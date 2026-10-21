// Package classes implements administrator class, enrollment, and teacher
// assignment management.
package classes

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

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/classhistory"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/dberror"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var (
	ErrClassNotFound          = errors.New("class not found")
	ErrCourseNotFound         = errors.New("course not found")
	ErrClassConflict          = errors.New("class code already exists")
	ErrCapacityBelowCount     = errors.New("capacity is below current enrollment")
	ErrClassNotEnrollable     = errors.New("class status does not allow enrollment")
	ErrStudentNotFound        = errors.New("student not found")
	ErrStudentInactive        = errors.New("student is not active")
	ErrEnrollmentNotFound     = errors.New("enrollment not found")
	ErrDuplicateEnrollment    = errors.New("student is already enrolled in class")
	ErrClassFull              = errors.New("class is full")
	ErrTeacherNotFound        = errors.New("teacher not found")
	ErrTeacherInactive        = errors.New("teacher is not active")
	ErrTeacherNotAssigned     = errors.New("teacher is not assigned to class")
	ErrAssignmentNotFound     = errors.New("teacher assignment not found")
	ErrDuplicateAssignment    = errors.New("teacher already assigned")
	ErrAssignmentInUse        = errors.New("teacher assignment is used by sessions")
	ErrEnrollmentNotActive    = errors.New("enrollment is not active")
	ErrEnrollmentCannotReopen = errors.New("only a withdrawn enrollment can be reopened")
	ErrReenrollmentDate       = errors.New("reenrollment time is outside the allowed range")
	ErrActiveCourseEnrollment = errors.New("student already has an active enrollment for this course")
	ErrTransferSameClass      = errors.New("source and target classes are the same")
	ErrTransferCourse         = errors.New("target class belongs to another course")
)

type ListFilter struct {
	Search       string
	Status       string
	CourseID     string
	TeacherID    string
	Capacity     string
	FromDate     string
	ToDate       string
	SaleUserID   string
	UpcomingOnly bool
	SortBy       string
	SortOrder    string
	Page         int
	PerPage      int
}

type View struct {
	ID               string `json:"id"`
	CourseID         string `json:"course_id"`
	CourseCode       string `json:"course_code"`
	CourseName       string `json:"course_name"`
	ClassCode        string `json:"class_code"`
	Name             string `json:"name"`
	StartDate        string `json:"start_date"`
	EndDate          string `json:"end_date"`
	MaximumStudents  int32  `json:"maximum_students"`
	EnrolledStudents int32  `json:"enrolled_students"`
	Status           string `json:"status"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

type EnrollmentView struct {
	ID          string  `json:"id"`
	ClassID     string  `json:"class_id"`
	StudentID   string  `json:"student_id"`
	StudentCode string  `json:"student_code"`
	FullName    string  `json:"full_name"`
	Status      string  `json:"status"`
	EnrolledAt  string  `json:"enrolled_at"`
	EndedAt     *string `json:"ended_at"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type AssignmentView struct {
	ID             string `json:"id"`
	ClassID        string `json:"class_id"`
	TeacherID      string `json:"teacher_id"`
	TeacherCode    string `json:"teacher_code"`
	FullName       string `json:"full_name"`
	AssignmentRole string `json:"assignment_role"`
	AssignedAt     string `json:"assigned_at"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type CriterionView struct {
	ID          string  `json:"id"`
	CourseID    string  `json:"course_id"`
	ModuleID    *string `json:"module_id"`
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	IsRequired  bool    `json:"is_required"`
	SequenceNo  int32   `json:"sequence_no"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type TeacherClassView struct {
	Class        View             `json:"class"`
	Students     []EnrollmentView `json:"students"`
	Competencies []CriterionView  `json:"competencies"`
}

type OperationHistoryView struct {
	ID          string          `json:"id"`
	ClassID     string          `json:"class_id"`
	EventType   string          `json:"event_type"`
	EntityType  string          `json:"entity_type"`
	EntityID    *string         `json:"entity_id"`
	Reason      *string         `json:"reason"`
	Details     json.RawMessage `json:"details"`
	ActorUserID *string         `json:"actor_user_id"`
	ActorEmail  *string         `json:"actor_email"`
	OccurredAt  string          `json:"occurred_at"`
}

type TransferView struct {
	Source EnrollmentView `json:"source"`
	Target EnrollmentView `json:"target"`
}

type WriteInput struct {
	CourseID        string
	ClassCode       string
	Name            string
	StartDate       string
	EndDate         string
	MaximumStudents int32
	Status          db.ClassStatus
	ChangeReason    string
}

type Service struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: db.New(pool)}
}

