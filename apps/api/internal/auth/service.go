// Package auth implements authentication and authorization for the API.
package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

// Domain errors mapped to standard API error codes by the handler.
var (
	// ErrInvalidCredentials is the GENERIC failure for login (never reveals
	// whether the email exists, the password was wrong, or the account is suspended).
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrInvalidRefreshToken covers missing, unknown, expired, or revoked refresh tokens.
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
	// ErrWrongCurrentPassword is returned when changing password with a wrong current one.
	ErrWrongCurrentPassword = errors.New("current password is incorrect")
	// ErrWeakPassword is returned when the new password violates policy.
	ErrWeakPassword = errors.New("new password does not meet requirements")
	// ErrUserNotFound is returned when the authenticated user no longer exists.
	ErrUserNotFound = errors.New("user not found")
	// ErrSSOAccountNotFound is returned when logging in via Google/Microsoft but email doesn't exist in system.
	ErrSSOAccountNotFound = errors.New("sso account not found")
	// ErrSSOAccountSuspended is returned when SSO account exists but is suspended or inactive.
	ErrSSOAccountSuspended = errors.New("sso account suspended")
)

// minPasswordLength is the MVP password policy (documented in docs/openapi.yaml).
const minPasswordLength = 8

// ProfileInfo is a lightweight reference to a student/teacher profile.
type ProfileInfo struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	FullName string `json:"full_name"`
}

// UserInfo describes the authenticated user for /auth/me and login responses.
type UserInfo struct {
	ID                 string       `json:"id"`
	Email              string       `json:"email"`
	Roles              []string     `json:"roles"`
	MustChangePassword bool         `json:"must_change_password"`
	StudentProfile     *ProfileInfo `json:"student_profile,omitempty"`
	TeacherProfile     *ProfileInfo `json:"teacher_profile,omitempty"`
}

// TokenBundle is the result of a successful login or refresh.
type TokenBundle struct {
	AccessToken        string    `json:"access_token"`
	TokenType          string    `json:"token_type"`
	AccessExpiresAt    time.Time `json:"access_expires_at"`
	RefreshToken       string    `json:"-"` // transported via HttpOnly cookie only
	RefreshExpiresAt   time.Time `json:"-"`
	MustChangePassword bool      `json:"must_change_password"`
	User               UserInfo  `json:"user"`
}

// Service contains the authentication use cases.
type Service struct {
	queries    *db.Queries
	tokens     *TokenService
	refreshTTL time.Duration
	bcryptCost int
	log        *slog.Logger

	googleClientID        string
	googleClientSecret    string
	microsoftClientID     string
	microsoftClientSecret string
}

// NewService wires the authentication use cases.
func NewService(queries *db.Queries, tokens *TokenService, refreshTTLDays int, bcryptCost int, log *slog.Logger) (*Service, error) {
	if queries == nil || tokens == nil {
		return nil, errors.New("auth service requires queries and token service")
	}
	if refreshTTLDays <= 0 {
		return nil, errors.New("refresh TTL days must be positive")
	}
	if bcryptCost < bcrypt_minCost || bcryptCost > 14 {
		return nil, errors.New("bcrypt cost out of range")
	}
	return &Service{
		queries:    queries,
		tokens:     tokens,
		refreshTTL: time.Duration(refreshTTLDays) * 24 * time.Hour,
		bcryptCost: bcryptCost,
		log:        log,
	}, nil
}

const bcrypt_minCost = 10

// Login authenticates by email + password and issues a token bundle.
// All failure modes collapse into ErrInvalidCredentials (no user enumeration).
func (s *Service) Login(ctx context.Context, email, password string) (*TokenBundle, error) {
	user, err := s.queries.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("login lookup: %w", err)
	}
	if !CheckPassword(user.PasswordHash, password) {
		return nil, ErrInvalidCredentials
	}
	if user.Status != db.UserStatusActive {
		return nil, ErrInvalidCredentials
	}

	roles, err := s.queries.GetUserRoleCodes(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("login roles: %w", err)
	}

	bundle, err := s.issueBundle(ctx, user.ID, user.Email, roles, false)
	if err != nil {
		return nil, err
	}
	if err := s.queries.UpdateLastLogin(ctx, user.ID); err != nil {
		s.log.Warn("failed to update last_login_at", "error", err)
	}
	return bundle, nil
}

