// Package completions implements approval decisions and verifiable certificates.
package completions

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/notifications"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/classhistory"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/storage"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var (
	ErrNotFound            = errors.New("completion candidate not found")
	ErrNotEligible         = errors.New("completion requirements are not met")
	ErrCertificateNotFound = errors.New("certificate not found")
	ErrCertificateRevoked  = errors.New("certificate is revoked")
)

type CandidateView struct {
	ClassID                   string   `json:"class_id"`
	ClassCode                 string   `json:"class_code"`
	ClassName                 string   `json:"class_name"`
	StudentID                 string   `json:"student_id"`
	StudentCode               string   `json:"student_code"`
	StudentName               string   `json:"student_name"`
	CourseCode                string   `json:"course_code"`
	CourseName                string   `json:"course_name"`
	CompletedSessions         int32    `json:"completed_sessions"`
	TotalSessions             int32    `json:"total_sessions"`
	AttendancePct             float64  `json:"attendance_pct"`
	MinimumAttendancePct      float64  `json:"minimum_attendance_pct"`
	RequiredCompetenciesMet   int32    `json:"required_competencies_met"`
	RequiredCompetenciesTotal int32    `json:"required_competencies_total"`
	RequiredTestsPassed       int32    `json:"required_tests_passed"`
	RequiredTestsTotal        int32    `json:"required_tests_total"`
	FinalExamScore            *float64 `json:"final_exam_score"`
	FinalExamPassed           bool     `json:"final_exam_passed"`
	CompletedAssessments      int32    `json:"completed_assessments"`
	RequiredAssessments       int32    `json:"required_assessments"`
	IsEligible                bool     `json:"is_eligible"`
	Status                    string   `json:"status"`
	ReviewNote                *string  `json:"review_note"`
	ReviewedAt                *string  `json:"reviewed_at"`
	FailureReasons            []string `json:"failure_reasons"`
	CurrentCertificateID      *string  `json:"current_certificate_id"`
	CurrentCertificateNumber  *string  `json:"current_certificate_number"`
	CurrentDiplomaFileURL     *string  `json:"current_diploma_file_url"`
	CurrentDiplomaFileName    *string  `json:"current_diploma_file_name"`
}

type CertificateView struct {
	ID                string  `json:"id"`
	CompletionID      string  `json:"completion_id"`
	CertificateNumber string  `json:"certificate_number"`
	VerificationCode  string  `json:"verification_code"`
	ClassCode         string  `json:"class_code"`
	ClassName         string  `json:"class_name"`
	CourseCode        string  `json:"course_code"`
	CourseName        string  `json:"course_name"`
	StudentCode       string  `json:"student_code"`
	StudentName       string  `json:"student_name"`
	IssuedAt          string  `json:"issued_at"`
	IsCurrent         bool    `json:"is_current"`
	RevokedAt         *string `json:"revoked_at"`
	RevokeReason      *string `json:"revoke_reason"`
	DiplomaFileURL    *string `json:"diploma_file_url"`
	DiplomaFileName   *string `json:"diploma_file_name"`
	DiplomaUploadedAt *string `json:"diploma_uploaded_at"`
}

type DecisionHistoryView struct {
	ID                  string   `json:"id"`
	Status              string   `json:"status"`
	Note                string   `json:"note"`
	DecidedByEmail      string   `json:"decided_by_email"`
	DecidedAt           string   `json:"decided_at"`
	RequiredTestsPassed int32    `json:"required_tests_passed"`
	RequiredTestsTotal  int32    `json:"required_tests_total"`
	FinalExamScore      *float64 `json:"final_exam_score"`
}
type DecisionResult struct {
	Candidate   CandidateView    `json:"candidate"`
	Certificate *CertificateView `json:"certificate"`
}

type ListFilter struct {
	Search      string
	Eligibility string
	CourseID    string
	ClassID     string
	SortBy      string
	SortOrder   string
	Page        int
	PerPage     int
}

type Service struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	storage storage.Storage
}

func NewService(pool *pgxpool.Pool, storage storage.Storage) *Service {
	return &Service{pool: pool, queries: db.New(pool), storage: storage}
}