func (s *Service) Create(ctx context.Context, actorID string, input WriteInput) (View, error) {
	courseID, startDate, endDate, err := parseClassInput(input)
	if err != nil {
		return View{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin create class: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	if _, err := q.GetCourse(ctx, courseID); errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrCourseNotFound
	} else if err != nil {
		return View{}, fmt.Errorf("get class course: %w", err)
	}
	created, err := q.CreateClass(ctx, db.CreateClassParams{
		CourseID: courseID, ClassCode: input.ClassCode, Name: input.Name,
		StartDate: startDate, EndDate: endDate, MaximumStudents: input.MaximumStudents,
		Status: input.Status,
	})
	if err != nil {
		return View{}, mapClassWriteError(err)
	}
	row, err := q.GetAdminClass(ctx, created.ID)
	if err != nil {
		return View{}, fmt.Errorf("read created class: %w", err)
	}
	view := viewFromGet(row)
	if err := classhistory.Write(ctx, q, actorID, created.ID, "class_created", "class", created.ID, "Khởi tạo lớp học", view); err != nil {
		return View{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class.create", "class", created.ID, nil, view); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit create class: %w", err)
	}
	return view, nil
}

func (s *Service) Get(ctx context.Context, id string) (View, error) {
	classID, err := data.UUID(id)
	if err != nil {
		return View{}, ErrClassNotFound
	}
	row, err := s.queries.GetAdminClass(ctx, classID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrClassNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get class: %w", err)
	}
	return viewFromGet(row), nil
}

func (s *Service) OperationHistory(ctx context.Context, id string) ([]OperationHistoryView, error) {
	classID, err := data.UUID(id)
	if err != nil {
		return nil, ErrClassNotFound
	}
	if _, err := s.queries.GetAdminClass(ctx, classID); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrClassNotFound
	} else if err != nil {
		return nil, fmt.Errorf("get class for operation history: %w", err)
	}
	rows, err := s.queries.ListClassOperationHistory(ctx, classID)
	if err != nil {
		return nil, fmt.Errorf("list class operation history: %w", err)
	}
	items := make([]OperationHistoryView, 0, len(rows))
	for _, row := range rows {
		items = append(items, OperationHistoryView{
			ID: data.UUIDString(row.ID), ClassID: data.UUIDString(row.ClassID),
			EventType: row.EventType, EntityType: row.EntityType,
			EntityID: data.UUIDPointer(row.EntityID), Reason: data.TextPointer(row.Reason),
			Details: json.RawMessage(row.Details), ActorUserID: data.UUIDPointer(row.ActorUserID),
			ActorEmail: data.TextPointer(row.ActorEmail), OccurredAt: row.OccurredAt.Time.UTC().Format(time.RFC3339Nano),
		})
	}
	return items, nil
}

func (s *Service) List(ctx context.Context, filter ListFilter) (pagination.Result[View], error) {
	courseID, err := optionalFilterUUID(filter.CourseID)
	if err != nil {
		return pagination.Result[View]{}, ErrCourseNotFound
	}
	teacherID, err := optionalFilterUUID(filter.TeacherID)
	if err != nil {
		return pagination.Result[View]{}, ErrTeacherNotFound
	}
	fromDate, err := data.Date(&filter.FromDate)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	toDate, err := data.Date(&filter.ToDate)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	saleUserID, err := optionalFilterUUID(filter.SaleUserID)
	if err != nil {
		return pagination.Result[View]{}, err
	}
	params := db.ListAdminClassesParams{
		Search: strings.TrimSpace(filter.Search), Status: filter.Status, CourseID: courseID,
		TeacherID: teacherID, Capacity: filter.Capacity, FromDate: fromDate, ToDate: toDate,
		UpcomingOnly: pgtype.Bool{Bool: filter.UpcomingOnly, Valid: filter.UpcomingOnly},
		SaleUserID:   saleUserID,
		SortBy:       filter.SortBy, SortOrder: filter.SortOrder,
		PageOffset: int32((filter.Page - 1) * filter.PerPage), PageLimit: int32(filter.PerPage),
	}
	rows, err := s.queries.ListAdminClasses(ctx, params)
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("list classes: %w", err)
	}
	total, err := s.queries.CountAdminClasses(ctx, db.CountAdminClassesParams{
		Search: params.Search, Status: params.Status, CourseID: courseID, TeacherID: teacherID,
		Capacity: params.Capacity, FromDate: fromDate, ToDate: toDate,
		UpcomingOnly: pgtype.Bool{Bool: filter.UpcomingOnly, Valid: filter.UpcomingOnly},
		SaleUserID:   saleUserID,
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("count classes: %w", err)
	}
	items := make([]View, 0, len(rows))
	for _, row := range rows {
		items = append(items, viewFromList(row))
	}
	return pagination.New(items, filter.Page, filter.PerPage, total), nil
}

func optionalFilterUUID(value string) (pgtype.UUID, error) {
	if strings.TrimSpace(value) == "" {
		return pgtype.UUID{}, nil
	}
	return data.UUID(value)
}

func (s *Service) ListTeacher(ctx context.Context, userIDValue string) ([]View, error) {
	userID, err := data.UUID(userIDValue)
	if err != nil {
		return nil, ErrTeacherNotAssigned
	}
	rows, err := s.queries.ListTeacherClasses(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list teacher classes: %w", err)
	}
	items := make([]View, 0, len(rows))
	for _, row := range rows {
		items = append(items, viewFromTeacherList(row))
	}
	return items, nil
}

func (s *Service) GetTeacherClass(ctx context.Context, userIDValue, classIDValue string) (TeacherClassView, error) {
	userID, err := data.UUID(userIDValue)
	if err != nil {
		return TeacherClassView{}, ErrTeacherNotAssigned
	}
	classID, err := data.UUID(classIDValue)
	if err != nil {
		return TeacherClassView{}, ErrClassNotFound
	}
	if _, err := s.queries.GetAssignedAssessmentTeacher(ctx, db.GetAssignedAssessmentTeacherParams{
		ClassID: classID, UserID: userID,
	}); errors.Is(err, pgx.ErrNoRows) {
		return TeacherClassView{}, ErrTeacherNotAssigned
	} else if err != nil {
		return TeacherClassView{}, fmt.Errorf("authorize teacher class: %w", err)
	}
	classRow, err := s.queries.GetAdminClass(ctx, classID)
	if errors.Is(err, pgx.ErrNoRows) {
		return TeacherClassView{}, ErrClassNotFound
	} else if err != nil {
		return TeacherClassView{}, fmt.Errorf("get teacher class: %w", err)
	}
	studentRows, err := s.queries.ListClassEnrollments(ctx, db.ListClassEnrollmentsParams{ClassID: classID})
	if err != nil {
		return TeacherClassView{}, fmt.Errorf("list teacher class students: %w", err)
	}
	students := make([]EnrollmentView, 0, len(studentRows))
	for _, row := range studentRows {
		students = append(students, enrollmentViewFromList(row))
	}
	criterionRows, err := s.queries.ListCompetencyCriteria(ctx, classRow.CourseID)
	if err != nil {
		return TeacherClassView{}, fmt.Errorf("list teacher class competencies: %w", err)
	}
	criteria := make([]CriterionView, 0, len(criterionRows))
	for _, row := range criterionRows {
		criteria = append(criteria, criterionView(row))
	}
	return TeacherClassView{Class: viewFromGet(classRow), Students: students, Competencies: criteria}, nil
}