// LoginSSO authenticates an account matched by email via SSO (Google or Microsoft).
// Per system policy: accounts must be pre-created by an administrator.
// Returns ErrSSOAccountNotFound if the email is not registered.
// Returns ErrSSOAccountSuspended if the user status is not active.
func (s *Service) LoginSSO(ctx context.Context, provider, email string) (*TokenBundle, error) {
	cleanEmail := strings.TrimSpace(strings.ToLower(email))
	if cleanEmail == "" {
		return nil, ErrSSOAccountNotFound
	}

	user, err := s.queries.GetUserByEmail(ctx, cleanEmail)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSSOAccountNotFound
		}
		return nil, fmt.Errorf("sso lookup: %w", err)
	}

	if user.Status != db.UserStatusActive {
		return nil, ErrSSOAccountSuspended
	}

	roles, err := s.queries.GetUserRoleCodes(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("sso roles: %w", err)
	}

	if user.MustChangePassword {
		if err := s.queries.ClearMustChangePassword(ctx, user.ID); err != nil {
			s.log.Warn("failed to clear must_change_password for sso user", "error", err)
		}
	}

	bundle, err := s.issueBundle(ctx, user.ID, user.Email, roles, false)
	if err != nil {
		return nil, err
	}
	if err := s.queries.UpdateLastLogin(ctx, user.ID); err != nil {
		s.log.Warn("failed to update last_login_at", "error", err)
	}
	s.log.Info("sso login successful", "provider", provider, "email", cleanEmail, "user_id", user.ID)
	return bundle, nil
}

// SetOAuthConfig configures Google and Microsoft OAuth credentials.
func (s *Service) SetOAuthConfig(googleClientID, googleClientSecret, msClientID, msClientSecret string) {
	s.googleClientID = googleClientID
	s.googleClientSecret = googleClientSecret
	s.microsoftClientID = msClientID
	s.microsoftClientSecret = msClientSecret
}

// GoogleClientID returns configured Google OAuth Client ID.
func (s *Service) GoogleClientID() string {
	return s.googleClientID
}

// MicrosoftClientID returns configured Microsoft OAuth Client ID.
func (s *Service) MicrosoftClientID() string {
	return s.microsoftClientID
}

// ExchangeOAuthCode exchanges an authorization code from Google or Microsoft (or dev mock)
// for user profile information, extracting the verified email, and then performing LoginSSO.
func (s *Service) ExchangeOAuthCode(ctx context.Context, provider, code, redirectURI string) (*TokenBundle, string, error) {
	var verifiedEmail string

	if strings.HasPrefix(code, "mock_") {
		// Development / Local simulation mode: code is mock_<base64_or_plain_email>
		raw := strings.TrimPrefix(code, "mock_")
		if decoded, err := base64.URLEncoding.DecodeString(raw); err == nil && len(decoded) > 0 {
			verifiedEmail = string(decoded)
		} else if decodedStd, err := base64.StdEncoding.DecodeString(raw); err == nil && len(decodedStd) > 0 {
			verifiedEmail = string(decodedStd)
		} else {
			verifiedEmail = raw
		}
	} else if provider == "google" {
		if s.googleClientID == "" || s.googleClientSecret == "" {
			return nil, "", errors.New("google oauth is not configured on server")
		}
		email, err := s.fetchGoogleUserEmail(ctx, code, redirectURI)
		if err != nil {
			return nil, "", fmt.Errorf("google token exchange: %w", err)
		}
		verifiedEmail = email
	} else if provider == "microsoft" {
		if s.microsoftClientID == "" || s.microsoftClientSecret == "" {
			return nil, "", errors.New("microsoft oauth is not configured on server")
		}
		email, err := s.fetchMicrosoftUserEmail(ctx, code, redirectURI)
		if err != nil {
			return nil, "", fmt.Errorf("microsoft token exchange: %w", err)
		}
		verifiedEmail = email
	} else {
		return nil, "", errors.New("unsupported oauth provider")
	}

	bundle, err := s.LoginSSO(ctx, provider, verifiedEmail)
	return bundle, verifiedEmail, err
}

