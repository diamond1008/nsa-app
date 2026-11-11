// Package students implements administrator student-account management.
package students

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

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
	ErrNotFound      = errors.New("student not found")
	ErrEmailConflict = errors.New("email already exists")
	ErrCodeConflict  = errors.New("student code already exists")
	ErrStatusReason  = errors.New("status change reason is required")
)

type ListFilter struct {
	Search         string
	Status         string
	ClassID        string
	CourseID       string
	AttendanceRisk string
	SortBy         string
	SortOrder      string
	Page           int
	PerPage        int
}

// View is the public administrator representation of a student and account.
type View struct {
	ID                    string  `json:"id"`
	UserID                string  `json:"user_id"`
	Email                 string  `json:"email"`
	AccountStatus         string  `json:"account_status"`
	StudentCode           string  `json:"student_code"`
	FullName              string  `json:"full_name"`
	AvatarURL             *string `json:"avatar_url"`
	Phone                 *string `json:"phone"`
	DateOfBirth           *string `json:"date_of_birth"`
	Gender                *string `json:"gender"`
	Address               *string `json:"address"`
	EmergencyContactName  *string `json:"emergency_contact_name"`
	EmergencyContactPhone *string `json:"emergency_contact_phone"`
	Status                string  `json:"status"`
	EnrolledAt            *string `json:"enrolled_at"`
	CreatedAt             string  `json:"created_at"`
	UpdatedAt             string  `json:"updated_at"`
}

// WriteInput contains normalized, validated fields shared by create/update.
type WriteInput struct {
	Email                 string
	Password              string
	AccountStatus         db.UserStatus
	StudentCode           string
	FullName              string
	AvatarURL             *string
	Phone                 *string
	DateOfBirth           *string
	Gender                *string
	Address               *string
	EmergencyContactName  *string
	EmergencyContactPhone *string
	Status                db.StudentStatus
	EnrolledAt            *string
	StatusChangeReason    *string
}

// StatusHistoryView is an immutable student lifecycle transition.
type StatusHistoryView struct {
	ID             string  `json:"id"`
	StudentID      string  `json:"student_id"`
	FromStatus     *string `json:"from_status"`
	ToStatus       string  `json:"to_status"`
	Reason         string  `json:"reason"`
	ChangedBy      *string `json:"changed_by"`
	ChangedByEmail *string `json:"changed_by_email"`
	ChangedAt      string  `json:"changed_at"`
}

type ProfileSummaryView struct {
	Profile               View  `json:"profile"`
	CurrentClasses        int64 `json:"current_classes"`
	TotalClasses          int64 `json:"total_classes"`
	AttendanceRiskClasses int64 `json:"attendance_risk_classes"`
	UpcomingSessions      int64 `json:"upcoming_sessions"`
}

type ClassPeriodView struct {
	ID          string  `json:"id"`
	StartedAt   string  `json:"started_at"`
	EndedAt     *string `json:"ended_at"`
	StartReason *string `json:"start_reason"`
	EndReason   *string `json:"end_reason"`
}

type ClassHistoryView struct {
	EnrollmentID     string            `json:"enrollment_id"`
	ClassID          string            `json:"class_id"`
	ClassCode        string            `json:"class_code"`
	ClassName        string            `json:"class_name"`
	CourseID         string            `json:"course_id"`
	CourseCode       string            `json:"course_code"`
	CourseName       string            `json:"course_name"`
	EnrollmentStatus string            `json:"enrollment_status"`
	EnrolledAt       string            `json:"enrolled_at"`
	EndedAt          *string           `json:"ended_at"`
	Periods          []ClassPeriodView `json:"periods"`
}

type ClassHistoryResult = pagination.Result[ClassHistoryView]

// Service implements student management use cases.
type Service struct {
	pool       *pgxpool.Pool
	queries    *db.Queries
	bcryptCost int
}

func NewService(pool *pgxpool.Pool, bcryptCost int) *Service {
	return &Service{pool: pool, queries: db.New(pool), bcryptCost: bcryptCost}
}