func (s *Service) Update(ctx context.Context, actorID, id string, input WriteInput) (View, error) {
	classID, err := data.UUID(id)
	if err != nil {
		return View{}, ErrClassNotFound
	}
	courseID, startDate, endDate, err := parseClassInput(input)
	if err != nil {
		return View{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin update class: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	existing, err := q.GetAdminClass(ctx, classID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrClassNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get class for update: %w", err)
	}
	if _, err := q.GetCourse(ctx, courseID); errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrCourseNotFound
	} else if err != nil {
		return View{}, fmt.Errorf("get updated class course: %w", err)
	}
	if _, err := q.UpdateClass(ctx, db.UpdateClassParams{
		ID: classID, CourseID: courseID, ClassCode: input.ClassCode, Name: input.Name,
		StartDate: startDate, EndDate: endDate, MaximumStudents: input.MaximumStudents,
		Status: input.Status,
	}); err != nil {
		return View{}, mapClassWriteError(err)
	}
	updated, err := q.GetAdminClass(ctx, classID)
	if err != nil {
		return View{}, fmt.Errorf("read updated class: %w", err)
	}
	view := viewFromGet(updated)
	reason := strings.TrimSpace(input.ChangeReason)
	if reason == "" {
		reason = "Cập nhật thông tin lớp"
	}
	if err := classhistory.Write(ctx, q, actorID, classID, "class_updated", "class", classID, reason, map[string]any{
		"before": viewFromGet(existing), "after": view,
	}); err != nil {
		return View{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class.update", "class", classID, viewFromGet(existing), view); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit update class: %w", err)
	}
	return view, nil
}

func (s *Service) Enroll(ctx context.Context, actorID, classIDValue, studentIDValue string) (EnrollmentView, error) {
	return s.EnrollWithReason(ctx, actorID, classIDValue, studentIDValue, "Ghi danh học viên")
}

func (s *Service) EnrollWithReason(ctx context.Context, actorID, classIDValue, studentIDValue, reason string) (EnrollmentView, error) {
	classID, studentID, err := parsePair(classIDValue, studentIDValue)
	if err != nil {
		return EnrollmentView{}, ErrStudentNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("begin enrollment: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	classRow, err := q.GetAdminClass(ctx, classID)
	if errors.Is(err, pgx.ErrNoRows) {
		return EnrollmentView{}, ErrClassNotFound
	}
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get enrollment class: %w", err)
	}
	if !classAllowsRelations(classRow.Status) {
		return EnrollmentView{}, ErrClassNotEnrollable
	}
	student, err := q.GetAdminStudent(ctx, studentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return EnrollmentView{}, ErrStudentNotFound
	}
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get enrollment student: %w", err)
	}
	if student.StudentStatus != db.StudentStatusActive || student.UserStatus != db.UserStatusActive {
		return EnrollmentView{}, ErrStudentInactive
	}
	if _, err := q.GetEnrollmentByClassStudent(ctx, db.GetEnrollmentByClassStudentParams{
		ClassID: classID, StudentID: studentID,
	}); err == nil {
		return EnrollmentView{}, ErrDuplicateEnrollment
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return EnrollmentView{}, fmt.Errorf("check duplicate enrollment: %w", err)
	}
	actor, _ := data.UUID(actorID)
	enrollment, err := q.CreateClassEnrollment(ctx, db.CreateClassEnrollmentParams{
		ClassID: classID, StudentID: studentID, CreatedBy: actor,
	})
	if err != nil {
		return EnrollmentView{}, mapEnrollmentWriteError(err)
	}
	row, err := q.GetClassEnrollment(ctx, db.GetClassEnrollmentParams{ID: enrollment.ID, ClassID: classID})
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("read enrollment: %w", err)
	}
	view := enrollmentViewFromGet(row)
	if err := classhistory.Write(ctx, q, actorID, classID, "student_enrolled", "class_enrollment", enrollment.ID, reason, view); err != nil {
		return EnrollmentView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class_enrollment.create", "class_enrollment", enrollment.ID, nil, view); err != nil {
		return EnrollmentView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return EnrollmentView{}, fmt.Errorf("commit enrollment: %w", err)
	}
	return view, nil
}

func (s *Service) ListEnrollments(ctx context.Context, classIDValue, saleUserIDValue string) ([]EnrollmentView, error) {
	classID, err := data.UUID(classIDValue)
	if err != nil {
		return nil, ErrClassNotFound
	}
	saleUserID, err := optionalFilterUUID(saleUserIDValue)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetAdminClass(ctx, classID); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrClassNotFound
	} else if err != nil {
		return nil, fmt.Errorf("get enrollment class: %w", err)
	}
	rows, err := s.queries.ListClassEnrollments(ctx, db.ListClassEnrollmentsParams{
		ClassID:    classID,
		SaleUserID: saleUserID,
	})
	if err != nil {
		return nil, fmt.Errorf("list enrollments: %w", err)
	}
	items := make([]EnrollmentView, 0, len(rows))
	for _, row := range rows {
		items = append(items, enrollmentViewFromList(row))
	}
	return items, nil
}

