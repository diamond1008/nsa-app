// Package users implements administrator user management, scoped RBAC, and audit history.
package users

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/dberror"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var (
	ErrNotFound      = errors.New("user not found")
	ErrForbidden     = errors.New("forbidden: you do not have permission to manage this user")
	ErrEmailConflict = errors.New("email already exists")
	ErrInvalidInput  = errors.New("invalid input")
)

type Service struct {
	pool       *pgxpool.Pool
	queries    *db.Queries
	bcryptCost int
}

func NewService(pool *pgxpool.Pool, bcryptCost int) *Service {
	return &Service{
		pool:       pool,
		queries:    db.New(pool),
		bcryptCost: bcryptCost,
	}
}

// allowedRolesForClaims defines the strict manageable scope for the authenticated caller:
// - ADMIN: manages all roles (ADMIN, ACADEMIC_ADMIN, SALE_ADMIN, SALE, TEACHER, STUDENT)
// - ACADEMIC_ADMIN: manages TEACHER and STUDENT
// - SALE_ADMIN: manages SALE
func (s *Service) allowedRolesForClaims(claims *auth.AccessClaims) []string {
	if claims == nil {
		return nil
	}
	if claims.HasAnyRole(auth.RoleAdmin) {
		return []string{
			auth.RoleAdmin,
			auth.RoleAcademicAdmin,
			auth.RoleSaleAdmin,
			auth.RoleSale,
			auth.RoleTeacher,
			auth.RoleStudent,
		}
	}
	if claims.HasAnyRole(auth.RoleAcademicAdmin) {
		return []string{
			auth.RoleTeacher,
			auth.RoleStudent,
		}
	}
	if claims.HasAnyRole(auth.RoleSaleAdmin) {
		return []string{
			auth.RoleSale,
		}
	}
	return nil
}

// canManageRole reports whether the caller has authority to create or manage a specific role.
func (s *Service) canManageRole(claims *auth.AccessClaims, targetRole string) bool {
	allowed := s.allowedRolesForClaims(claims)
	for _, r := range allowed {
		if strings.EqualFold(r, targetRole) {
			return true
		}
	}
	return false
}

// checkUserInScope verifies the target user has at least one role matching the caller's scope
// and does NOT hold roles superior to the caller (e.g. ACADEMIC_ADMIN cannot edit an ADMIN).
func (s *Service) checkUserInScope(claims *auth.AccessClaims, targetRoles []string) bool {
	if claims.HasAnyRole(auth.RoleAdmin) {
		return true // superadmin can manage everyone
	}

	// Non-superadmins cannot modify users who hold ADMIN or SALE_ADMIN or ACADEMIC_ADMIN
	for _, tr := range targetRoles {
		if tr == auth.RoleAdmin {
			return false
		}
		if claims.HasAnyRole(auth.RoleAcademicAdmin) && (tr == auth.RoleAcademicAdmin || tr == auth.RoleSaleAdmin || tr == auth.RoleSale) {
			return false
		}
		if claims.HasAnyRole(auth.RoleSaleAdmin) && tr != auth.RoleSale {
			return false
		}
	}

	allowed := s.allowedRolesForClaims(claims)
	for _, tr := range targetRoles {
		for _, ar := range allowed {
			if tr == ar {
				return true
			}
		}
	}
	return false
}