// Create atomically creates the account, STUDENT role, profile, and audit log.
func (s *Service) Create(ctx context.Context, actorID string, input WriteInput) (View, error) {
	passwordHash, err := auth.HashPassword(input.Password, s.bcryptCost)
	if err != nil {
		return View{}, fmt.Errorf("hash temporary password: %w", err)
	}
	dateOfBirth, err := data.Date(input.DateOfBirth)
	if err != nil {
		return View{}, err
	}
	enrolledAt, err := data.Date(input.EnrolledAt)
	if err != nil {
		return View{}, err
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return View{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin create student: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)

	user, err := q.CreateManagedUser(ctx, db.CreateManagedUserParams{
		Email:        input.Email,
		PasswordHash: passwordHash,
		Status:       input.AccountStatus,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}
	if err := q.AssignManagedUserRole(ctx, db.AssignManagedUserRoleParams{
		UserID: user.ID, Code: auth.RoleStudent, AssignedBy: actor,
	}); err != nil {
		return View{}, fmt.Errorf("assign student role: %w", err)
	}
	_ = q.SyncManagedUserIdentity(ctx, db.SyncManagedUserIdentityParams{
		ID:        user.ID,
		FullName:  data.Text(&input.FullName),
		Phone:     data.Text(input.Phone),
		AvatarUrl: data.Text(input.AvatarURL),
	})
	profile, err := q.CreateStudentProfile(ctx, db.CreateStudentProfileParams{
		UserID:                user.ID,
		StudentCode:           input.StudentCode,
		FullName:              input.FullName,
		AvatarUrl:             data.Text(input.AvatarURL),
		Phone:                 data.Text(input.Phone),
		DateOfBirth:           dateOfBirth,
		Gender:                data.Text(input.Gender),
		Address:               data.Text(input.Address),
		EmergencyContactName:  data.Text(input.EmergencyContactName),
		EmergencyContactPhone: data.Text(input.EmergencyContactPhone),
		Status:                input.Status,
		EnrolledAt:            enrolledAt,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}
	if _, err := q.CreateStudentStatusHistory(ctx, db.CreateStudentStatusHistoryParams{
		StudentID: profile.ID,
		ToStatus:  input.Status,
		Reason:    "Khởi tạo hồ sơ",
		ChangedBy: actor,
	}); err != nil {
		return View{}, fmt.Errorf("create initial student status history: %w", err)
	}
	created, err := q.GetAdminStudent(ctx, profile.ID)
	if err != nil {
		return View{}, fmt.Errorf("read created student: %w", err)
	}
	view := viewFromGet(created)
	if err := audit.Write(ctx, q, actorID, "student.create", "student_profile", profile.ID, nil, auditStudentView(view)); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit create student: %w", err)
	}
	return view, nil
}

// StatusHistory returns the newest-first immutable lifecycle history.
func (s *Service) StatusHistory(ctx context.Context, id string) ([]StatusHistoryView, error) {
	studentID, err := data.UUID(id)
	if err != nil {
		return nil, ErrNotFound
	}
	if _, err := s.queries.GetAdminStudent(ctx, studentID); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("get student for status history: %w", err)
	}
	rows, err := s.queries.ListStudentStatusHistory(ctx, studentID)
	if err != nil {
		return nil, fmt.Errorf("list student status history: %w", err)
	}
	items := make([]StatusHistoryView, 0, len(rows))
	for _, row := range rows {
		var fromStatus *string
		if row.FromStatus.Valid {
			value := string(row.FromStatus.StudentStatus)
			fromStatus = &value
		}
		items = append(items, StatusHistoryView{
			ID: data.UUIDString(row.ID), StudentID: data.UUIDString(row.StudentID),
			FromStatus: fromStatus, ToStatus: string(row.ToStatus), Reason: row.Reason,
			ChangedBy: data.UUIDPointer(row.ChangedBy), ChangedByEmail: data.TextPointer(row.ChangedByEmail),
			ChangedAt: row.ChangedAt.Time.UTC().Format(time.RFC3339Nano),
		})
	}
	return items, nil
}

// Get returns one student by profile ID.
func (s *Service) Get(ctx context.Context, id string) (View, error) {
	studentID, err := data.UUID(id)
	if err != nil {
		return View{}, ErrNotFound
	}
	row, err := s.queries.GetAdminStudent(ctx, studentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get student: %w", err)
	}
	return viewFromGet(row), nil
}

func (s *Service) ProfileSummary(ctx context.Context, id string) (ProfileSummaryView, error) {
	studentID, err := data.UUID(id)
	if err != nil {
		return ProfileSummaryView{}, ErrNotFound
	}
	profile, err := s.Get(ctx, id)
	if err != nil {
		return ProfileSummaryView{}, err
	}
	metrics, err := s.queries.GetStudentProfileMetrics(ctx, studentID)
	if err != nil {
		return ProfileSummaryView{}, fmt.Errorf("get student profile metrics: %w", err)
	}
	return ProfileSummaryView{
		Profile: profile, CurrentClasses: metrics.CurrentClasses, TotalClasses: metrics.TotalClasses,
		AttendanceRiskClasses: metrics.AttendanceRiskClasses, UpcomingSessions: metrics.UpcomingSessions,
	}, nil
}

func (s *Service) ClassHistory(ctx context.Context, id string, page, perPage int) (ClassHistoryResult, error) {
	studentID, err := data.UUID(id)
	if err != nil {
		return ClassHistoryResult{}, ErrNotFound
	}
	if _, err := s.Get(ctx, id); err != nil {
		return ClassHistoryResult{}, err
	}
	rows, err := s.queries.ListStudentClassHistory(ctx, db.ListStudentClassHistoryParams{
		StudentID: studentID, PageOffset: int32((page - 1) * perPage), PageLimit: int32(perPage),
	})
	if err != nil {
		return ClassHistoryResult{}, fmt.Errorf("list student class history: %w", err)
	}
	items := make([]ClassHistoryView, 0, len(rows))
	for _, row := range rows {
		var periods []ClassPeriodView
		if err := json.Unmarshal([]byte(row.PeriodsJson), &periods); err != nil {
			return ClassHistoryResult{}, fmt.Errorf("decode student class periods: %w", err)
		}
		items = append(items, ClassHistoryView{
			EnrollmentID: data.UUIDString(row.EnrollmentID), ClassID: data.UUIDString(row.ClassID),
			ClassCode: row.ClassCode, ClassName: row.ClassName,
			CourseID: data.UUIDString(row.CourseID), CourseCode: row.CourseCode, CourseName: row.CourseName,
			EnrollmentStatus: row.EnrollmentStatus, EnrolledAt: row.EnrolledAt.Time.UTC().Format(time.RFC3339Nano),
			EndedAt: data.TimeString(row.EndedAt), Periods: periods,
		})
	}
	total, err := s.queries.CountStudentClassHistory(ctx, studentID)
	if err != nil {
		return ClassHistoryResult{}, fmt.Errorf("count student class history: %w", err)
	}
	return pagination.New(items, page, perPage, total), nil
}

// List returns a filtered page of students.
func (s *Service) List(ctx context.Context, filter ListFilter) (pagination.Result[View], error) {
	classID, err := optionalListUUID(filter.ClassID)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	courseID, err := optionalListUUID(filter.CourseID)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	params := db.ListAdminStudentsParams{
		Search: strings.TrimSpace(filter.Search), Status: filter.Status,
		ClassID: classID, CourseID: courseID, AttendanceRisk: filter.AttendanceRisk,
		SortBy: filter.SortBy, SortOrder: filter.SortOrder,
		PageOffset: int32((filter.Page - 1) * filter.PerPage), PageLimit: int32(filter.PerPage),
	}
	rows, err := s.queries.ListAdminStudents(ctx, params)
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("list students: %w", err)
	}
	total, err := s.queries.CountAdminStudents(ctx, db.CountAdminStudentsParams{
		Search: params.Search, Status: params.Status, ClassID: classID, CourseID: courseID,
		AttendanceRisk: filter.AttendanceRisk,
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("count students: %w", err)
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

// Export returns all students matching the administrator filters in a stable order.
func (s *Service) Export(ctx context.Context, filter ListFilter) ([]View, error) {
	classID, err := optionalListUUID(filter.ClassID)
	if err != nil {
		return nil, err
	}
	courseID, err := optionalListUUID(filter.CourseID)
	if err != nil {
		return nil, err
	}
	rows, err := s.queries.ExportAdminStudents(ctx, db.ExportAdminStudentsParams{
		Search: strings.TrimSpace(filter.Search), Status: filter.Status,
		ClassID: classID, CourseID: courseID, AttendanceRisk: filter.AttendanceRisk,
	})
	if err != nil {
		return nil, fmt.Errorf("export students: %w", err)
	}
	items := make([]View, 0, len(rows))
	for _, row := range rows {
		items = append(items, View{
			ID: data.UUIDString(row.ID), UserID: data.UUIDString(row.UserID),
			Email: row.Email, AccountStatus: string(row.UserStatus),
			StudentCode: row.StudentCode, FullName: row.FullName, AvatarURL: data.TextPointer(row.AvatarUrl),
			Phone: data.TextPointer(row.Phone), DateOfBirth: data.DateString(row.DateOfBirth),
			Gender: data.TextPointer(row.Gender), Address: data.TextPointer(row.Address),
			EmergencyContactName:  data.TextPointer(row.EmergencyContactName),
			EmergencyContactPhone: data.TextPointer(row.EmergencyContactPhone),
			Status:                string(row.StudentStatus), EnrolledAt: data.DateString(row.EnrolledAt),
			CreatedAt: row.CreatedAt.Time.UTC().Format(time.RFC3339Nano),
			UpdatedAt: row.UpdatedAt.Time.UTC().Format(time.RFC3339Nano),
		})
	}
	return items, nil
}

// Update atomically updates the account, profile, and audit log.
func (s *Service) Update(ctx context.Context, actorID, id string, input WriteInput) (View, error) {
	studentID, err := data.UUID(id)
	if err != nil {
		return View{}, ErrNotFound
	}
	dateOfBirth, err := data.Date(input.DateOfBirth)
	if err != nil {
		return View{}, err
	}
	enrolledAt, err := data.Date(input.EnrolledAt)
	if err != nil {
		return View{}, err
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return View{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin update student: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)

	existing, err := q.GetAdminStudent(ctx, studentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get student for update: %w", err)
	}
	oldView := viewFromGet(existing)
	statusChanged := existing.StudentStatus != input.Status
	statusReason := ""
	if input.StatusChangeReason != nil {
		statusReason = strings.TrimSpace(*input.StatusChangeReason)
	}
	if statusChanged && statusReason == "" {
		return View{}, ErrStatusReason
	}
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
	if _, err := q.UpdateStudentProfile(ctx, db.UpdateStudentProfileParams{
		ID:                    studentID,
		FullName:              input.FullName,
		AvatarUrl:             data.Text(input.AvatarURL),
		Phone:                 data.Text(input.Phone),
		DateOfBirth:           dateOfBirth,
		Gender:                data.Text(input.Gender),
		Address:               data.Text(input.Address),
		EmergencyContactName:  data.Text(input.EmergencyContactName),
		EmergencyContactPhone: data.Text(input.EmergencyContactPhone),
		Status:                input.Status,
		EnrolledAt:            enrolledAt,
	}); err != nil {
		return View{}, mapWriteError(err)
	}
	if statusChanged {
		if _, err := q.CreateStudentStatusHistory(ctx, db.CreateStudentStatusHistoryParams{
			StudentID:  studentID,
			FromStatus: db.NullStudentStatus{StudentStatus: existing.StudentStatus, Valid: true},
			ToStatus:   input.Status,
			Reason:     statusReason,
			ChangedBy:  actor,
		}); err != nil {
			return View{}, fmt.Errorf("create student status history: %w", err)
		}
	}
	updated, err := q.GetAdminStudent(ctx, studentID)
	if err != nil {
		return View{}, fmt.Errorf("read updated student: %w", err)
	}
	view := viewFromGet(updated)
	if err := audit.Write(ctx, q, actorID, "student.update", "student_profile", studentID, auditStudentView(oldView), auditStudentView(view)); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit update student: %w", err)
	}
	return view, nil
}

func auditStudentView(view View) View {
	view.AvatarURL = avatar.Redact(view.AvatarURL)
	return view
}

func mapWriteError(err error) error {
	if dberror.IsCode(err, dberror.UniqueViolation) {
		switch dberror.Constraint(err) {
		case "users_email_key":
			return ErrEmailConflict
		case "student_profiles_student_code_key":
			return ErrCodeConflict
		}
	}
	return err
}

func viewFromGet(row db.GetAdminStudentRow) View {
	return View{
		ID: data.UUIDString(row.ID), UserID: data.UUIDString(row.UserID),
		Email: row.Email, AccountStatus: string(row.UserStatus),
		StudentCode: row.StudentCode, FullName: row.FullName, AvatarURL: data.TextPointer(row.AvatarUrl),
		Phone: data.TextPointer(row.Phone), DateOfBirth: data.DateString(row.DateOfBirth),
		Gender: data.TextPointer(row.Gender), Address: data.TextPointer(row.Address),
		EmergencyContactName:  data.TextPointer(row.EmergencyContactName),
		EmergencyContactPhone: data.TextPointer(row.EmergencyContactPhone),
		Status:                string(row.StudentStatus), EnrolledAt: data.DateString(row.EnrolledAt),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func viewFromList(row db.ListAdminStudentsRow) View {
	return View{
		ID: data.UUIDString(row.ID), UserID: data.UUIDString(row.UserID),
		Email: row.Email, AccountStatus: string(row.UserStatus),
		StudentCode: row.StudentCode, FullName: row.FullName, AvatarURL: data.TextPointer(row.AvatarUrl),
		Phone: data.TextPointer(row.Phone), DateOfBirth: data.DateString(row.DateOfBirth),
		Gender: data.TextPointer(row.Gender), Address: data.TextPointer(row.Address),
		EmergencyContactName:  data.TextPointer(row.EmergencyContactName),
		EmergencyContactPhone: data.TextPointer(row.EmergencyContactPhone),
		Status:                string(row.StudentStatus), EnrolledAt: data.DateString(row.EnrolledAt),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

type AttendanceBreakdownItem struct {
	ClassID              string  `json:"class_id"`
	ClassCode            string  `json:"class_code"`
	ClassName            string  `json:"class_name"`
	CourseName           string  `json:"course_name"`
	MinimumAttendancePct float64 `json:"minimum_attendance_pct"`
	TotalSessions        int64   `json:"total_sessions"`
	RecordedSessions     int64   `json:"recorded_sessions"`
	AttendedSessions     int64   `json:"attended_sessions"`
	AbsentSessions       int64   `json:"absent_sessions"`
	AttendancePct        float64 `json:"attendance_pct"`
	AtRisk               bool    `json:"at_risk"`
}

func (s *Service) GetAttendanceBreakdown(ctx context.Context, studentID string) ([]AttendanceBreakdownItem, error) {
	id, err := data.UUID(studentID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.queries.GetStudentAttendanceBreakdown(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("read attendance breakdown: %w", err)
	}
	items := make([]AttendanceBreakdownItem, 0, len(rows))
	for _, r := range rows {
		minPct := data.NumericFloat(r.MinimumAttendancePct)
		total := r.TotalSessions
		recorded := r.RecordedSessions
		attended := r.AttendedSessions
		var pct float64 = 100.0
		if recorded > 0 {
			pct = (float64(attended) / float64(recorded)) * 100.0
		}
		atRisk := recorded > 0 && pct < minPct
		items = append(items, AttendanceBreakdownItem{
			ClassID:              data.UUIDString(r.ClassID),
			ClassCode:            r.ClassCode,
			ClassName:            r.ClassName,
			CourseName:           r.CourseName,
			MinimumAttendancePct: minPct,
			TotalSessions:        total,
			RecordedSessions:     recorded,
			AttendedSessions:     attended,
			AbsentSessions:       r.AbsentSessions,
			AttendancePct:        pct,
			AtRisk:               atRisk,
		})
	}
	return items, nil
}

type AcademicSummaryItem struct {
	TestID     string  `json:"test_id"`
	TestTitle  string  `json:"test_title"`
	PassScore  float64 `json:"pass_score"`
	ClassID    string  `json:"class_id"`
	ClassName  string  `json:"class_name"`
	CourseID   string  `json:"course_id"`
	CourseName string  `json:"course_name"`
	Score      float64 `json:"score"`
	GradedAt   string  `json:"graded_at"`
	Passed     bool    `json:"passed"`
}

func (s *Service) GetAcademicSummary(ctx context.Context, studentID string) ([]AcademicSummaryItem, error) {
	id, err := data.UUID(studentID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.queries.GetStudentAcademicSummary(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("read academic summary: %w", err)
	}
	items := make([]AcademicSummaryItem, 0, len(rows))
	for _, r := range rows {
		score := data.NumericFloat(r.Score)
		passScore := data.NumericFloat(r.PassScore)
		items = append(items, AcademicSummaryItem{
			TestID:     data.UUIDString(r.TestID),
			TestTitle:  r.TestTitle,
			PassScore:  passScore,
			ClassID:    data.UUIDString(r.ClassID),
			ClassName:  r.ClassName,
			CourseID:   data.UUIDString(r.CourseID),
			CourseName: r.CourseName,
			Score:      score,
			GradedAt:   r.GradedAt.Time.UTC().Format(time.RFC3339),
			Passed:     score >= passScore,
		})
	}
	return items, nil
}

type ClassSessionAttendanceItem struct {
	SessionID        string `json:"session_id"`
	StartsAt         string `json:"starts_at"`
	EndsAt           string `json:"ends_at"`
	SessionTitle     string `json:"session_title"`
	SessionStatus    string `json:"session_status"`
	LocationName     string `json:"location_name"`
	TeacherName      string `json:"teacher_name"`
	AttendanceStatus string `json:"attendance_status"`
	Remarks          string `json:"remarks"`
}

func (s *Service) GetClassSessionAttendance(ctx context.Context, studentID, classID string) ([]ClassSessionAttendanceItem, error) {
	sID, err := data.UUID(studentID)
	if err != nil {
		return nil, ErrNotFound
	}
	cID, err := data.UUID(classID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.queries.GetStudentClassSessionAttendance(ctx, db.GetStudentClassSessionAttendanceParams{
		StudentID: sID,
		ClassID:   cID,
	})
	if err != nil {
		return nil, fmt.Errorf("read class session attendance: %w", err)
	}
	items := make([]ClassSessionAttendanceItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, ClassSessionAttendanceItem{
			SessionID:        data.UUIDString(r.SessionID),
			StartsAt:         r.StartsAt.Time.UTC().Format(time.RFC3339),
			EndsAt:           r.EndsAt.Time.UTC().Format(time.RFC3339),
			SessionTitle:     r.SessionTitle,
			SessionStatus:    string(r.SessionStatus),
			LocationName:     r.LocationName,
			TeacherName:      r.TeacherName,
			AttendanceStatus: r.AttendanceStatus,
			Remarks:          r.Remarks,
		})
	}
	return items, nil
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
			CreatedAt:   r.CreatedAt.Time.UTC().Format(time.RFC3339),
		})
	}
	return pagination.New(items, page, perPage, total), nil
}

func (s *Service) UpdateAccountStatus(ctx context.Context, profileID, newStatus, reason, actorID string) (View, error) {
	newStatus = strings.TrimSpace(strings.ToLower(newStatus))
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return View{}, ErrStatusReason
	}
	if newStatus != "active" && newStatus != "inactive" && newStatus != "suspended" {
		return View{}, errors.New("invalid account status")
	}
	st, err := s.Get(ctx, profileID)
	if err != nil {
		return View{}, err
	}
	userID, err := data.UUID(st.UserID)
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

	stID, _ := data.UUID(st.ID)
	err = audit.WriteWithReason(ctx, qtx, actorID, "user.account_status_update", "user", stID, map[string]any{"account_status": st.AccountStatus}, map[string]any{"account_status": res.Status}, reason)
	if err != nil {
		return View{}, fmt.Errorf("record audit: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit tx: %w", err)
	}
	return s.Get(ctx, profileID)
}