func (s *Service) UpdateEnrollment(ctx context.Context, actorID, classIDValue, enrollmentIDValue string, status db.EnrollmentStatus) (EnrollmentView, error) {
	return s.UpdateEnrollmentWithReason(ctx, actorID, classIDValue, enrollmentIDValue, status, "Cập nhật trạng thái ghi danh")
}

func (s *Service) UpdateEnrollmentWithReason(ctx context.Context, actorID, classIDValue, enrollmentIDValue string, status db.EnrollmentStatus, reason string) (EnrollmentView, error) {
	if status == db.EnrollmentStatusEnrolled {
		return s.Reenroll(ctx, actorID, classIDValue, enrollmentIDValue, time.Now(), reason)
	}
	classID, enrollmentID, err := parsePair(classIDValue, enrollmentIDValue)
	if err != nil {
		return EnrollmentView{}, ErrEnrollmentNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("begin update enrollment: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	existing, err := q.GetClassEnrollmentForUpdate(ctx, db.GetClassEnrollmentForUpdateParams{ID: enrollmentID, ClassID: classID})
	if errors.Is(err, pgx.ErrNoRows) {
		return EnrollmentView{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get enrollment for update: %w", err)
	}
	if existing.Status != db.EnrollmentStatusEnrolled {
		return EnrollmentView{}, ErrEnrollmentNotActive
	}
	endedAt := time.Now().UTC()
	actor, err := data.UUID(actorID)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("invalid enrollment actor")
	}
	if _, err := q.CloseOpenEnrollmentPeriod(ctx, db.CloseOpenEnrollmentPeriodParams{
		EnrollmentID: enrollmentID,
		EndedAt:      pgtype.Timestamptz{Time: endedAt, Valid: true},
		EndedBy:      actor,
		EndReason:    pgtype.Text{String: reason, Valid: reason != ""},
	}); err != nil {
		return EnrollmentView{}, fmt.Errorf("close enrollment period: %w", err)
	}
	if _, err := q.EndClassEnrollmentAt(ctx, db.EndClassEnrollmentAtParams{
		ID: enrollmentID, ClassID: classID, Status: status,
		EndedAt: pgtype.Timestamptz{Time: endedAt, Valid: true},
	}); err != nil {
		return EnrollmentView{}, mapEnrollmentWriteError(err)
	}
	updated, err := q.GetClassEnrollment(ctx, db.GetClassEnrollmentParams{ID: enrollmentID, ClassID: classID})
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("read updated enrollment: %w", err)
	}
	view := enrollmentViewFromGet(updated)
	if err := classhistory.Write(ctx, q, actorID, classID, "enrollment_status_changed", "class_enrollment", enrollmentID, reason, map[string]any{
		"from_status": existing.Status, "to_status": updated.Status,
		"student_id": data.UUIDString(existing.StudentID), "student_code": existing.StudentCode,
	}); err != nil {
		return EnrollmentView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class_enrollment.update", "class_enrollment", enrollmentID, enrollmentViewFromLocked(existing), view); err != nil {
		return EnrollmentView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return EnrollmentView{}, fmt.Errorf("commit update enrollment: %w", err)
	}
	return view, nil
}

// Reenroll reopens a withdrawn membership while preserving the closed period.
// Sessions during the gap are excluded by the temporal roster queries.
func (s *Service) Reenroll(
	ctx context.Context,
	actorID, classIDValue, enrollmentIDValue string,
	effectiveAt time.Time,
	reason string,
) (EnrollmentView, error) {
	classID, enrollmentID, err := parsePair(classIDValue, enrollmentIDValue)
	if err != nil {
		return EnrollmentView{}, ErrEnrollmentNotFound
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("invalid reenrollment actor")
	}
	effectiveAt = effectiveAt.UTC()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("begin reenrollment: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)

	existing, err := q.GetClassEnrollmentForUpdate(ctx, db.GetClassEnrollmentForUpdateParams{
		ID: enrollmentID, ClassID: classID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return EnrollmentView{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get enrollment for reenrollment: %w", err)
	}
	if existing.Status != db.EnrollmentStatusWithdrawn {
		return EnrollmentView{}, ErrEnrollmentCannotReopen
	}
	if _, err := q.LockStudentForEnrollment(ctx, existing.StudentID); err != nil {
		return EnrollmentView{}, fmt.Errorf("lock reenrollment student: %w", err)
	}
	classRow, err := q.GetAdminClass(ctx, classID)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get class for reenrollment: %w", err)
	}
	if !classAllowsRelations(classRow.Status) {
		return EnrollmentView{}, ErrClassNotEnrollable
	}
	student, err := q.GetAdminStudent(ctx, existing.StudentID)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get student for reenrollment: %w", err)
	}
	if student.StudentStatus != db.StudentStatusActive || student.UserStatus != db.UserStatusActive {
		return EnrollmentView{}, ErrStudentInactive
	}
	location := time.FixedZone("Asia/Ho_Chi_Minh", 7*60*60)
	effectiveDate := effectiveAt.In(location).Format("2006-01-02")
	if effectiveDate < classRow.StartDate.Time.Format("2006-01-02") ||
		effectiveDate > classRow.EndDate.Time.Format("2006-01-02") {
		return EnrollmentView{}, ErrReenrollmentDate
	}
	latest, err := q.GetLatestEnrollmentPeriod(ctx, enrollmentID)
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("get latest enrollment period: %w", err)
	}
	if !latest.EndedAt.Valid || effectiveAt.Before(latest.EndedAt.Time) {
		return EnrollmentView{}, ErrReenrollmentDate
	}
	otherActive, err := q.HasOtherActiveEnrollmentForCourse(ctx, db.HasOtherActiveEnrollmentForCourseParams{
		StudentID: existing.StudentID, CourseID: classRow.CourseID, EnrollmentID: enrollmentID,
	})
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("check active course enrollment: %w", err)
	}
	if otherActive {
		return EnrollmentView{}, ErrActiveCourseEnrollment
	}
	period, err := q.CreateEnrollmentPeriod(ctx, db.CreateEnrollmentPeriodParams{
		EnrollmentID: enrollmentID,
		StartedAt:    pgtype.Timestamptz{Time: effectiveAt, Valid: true},
		CreatedBy:    actor,
		StartReason:  pgtype.Text{String: reason, Valid: reason != ""},
	})
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("create reenrollment period: %w", err)
	}
	if _, err := q.ReopenClassEnrollment(ctx, db.ReopenClassEnrollmentParams{
		ID: enrollmentID, ClassID: classID,
	}); err != nil {
		return EnrollmentView{}, mapEnrollmentWriteError(err)
	}
	updated, err := q.GetClassEnrollment(ctx, db.GetClassEnrollmentParams{ID: enrollmentID, ClassID: classID})
	if err != nil {
		return EnrollmentView{}, fmt.Errorf("read reenrolled membership: %w", err)
	}
	view := enrollmentViewFromGet(updated)
	details := map[string]any{
		"from_status": existing.Status, "to_status": updated.Status,
		"student_id": data.UUIDString(existing.StudentID), "student_code": existing.StudentCode,
		"effective_at": effectiveAt.Format(time.RFC3339Nano), "period_id": data.UUIDString(period.ID),
	}
	if err := classhistory.Write(ctx, q, actorID, classID, "student_reenrolled", "class_enrollment", enrollmentID, reason, details); err != nil {
		return EnrollmentView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class_enrollment.reopen", "class_enrollment", enrollmentID, enrollmentViewFromLocked(existing), view); err != nil {
		return EnrollmentView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return EnrollmentView{}, fmt.Errorf("commit reenrollment: %w", err)
	}
	return view, nil
}