// List returns a paginated list of users filtered by caller scope and query parameters.
func (s *Service) List(ctx context.Context, claims *auth.AccessClaims, filter ListFilter) (pagination.Result[UserView], error) {
	allowedRoles := s.allowedRolesForClaims(claims)
	if len(allowedRoles) == 0 {
		return pagination.New([]UserView{}, 1, 20, 0), ErrForbidden
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	perPage := filter.PerPage
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := int32((page - 1) * perPage)
	limit := int32(perPage)

	var roleArg pgtype.Text
	if filter.Role != "" {
		if !s.canManageRole(claims, filter.Role) {
			return pagination.New([]UserView{}, page, perPage, 0), nil
		}
		roleArg = data.Text(&filter.Role)
	}

	var statusArg db.NullUserStatus
	if filter.Status != "" {
		statusArg = db.NullUserStatus{
			UserStatus: db.UserStatus(filter.Status),
			Valid:      true,
		}
	}

	var searchArg pgtype.Text
	if strings.TrimSpace(filter.Search) != "" {
		trimmed := strings.TrimSpace(filter.Search)
		searchArg = data.Text(&trimmed)
	}

	total, err := s.queries.CountUsers(ctx, db.CountUsersParams{
		AllowedRoles: allowedRoles,
		Role:         roleArg,
		Status:       statusArg,
		Search:       searchArg,
	})
	if err != nil {
		return pagination.Result[UserView]{}, fmt.Errorf("count users: %w", err)
	}

	rows, err := s.queries.ListUsers(ctx, db.ListUsersParams{
		AllowedRoles: allowedRoles,
		Role:         roleArg,
		Status:       statusArg,
		Search:       searchArg,
		OffsetVal:    offset,
		LimitVal:     limit,
	})
	if err != nil {
		return pagination.Result[UserView]{}, fmt.Errorf("list users: %w", err)
	}

	items := make([]UserView, 0, len(rows))
	for _, r := range rows {
		var lastLogin *time.Time
		if r.LastLoginAt.Valid {
			t := r.LastLoginAt.Time
			lastLogin = &t
		}
		items = append(items, UserView{
			ID:                 data.UUIDString(r.ID),
			Email:              r.Email,
			Status:             string(r.Status),
			MustChangePassword: r.MustChangePassword,
			LastLoginAt:        lastLogin,
			CreatedAt:          r.CreatedAt.Time,
			UpdatedAt:          r.UpdatedAt.Time,
			FullName:           r.FullName,
			Phone:              r.Phone,
			Roles:              r.RoleCodes,
			StudentCode:        r.StudentCode,
			TeacherCode:        r.TeacherCode,
			CreatedByEmail:     r.CreatedByEmail,
			IsAcceptingLeads:    r.IsAcceptingLeads,
			LeadAssignmentOrder: int(r.LeadAssignmentOrder),
		})
	}

	return pagination.New(items, page, perPage, total), nil
}

// Get returns details of a single user if the caller has permission.
func (s *Service) Get(ctx context.Context, claims *auth.AccessClaims, id string) (UserView, error) {
	uid, err := data.UUID(id)
	if err != nil {
		return UserView{}, ErrNotFound
	}

	row, err := s.queries.GetUserDetail(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserView{}, ErrNotFound
		}
		return UserView{}, fmt.Errorf("get user: %w", err)
	}

	if !s.checkUserInScope(claims, row.RoleCodes) {
		return UserView{}, ErrForbidden
	}

	var lastLogin *time.Time
	if row.LastLoginAt.Valid {
		t := row.LastLoginAt.Time
		lastLogin = &t
	}

	return UserView{
		ID:                 data.UUIDString(row.ID),
		Email:              row.Email,
		Status:             string(row.Status),
		MustChangePassword: row.MustChangePassword,
		LastLoginAt:        lastLogin,
		CreatedAt:          row.CreatedAt.Time,
		UpdatedAt:          row.UpdatedAt.Time,
		FullName:           row.FullName,
		Phone:              row.Phone,
		Roles:              row.RoleCodes,
		StudentCode:        row.StudentCode,
		TeacherCode:        row.TeacherCode,
		CreatedByEmail:     row.CreatedByEmail,
		IsAcceptingLeads:    row.IsAcceptingLeads,
		LeadAssignmentOrder: int(row.LeadAssignmentOrder),
	}, nil
}