func (s *Service) List(ctx context.Context, filter ListFilter) (pagination.Result[CandidateView], error) {
	courseID, err := optionalUUID(filter.CourseID)
	if err != nil {
		return pagination.Result[CandidateView]{}, err
	}
	classID, err := optionalUUID(filter.ClassID)
	if err != nil {
		return pagination.Result[CandidateView]{}, err
	}
	params := db.ListCompletionCandidatesParams{
		Search: filter.Search, CourseID: courseID, ClassID: classID,
		Eligibility: filter.Eligibility, SortBy: filter.SortBy, SortOrder: filter.SortOrder,
		PageOffset: int32((filter.Page - 1) * filter.PerPage), PageLimit: int32(filter.PerPage),
	}
	rows, err := s.queries.ListCompletionCandidates(ctx, params)
	if err != nil {
		return pagination.Result[CandidateView]{}, fmt.Errorf("list completion candidates: %w", err)
	}
	total, err := s.queries.CountCompletionCandidates(ctx, db.CountCompletionCandidatesParams{
		Search: filter.Search, CourseID: courseID, ClassID: classID, Eligibility: filter.Eligibility,
	})
	if err != nil {
		return pagination.Result[CandidateView]{}, fmt.Errorf("count completion candidates: %w", err)
	}
	items := make([]CandidateView, 0, len(rows))
	for _, row := range rows {
		items = append(items, candidateFromList(row))
	}
	return pagination.New(items, filter.Page, filter.PerPage, total), nil
}

func optionalUUID(value string) (pgtype.UUID, error) {
	if value == "" {
		return pgtype.UUID{}, nil
	}
	return data.UUID(value)
}