func (s *Service) TransferEnrollment(ctx context.Context, actorID, sourceClassIDValue, enrollmentIDValue, targetClassIDValue, reason string) (TransferView, error) {
	sourceClassID, enrollmentID, err := parsePair(sourceClassIDValue, enrollmentIDValue)
	if err != nil {
		return TransferView{}, ErrEnrollmentNotFound
	}
	targetClassID, err := data.UUID(targetClassIDValue)
	if err != nil {
		return TransferView{}, ErrClassNotFound
	}
	if sourceClassID == targetClassID {
		return TransferView{}, ErrTransferSameClass
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransferView{}, fmt.Errorf("begin enrollment transfer: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	source, err := q.GetClassEnrollmentForUpdate(ctx, db.GetClassEnrollmentForUpdateParams{ID: enrollmentID, ClassID: sourceClassID})
	if errors.Is(err, pgx.ErrNoRows) {
		return TransferView{}, ErrEnrollmentNotFound
	}
	if err != nil {
		return TransferView{}, fmt.Errorf("get source enrollment for transfer: %w", err)
	}
	if source.Status != db.EnrollmentStatusEnrolled {
		return TransferView{}, ErrEnrollmentNotActive
	}
	sourceClass, err := q.GetAdminClass(ctx, sourceClassID)
	if err != nil {
		return TransferView{}, fmt.Errorf("get source class for transfer: %w", err)
	}
	targetClass, err := q.GetAdminClass(ctx, targetClassID)
	if errors.Is(err, pgx.ErrNoRows) {
		return TransferView{}, ErrClassNotFound
	}
	if err != nil {
		return TransferView{}, fmt.Errorf("get target class for transfer: %w", err)
	}
	if sourceClass.CourseID != targetClass.CourseID {
		return TransferView{}, ErrTransferCourse
	}
	if !classAllowsRelations(targetClass.Status) {
		return TransferView{}, ErrClassNotEnrollable
	}
	if _, err := q.GetEnrollmentByClassStudent(ctx, db.GetEnrollmentByClassStudentParams{
		ClassID: targetClassID, StudentID: source.StudentID,
	}); err == nil {
		return TransferView{}, ErrDuplicateEnrollment
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return TransferView{}, fmt.Errorf("check target enrollment: %w", err)
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return TransferView{}, err
	}
	endedAt := time.Now().UTC()
	if _, err := q.CloseOpenEnrollmentPeriod(ctx, db.CloseOpenEnrollmentPeriodParams{
		EnrollmentID: enrollmentID,
		EndedAt:      pgtype.Timestamptz{Time: endedAt, Valid: true},
		EndedBy:      actor,
		EndReason:    pgtype.Text{String: reason, Valid: reason != ""},
	}); err != nil {
		return TransferView{}, fmt.Errorf("close source enrollment period: %w", err)
	}
	if _, err := q.EndClassEnrollmentAt(ctx, db.EndClassEnrollmentAtParams{
		ID: enrollmentID, ClassID: sourceClassID, Status: db.EnrollmentStatusTransferred,
		EndedAt: pgtype.Timestamptz{Time: endedAt, Valid: true},
	}); err != nil {
		return TransferView{}, mapEnrollmentWriteError(err)
	}
	targetCreated, err := q.CreateClassEnrollment(ctx, db.CreateClassEnrollmentParams{
		ClassID: targetClassID, StudentID: source.StudentID, CreatedBy: actor,
	})
	if err != nil {
		return TransferView{}, mapEnrollmentWriteError(err)
	}
	sourceUpdated, err := q.GetClassEnrollment(ctx, db.GetClassEnrollmentParams{ID: enrollmentID, ClassID: sourceClassID})
	if err != nil {
		return TransferView{}, fmt.Errorf("read transferred source enrollment: %w", err)
	}
	targetRow, err := q.GetClassEnrollment(ctx, db.GetClassEnrollmentParams{ID: targetCreated.ID, ClassID: targetClassID})
	if err != nil {
		return TransferView{}, fmt.Errorf("read transfer target enrollment: %w", err)
	}
	result := TransferView{Source: enrollmentViewFromGet(sourceUpdated), Target: enrollmentViewFromGet(targetRow)}
	details := map[string]any{
		"student_id": data.UUIDString(source.StudentID), "student_code": source.StudentCode,
		"source_class_id": sourceClassIDValue, "target_class_id": targetClassIDValue,
		"source_class_code": sourceClass.ClassCode, "target_class_code": targetClass.ClassCode,
	}
	if err := classhistory.Write(ctx, q, actorID, sourceClassID, "student_transferred_out", "class_enrollment", enrollmentID, reason, details); err != nil {
		return TransferView{}, err
	}
	if err := classhistory.Write(ctx, q, actorID, targetClassID, "student_transferred_in", "class_enrollment", targetCreated.ID, reason, details); err != nil {
		return TransferView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class_enrollment.transfer_out", "class_enrollment", enrollmentID, nil, result.Source); err != nil {
		return TransferView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "class_enrollment.transfer_in", "class_enrollment", targetCreated.ID, nil, result.Target); err != nil {
		return TransferView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return TransferView{}, fmt.Errorf("commit enrollment transfer: %w", err)
	}
	return result, nil
}

func (s *Service) AssignTeacher(ctx context.Context, actorID, classIDValue, teacherIDValue, role string) (AssignmentView, error) {
	return s.AssignTeacherWithReason(ctx, actorID, classIDValue, teacherIDValue, role, "Phân công giảng viên")
}

func (s *Service) AssignTeacherWithReason(ctx context.Context, actorID, classIDValue, teacherIDValue, role, reason string) (AssignmentView, error) {
	classID, teacherID, err := parsePair(classIDValue, teacherIDValue)
	if err != nil {
		return AssignmentView{}, ErrTeacherNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AssignmentView{}, fmt.Errorf("begin teacher assignment: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	classRow, err := q.GetAdminClass(ctx, classID)
	if errors.Is(err, pgx.ErrNoRows) {
		return AssignmentView{}, ErrClassNotFound
	}
	if err != nil {
		return AssignmentView{}, fmt.Errorf("get assignment class: %w", err)
	}
	if !classAllowsRelations(classRow.Status) {
		return AssignmentView{}, ErrClassNotEnrollable
	}
	teacher, err := q.GetAdminTeacher(ctx, teacherID)
	if errors.Is(err, pgx.ErrNoRows) {
		return AssignmentView{}, ErrTeacherNotFound
	}
	if err != nil {
		return AssignmentView{}, fmt.Errorf("get assignment teacher: %w", err)
	}
	if teacher.TeacherStatus != db.TeacherStatusActive || teacher.UserStatus != db.UserStatusActive {
		return AssignmentView{}, ErrTeacherInactive
	}
	actor, _ := data.UUID(actorID)
	assignment, err := q.GetTeacherAssignmentByPair(ctx, db.GetTeacherAssignmentByPairParams{
		ClassID: classID, TeacherID: teacherID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		assignment, err = q.CreateTeacherAssignment(ctx, db.CreateTeacherAssignmentParams{
			ClassID: classID, TeacherID: teacherID, AssignmentRole: role, AssignedBy: actor,
		})
		if err != nil {
			return AssignmentView{}, mapAssignmentWriteError(err)
		}
	} else if err != nil {
		return AssignmentView{}, fmt.Errorf("get existing teacher assignment: %w", err)
	} else {
		open, err := q.HasOpenTeacherAssignmentPeriod(ctx, assignment.ID)
		if err != nil {
			return AssignmentView{}, fmt.Errorf("check teacher assignment period: %w", err)
		}
		if open {
			return AssignmentView{}, ErrDuplicateAssignment
		}
		now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
		assignment, err = q.ReopenTeacherAssignment(ctx, db.ReopenTeacherAssignmentParams{
			ID: assignment.ID, AssignmentRole: role, AssignedAt: now, AssignedBy: actor,
		})
		if err != nil {
			return AssignmentView{}, fmt.Errorf("reopen teacher assignment: %w", err)
		}
		if _, err := q.CreateTeacherAssignmentPeriod(ctx, db.CreateTeacherAssignmentPeriodParams{
			AssignmentID: assignment.ID, StartedAt: now, CreatedBy: actor, StartReason: data.Text(&reason),
		}); err != nil {
			return AssignmentView{}, fmt.Errorf("create teacher assignment period: %w", err)
		}
	}
	row, err := q.GetTeacherAssignment(ctx, db.GetTeacherAssignmentParams{ID: assignment.ID, ClassID: classID})
	if err != nil {
		return AssignmentView{}, fmt.Errorf("read teacher assignment: %w", err)
	}
	view := assignmentViewFromGet(row)
	if err := classhistory.Write(ctx, q, actorID, classID, "teacher_assigned", "teacher_assignment", assignment.ID, reason, view); err != nil {
		return AssignmentView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "teacher_assignment.create", "teacher_assignment", assignment.ID, nil, view); err != nil {
		return AssignmentView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AssignmentView{}, fmt.Errorf("commit teacher assignment: %w", err)
	}
	return view, nil
}

func (s *Service) ListAssignments(ctx context.Context, classIDValue string) ([]AssignmentView, error) {
	classID, err := data.UUID(classIDValue)
	if err != nil {
		return nil, ErrClassNotFound
	}
	if _, err := s.queries.GetAdminClass(ctx, classID); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrClassNotFound
	} else if err != nil {
		return nil, fmt.Errorf("get assignment class: %w", err)
	}
	rows, err := s.queries.ListTeacherAssignments(ctx, classID)
	if err != nil {
		return nil, fmt.Errorf("list teacher assignments: %w", err)
	}
	items := make([]AssignmentView, 0, len(rows))
	for _, row := range rows {
		items = append(items, assignmentViewFromList(row))
	}
	return items, nil
}

func (s *Service) UpdateAssignment(ctx context.Context, actorID, classIDValue, assignmentIDValue, role string) (AssignmentView, error) {
	return s.UpdateAssignmentWithReason(ctx, actorID, classIDValue, assignmentIDValue, role, "Cập nhật vai trò giảng viên")
}

func (s *Service) UpdateAssignmentWithReason(ctx context.Context, actorID, classIDValue, assignmentIDValue, role, reason string) (AssignmentView, error) {
	classID, assignmentID, err := parsePair(classIDValue, assignmentIDValue)
	if err != nil {
		return AssignmentView{}, ErrAssignmentNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AssignmentView{}, fmt.Errorf("begin update assignment: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	existing, err := q.GetTeacherAssignment(ctx, db.GetTeacherAssignmentParams{ID: assignmentID, ClassID: classID})
	if errors.Is(err, pgx.ErrNoRows) {
		return AssignmentView{}, ErrAssignmentNotFound
	}
	if err != nil {
		return AssignmentView{}, fmt.Errorf("get assignment for update: %w", err)
	}
	if _, err := q.UpdateTeacherAssignment(ctx, db.UpdateTeacherAssignmentParams{
		ID: assignmentID, ClassID: classID, AssignmentRole: role,
	}); err != nil {
		return AssignmentView{}, fmt.Errorf("update assignment: %w", err)
	}
	updated, err := q.GetTeacherAssignment(ctx, db.GetTeacherAssignmentParams{ID: assignmentID, ClassID: classID})
	if err != nil {
		return AssignmentView{}, fmt.Errorf("read updated assignment: %w", err)
	}
	view := assignmentViewFromGet(updated)
	if err := classhistory.Write(ctx, q, actorID, classID, "teacher_assignment_updated", "teacher_assignment", assignmentID, reason, map[string]any{
		"before": assignmentViewFromGet(existing), "after": view,
	}); err != nil {
		return AssignmentView{}, err
	}
	if err := audit.Write(ctx, q, actorID, "teacher_assignment.update", "teacher_assignment", assignmentID, assignmentViewFromGet(existing), view); err != nil {
		return AssignmentView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AssignmentView{}, fmt.Errorf("commit update assignment: %w", err)
	}
	return view, nil
}

func (s *Service) DeleteAssignment(ctx context.Context, actorID, classIDValue, assignmentIDValue string) error {
	return s.DeleteAssignmentWithReason(ctx, actorID, classIDValue, assignmentIDValue, "Gỡ phân công giảng viên")
}

func (s *Service) DeleteAssignmentWithReason(ctx context.Context, actorID, classIDValue, assignmentIDValue, reason string) error {
	classID, assignmentID, err := parsePair(classIDValue, assignmentIDValue)
	if err != nil {
		return ErrAssignmentNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete assignment: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	existing, err := q.GetTeacherAssignment(ctx, db.GetTeacherAssignmentParams{ID: assignmentID, ClassID: classID})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAssignmentNotFound
	}
	if err != nil {
		return fmt.Errorf("get assignment for delete: %w", err)
	}
	inUse, err := q.CheckTeacherAssignmentHasUpcomingSessions(ctx, db.CheckTeacherAssignmentHasUpcomingSessionsParams{
		ClassID: classID, TeacherID: existing.TeacherID,
	})
	if err != nil {
		return fmt.Errorf("check teacher assignment upcoming sessions: %w", err)
	}
	if inUse {
		return ErrAssignmentInUse
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return err
	}
	if _, err := q.EndTeacherAssignmentPeriod(ctx, db.EndTeacherAssignmentPeriodParams{
		AssignmentID: assignmentID,
		EndedAt:      pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		EndedBy:      actor,
		EndReason:    data.Text(&reason),
	}); err != nil {
		return fmt.Errorf("end teacher assignment period: %w", err)
	}
	if err := classhistory.Write(ctx, q, actorID, classID, "teacher_removed", "teacher_assignment", assignmentID, reason, assignmentViewFromGet(existing)); err != nil {
		return err
	}
	if err := audit.Write(ctx, q, actorID, "teacher_assignment.delete", "teacher_assignment", assignmentID, assignmentViewFromGet(existing), nil); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit delete assignment: %w", err)
	}
	return nil
}

func parseClassInput(input WriteInput) (pgtype.UUID, pgtype.Date, pgtype.Date, error) {
	courseID, err := data.UUID(input.CourseID)
	if err != nil {
		return pgtype.UUID{}, pgtype.Date{}, pgtype.Date{}, ErrCourseNotFound
	}
	startDate, err := data.RequiredDate(input.StartDate)
	if err != nil {
		return pgtype.UUID{}, pgtype.Date{}, pgtype.Date{}, err
	}
	endDate, err := data.RequiredDate(input.EndDate)
	return courseID, startDate, endDate, err
}

func parsePair(first, second string) (pgtype.UUID, pgtype.UUID, error) {
	firstID, err := data.UUID(first)
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, err
	}
	secondID, err := data.UUID(second)
	return firstID, secondID, err
}

func classAllowsRelations(status db.ClassStatus) bool {
	return status == db.ClassStatusPlanning || status == db.ClassStatusOpen || status == db.ClassStatusInProgress
}

func mapClassWriteError(err error) error {
	if dberror.IsCapacityViolation(err) {
		return ErrCapacityBelowCount
	}
	if dberror.IsCode(err, dberror.UniqueViolation) {
		return ErrClassConflict
	}
	if dberror.IsCode(err, dberror.ForeignKeyViolation) {
		return ErrCourseNotFound
	}
	return err
}

func mapEnrollmentWriteError(err error) error {
	if dberror.IsCapacityViolation(err) {
		return ErrClassFull
	}
	if dberror.IsCode(err, dberror.UniqueViolation) {
		return ErrDuplicateEnrollment
	}
	return err
}

func mapAssignmentWriteError(err error) error {
	if dberror.IsCode(err, dberror.UniqueViolation) {
		return ErrDuplicateAssignment
	}
	if dberror.IsCode(err, dberror.ForeignKeyViolation) {
		return ErrAssignmentInUse
	}
	return err
}

func viewFromGet(row db.GetAdminClassRow) View {
	return View{
		ID: data.UUIDString(row.ID), CourseID: data.UUIDString(row.CourseID),
		CourseCode: row.CourseCode, CourseName: row.CourseName,
		ClassCode: row.ClassCode, Name: row.Name,
		StartDate: row.StartDate.Time.Format("2006-01-02"), EndDate: row.EndDate.Time.Format("2006-01-02"),
		MaximumStudents: row.MaximumStudents, EnrolledStudents: row.EnrolledStudents,
		Status:    string(row.Status),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func viewFromList(row db.ListAdminClassesRow) View {
	return View{
		ID: data.UUIDString(row.ID), CourseID: data.UUIDString(row.CourseID),
		CourseCode: row.CourseCode, CourseName: row.CourseName,
		ClassCode: row.ClassCode, Name: row.Name,
		StartDate: row.StartDate.Time.Format("2006-01-02"), EndDate: row.EndDate.Time.Format("2006-01-02"),
		MaximumStudents: row.MaximumStudents, EnrolledStudents: row.EnrolledStudents,
		Status:    string(row.Status),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func viewFromTeacherList(row db.ListTeacherClassesRow) View {
	return View{
		ID: data.UUIDString(row.ID), CourseID: data.UUIDString(row.CourseID),
		CourseCode: row.CourseCode, CourseName: row.CourseName,
		ClassCode: row.ClassCode, Name: row.Name,
		StartDate: row.StartDate.Time.Format("2006-01-02"), EndDate: row.EndDate.Time.Format("2006-01-02"),
		MaximumStudents: row.MaximumStudents, EnrolledStudents: row.EnrolledStudents,
		Status:    string(row.Status),
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func criterionView(row db.CompetencyCriterium) CriterionView {
	var moduleID *string
	if row.ModuleID.Valid {
		value := data.UUIDString(row.ModuleID)
		moduleID = &value
	}
	return CriterionView{
		ID: data.UUIDString(row.ID), CourseID: data.UUIDString(row.CourseID), ModuleID: moduleID,
		Code: row.Code, Name: row.Name, Description: data.TextPointer(row.Description),
		IsRequired: row.IsRequired, SequenceNo: row.SequenceNo,
		CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func enrollmentViewFromGet(row db.GetClassEnrollmentRow) EnrollmentView {
	return EnrollmentView{
		ID: data.UUIDString(row.ID), ClassID: data.UUIDString(row.ClassID),
		StudentID: data.UUIDString(row.StudentID), StudentCode: row.StudentCode,
		FullName: row.FullName, Status: string(row.Status),
		EnrolledAt: row.EnrolledAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		EndedAt:    data.TimeString(row.EndedAt),
		CreatedAt:  row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:  row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func enrollmentViewFromLocked(row db.GetClassEnrollmentForUpdateRow) EnrollmentView {
	return EnrollmentView{
		ID: data.UUIDString(row.ID), ClassID: data.UUIDString(row.ClassID),
		StudentID: data.UUIDString(row.StudentID), StudentCode: row.StudentCode,
		FullName: row.FullName, Status: string(row.Status),
		EnrolledAt: row.EnrolledAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		EndedAt:    data.TimeString(row.EndedAt),
		CreatedAt:  row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:  row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func enrollmentViewFromList(row db.ListClassEnrollmentsRow) EnrollmentView {
	return EnrollmentView{
		ID: data.UUIDString(row.ID), ClassID: data.UUIDString(row.ClassID),
		StudentID: data.UUIDString(row.StudentID), StudentCode: row.StudentCode,
		FullName: row.FullName, Status: string(row.Status),
		EnrolledAt: row.EnrolledAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		EndedAt:    data.TimeString(row.EndedAt),
		CreatedAt:  row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:  row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func assignmentViewFromGet(row db.GetTeacherAssignmentRow) AssignmentView {
	return AssignmentView{
		ID: data.UUIDString(row.ID), ClassID: data.UUIDString(row.ClassID),
		TeacherID: data.UUIDString(row.TeacherID), TeacherCode: row.TeacherCode,
		FullName: row.FullName, AssignmentRole: row.AssignmentRole,
		AssignedAt: row.AssignedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		CreatedAt:  row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:  row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func assignmentViewFromList(row db.ListTeacherAssignmentsRow) AssignmentView {
	return AssignmentView{
		ID: data.UUIDString(row.ID), ClassID: data.UUIDString(row.ClassID),
		TeacherID: data.UUIDString(row.TeacherID), TeacherCode: row.TeacherCode,
		FullName: row.FullName, AssignmentRole: row.AssignmentRole,
		AssignedAt: row.AssignedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		CreatedAt:  row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:  row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}
