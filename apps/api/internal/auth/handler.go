package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/response"
)

// refreshCookieName transports the opaque refresh token (HttpOnly).
const refreshCookieName = "nsa_refresh"

// Handler exposes the authentication endpoints.
type Handler struct {
	svc           *Service
	log           *slog.Logger
	secureCookies bool // true outside development (HTTPS only)
}

// NewHandler creates the auth HTTP handler. secureCookies must be true in production.
func NewHandler(svc *Service, log *slog.Logger, secureCookies bool) *Handler {
	return &Handler{svc: svc, log: log, secureCookies: secureCookies}
}

// ---------- Request/response DTOs ----------

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type ssoLoginRequest struct {
	Provider string `json:"provider"`
	Email    string `json:"email"`
}

type oauthCallbackRequest struct {
	Provider    string `json:"provider"`
	Code        string `json:"code"`
	RedirectURI string `json:"redirect_uri"`
}

// ---------- Handlers ----------

// OAuthConfig handles GET /api/v1/auth/oauth/config.
func (h *Handler) OAuthConfig(w http.ResponseWriter, r *http.Request) {
	response.OK(w, map[string]any{
		"google_configured":    h.svc.GoogleClientID() != "",
		"google_client_id":     h.svc.GoogleClientID(),
		"microsoft_configured": h.svc.MicrosoftClientID() != "",
		"microsoft_client_id":  h.svc.MicrosoftClientID(),
	})
}

// OAuthCallback handles POST /api/v1/auth/oauth/callback.
func (h *Handler) OAuthCallback(w http.ResponseWriter, r *http.Request) {
	var req oauthCallbackRequest
	if err := decodeJSON(w, r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	req.Provider = strings.TrimSpace(strings.ToLower(req.Provider))
	if req.Provider != "google" && req.Provider != "microsoft" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Provider must be 'google' or 'microsoft'")
		return
	}
	if req.Code == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Authorization code is required")
		return
	}

	bundle, email, err := h.svc.ExchangeOAuthCode(r.Context(), req.Provider, req.Code, req.RedirectURI)
	if err != nil {
		switch {
		case errors.Is(err, ErrSSOAccountNotFound):
			errMsg := "Email này chưa được cấp tài khoản trong hệ thống. Vui lòng liên hệ Quản trị viên để được tạo tài khoản."
			if email != "" {
				errMsg = fmt.Sprintf("Email %s chưa được cấp tài khoản trong hệ thống. Vui lòng liên hệ Quản trị viên để được tạo tài khoản.", email)
			}
			response.Fail(w, http.StatusNotFound, "ACCOUNT_NOT_FOUND", errMsg)
		case errors.Is(err, ErrSSOAccountSuspended):
			errMsg := "Tài khoản của bạn đã bị tạm khóa hoặc ngừng hoạt động. Vui lòng liên hệ Quản trị viên."
			if email != "" {
				errMsg = fmt.Sprintf("Tài khoản %s đã bị tạm khóa hoặc ngừng hoạt động. Vui lòng liên hệ Quản trị viên.", email)
			}
			response.Fail(w, http.StatusForbidden, "ACCOUNT_SUSPENDED", errMsg)
		default:
			h.log.Error("oauth callback exchange error", "error", err, "provider", req.Provider)
			response.Fail(w, http.StatusInternalServerError, "OAUTH_ERROR", err.Error())
		}
		return
	}

	h.setRefreshCookie(w, bundle.RefreshToken, bundle.RefreshExpiresAt)
	response.OK(w, bundle)
}