func (s *Service) Decide(ctx context.Context, actorID, classIDValue, studentIDValue, status, note string) (DecisionResult, error) {
	classID, err := data.UUID(classIDValue)
	if err != nil {
		return DecisionResult{}, ErrNotFound
	}
	studentID, err := data.UUID(studentIDValue)
	if err != nil {
		return DecisionResult{}, ErrNotFound
	}
	actor, err := data.UUID(actorID)
	if err != nil {
		return DecisionResult{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DecisionResult{}, fmt.Errorf("begin completion decision: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	row, err := q.GetCompletionCandidate(ctx, db.GetCompletionCandidateParams{ClassID: classID, StudentID: studentID})
	if errors.Is(err, pgx.ErrNoRows) {
		return DecisionResult{}, ErrNotFound
	}
	if err != nil {
		return DecisionResult{}, fmt.Errorf("get completion candidate: %w", err)
	}
	if status == "approved" && !row.IsEligible {
		return DecisionResult{}, ErrNotEligible
	}
	decisionStatus := db.CompletionStatus(status)
	completion, err := q.UpsertCourseCompletionDecision(ctx, db.UpsertCourseCompletionDecisionParams{ClassID: classID, CourseID: row.CourseID, StudentID: studentID, AttendancePct: row.AttendancePct, RequiredCompetenciesMet: row.RequiredCompetenciesMet, RequiredCompetenciesTotal: row.RequiredCompetenciesTotal, RequiredTestsPassed: row.RequiredTestsPassed, RequiredTestsTotal: row.RequiredTestsTotal, FinalExamScore: row.FinalExamScore, Status: decisionStatus, ReviewedBy: actor, ReviewNote: data.Text(&note)})
	if err != nil {
		return DecisionResult{}, fmt.Errorf("save completion decision: %w", err)
	}
	_, err = q.CreateCompletionDecisionHistory(ctx, db.CreateCompletionDecisionHistoryParams{CompletionID: completion.ID, Status: decisionStatus, AttendancePct: row.AttendancePct, RequiredCompetenciesMet: row.RequiredCompetenciesMet, RequiredCompetenciesTotal: row.RequiredCompetenciesTotal, RequiredTestsPassed: row.RequiredTestsPassed, RequiredTestsTotal: row.RequiredTestsTotal, FinalExamScore: row.FinalExamScore, Note: note, DecidedBy: actor})
	if err != nil {
		return DecisionResult{}, fmt.Errorf("save completion history: %w", err)
	}
	var certificate *CertificateView
	if status == "approved" {
		cert, certErr := q.GetCurrentCertificateByCompletion(ctx, completion.ID)
		if errors.Is(certErr, pgx.ErrNoRows) {
			created, e := q.CreateCertificate(ctx, db.CreateCertificateParams{CompletionID: completion.ID, IssuedBy: actor})
			if e != nil {
				return DecisionResult{}, fmt.Errorf("issue certificate: %w", e)
			}
			cert = created
		} else if certErr != nil {
			return DecisionResult{}, fmt.Errorf("get current certificate: %w", certErr)
		}
		detail, e := q.GetCertificateDetail(ctx, cert.ID)
		if e != nil {
			return DecisionResult{}, fmt.Errorf("load certificate: %w", e)
		}
		v := certificateFromDetail(detail)
		certificate = &v
		enrollmentID, e := q.GetEnrollmentByClassStudent(ctx, db.GetEnrollmentByClassStudentParams{ClassID: classID, StudentID: studentID})
		if e == nil {
			_, e = q.UpdateClassEnrollmentStatus(ctx, db.UpdateClassEnrollmentStatusParams{ID: enrollmentID, ClassID: classID, Status: db.EnrollmentStatusCompleted})
		}
		if e != nil {
			return DecisionResult{}, fmt.Errorf("complete enrollment: %w", e)
		}
	} else {
		// A rejected re-review must invalidate any previously issued certificate and revert enrollment status.
		if _, certErr := q.GetCurrentCertificateByCompletion(ctx, completion.ID); certErr == nil {
			if _, err := q.RevokeCurrentCertificate(ctx, db.RevokeCurrentCertificateParams{
				CompletionID: completion.ID,
				RevokedBy:    actor,
				RevokeReason: data.Text(&note),
			}); err != nil {
				return DecisionResult{}, fmt.Errorf("revoke rejected certificate: %w", err)
			}
			if enrollmentID, e := q.GetEnrollmentByClassStudent(ctx, db.GetEnrollmentByClassStudentParams{ClassID: classID, StudentID: studentID}); e == nil {
				_, _ = q.UpdateClassEnrollmentStatus(ctx, db.UpdateClassEnrollmentStatusParams{ID: enrollmentID, ClassID: classID, Status: db.EnrollmentStatusEnrolled})
			}
		} else if !errors.Is(certErr, pgx.ErrNoRows) {
			return DecisionResult{}, fmt.Errorf("get certificate for rejection: %w", certErr)
		}
	}
	actionURL := "/student/tien-do"
	title := "Kết quả hoàn thành khóa học"
	message := "Hồ sơ hoàn thành khóa học của bạn đã được phê duyệt."
	if status == "rejected" {
		message = "Hồ sơ hoàn thành khóa học của bạn chưa được duyệt: " + note
	}
	if err := notifications.Create(ctx, q, row.StudentUserID, title, message, "completion", &actionURL); err != nil {
		return DecisionResult{}, err
	}
	if err := classhistory.Write(ctx, q, actorID, classID, "completion_"+status, "course_completion", completion.ID, note, map[string]any{"student_code": row.StudentCode, "status": status}); err != nil {
		return DecisionResult{}, err
	}
	if err := audit.WriteWithReason(ctx, q, actorID, "completion."+status, "course_completion", completion.ID, nil, map[string]any{"status": status, "certificate": certificate}, note); err != nil {
		return DecisionResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return DecisionResult{}, fmt.Errorf("commit completion decision: %w", err)
	}
	updated := candidateFromGet(row)
	updated.Status = status
	updated.ReviewNote = &note
	now := time.Now().UTC().Format(time.RFC3339Nano)
	updated.ReviewedAt = &now
	return DecisionResult{Candidate: updated, Certificate: certificate}, nil
}

func (s *Service) History(ctx context.Context, classIDValue, studentIDValue string) ([]DecisionHistoryView, error) {
	classID, e := data.UUID(classIDValue)
	if e != nil {
		return nil, ErrNotFound
	}
	studentID, e := data.UUID(studentIDValue)
	if e != nil {
		return nil, ErrNotFound
	}
	rows, e := s.queries.ListCompletionDecisionHistory(ctx, db.ListCompletionDecisionHistoryParams{ClassID: classID, StudentID: studentID})
	if e != nil {
		return nil, fmt.Errorf("list completion history: %w", e)
	}
	items := make([]DecisionHistoryView, 0, len(rows))
	for _, r := range rows {
		items = append(items, DecisionHistoryView{ID: data.UUIDString(r.ID), Status: string(r.Status), Note: r.Note, DecidedByEmail: r.DecidedByEmail, DecidedAt: r.DecidedAt.Time.UTC().Format(time.RFC3339Nano), RequiredTestsPassed: r.RequiredTestsPassed, RequiredTestsTotal: r.RequiredTestsTotal, FinalExamScore: numericPointer(r.FinalExamScore)})
	}
	return items, nil
}

func (s *Service) StudentCertificates(ctx context.Context, userID string) ([]CertificateView, error) {
	uid, e := data.UUID(userID)
	if e != nil {
		return nil, ErrCertificateNotFound
	}
	rows, e := s.queries.ListStudentCertificates(ctx, uid)
	if e != nil {
		return nil, fmt.Errorf("list certificates: %w", e)
	}
	items := make([]CertificateView, 0, len(rows))
	for _, r := range rows {
		items = append(items, certificateFromStudent(r))
	}
	return items, nil
}
func (s *Service) StudentCertificate(ctx context.Context, userID, id string) (CertificateView, error) {
	uid, e := data.UUID(userID)
	if e != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	cid, e := data.UUID(id)
	if e != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	r, e := s.queries.GetStudentCertificate(ctx, db.GetStudentCertificateParams{ID: cid, UserID: uid})
	if errors.Is(e, pgx.ErrNoRows) {
		return CertificateView{}, ErrCertificateNotFound
	}
	if e != nil {
		return CertificateView{}, e
	}
	return certificateFromStudentGet(r), nil
}
func (s *Service) Certificate(ctx context.Context, id string) (CertificateView, error) {
	cid, e := data.UUID(id)
	if e != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	r, e := s.queries.GetCertificateDetail(ctx, cid)
	if errors.Is(e, pgx.ErrNoRows) {
		return CertificateView{}, ErrCertificateNotFound
	}
	if e != nil {
		return CertificateView{}, e
	}
	return certificateFromDetail(r), nil
}
func (s *Service) Verify(ctx context.Context, code string) (CertificateView, error) {
	id, e := data.UUID(code)
	if e != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	r, e := s.queries.GetCertificateByVerificationCode(ctx, id)
	if errors.Is(e, pgx.ErrNoRows) {
		return CertificateView{}, ErrCertificateNotFound
	}
	if e != nil {
		return CertificateView{}, e
	}
	return certificateFromVerify(r), nil
}

func (s *Service) RevokeOrReissue(ctx context.Context, actorID, id, reason string, reissue bool) (CertificateView, error) {
	actor, e := data.UUID(actorID)
	if e != nil {
		return CertificateView{}, e
	}
	cid, e := data.UUID(id)
	if e != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return CertificateView{}, e
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := s.queries.WithTx(tx)
	detail, e := q.GetCertificateDetail(ctx, cid)
	if errors.Is(e, pgx.ErrNoRows) {
		return CertificateView{}, ErrCertificateNotFound
	}
	if e != nil {
		return CertificateView{}, e
	}
	if !detail.IsCurrent {
		return CertificateView{}, ErrCertificateRevoked
	}
	if _, e = q.RevokeCurrentCertificate(ctx, db.RevokeCurrentCertificateParams{CompletionID: detail.CompletionID, RevokedBy: actor, RevokeReason: data.Text(&reason)}); e != nil {
		return CertificateView{}, fmt.Errorf("revoke certificate: %w", e)
	}
	var result CertificateView
	if reissue {
		created, e := q.CreateCertificate(ctx, db.CreateCertificateParams{CompletionID: detail.CompletionID, IssuedBy: actor})
		if e != nil {
			return CertificateView{}, fmt.Errorf("reissue certificate: %w", e)
		}
		newDetail, e := q.GetCertificateDetail(ctx, created.ID)
		if e != nil {
			return CertificateView{}, e
		}
		result = certificateFromDetail(newDetail)
	} else {
		updated, e := q.GetCertificateDetail(ctx, cid)
		if e != nil {
			return CertificateView{}, e
		}
		result = certificateFromDetail(updated)
	}
	action := "certificate.revoke"
	if reissue {
		action = "certificate.reissue"
	}
	if e := audit.WriteWithReason(ctx, q, actorID, action, "certificate", cid, certificateFromDetail(detail), result, reason); e != nil {
		return CertificateView{}, e
	}
	if e := classhistory.Write(ctx, q, actorID, detail.ClassID, action, "certificate", cid, reason, result); e != nil {
		return CertificateView{}, e
	}
	if e := tx.Commit(ctx); e != nil {
		return CertificateView{}, e
	}
	return result, nil
}

func candidateStatus(p db.NullCompletionStatus, eligible bool) string {
	if p.Valid {
		return string(p.CompletionStatus)
	}
	if eligible {
		return "eligible"
	}
	return "pending"
}
func candidateFromList(r db.ListCompletionCandidatesRow) CandidateView {
	return buildCandidate(r.ClassID, r.ClassCode, r.ClassName, r.StudentID, r.StudentCode, r.StudentName, r.CourseCode, r.CourseName, r.CompletedSessions, r.TotalSessions, r.AttendancePct, r.MinimumAttendancePct, r.RequiredCompetenciesMet, r.RequiredCompetenciesTotal, r.RequiredTestsPassed, r.RequiredTestsTotal, r.FinalExamScore, r.CompletedAssessments, r.RequiredAssessments, r.IsEligible, r.PersistedStatus, r.ReviewNote, r.ReviewedAt, r.CurrentCertificateID, r.CurrentCertificateNumber, r.CurrentDiplomaFileUrl, r.CurrentDiplomaFileName)
}
func candidateFromGet(r db.GetCompletionCandidateRow) CandidateView {
	return buildCandidate(r.ClassID, r.ClassCode, r.ClassName, r.StudentID, r.StudentCode, r.StudentName, r.CourseCode, r.CourseName, r.CompletedSessions, r.TotalSessions, r.AttendancePct, r.MinimumAttendancePct, r.RequiredCompetenciesMet, r.RequiredCompetenciesTotal, r.RequiredTestsPassed, r.RequiredTestsTotal, r.FinalExamScore, r.CompletedAssessments, r.RequiredAssessments, r.IsEligible, r.PersistedStatus, r.ReviewNote, r.ReviewedAt, r.CurrentCertificateID, r.CurrentCertificateNumber, r.CurrentDiplomaFileUrl, r.CurrentDiplomaFileName)
}

func buildCandidate(classID pgtype.UUID, classCode, className string, studentID pgtype.UUID, studentCode, studentName, courseCode, courseName string, completedSessions, totalSessions int32, attendance, minimum pgtype.Numeric, competenciesMet, competenciesTotal, testsPassed, testsTotal int32, finalScore pgtype.Numeric, completedAssessments, requiredAssessments int32, eligible bool, persisted db.NullCompletionStatus, note pgtype.Text, reviewedAt pgtype.Timestamptz, certificateID pgtype.UUID, certificateNumber string, diplomaFileURL, diplomaFileName pgtype.Text) CandidateView {
	attendancePct := data.NumericFloat(attendance)
	minimumPct := data.NumericFloat(minimum)
	final := numericPointer(finalScore)
	finalPassed := final != nil && *final > 5
	reasons := make([]string, 0, 3)
	if attendancePct < minimumPct {
		reasons = append(reasons, fmt.Sprintf("Chuyên cần %.2f%%, yêu cầu tối thiểu %.0f%%", attendancePct, minimumPct))
	}
	if testsPassed < testsTotal {
		reasons = append(reasons, fmt.Sprintf("Còn %d bài kiểm tra bắt buộc chưa đạt", testsTotal-testsPassed))
	}
	if final == nil {
		reasons = append(reasons, "Chưa có điểm thi kết thúc khóa")
	} else if !finalPassed {
		reasons = append(reasons, fmt.Sprintf("Điểm thi kết thúc %.2f, yêu cầu trên 5", *final))
	}
	return CandidateView{ClassID: data.UUIDString(classID), ClassCode: classCode, ClassName: className, StudentID: data.UUIDString(studentID), StudentCode: studentCode, StudentName: studentName, CourseCode: courseCode, CourseName: courseName, CompletedSessions: completedSessions, TotalSessions: totalSessions, AttendancePct: attendancePct, MinimumAttendancePct: minimumPct, RequiredCompetenciesMet: competenciesMet, RequiredCompetenciesTotal: competenciesTotal, RequiredTestsPassed: testsPassed, RequiredTestsTotal: testsTotal, FinalExamScore: final, FinalExamPassed: finalPassed, CompletedAssessments: completedAssessments, RequiredAssessments: requiredAssessments, IsEligible: eligible, Status: candidateStatus(persisted, eligible), ReviewNote: data.TextPointer(note), ReviewedAt: data.TimeString(reviewedAt), FailureReasons: reasons, CurrentCertificateID: data.UUIDPointer(certificateID), CurrentCertificateNumber: nonEmptyPointer(certificateNumber), CurrentDiplomaFileURL: data.TextPointer(diplomaFileURL), CurrentDiplomaFileName: data.TextPointer(diplomaFileName)}
}

func nonEmptyPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func numericPointer(value pgtype.Numeric) *float64 {
	if !value.Valid {
		return nil
	}
	v := data.NumericFloat(value)
	return &v
}

func (s *Service) UploadDiploma(ctx context.Context, actorID string, certificateID string, filename string, r io.Reader, size int64) (CertificateView, error) {
	aid, err := data.UUID(actorID)
	if err != nil {
		return CertificateView{}, err
	}
	cid, err := data.UUID(certificateID)
	if err != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	detail, err := s.queries.GetCertificateDetail(ctx, cid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CertificateView{}, ErrCertificateNotFound
		}
		return CertificateView{}, fmt.Errorf("get certificate for diploma upload: %w", err)
	}
	if !detail.IsCurrent {
		return CertificateView{}, ErrCertificateRevoked
	}

	fileURL, err := s.storage.UploadDiplomaPDF(ctx, certificateID, filename, r, size)
	if err != nil {
		return CertificateView{}, fmt.Errorf("upload diploma to storage: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return CertificateView{}, err
	}
	defer tx.Rollback(ctx)
	q := s.queries.WithTx(tx)

	_, err = q.UpdateCertificateDiplomaFile(ctx, db.UpdateCertificateDiplomaFileParams{
		ID:                cid,
		DiplomaFileUrl:    pgtype.Text{String: fileURL, Valid: true},
		DiplomaFileName:   pgtype.Text{String: filename, Valid: true},
		DiplomaUploadedBy: aid,
	})
	if err != nil {
		return CertificateView{}, fmt.Errorf("update certificate diploma file: %w", err)
	}

	detail, err = q.GetCertificateDetail(ctx, cid)
	if err != nil {
		return CertificateView{}, fmt.Errorf("get updated certificate detail: %w", err)
	}
	result := certificateFromDetail(detail)

	if err := audit.WriteWithReason(ctx, q, actorID, "certificate.diploma_uploaded", "certificates", cid, nil, map[string]any{
		"certificate_number": detail.CertificateNumber,
		"student_code":       detail.StudentCode,
		"diploma_file_url":   fileURL,
		"diploma_file_name":  filename,
	}, "Tải lên bản scan bằng tốt nghiệp"); err != nil {
		return CertificateView{}, err
	}
	if err := classhistory.Write(ctx, q, actorID, detail.ClassID, "certificate.diploma_uploaded", "certificates", cid, "Tải lên bản scan bằng tốt nghiệp", result); err != nil {
		return CertificateView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return CertificateView{}, err
	}

	return result, nil
}

func (s *Service) DeleteDiploma(ctx context.Context, actorID string, certificateID string) (CertificateView, error) {
	_, err := data.UUID(actorID)
	if err != nil {
		return CertificateView{}, err
	}
	cid, err := data.UUID(certificateID)
	if err != nil {
		return CertificateView{}, ErrCertificateNotFound
	}
	detail, err := s.queries.GetCertificateDetail(ctx, cid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CertificateView{}, ErrCertificateNotFound
		}
		return CertificateView{}, fmt.Errorf("get certificate for diploma delete: %w", err)
	}
	if !detail.IsCurrent {
		return CertificateView{}, ErrCertificateRevoked
	}

	if detail.DiplomaFileUrl.Valid && detail.DiplomaFileUrl.String != "" {
		_ = s.storage.DeleteDiplomaPDF(ctx, detail.DiplomaFileUrl.String)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return CertificateView{}, err
	}
	defer tx.Rollback(ctx)
	q := s.queries.WithTx(tx)

	_, err = q.RemoveCertificateDiplomaFile(ctx, cid)
	if err != nil {
		return CertificateView{}, fmt.Errorf("remove certificate diploma file: %w", err)
	}

	detail, err = q.GetCertificateDetail(ctx, cid)
	if err != nil {
		return CertificateView{}, fmt.Errorf("get updated certificate detail: %w", err)
	}
	result := certificateFromDetail(detail)

	if err := audit.WriteWithReason(ctx, q, actorID, "certificate.diploma_removed", "certificates", cid, nil, map[string]any{
		"certificate_number": detail.CertificateNumber,
		"student_code":       detail.StudentCode,
	}, "Xóa bản scan bằng tốt nghiệp"); err != nil {
		return CertificateView{}, err
	}
	if err := classhistory.Write(ctx, q, actorID, detail.ClassID, "certificate.diploma_removed", "certificates", cid, "Xóa bản scan bằng tốt nghiệp", result); err != nil {
		return CertificateView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return CertificateView{}, err
	}

	return result, nil
}

type certificateData struct {
	ID, CompletionID, VerificationCode                                     pgtype.UUID
	CertificateNumber                                                      string
	IssuedAt, RevokedAt                                                    pgtype.Timestamptz
	RevokeReason                                                           pgtype.Text
	IsCurrent                                                              bool
	ClassCode, ClassName, CourseCode, CourseName, StudentCode, StudentName string
	DiplomaFileURL, DiplomaFileName                                        pgtype.Text
	DiplomaUploadedAt                                                      pgtype.Timestamptz
}

func certificateView(r certificateData) CertificateView {
	return CertificateView{
		ID:                data.UUIDString(r.ID),
		CompletionID:      data.UUIDString(r.CompletionID),
		CertificateNumber: r.CertificateNumber,
		VerificationCode:  data.UUIDString(r.VerificationCode),
		ClassCode:         r.ClassCode,
		ClassName:         r.ClassName,
		CourseCode:        r.CourseCode,
		CourseName:        r.CourseName,
		StudentCode:       r.StudentCode,
		StudentName:       r.StudentName,
		IssuedAt:          r.IssuedAt.Time.UTC().Format(time.RFC3339Nano),
		IsCurrent:         r.IsCurrent,
		RevokedAt:         data.TimeString(r.RevokedAt),
		RevokeReason:      data.TextPointer(r.RevokeReason),
		DiplomaFileURL:    data.TextPointer(r.DiplomaFileURL),
		DiplomaFileName:   data.TextPointer(r.DiplomaFileName),
		DiplomaUploadedAt: data.TimeString(r.DiplomaUploadedAt),
	}
}
func certificateFromDetail(r db.GetCertificateDetailRow) CertificateView {
	return certificateView(certificateData{r.ID, r.CompletionID, r.VerificationCode, r.CertificateNumber, r.IssuedAt, r.RevokedAt, r.RevokeReason, r.IsCurrent, r.ClassCode, r.ClassName, r.CourseCode, r.CourseName, r.StudentCode, r.StudentName, r.DiplomaFileUrl, r.DiplomaFileName, r.DiplomaUploadedAt})
}
func certificateFromVerify(r db.GetCertificateByVerificationCodeRow) CertificateView {
	return certificateView(certificateData{r.ID, r.CompletionID, r.VerificationCode, r.CertificateNumber, r.IssuedAt, r.RevokedAt, r.RevokeReason, r.IsCurrent, r.ClassCode, r.ClassName, r.CourseCode, r.CourseName, r.StudentCode, r.StudentName, r.DiplomaFileUrl, r.DiplomaFileName, r.DiplomaUploadedAt})
}
func certificateFromStudent(r db.ListStudentCertificatesRow) CertificateView {
	return certificateView(certificateData{r.ID, r.CompletionID, r.VerificationCode, r.CertificateNumber, r.IssuedAt, r.RevokedAt, r.RevokeReason, r.IsCurrent, r.ClassCode, r.ClassName, r.CourseCode, r.CourseName, r.StudentCode, r.StudentName, r.DiplomaFileUrl, r.DiplomaFileName, r.DiplomaUploadedAt})
}
func certificateFromStudentGet(r db.GetStudentCertificateRow) CertificateView {
	return certificateView(certificateData{r.ID, r.CompletionID, r.VerificationCode, r.CertificateNumber, r.IssuedAt, r.RevokedAt, r.RevokeReason, r.IsCurrent, r.ClassCode, r.ClassName, r.CourseCode, r.CourseName, r.StudentCode, r.StudentName, r.DiplomaFileUrl, r.DiplomaFileName, r.DiplomaUploadedAt})
}
