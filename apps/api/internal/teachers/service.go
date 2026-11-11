// Package teachers implements administrator teacher-account management.
package teachers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/avatar"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/dberror"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var (
	ErrNotFound      = errors.New("teacher not found")
	ErrEmailConflict = errors.New("email already exists")
	ErrCodeConflict  = errors.New("teacher code already exists")
)

type ListFilter struct {
	Search     string
	Status     string
	ClassID    string
	CourseID   string
	Assignment string
	SortBy     string
	SortOrder  string
	Page       int
	PerPage    int
}

type View struct {
	ID             string  `json:"id"`
	UserID         string  `json:"user_id"`
	Email          string  `json:"email"`
	AccountStatus  string  `json:"account_status"`
	TeacherCode    string  `json:"teacher_code"`
	FullName       string  `json:"full_name"`
	AvatarURL      *string `json:"avatar_url"`
	Phone          *string `json:"phone"`
	Specialization *string `json:"specialization"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

type WriteInput struct {
	Email          string
	Password       string
	AccountStatus  db.UserStatus
	TeacherCode    string
	FullName       string
	AvatarURL      *string
	Phone          *string
	Specialization *string
	Status         db.TeacherStatus
}

type ProfileSummaryView struct {
	Profile           View  `json:"profile"`
	CurrentClasses    int64 `json:"current_classes"`
	TotalClasses      int64 `json:"total_classes"`
	CompletedSessions int64 `json:"completed_sessions"`
	UpcomingSessions  int64 `json:"upcoming_sessions"`
}

type AssignmentPeriodView struct {
	ID          string  `json:"id"`
	StartedAt   string  `json:"started_at"`
	EndedAt     *string `json:"ended_at"`
	StartReason *string `json:"start_reason"`
	EndReason   *string `json:"end_reason"`
}

type ClassHistoryView struct {
	AssignmentID   string                 `json:"assignment_id"`
	ClassID        string                 `json:"class_id"`
	ClassCode      string                 `json:"class_code"`
	ClassName      string                 `json:"class_name"`
	CourseID       string                 `json:"course_id"`
	CourseCode     string                 `json:"course_code"`
	CourseName     string                 `json:"course_name"`
	AssignmentRole string                 `json:"assignment_role"`
	AssignedAt     string                 `json:"assigned_at"`
	IsCurrent      bool                   `json:"is_current"`
	Periods        []AssignmentPeriodView `json:"periods"`
}

type ClassHistoryResult = pagination.Result[ClassHistoryView]

type Service struct {
	pool       *pgxpool.Pool
	queries    *db.Queries
	bcryptCost int
}

func NewService(pool *pgxpool.Pool, bcryptCost int) *Service {
	return &Service{pool: pool, queries: db.New(pool), bcryptCost: bcryptCost}
}

func (s *Service) Create(ctx context.Context, actorID string, input WriteInput) (View, error) {
	passwordHash, err := auth.HashPassword(input.Password, s.bcryptCost)
	if err != nil {
		return View{}, fmt.Errorf("hash temporary password: %w", err)
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return View{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin create teacher: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	user, err := q.CreateManagedUser(ctx, db.CreateManagedUserParams{
		Email: input.Email, PasswordHash: passwordHash, Status: input.AccountStatus,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}
	if err := q.AssignManagedUserRole(ctx, db.AssignManagedUserRoleParams{
		UserID: user.ID, Code: auth.RoleTeacher, AssignedBy: actor,
	}); err != nil {
		return View{}, fmt.Errorf("assign teacher role: %w", err)
	}
	_ = q.SyncManagedUserIdentity(ctx, db.SyncManagedUserIdentityParams{
		ID:        user.ID,
		FullName:  data.Text(&input.FullName),
		Phone:     data.Text(input.Phone),
		AvatarUrl: data.Text(input.AvatarURL),
	})
	profile, err := q.CreateTeacherProfile(ctx, db.CreateTeacherProfileParams{
		UserID: user.ID, TeacherCode: input.TeacherCode, FullName: input.FullName,
		AvatarUrl: data.Text(input.AvatarURL),
		Phone:     data.Text(input.Phone), Specialization: data.Text(input.Specialization),
		Status: input.Status,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}
	created, err := q.GetAdminTeacher(ctx, profile.ID)
	if err != nil {
		return View{}, fmt.Errorf("read created teacher: %w", err)
	}
	view := viewFromGet(created)
	if err := audit.Write(ctx, q, actorID, "teacher.create", "teacher_profile", profile.ID, nil, auditTeacherView(view)); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit create teacher: %w", err)
	}
	return view, nil
}

func (s *Service) Get(ctx context.Context, id string) (View, error) {
	teacherID, err := data.UUID(id)
	if err != nil {
		return View{}, ErrNotFound
	}
	row, err := s.queries.GetAdminTeacher(ctx, teacherID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get teacher: %w", err)
	}
	return viewFromGet(row), nil
}

func (s *Service) ProfileSummary(ctx context.Context, id string) (ProfileSummaryView, error) {
	teacherID, err := data.UUID(id)
	if err != nil {
		return ProfileSummaryView{}, ErrNotFound
	}
	profile, err := s.Get(ctx, id)
	if err != nil {
		return ProfileSummaryView{}, err
	}
	metrics, err := s.queries.GetTeacherProfileMetrics(ctx, teacherID)
	if err != nil {
		return ProfileSummaryView{}, fmt.Errorf("get teacher profile metrics: %w", err)
	}
	return ProfileSummaryView{
		Profile: profile, CurrentClasses: metrics.CurrentClasses, TotalClasses: metrics.TotalClasses,
		CompletedSessions: metrics.CompletedSessions, UpcomingSessions: metrics.UpcomingSessions,
	}, nil
}

func (s *Service) ClassHistory(ctx context.Context, id string, page, perPage int) (ClassHistoryResult, error) {
	teacherID, err := data.UUID(id)
	if err != nil {
		return ClassHistoryResult{}, ErrNotFound
	}
	if _, err := s.Get(ctx, id); err != nil {
		return ClassHistoryResult{}, err
	}
	rows, err := s.queries.ListTeacherClassHistory(ctx, db.ListTeacherClassHistoryParams{
		TeacherID: teacherID, PageOffset: int32((page - 1) * perPage), PageLimit: int32(perPage),
	})
	if err != nil {
		return ClassHistoryResult{}, fmt.Errorf("list teacher class history: %w", err)
	}
	items := make([]ClassHistoryView, 0, len(rows))
	for _, row := range rows {
		var periods []AssignmentPeriodView
		if err := json.Unmarshal([]byte(row.PeriodsJson), &periods); err != nil {
			return ClassHistoryResult{}, fmt.Errorf("decode teacher assignment periods: %w", err)
		}
		items = append(items, ClassHistoryView{
			AssignmentID: data.UUIDString(row.AssignmentID), ClassID: data.UUIDString(row.ClassID),
			ClassCode: row.ClassCode, ClassName: row.ClassName,
			CourseID: data.UUIDString(row.CourseID), CourseCode: row.CourseCode, CourseName: row.CourseName,
			AssignmentRole: row.AssignmentRole, AssignedAt: row.AssignedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
			IsCurrent: row.IsCurrent, Periods: periods,
		})
	}
	total, err := s.queries.CountTeacherClassHistory(ctx, teacherID)
	if err != nil {
		return ClassHistoryResult{}, fmt.Errorf("count teacher class history: %w", err)
	}
	return pagination.New(items, page, perPage, total), nil
}

func (s *Service) List(ctx context.Context, filter ListFilter) (pagination.Result[View], error) {
	classID, err := optionalListUUID(filter.ClassID)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	courseID, err := optionalListUUID(filter.CourseID)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	params := db.ListAdminTeachersParams{
		Search: strings.TrimSpace(filter.Search), Status: filter.Status,
		ClassID: classID, CourseID: courseID, Assignment: filter.Assignment,
		SortBy: filter.SortBy, SortOrder: filter.SortOrder,
		PageOffset: int32((filter.Page - 1) * filter.PerPage), PageLimit: int32(filter.PerPage),
	}
	rows, err := s.queries.ListAdminTeachers(ctx, params)
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("list teachers: %w", err)
	}
	total, err := s.queries.CountAdminTeachers(ctx, db.CountAdminTeachersParams{
		Search: params.Search, Status: params.Status, ClassID: classID,
		CourseID: courseID, Assignment: params.Assignment,
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("count teachers: %w", err)
	}
	items := make([]View, 0, len(rows))
	for _, row := range rows {
		items = append(items, viewFromList(row))
	}
	return pagination.New(items, filter.Page, filter.PerPage, total), nil
}

func optionalListUUID(value string) (pgtype.UUID, error) {
	if strings.TrimSpace(value) == "" {
		return pgtype.UUID{}, nil
	}
	return data.UUID(value)
}

func (s *Service) Update(ctx context.Context, actorID, id string, input WriteInput) (View, error) {
	teacherID, err := data.UUID(id)
	if err != nil {
		return View{}, ErrNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin update teacher: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	existing, err := q.GetAdminTeacher(ctx, teacherID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get teacher for update: %w", err)
	}
	oldView := viewFromGet(existing)
	if _, err := q.UpdateManagedUser(ctx, db.UpdateManagedUserParams{
		ID: existing.UserID, Email: input.Email, Status: input.AccountStatus,
	}); err != nil {
		return View{}, mapWriteError(err)
	}
	_ = q.SyncManagedUserIdentity(ctx, db.SyncManagedUserIdentityParams{
		ID:        existing.UserID,
		FullName:  data.Text(&input.FullName),
		Phone:     data.Text(input.Phone),
		AvatarUrl: data.Text(input.AvatarURL),
	})
	if _, err := q.UpdateTeacherProfile(ctx, db.UpdateTeacherProfileParams{
		ID: teacherID, TeacherCode: input.TeacherCode, FullName: input.FullName,
		AvatarUrl: data.Text(input.AvatarURL),
		Phone:     data.Text(input.Phone), Specialization: data.Text(input.Specialization),
		Status: input.Status,
	}); err != nil {
		return View{}, mapWriteError(err)
	}
	updated, err := q.GetAdminTeacher(ctx, teacherID)
	if err != nil {
		return View{}, fmt.Errorf("read updated teacher: %w", err)
	}
	view := viewFromGet(updated)
	if err := audit.Write(ctx, q, actorID, "teacher.update", "teacher_profile", teacherID, auditTeacherView(oldView), auditTeacherView(view)); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit update teacher: %w", err)
	}
	return view, nil
}

func auditTeacherView(view View) View {
	view.AvatarURL = avatar.Redact(view.AvatarURL)
	return view
}

func mapWriteError(err error) error {
	if dberror.IsCode(err, dberror.UniqueViolation) {
		switch dberror.Constraint(err) {
		case "users_email_key":
			return ErrEmailConflict
		case "teacher_profiles_teacher_code_key":
			return ErrCodeConflict
		}
	}
	return err
}

func viewFromGet(row db.GetAdminTeacherRow) View {
	return View{
		ID: data.UUIDString(row.ID), UserID: data.UUIDString(row.UserID),
		Email: row.Email, AccountStatus: string(row.UserStatus),
		TeacherCode: row.TeacherCode, FullName: row.FullName,
		AvatarURL: data.TextPointer(row.AvatarUrl),
		Phone:     data.TextPointer(row.Phone), Specialization: data.TextPointer(row.Specialization),
		Status:    string(row.TeacherStatus),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func viewFromList(row db.ListAdminTeachersRow) View {
	return View{
		ID: data.UUIDString(row.ID), UserID: data.UUIDString(row.UserID),
		Email: row.Email, AccountStatus: string(row.UserStatus),
		TeacherCode: row.TeacherCode, FullName: row.FullName,
		AvatarURL: data.TextPointer(row.AvatarUrl),
		Phone:     data.TextPointer(row.Phone), Specialization: data.TextPointer(row.Specialization),
		Status:    string(row.TeacherStatus),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

type WorkloadSummaryItem struct {
	ClassID                  string  `json:"class_id"`
	ClassCode                string  `json:"class_code"`
	ClassName                string  `json:"class_name"`
	CourseName               string  `json:"course_name"`
	CompletedSessions        int64   `json:"completed_sessions"`
	RecordedRollcallSessions int64   `json:"recorded_rollcall_sessions"`
	PunctualityPct           float64 `json:"punctuality_pct"`
}

func (s *Service) GetWorkloadSummary(ctx context.Context, teacherID string) ([]WorkloadSummaryItem, error) {
	id, err := data.UUID(teacherID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.queries.GetTeacherWorkloadSummary(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("read teacher workload summary: %w", err)
	}
	items := make([]WorkloadSummaryItem, 0, len(rows))
	for _, r := range rows {
		total := r.CompletedSessions
		recorded := r.RecordedRollcallSessions
		var pct float64
		if total > 0 {
			pct = (float64(recorded) / float64(total)) * 100.0
		} else {
			pct = 100.0
		}
		items = append(items, WorkloadSummaryItem{
			ClassID:                  data.UUIDString(r.ClassID),
			ClassCode:                r.ClassCode,
			ClassName:                r.ClassName,
			CourseName:               r.CourseName,
			CompletedSessions:        total,
			RecordedRollcallSessions: recorded,
			PunctualityPct:           pct,
		})
	}
	return items, nil
}

func (s *Service) UpdateAccountStatus(ctx context.Context, profileID, newStatus, reason, actorID string) (View, error) {
	newStatus = strings.TrimSpace(strings.ToLower(newStatus))
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return View{}, errors.New("status change reason is required")
	}
	if newStatus != "active" && newStatus != "inactive" && newStatus != "suspended" {
		return View{}, errors.New("invalid account status")
	}
	tc, err := s.Get(ctx, profileID)
	if err != nil {
		return View{}, err
	}
	userID, err := data.UUID(tc.UserID)
	if err != nil {
		return View{}, ErrNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	res, err := qtx.UpdateUserAccountStatus(ctx, db.UpdateUserAccountStatusParams{
		ID:     userID,
		Status: db.UserStatus(newStatus),
	})
	if err != nil {
		return View{}, fmt.Errorf("update user status: %w", err)
	}

	tcID, _ := data.UUID(tc.ID)
	err = audit.WriteWithReason(ctx, qtx, actorID, "user.account_status_update", "user", tcID, map[string]any{"account_status": tc.AccountStatus}, map[string]any{"account_status": res.Status}, reason)
	if err != nil {
		return View{}, fmt.Errorf("record audit: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit tx: %w", err)
	}
	return s.Get(ctx, profileID)
}

type AuditLogItem struct {
	ID          int64   `json:"id"`
	ActorUserID string  `json:"actor_user_id"`
	ActorEmail  string  `json:"actor_email"`
	Action      string  `json:"action"`
	EntityType  string  `json:"entity_type"`
	EntityID    string  `json:"entity_id"`
	OldValues   string  `json:"old_values"`
	NewValues   string  `json:"new_values"`
	Reason      *string `json:"reason"`
	CreatedAt   string  `json:"created_at"`
}

func (s *Service) GetAuditLogs(ctx context.Context, entityID string, page, perPage int) (pagination.Result[AuditLogItem], error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	id, err := data.UUID(entityID)
	if err != nil {
		return pagination.New([]AuditLogItem{}, page, perPage, 0), nil
	}
	total, err := s.queries.CountPersonAuditLogs(ctx, id)
	if err != nil {
		return pagination.Result[AuditLogItem]{}, fmt.Errorf("count audit logs: %w", err)
	}
	offset := int32((page - 1) * perPage)
	rows, err := s.queries.GetPersonAuditLogs(ctx, db.GetPersonAuditLogsParams{
		EntityID: id,
		Limit:    int32(perPage),
		Offset:   offset,
	})
	if err != nil {
		return pagination.Result[AuditLogItem]{}, fmt.Errorf("list audit logs: %w", err)
	}
	items := make([]AuditLogItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, AuditLogItem{
			ID:          r.ID,
			ActorUserID: data.UUIDString(r.ActorUserID),
			ActorEmail:  r.ActorEmail,
			Action:      r.Action,
			EntityType:  r.EntityType,
			EntityID:    data.UUIDString(r.EntityID),
			OldValues:   string(r.OldValues),
			NewValues:   string(r.NewValues),
			Reason:      data.TextPointer(r.Reason),
			CreatedAt:   r.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		})
	}
	return pagination.New(items, page, perPage, total), nil
}