// SSOLogin handles POST /api/v1/auth/sso.
func (h *Handler) SSOLogin(w http.ResponseWriter, r *http.Request) {
	var req ssoLoginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	req.Provider = strings.TrimSpace(strings.ToLower(req.Provider))
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if req.Provider != "google" && req.Provider != "microsoft" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Provider must be 'google' or 'microsoft'")
		return
	}
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "A valid email address is required")
		return
	}

	bundle, err := h.svc.LoginSSO(r.Context(), req.Provider, req.Email)
	if err != nil {
		switch {
		case errors.Is(err, ErrSSOAccountNotFound):
			response.Fail(w, http.StatusNotFound, "ACCOUNT_NOT_FOUND", "Email này chưa được cấp tài khoản trong hệ thống. Vui lòng liên hệ Quản trị viên để được tạo tài khoản.")
		case errors.Is(err, ErrSSOAccountSuspended):
			response.Fail(w, http.StatusForbidden, "ACCOUNT_SUSPENDED", "Tài khoản của bạn đã bị tạm khóa hoặc ngừng hoạt động. Vui lòng liên hệ Quản trị viên.")
		default:
			h.log.Error("sso login internal error", "error", err, "email", req.Email, "provider", req.Provider)
			response.Fail(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		}
		return
	}

	h.setRefreshCookie(w, bundle.RefreshToken, bundle.RefreshExpiresAt)
	response.OK(w, bundle)
}

// Login handles POST /api/v1/auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Email and password are required")
		return
	}

	bundle, err := h.svc.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			response.Fail(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password")
			return
		}
		h.log.Error("login internal error", "error", err, "email", req.Email)
		response.Fail(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	h.setRefreshCookie(w, bundle.RefreshToken, bundle.RefreshExpiresAt)
	response.OK(w, bundle)
}

// Refresh handles POST /api/v1/auth/refresh (uses the refresh cookie).
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	token := h.readRefreshCookie(r)
	bundle, err := h.svc.Refresh(r.Context(), token)
	if err != nil {
		if errors.Is(err, ErrInvalidRefreshToken) {
			h.clearRefreshCookie(w)
			response.Fail(w, http.StatusUnauthorized, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired")
			return
		}
		response.InternalError(w, h.log, RequestIDFrom(r.Context()), err)
		return
	}
	h.setRefreshCookie(w, bundle.RefreshToken, bundle.RefreshExpiresAt)
	response.OK(w, bundle)
}

// Logout handles POST /api/v1/auth/logout (revokes the refresh cookie's token).
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Logout(r.Context(), h.readRefreshCookie(r)); err != nil {
		response.InternalError(w, h.log, RequestIDFrom(r.Context()), err)
		return
	}
	h.clearRefreshCookie(w)
	response.OK(w, map[string]string{"message": "Logged out"})
}

// ChangePassword handles POST /api/v1/auth/change-password (requires auth).
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserIDFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}
	var req changePasswordRequest
	if err := decodeJSON(w, r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "current_password and new_password are required")
		return
	}

	err := h.svc.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword)
	switch {
	case err == nil:
		h.clearRefreshCookie(w) // all sessions revoked — client must log in again
		response.OK(w, map[string]string{"message": "Password changed. Please log in again."})
	case errors.Is(err, ErrWrongCurrentPassword):
		response.Fail(w, http.StatusBadRequest, "WRONG_CURRENT_PASSWORD", "Current password is incorrect")
	case errors.Is(err, ErrWeakPassword):
		response.Fail(w, http.StatusBadRequest, "WEAK_PASSWORD", "New password must be at least 8 characters")
	case errors.Is(err, ErrUserNotFound):
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Account no longer exists")
	default:
		response.InternalError(w, h.log, RequestIDFrom(r.Context()), err)
	}
}

// Me handles GET /api/v1/auth/me (requires auth).
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserIDFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}
	info, err := h.svc.Me(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Account no longer exists")
			return
		}
		response.InternalError(w, h.log, RequestIDFrom(r.Context()), err)
		return
	}
	response.OK(w, info)
}

// ---------- Helpers ----------

// setRefreshCookie writes the refresh token cookie (HttpOnly, SameSite=None when Secure,
// Secure outside development, scoped to the auth routes).
func (h *Handler) setRefreshCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	sameSite := http.SameSiteLaxMode
	if h.secureCookies {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    token,
		Path:     "/api/v1/auth",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   h.secureCookies,
		SameSite: sameSite,
	})
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter) {
	sameSite := http.SameSiteLaxMode
	if h.secureCookies {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/v1/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secureCookies,
		SameSite: sameSite,
	})
}

func (h *Handler) readRefreshCookie(r *http.Request) string {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

// decodeJSON reads a JSON body with a 1MB size limit (request body limits).
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	return nil
}
