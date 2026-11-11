package testscores

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/request"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/response"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

type Handler struct {
	service *Service
	log     *slog.Logger
}

func NewHandler(service *Service, log *slog.Logger) *Handler {
	return &Handler{service: service, log: log}
}

type testRequest struct {
	Code       string  `json:"code"`
	Title      string  `json:"title"`
	Kind       string  `json:"kind"`
	PassScore  float64 `json:"pass_score"`
	IsRequired *bool   `json:"is_required"`
	SequenceNo int32   `json:"sequence_no"`
	IsActive   *bool   `json:"is_active"`
}
type attemptRequest struct {
	Score   float64 `json:"score"`
	Note    *string `json:"note"`
	TakenAt *string `json:"taken_at"`
	Reason  string  `json:"reason"`
}

func (h *Handler) ListTests(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.ListTests(r.Context(), chi.URLParam(r, "courseID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}
func (h *Handler) CreateTest(w http.ResponseWriter, r *http.Request) {
	input, ok := h.decodeTest(w, r)
	if !ok {
		return
	}
	actor, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.CreateTest(r.Context(), actor, chi.URLParam(r, "courseID"), input)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.Created(w, view)
}
func (h *Handler) UpdateTest(w http.ResponseWriter, r *http.Request) {
	input, ok := h.decodeTest(w, r)
	if !ok {
		return
	}
	actor, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.UpdateTest(r.Context(), actor, chi.URLParam(r, "courseID"), chi.URLParam(r, "testID"), input)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}
func (h *Handler) TeacherResults(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.TeacherResults(r.Context(), user, chi.URLParam(r, "classID"), chi.URLParam(r, "studentID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}
func (h *Handler) StudentResults(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.StudentResults(r.Context(), user)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}
func (h *Handler) RecordAttempt(w http.ResponseWriter, r *http.Request) {
	input, _, ok := h.decodeAttempt(w, r, false)
	if !ok {
		return
	}
	user, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleAcademicAdmin)
	view, err := h.service.RecordAttempt(r.Context(), user, chi.URLParam(r, "classID"), chi.URLParam(r, "studentID"), chi.URLParam(r, "testID"), input, isAdmin)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.Created(w, view)
}
func (h *Handler) CorrectTeacher(w http.ResponseWriter, r *http.Request) { h.correct(w, r, false) }
func (h *Handler) CorrectAdmin(w http.ResponseWriter, r *http.Request)   { h.correct(w, r, true) }
func (h *Handler) correct(w http.ResponseWriter, r *http.Request, isAdmin bool) {
	input, reason, ok := h.decodeAttempt(w, r, true)
	if !ok {
		return
	}
	user, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.CorrectAttempt(r.Context(), user, chi.URLParam(r, "attemptID"), input, reason, isAdmin)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}

type grantRetakeRequest struct {
	TargetAttemptNo int32  `json:"target_attempt_no"`
	Reason          string `json:"reason"`
}

func (h *Handler) GrantRetakePermit(w http.ResponseWriter, r *http.Request) {
	var body grantRetakeRequest
	if request.DecodeJSON(w, r, &body) != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" || len([]rune(reason)) > 1000 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "reason is required and must not exceed 1000 characters")
		return
	}
	if body.TargetAttemptNo < 2 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "target_attempt_no must be at least 2")
		return
	}
	actor, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.GrantRetakePermit(r.Context(), actor, chi.URLParam(r, "courseID"), chi.URLParam(r, "studentID"), chi.URLParam(r, "testID"), body.TargetAttemptNo, reason)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.Created(w, view)
}

func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.History(r.Context(), chi.URLParam(r, "attemptID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}
func (h *Handler) TeacherHistory(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserIDFrom(r.Context())
	items, err := h.service.TeacherHistory(r.Context(), user, chi.URLParam(r, "attemptID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) decodeTest(w http.ResponseWriter, r *http.Request) (TestInput, bool) {
	var body testRequest
	if request.DecodeJSON(w, r, &body) != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return TestInput{}, false
	}
	body.Code = strings.ToUpper(strings.TrimSpace(body.Code))
	body.Title = strings.TrimSpace(body.Title)
	if body.Code == "" || len(body.Code) > 40 || body.Title == "" || len([]rune(body.Title)) > 200 || body.SequenceNo < 1 || body.PassScore < 0 || body.PassScore > 10 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "code, title, sequence_no and score range 0-10 are required")
		return TestInput{}, false
	}
	if body.Kind != "class_test" && body.Kind != "final_exam" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "kind must be class_test or final_exam")
		return TestInput{}, false
	}
	required := true
	if body.IsRequired != nil {
		required = *body.IsRequired
	}
	active := true
	if body.IsActive != nil {
		active = *body.IsActive
	}
	return TestInput{Code: body.Code, Title: body.Title, Kind: db.CourseTestKind(body.Kind), PassScore: body.PassScore, IsRequired: required, SequenceNo: body.SequenceNo, IsActive: active}, true
}
func (h *Handler) decodeAttempt(w http.ResponseWriter, r *http.Request, correction bool) (AttemptInput, string, bool) {
	var body attemptRequest
	if request.DecodeJSON(w, r, &body) != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return AttemptInput{}, "", false
	}
	if body.Score < 0 || body.Score > 10 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "score must be between 0 and 10")
		return AttemptInput{}, "", false
	}
	if body.Note != nil {
		trimmed := strings.TrimSpace(*body.Note)
		if len([]rune(trimmed)) > 1000 {
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "note must not exceed 1000 characters")
			return AttemptInput{}, "", false
		}
		body.Note = &trimmed
	}
	var taken time.Time
	if body.TakenAt != nil && strings.TrimSpace(*body.TakenAt) != "" {
		parsed, err := time.Parse(time.RFC3339, *body.TakenAt)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "taken_at must be RFC3339")
			return AttemptInput{}, "", false
		}
		taken = parsed
	}
	reason := strings.TrimSpace(body.Reason)
	if correction && (reason == "" || len([]rune(reason)) > 1000) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "reason is required and must not exceed 1000 characters")
		return AttemptInput{}, "", false
	}
	return AttemptInput{Score: body.Score, Note: body.Note, TakenAt: taken}, reason, true
}
func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrTestNotFound):
		response.Fail(w, http.StatusNotFound, "TEST_NOT_FOUND", "Course test not found")
	case errors.Is(err, ErrAttemptNotFound):
		response.Fail(w, http.StatusNotFound, "ATTEMPT_NOT_FOUND", "Test attempt not found")
	case errors.Is(err, ErrNotAssigned):
		response.Fail(w, http.StatusForbidden, "TEACHER_NOT_ASSIGNED", "Teacher is not assigned to this class")
	case errors.Is(err, ErrStudentNotActive):
		response.Fail(w, http.StatusConflict, "STUDENT_NOT_ACTIVE", "Student is not actively enrolled in this class")
	case errors.Is(err, ErrTestConflict):
		response.Fail(w, http.StatusConflict, "TEST_CONFLICT", "Test code, sequence, or final exam already exists")
	case errors.Is(err, ErrInvalidFinalRule):
		response.Fail(w, http.StatusBadRequest, "INVALID_FINAL_EXAM_RULE", "Final exam must be required with pass score 5")
	case errors.Is(err, ErrRetakeNotPermitted):
		response.Fail(w, http.StatusForbidden, "RETAKE_NOT_PERMITTED", "Lượt thi lại này chưa được Admin duyệt cấp phép. Vui lòng liên hệ Admin.")
	default:
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
	}
}