func extractEmailFromIDToken(idToken string) string {
	if strings.TrimSpace(idToken) == "" {
		return ""
	}
	parts := strings.Split(idToken, ".")
	if len(parts) < 2 {
		return ""
	}
	segment := parts[1]
	decoded, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		if rem := len(segment) % 4; rem != 0 {
			segment += strings.Repeat("=", 4-rem)
		}
		var errPadded error
		decoded, errPadded = base64.URLEncoding.DecodeString(segment)
		if errPadded != nil {
			return ""
		}
	}
	var claims struct {
		Email             string `json:"email"`
		PreferredUsername string `json:"preferred_username"`
		UPN               string `json:"upn"`
		UniqueName        string `json:"unique_name"`
	}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return ""
	}
	for _, candidate := range []string{claims.Email, claims.PreferredUsername, claims.UPN, claims.UniqueName} {
		trimmed := strings.TrimSpace(candidate)
		if trimmed != "" && strings.Contains(trimmed, "@") {
			return trimmed
		}
	}
	return ""
}

func (s *Service) fetchGoogleUserEmail(ctx context.Context, code, redirectURI string) (string, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", s.googleClientID)
	form.Set("client_secret", s.googleClientSecret)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("google token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	if email := extractEmailFromIDToken(tokenResp.IDToken); email != "" {
		s.log.Info("google email extracted from id_token", "email", email)
		return email, nil
	}

	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return "", err
	}
	userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	userResp, err := http.DefaultClient.Do(userReq)
	if err != nil {
		return "", err
	}
	defer userResp.Body.Close()

	if userResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(userResp.Body)
		return "", fmt.Errorf("google userinfo returned %d: %s", userResp.StatusCode, string(body))
	}

	var userInfo struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&userInfo); err != nil {
		return "", err
	}
	if userInfo.Email == "" {
		return "", errors.New("no email returned by google")
	}
	return userInfo.Email, nil
}