// Create registers a new user with the given role, initial password, and audit log.
func (s *Service) Create(ctx context.Context, claims *auth.AccessClaims, input CreateUserInput) (UserView, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		return UserView{}, fmt.Errorf("%w: invalid email address", ErrInvalidInput)
	}
	if len(input.Password) < 8 {
		return UserView{}, fmt.Errorf("%w: password must be at least 8 characters", ErrInvalidInput)
	}

	targetRole := strings.ToUpper(strings.TrimSpace(input.Role))
	if !s.canManageRole(claims, targetRole) {
		return UserView{}, fmt.Errorf("%w: you are not authorized to create a user with role %s", ErrForbidden, targetRole)
	}

	status := db.UserStatusActive
	if input.Status != "" {
		switch input.Status {
		case "active":
			status = db.UserStatusActive
		case "suspended":
			status = db.UserStatusSuspended
		case "inactive":
			status = db.UserStatusInactive
		case "pending":
			status = db.UserStatusPending
		default:
			return UserView{}, fmt.Errorf("%w: invalid status %s", ErrInvalidInput, input.Status)
		}
	}

	passwordHash, err := auth.HashPassword(input.Password, s.bcryptCost)
	if err != nil {
		return UserView{}, fmt.Errorf("hash password: %w", err)
	}

	actorID, err := data.UUID(claims.UserID)
	if err != nil {
		return UserView{}, fmt.Errorf("invalid actor id: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return UserView{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	var fullNameArg, phoneArg pgtype.Text
	fullNameTrimmed := strings.TrimSpace(input.FullName)
	if fullNameTrimmed != "" {
		fullNameArg = data.Text(&fullNameTrimmed)
	}
	phoneTrimmed := strings.TrimSpace(input.Phone)
	if phoneTrimmed != "" {
		phoneArg = data.Text(&phoneTrimmed)
	}

	createdUser, err := q.CreateUserAccount(ctx, db.CreateUserAccountParams{
		Email:        email,
		PasswordHash: passwordHash,
		Status:       status,
		FullName:     fullNameArg,
		Phone:        phoneArg,
	})
	if err != nil {
		if dberror.IsCode(err, dberror.UniqueViolation) {
			return UserView{}, ErrEmailConflict
		}
		return UserView{}, fmt.Errorf("create user account: %w", err)
	}

	if err := q.AssignManagedUserRole(ctx, db.AssignManagedUserRoleParams{
		UserID:     createdUser.ID,
		Code:       targetRole,
		AssignedBy: actorID,
	}); err != nil {
		return UserView{}, fmt.Errorf("assign user role: %w", err)
	}

	// Create linked minimal domain profiles for STUDENT or TEACHER if needed
	var studentCode, teacherCode string
	if targetRole == auth.RoleStudent {
		now := time.Now().UTC()
		studentCode = fmt.Sprintf("HV%s", now.Format("060102150405"))
		sName := fullNameTrimmed
		if sName == "" {
			sName = email
		}
		_, err := q.CreateStudentProfile(ctx, db.CreateStudentProfileParams{
			UserID:                createdUser.ID,
			StudentCode:           studentCode,
			FullName:              sName,
			AvatarUrl:             pgtype.Text{},
			Phone:                 phoneArg,
			DateOfBirth:           pgtype.Date{},
			Gender:                pgtype.Text{},
			Address:               pgtype.Text{},
			EmergencyContactName:  pgtype.Text{},
			EmergencyContactPhone: pgtype.Text{},
			Status:                db.StudentStatusActive,
			EnrolledAt:            pgtype.Date{Time: now, Valid: true},
		})
		if err != nil && !dberror.IsCode(err, dberror.UniqueViolation) {
			return UserView{}, fmt.Errorf("create student profile: %w", err)
		}
	} else if targetRole == auth.RoleTeacher {
		now := time.Now().UTC()
		teacherCode = fmt.Sprintf("GV%s", now.Format("060102150405"))
		tName := fullNameTrimmed
		if tName == "" {
			tName = email
		}
		_, err := q.CreateTeacherProfile(ctx, db.CreateTeacherProfileParams{
			UserID:         createdUser.ID,
			TeacherCode:    teacherCode,
			FullName:       tName,
			AvatarUrl:      pgtype.Text{},
			Phone:          phoneArg,
			Specialization: pgtype.Text{},
			Status:         db.TeacherStatusActive,
		})
		if err != nil && !dberror.IsCode(err, dberror.UniqueViolation) {
			return UserView{}, fmt.Errorf("create teacher profile: %w", err)
		}
	}

	auditPayload := map[string]any{
		"email":        email,
		"role":         targetRole,
		"status":       string(status),
		"full_name":    fullNameTrimmed,
		"phone":        phoneTrimmed,
		"student_code": studentCode,
		"teacher_code": teacherCode,
	}

	if err := audit.Write(ctx, q, claims.UserID, "user.create", "user", createdUser.ID, nil, auditPayload); err != nil {
		return UserView{}, fmt.Errorf("write audit log: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return UserView{}, fmt.Errorf("commit create user: %w", err)
	}

	return UserView{
		ID:                 data.UUIDString(createdUser.ID),
		Email:              createdUser.Email,
		Status:             string(createdUser.Status),
		MustChangePassword: createdUser.MustChangePassword,
		CreatedAt:          createdUser.CreatedAt.Time,
		UpdatedAt:          createdUser.UpdatedAt.Time,
		FullName:           fullNameTrimmed,
		Phone:              phoneTrimmed,
		Roles:              []string{targetRole},
		StudentCode:        studentCode,
		TeacherCode:        teacherCode,
		CreatedByEmail:     claims.Email,
		IsAcceptingLeads:    true,
		LeadAssignmentOrder: 0,
	}, nil
}

// UpdateStatus changes the user's account status (active, suspended, inactive) and records reason.
func (s *Service) UpdateStatus(ctx context.Context, claims *auth.AccessClaims, id string, input UpdateStatusInput) (UserView, error) {
	uid, err := data.UUID(id)
	if err != nil {
		return UserView{}, ErrNotFound
	}

	existing, err := s.queries.GetUserDetail(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserView{}, ErrNotFound
		}
		return UserView{}, fmt.Errorf("get user detail: %w", err)
	}

	if !s.checkUserInScope(claims, existing.RoleCodes) {
		return UserView{}, ErrForbidden
	}

	var newStatus db.UserStatus
	switch input.Status {
	case "active":
		newStatus = db.UserStatusActive
	case "suspended":
		newStatus = db.UserStatusSuspended
	case "inactive":
		newStatus = db.UserStatusInactive
	default:
		return UserView{}, fmt.Errorf("%w: invalid status %s", ErrInvalidInput, input.Status)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return UserView{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	_, err = q.UpdateUserStatus(ctx, db.UpdateUserStatusParams{
		ID:     uid,
		Status: newStatus,
	})
	if err != nil {
		return UserView{}, fmt.Errorf("update user status: %w", err)
	}

	// Revoke sessions if suspended or inactive
	if newStatus == db.UserStatusSuspended || newStatus == db.UserStatusInactive {
		_ = q.RevokeAllRefreshTokensForUser(ctx, uid)
	}

	oldValues := map[string]any{"status": string(existing.Status)}
	newValues := map[string]any{"status": string(newStatus)}

	if err := audit.WriteWithReason(
		ctx, q, claims.UserID, "user.update_status", "user", uid,
		oldValues, newValues, input.Reason,
	); err != nil {
		return UserView{}, fmt.Errorf("write status audit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return UserView{}, fmt.Errorf("commit status update: %w", err)
	}

	return s.Get(ctx, claims, id)
}

// UpdateProfile updates personal full_name and phone on the user account.
func (s *Service) UpdateProfile(ctx context.Context, claims *auth.AccessClaims, id string, input UpdateProfileInput) (UserView, error) {
	uid, err := data.UUID(id)
	if err != nil {
		return UserView{}, ErrNotFound
	}

	existing, err := s.queries.GetUserDetail(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserView{}, ErrNotFound
		}
		return UserView{}, fmt.Errorf("get user detail: %w", err)
	}

	if !s.checkUserInScope(claims, existing.RoleCodes) {
		return UserView{}, ErrForbidden
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return UserView{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	fn := strings.TrimSpace(input.FullName)
	ph := strings.TrimSpace(input.Phone)

	_, err = q.UpdateUserAccountProfile(ctx, db.UpdateUserAccountProfileParams{
		ID:       uid,
		FullName: data.Text(&fn),
		Phone:    data.Text(&ph),
	})
	if err != nil {
		return UserView{}, fmt.Errorf("update profile: %w", err)
	}

	oldValues := map[string]any{"full_name": existing.FullName, "phone": existing.Phone}
	newValues := map[string]any{"full_name": fn, "phone": ph}

	if err := audit.Write(ctx, q, claims.UserID, "user.update_profile", "user", uid, oldValues, newValues); err != nil {
		return UserView{}, fmt.Errorf("write profile audit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return UserView{}, fmt.Errorf("commit profile update: %w", err)
	}

	return s.Get(ctx, claims, id)
}

// ResetPassword resets the user's password, forces change on next login, revokes sessions, and records audit.
func (s *Service) ResetPassword(ctx context.Context, claims *auth.AccessClaims, id string, input ResetPasswordInput) error {
	uid, err := data.UUID(id)
	if err != nil {
		return ErrNotFound
	}

	existing, err := s.queries.GetUserDetail(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get user detail: %w", err)
	}

	if !s.checkUserInScope(claims, existing.RoleCodes) {
		return ErrForbidden
	}

	if len(input.NewPassword) < 8 {
		return fmt.Errorf("%w: password must be at least 8 characters", ErrInvalidInput)
	}

	passwordHash, err := auth.HashPassword(input.NewPassword, s.bcryptCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	if err := q.ResetUserAccountPassword(ctx, db.ResetUserAccountPasswordParams{
		ID:           uid,
		PasswordHash: passwordHash,
	}); err != nil {
		return fmt.Errorf("reset password: %w", err)
	}

	if err := q.RevokeAllRefreshTokensForUser(ctx, uid); err != nil {
		return fmt.Errorf("revoke tokens: %w", err)
	}

	if err := audit.WriteWithReason(
		ctx, q, claims.UserID, "user.reset_password", "user", uid,
		nil, map[string]any{"must_change_password": true}, input.Reason,
	); err != nil {
		return fmt.Errorf("write reset audit: %w", err)
	}

	return tx.Commit(ctx)
}

// ListAuditLogs returns the history of changes made to a user.
func (s *Service) ListAuditLogs(ctx context.Context, claims *auth.AccessClaims, id string, page, perPage int) (pagination.Result[AuditLogView], error) {
	uid, err := data.UUID(id)
	if err != nil {
		return pagination.Result[AuditLogView]{}, ErrNotFound
	}

	existing, err := s.queries.GetUserDetail(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return pagination.Result[AuditLogView]{}, ErrNotFound
		}
		return pagination.Result[AuditLogView]{}, fmt.Errorf("get user detail: %w", err)
	}

	if !s.checkUserInScope(claims, existing.RoleCodes) {
		return pagination.Result[AuditLogView]{}, ErrForbidden
	}

	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := int32((page - 1) * perPage)
	limit := int32(perPage)

	total, err := s.queries.CountUserAuditLogs(ctx, uid)
	if err != nil {
		return pagination.Result[AuditLogView]{}, fmt.Errorf("count audit logs: %w", err)
	}

	rows, err := s.queries.ListUserAuditLogs(ctx, db.ListUserAuditLogsParams{
		EntityID:  uid,
		OffsetVal: offset,
		LimitVal:  limit,
	})
	if err != nil {
		return pagination.Result[AuditLogView]{}, fmt.Errorf("list audit logs: %w", err)
	}

	items := make([]AuditLogView, 0, len(rows))
	for _, r := range rows {
		var oldVals any
		if len(r.OldValues) > 0 {
			_ = json.Unmarshal(r.OldValues, &oldVals)
		}
		var newVals any
		if len(r.NewValues) > 0 {
			_ = json.Unmarshal(r.NewValues, &newVals)
		}

		var actorIDStr *string
		if r.ActorUserID.Valid {
			s := data.UUIDString(r.ActorUserID)
			actorIDStr = &s
		}
		var reasonStr *string
		if r.Reason.Valid {
			reasonStr = &r.Reason.String
		}

		items = append(items, AuditLogView{
			ID:          r.ID,
			ActorUserID: actorIDStr,
			ActorEmail:  r.ActorEmail,
			ActorName:   r.ActorName,
			Action:      r.Action,
			OldValues:   oldVals,
			NewValues:   newVals,
			Reason:      reasonStr,
			CreatedAt:   r.CreatedAt.Time,
		})
	}

	return pagination.New(items, page, perPage, total), nil
}

// UpdateLeadRouting updates the is_accepting_leads flag and/or assignment order for a sale user.
func (s *Service) UpdateLeadRouting(ctx context.Context, claims *auth.AccessClaims, id string, input UpdateLeadRoutingInput) (UserView, error) {
	uid, err := data.UUID(id)
	if err != nil {
		return UserView{}, ErrNotFound
	}

	existing, err := s.queries.GetUserDetail(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserView{}, ErrNotFound
		}
		return UserView{}, fmt.Errorf("get user detail: %w", err)
	}

	if !s.checkUserInScope(claims, existing.RoleCodes) {
		return UserView{}, ErrForbidden
	}

	if !claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin) {
		return UserView{}, ErrForbidden
	}

	var isAccepting pgtype.Bool
	if input.IsAcceptingLeads != nil {
		isAccepting = pgtype.Bool{Bool: *input.IsAcceptingLeads, Valid: true}
	}
	var assignmentOrder pgtype.Int4
	if input.LeadAssignmentOrder != nil {
		assignmentOrder = pgtype.Int4{Int32: int32(*input.LeadAssignmentOrder), Valid: true}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return UserView{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	_, err = q.UpdateUserLeadRouting(ctx, db.UpdateUserLeadRoutingParams{
		ID:                  uid,
		IsAcceptingLeads:    isAccepting,
		LeadAssignmentOrder: assignmentOrder,
	})
	if err != nil {
		return UserView{}, fmt.Errorf("update user lead routing: %w", err)
	}

	oldValues := map[string]any{
		"is_accepting_leads":    existing.IsAcceptingLeads,
		"lead_assignment_order": existing.LeadAssignmentOrder,
	}
	newValues := map[string]any{}
	if input.IsAcceptingLeads != nil {
		newValues["is_accepting_leads"] = *input.IsAcceptingLeads
	}
	if input.LeadAssignmentOrder != nil {
		newValues["lead_assignment_order"] = *input.LeadAssignmentOrder
	}

	if err := audit.Write(ctx, q, claims.UserID, "user.update_lead_routing", "user", uid, oldValues, newValues); err != nil {
		return UserView{}, fmt.Errorf("write audit log: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return UserView{}, fmt.Errorf("commit tx: %w", err)
	}

	return s.Get(ctx, claims, id)
}

// ReorderLeadRouting updates the assignment order for multiple sale staff sequentially.
func (s *Service) ReorderLeadRouting(ctx context.Context, claims *auth.AccessClaims, input ReorderLeadRoutingInput) error {
	if !claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin) {
		return ErrForbidden
	}

	if len(input.OrderedUserIDs) == 0 {
		return nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	for index, idStr := range input.OrderedUserIDs {
		uid, err := data.UUID(idStr)
		if err != nil {
			continue
		}
		err = q.UpdateLeadAssignmentOrder(ctx, db.UpdateLeadAssignmentOrderParams{
			ID:                  uid,
			LeadAssignmentOrder: int32(index + 1),
		})
		if err != nil {
			return fmt.Errorf("update order for user %s: %w", idStr, err)
		}
	}

	actorID, _ := data.UUID(claims.UserID)
	if err := audit.Write(ctx, q, claims.UserID, "user.reorder_lead_routing", "user", actorID, nil, map[string]any{
		"ordered_user_ids": input.OrderedUserIDs,
	}); err != nil {
		return fmt.Errorf("write reorder audit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}