func (s *Service) fetchMicrosoftUserEmail(ctx context.Context, code, redirectURI string) (string, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", s.microsoftClientID)
	form.Set("client_secret", s.microsoftClientSecret)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://login.microsoftonline.com/common/oauth2/v2.0/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("microsoft token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	// 1. Try extracting verified email or preferred username directly from the OIDC id_token
	if email := extractEmailFromIDToken(tokenResp.IDToken); email != "" {
		s.log.Info("microsoft email extracted from id_token", "email", email)
		return email, nil
	}

	// 2. Fallback to Microsoft Graph /v1.0/me
	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.microsoft.com/v1.0/me", nil)
	if err != nil {
		return "", err
	}
	userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	userResp, err := http.DefaultClient.Do(userReq)
	if err != nil {
		return "", err
	}
	defer userResp.Body.Close()

	if userResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(userResp.Body)
		return "", fmt.Errorf("microsoft graph returned %d: %s", userResp.StatusCode, string(body))
	}

	var userInfo struct {
		Mail              string `json:"mail"`
		UserPrincipalName string `json:"userPrincipalName"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&userInfo); err != nil {
		return "", err
	}
	email := strings.TrimSpace(userInfo.Mail)
	if email == "" {
		email = strings.TrimSpace(userInfo.UserPrincipalName)
	}
	if email == "" {
		return "", errors.New("no email returned by microsoft")
	}
	return email, nil
}

// Refresh validates and rotates a refresh token, issuing a new bundle.
// Presenting an already-revoked token revokes ALL tokens of that user (reuse detection).
func (s *Service) Refresh(ctx context.Context, presentedToken string) (*TokenBundle, error) {
	if presentedToken == "" {
		return nil, ErrInvalidRefreshToken
	}
	stored, err := s.queries.GetRefreshTokenByHash(ctx, HashRefreshToken(presentedToken))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("refresh lookup: %w", err)
	}

	if stored.RevokedAt.Valid {
		// Token reuse detected: kill the whole session family.
		if err := s.queries.RevokeAllRefreshTokensForUser(ctx, stored.UserID); err != nil {
			s.log.Error("failed to revoke token family after reuse", "error", err)
		}
		s.log.Warn("revoked refresh token presented; family revoked", "user_id", stored.UserID.String())
		return nil, ErrInvalidRefreshToken
	}
	if time.Now().UTC().After(stored.ExpiresAt.Time) {
		return nil, ErrInvalidRefreshToken
	}

	user, err := s.queries.GetUserByID(ctx, stored.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("refresh user: %w", err)
	}
	if user.Status != db.UserStatusActive {
		return nil, ErrInvalidRefreshToken
	}

	// Rotate: revoke the old token before issuing its replacement.
	if err := s.queries.RevokeRefreshToken(ctx, stored.ID); err != nil {
		return nil, fmt.Errorf("refresh rotate: %w", err)
	}

	roles, err := s.queries.GetUserRoleCodes(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("refresh roles: %w", err)
	}
	return s.issueBundle(ctx, user.ID, user.Email, roles, false)
}

// Logout revokes the presented refresh token. Idempotent by design.
func (s *Service) Logout(ctx context.Context, presentedToken string) error {
	if presentedToken == "" {
		return nil
	}
	stored, err := s.queries.GetRefreshTokenByHash(ctx, HashRefreshToken(presentedToken))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("logout lookup: %w", err)
	}
	return s.queries.RevokeRefreshToken(ctx, stored.ID)
}

// ChangePassword verifies the current password, sets the new one,
// clears must_change_password, and revokes ALL refresh tokens (force re-login).
func (s *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	uid, err := parseUUID(userID)
	if err != nil {
		return ErrUserNotFound
	}
	user, err := s.queries.GetUserByID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUserNotFound
		}
		return fmt.Errorf("change password lookup: %w", err)
	}
	if !CheckPassword(user.PasswordHash, currentPassword) {
		return ErrWrongCurrentPassword
	}
	if len(newPassword) < minPasswordLength {
		return ErrWeakPassword
	}
	hash, err := HashPassword(newPassword, s.bcryptCost)
	if err != nil {
		return fmt.Errorf("hash new password: %w", err)
	}
	if err := s.queries.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{ID: uid, PasswordHash: hash}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if err := s.queries.RevokeAllRefreshTokensForUser(ctx, uid); err != nil {
		return fmt.Errorf("revoke tokens after password change: %w", err)
	}
	return nil
}

// Me returns the profile of the authenticated user.
func (s *Service) Me(ctx context.Context, userID string) (*UserInfo, error) {
	uid, err := parseUUID(userID)
	if err != nil {
		return nil, ErrUserNotFound
	}
	user, err := s.queries.GetUserByID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("me lookup: %w", err)
	}
	roles, err := s.queries.GetUserRoleCodes(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("me roles: %w", err)
	}
	info := &UserInfo{
		ID:                 userID,
		Email:              user.Email,
		Roles:              roles,
		MustChangePassword: user.MustChangePassword,
	}
	s.attachProfiles(ctx, uid, info)
	return info, nil
}

// issueBundle creates the access token + persisted refresh token pair.
func (s *Service) issueBundle(ctx context.Context, userID pgtype.UUID, email string, roles []string, mustChangePassword bool) (*TokenBundle, error) {
	userIDStr := data.UUIDString(userID)
	accessToken, accessExpiresAt, err := s.tokens.Issue(userIDStr, email, roles)
	if err != nil {
		return nil, err
	}
	refreshToken, err := GenerateRefreshToken()
	if err != nil {
		return nil, err
	}
	refreshExpiresAt := time.Now().UTC().Add(s.refreshTTL)
	_, err = s.queries.InsertRefreshToken(ctx, db.InsertRefreshTokenParams{
		UserID:    userID,
		TokenHash: HashRefreshToken(refreshToken),
		ExpiresAt: pgtype.Timestamptz{Time: refreshExpiresAt, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("persist refresh token: %w", err)
	}

	info := &UserInfo{
		ID:                 userIDStr,
		Email:              email,
		Roles:              roles,
		MustChangePassword: mustChangePassword,
	}
	s.attachProfiles(ctx, userID, info)

	return &TokenBundle{
		AccessToken:        accessToken,
		TokenType:          "Bearer",
		AccessExpiresAt:    accessExpiresAt,
		RefreshToken:       refreshToken,
		RefreshExpiresAt:   refreshExpiresAt,
		MustChangePassword: mustChangePassword,
		User:               *info,
	}, nil
}

// attachProfiles fills student/teacher profile references when they exist.
func (s *Service) attachProfiles(ctx context.Context, userID pgtype.UUID, info *UserInfo) {
	student, err := s.queries.GetStudentProfileByUserID(ctx, userID)
	if err == nil {
		info.StudentProfile = &ProfileInfo{ID: data.UUIDString(student.ID), Code: student.StudentCode, FullName: student.FullName}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		s.log.Warn("failed to load student profile", "error", err)
	}
	teacher, err := s.queries.GetTeacherProfileByUserID(ctx, userID)
	if err == nil {
		info.TeacherProfile = &ProfileInfo{ID: data.UUIDString(teacher.ID), Code: teacher.TeacherCode, FullName: teacher.FullName}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		s.log.Warn("failed to load teacher profile", "error", err)
	}
}

// parseUUID converts a string UUID into pgtype.UUID.
func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return pgtype.UUID{}, err
	}
	return u, nil
}
