package classes

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
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

type writeRequest struct {
	CourseID        string `json:"course_id"`
	ClassCode       string `json:"class_code"`
	Name            string `json:"name"`
	StartDate       string `json:"start_date"`
	EndDate         string `json:"end_date"`
	MaximumStudents int32  `json:"maximum_students"`
	Status          string `json:"status"`
	ChangeReason    string `json:"change_reason"`
}

type enrollmentRequest struct {
	StudentID string `json:"student_id"`
	Reason    string `json:"reason"`
}

type enrollmentStatusRequest struct {
	Status      string `json:"status"`
	Reason      string `json:"reason"`
	EffectiveAt string `json:"effective_at"`
}

type enrollmentTransferRequest struct {
	TargetClassID string `json:"target_class_id"`
	Reason        string `json:"reason"`
}

type assignmentRequest struct {
	TeacherID      string `json:"teacher_id"`
	AssignmentRole string `json:"assignment_role"`
	Reason         string `json:"reason"`
}

type assignmentUpdateRequest struct {
	AssignmentRole string `json:"assignment_role"`
	Reason         string `json:"reason"`
}

type reasonRequest struct {
	Reason string `json:"reason"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	input, ok := h.decodeClass(w, r, false)
	if !ok {
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.Create(r.Context(), actorID, input)
	h.writeClass(w, r, view, err, true)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	view, err := h.service.Get(r.Context(), chi.URLParam(r, "classID"))
	h.writeClass(w, r, view, err, false)
}

func (h *Handler) OperationHistory(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.OperationHistory(r.Context(), chi.URLParam(r, "classID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, perPage, err := request.Page(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !validClassStatus(status) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid class status")
		return
	}
	for _, name := range []string{"course_id", "teacher_id"} {
		if value := strings.TrimSpace(r.URL.Query().Get(name)); value != "" {
			if _, err := data.UUID(value); err != nil {
				response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", name+" must be a valid UUID")
				return
			}
		}
	}
	capacity := strings.TrimSpace(r.URL.Query().Get("capacity"))
	if capacity != "" && capacity != "available" && capacity != "full" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "capacity must be available or full")
		return
	}
	for _, name := range []string{"from_date", "to_date"} {
		if value := strings.TrimSpace(r.URL.Query().Get(name)); value != "" {
			if _, err := time.Parse("2006-01-02", value); err != nil {
				response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", name+" must use YYYY-MM-DD")
				return
			}
		}
	}
	fromDate, toDate := strings.TrimSpace(r.URL.Query().Get("from_date")), strings.TrimSpace(r.URL.Query().Get("to_date"))
	if fromDate != "" && toDate != "" {
		from, _ := time.Parse("2006-01-02", fromDate)
		to, _ := time.Parse("2006-01-02", toDate)
		if to.Before(from) {
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "to_date must be on or after from_date")
			return
		}
	}
	sortBy, sortOrder, err := request.Sort(r, "created_at", "created_at", "class_code", "start_date")
	if err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	var saleUserID string
	if claims, ok := auth.ClaimsFrom(r.Context()); ok {
		if claims.HasAnyRole(auth.RoleSale) && !claims.HasAnyRole(auth.RoleAdmin, auth.RoleAcademicAdmin, auth.RoleSaleAdmin) {
			saleUserID = claims.UserID
		}
	}
	result, err := h.service.List(r.Context(), ListFilter{
		Search: r.URL.Query().Get("search"), Status: status,
		CourseID: r.URL.Query().Get("course_id"), TeacherID: r.URL.Query().Get("teacher_id"),
		Capacity: capacity, FromDate: r.URL.Query().Get("from_date"), ToDate: r.URL.Query().Get("to_date"),
		SaleUserID: saleUserID,
		SortBy:     sortBy, SortOrder: sortOrder, Page: page, PerPage: perPage,
	})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, result)
}

// ListSaleClasses lists classes for sale operations (such as lead conversion and registration orders)
// without restricting by SaleUserID, ensuring sales staff can enroll students into any available class.
func (h *Handler) ListSaleClasses(w http.ResponseWriter, r *http.Request) {
	page, perPage, err := request.Page(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !validClassStatus(status) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid class status")
		return
	}
	for _, name := range []string{"course_id", "teacher_id"} {
		if value := strings.TrimSpace(r.URL.Query().Get(name)); value != "" {
			if _, err := data.UUID(value); err != nil {
				response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", name+" must be a valid UUID")
				return
			}
		}
	}
	capacity := strings.TrimSpace(r.URL.Query().Get("capacity"))
	if capacity != "" && capacity != "available" && capacity != "full" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "capacity must be available or full")
		return
	}
	for _, name := range []string{"from_date", "to_date"} {
		if value := strings.TrimSpace(r.URL.Query().Get(name)); value != "" {
			if _, err := time.Parse("2006-01-02", value); err != nil {
				response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", name+" must use YYYY-MM-DD")
				return
			}
		}
	}
	fromDate, toDate := strings.TrimSpace(r.URL.Query().Get("from_date")), strings.TrimSpace(r.URL.Query().Get("to_date"))
	if fromDate != "" && toDate != "" {
		from, _ := time.Parse("2006-01-02", fromDate)
		to, _ := time.Parse("2006-01-02", toDate)
		if to.Before(from) {
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "to_date must be on or after from_date")
			return
		}
	}
	sortBy, sortOrder, err := request.Sort(r, "created_at", "created_at", "class_code", "start_date")
	if err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	upcomingOnly := r.URL.Query().Get("include_started") != "true"
	result, err := h.service.List(r.Context(), ListFilter{
		Search: r.URL.Query().Get("search"), Status: status,
		CourseID: r.URL.Query().Get("course_id"), TeacherID: r.URL.Query().Get("teacher_id"),
		Capacity: capacity, FromDate: r.URL.Query().Get("from_date"), ToDate: r.URL.Query().Get("to_date"),
		UpcomingOnly: upcomingOnly,
		SortBy:       sortBy, SortOrder: sortOrder, Page: page, PerPage: perPage,
	})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, result)
}

func (h *Handler) ListTeacherClasses(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserIDFrom(r.Context())
	items, err := h.service.ListTeacher(r.Context(), userID)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) GetTeacherClass(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.GetTeacherClass(r.Context(), userID, chi.URLParam(r, "classID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	input, ok := h.decodeClass(w, r, true)
	if !ok {
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.Update(r.Context(), actorID, chi.URLParam(r, "classID"), input)
	h.writeClass(w, r, view, err, false)
}

func (h *Handler) Enroll(w http.ResponseWriter, r *http.Request) {
	var body enrollmentRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	if strings.TrimSpace(body.StudentID) == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "student_id is required")
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.EnrollWithReason(r.Context(), actorID, chi.URLParam(r, "classID"), body.StudentID, defaultReason(body.Reason, "Ghi danh học viên"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.Created(w, view)
}

func (h *Handler) ListEnrollments(w http.ResponseWriter, r *http.Request) {
	var saleUserID string
	if claims, ok := auth.ClaimsFrom(r.Context()); ok {
		if claims.HasAnyRole(auth.RoleSale) && !claims.HasAnyRole(auth.RoleAdmin, auth.RoleAcademicAdmin, auth.RoleSaleAdmin) {
			saleUserID = claims.UserID
		}
	}
	items, err := h.service.ListEnrollments(r.Context(), chi.URLParam(r, "classID"), saleUserID)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) UpdateEnrollment(w http.ResponseWriter, r *http.Request) {
	var body enrollmentStatusRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	body.Reason = strings.TrimSpace(body.Reason)
	body.EffectiveAt = strings.TrimSpace(body.EffectiveAt)
	if !validEnrollmentStatus(body.Status) || !validRequiredReason(body.Reason) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "A valid enrollment status and reason are required")
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	var view EnrollmentView
	var err error
	if body.Status == string(db.EnrollmentStatusEnrolled) {
		effectiveAt := time.Now()
		if body.EffectiveAt != "" {
			effectiveAt, err = time.Parse(time.RFC3339, body.EffectiveAt)
			if err != nil {
				response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "effective_at must be a valid RFC3339 timestamp")
				return
			}
		}
		view, err = h.service.Reenroll(
			r.Context(), actorID, chi.URLParam(r, "classID"), chi.URLParam(r, "enrollmentID"),
			effectiveAt, body.Reason,
		)
	} else {
		if body.EffectiveAt != "" {
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "effective_at is only valid when returning a withdrawn student")
			return
		}
		view, err = h.service.UpdateEnrollmentWithReason(
			r.Context(), actorID, chi.URLParam(r, "classID"), chi.URLParam(r, "enrollmentID"),
			db.EnrollmentStatus(body.Status), body.Reason,
		)
	}
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}

func (h *Handler) TransferEnrollment(w http.ResponseWriter, r *http.Request) {
	var body enrollmentTransferRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	body.TargetClassID, body.Reason = strings.TrimSpace(body.TargetClassID), strings.TrimSpace(body.Reason)
	if _, err := data.UUID(body.TargetClassID); err != nil || !validRequiredReason(body.Reason) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "target_class_id and a reason of at most 500 characters are required")
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.TransferEnrollment(r.Context(), actorID, chi.URLParam(r, "classID"), chi.URLParam(r, "enrollmentID"), body.TargetClassID, body.Reason)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}

func (h *Handler) AssignTeacher(w http.ResponseWriter, r *http.Request) {
	var body assignmentRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	body.AssignmentRole = strings.TrimSpace(body.AssignmentRole)
	body.Reason = strings.TrimSpace(body.Reason)
	if body.TeacherID == "" || body.AssignmentRole == "" || len(body.AssignmentRole) > 80 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "teacher_id and a valid assignment_role are required")
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.AssignTeacherWithReason(
		r.Context(), actorID, chi.URLParam(r, "classID"), body.TeacherID, body.AssignmentRole,
		defaultReason(body.Reason, "Phân công giảng viên"),
	)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.Created(w, view)
}

func (h *Handler) ListAssignments(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.ListAssignments(r.Context(), chi.URLParam(r, "classID"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) UpdateAssignment(w http.ResponseWriter, r *http.Request) {
	var body assignmentUpdateRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	body.AssignmentRole = strings.TrimSpace(body.AssignmentRole)
	body.Reason = strings.TrimSpace(body.Reason)
	if body.AssignmentRole == "" || len(body.AssignmentRole) > 80 || !validRequiredReason(body.Reason) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "A valid assignment_role is required")
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.UpdateAssignmentWithReason(
		r.Context(), actorID, chi.URLParam(r, "classID"), chi.URLParam(r, "assignmentID"),
		body.AssignmentRole, body.Reason,
	)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, view)
}

func (h *Handler) DeleteAssignment(w http.ResponseWriter, r *http.Request) {
	var body reasonRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}
	body.Reason = strings.TrimSpace(body.Reason)
	if !validRequiredReason(body.Reason) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "A reason of at most 500 characters is required")
		return
	}
	actorID, _ := auth.UserIDFrom(r.Context())
	err := h.service.DeleteAssignmentWithReason(
		r.Context(), actorID, chi.URLParam(r, "classID"), chi.URLParam(r, "assignmentID"),
		body.Reason,
	)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	response.OK(w, map[string]string{"message": "Teacher assignment removed"})
}

func (h *Handler) decodeClass(w http.ResponseWriter, r *http.Request, requireReason bool) (WriteInput, bool) {
	var body writeRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return WriteInput{}, false
	}
	body.CourseID, body.ClassCode, body.Name = strings.TrimSpace(body.CourseID), strings.TrimSpace(body.ClassCode), strings.TrimSpace(body.Name)
	body.Status = strings.TrimSpace(body.Status)
	body.ChangeReason = strings.TrimSpace(body.ChangeReason)
	start, startErr := time.Parse("2006-01-02", body.StartDate)
	end, endErr := time.Parse("2006-01-02", body.EndDate)
	if body.CourseID == "" || body.ClassCode == "" || len(body.ClassCode) > 40 ||
		body.Name == "" || len(body.Name) > 200 || startErr != nil || endErr != nil ||
		end.Before(start) || body.MaximumStudents <= 0 || !validClassStatus(body.Status) ||
		(requireReason && !validRequiredReason(body.ChangeReason)) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid course, code, name, dates, capacity, or status")
		return WriteInput{}, false
	}
	return WriteInput{
		CourseID: body.CourseID, ClassCode: body.ClassCode, Name: body.Name,
		StartDate: body.StartDate, EndDate: body.EndDate,
		MaximumStudents: body.MaximumStudents, Status: db.ClassStatus(body.Status),
		ChangeReason: body.ChangeReason,
	}, true
}

func validRequiredReason(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && len(value) <= 500
}

func defaultReason(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func validClassStatus(value string) bool {
	switch db.ClassStatus(value) {
	case db.ClassStatusPlanning, db.ClassStatusOpen, db.ClassStatusInProgress,
		db.ClassStatusCompleted, db.ClassStatusCancelled, db.ClassStatusArchived:
		return true
	default:
		return false
	}
}

func validEnrollmentStatus(value string) bool {
	switch db.EnrollmentStatus(value) {
	case db.EnrollmentStatusEnrolled, db.EnrollmentStatusTransferred,
		db.EnrollmentStatusCompleted, db.EnrollmentStatusWithdrawn:
		return true
	default:
		return false
	}
}

func (h *Handler) writeClass(w http.ResponseWriter, r *http.Request, view View, err error, created bool) {
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if created {
		response.Created(w, view)
	} else {
		response.OK(w, view)
	}
}

func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrClassNotFound):
		response.Fail(w, http.StatusNotFound, "CLASS_NOT_FOUND", "Class not found")
	case errors.Is(err, ErrCourseNotFound):
		response.Fail(w, http.StatusNotFound, "COURSE_NOT_FOUND", "Course not found")
	case errors.Is(err, ErrStudentNotFound):
		response.Fail(w, http.StatusNotFound, "STUDENT_NOT_FOUND", "Student not found")
	case errors.Is(err, ErrTeacherNotFound):
		response.Fail(w, http.StatusNotFound, "TEACHER_NOT_FOUND", "Teacher not found")
	case errors.Is(err, ErrTeacherNotAssigned):
		response.Fail(w, http.StatusForbidden, "TEACHER_NOT_ASSIGNED", "Teacher is not assigned to this class")
	case errors.Is(err, ErrEnrollmentNotFound):
		response.Fail(w, http.StatusNotFound, "ENROLLMENT_NOT_FOUND", "Enrollment not found")
	case errors.Is(err, ErrAssignmentNotFound):
		response.Fail(w, http.StatusNotFound, "ASSIGNMENT_NOT_FOUND", "Teacher assignment not found")
	case errors.Is(err, ErrClassConflict):
		response.Fail(w, http.StatusConflict, "CLASS_CODE_ALREADY_EXISTS", "Class code already exists")
	case errors.Is(err, ErrDuplicateEnrollment):
		response.Fail(w, http.StatusConflict, "DUPLICATE_ENROLLMENT", "Student is already enrolled in this class")
	case errors.Is(err, ErrClassFull):
		response.Fail(w, http.StatusConflict, "CLASS_CAPACITY_REACHED", "Class has reached maximum capacity")
	case errors.Is(err, ErrCapacityBelowCount):
		response.Fail(w, http.StatusConflict, "CAPACITY_BELOW_ENROLLMENT", "Maximum students cannot be below current enrollment")
	case errors.Is(err, ErrDuplicateAssignment):
		response.Fail(w, http.StatusConflict, "DUPLICATE_TEACHER_ASSIGNMENT", "Teacher is already assigned to this class")
	case errors.Is(err, ErrAssignmentInUse):
		response.Fail(w, http.StatusConflict, "ASSIGNMENT_IN_USE", "Reschedule or cancel the teacher's upcoming sessions before removing the assignment")
	case errors.Is(err, ErrStudentInactive):
		response.Fail(w, http.StatusConflict, "STUDENT_INACTIVE", "Only active students can be enrolled")
	case errors.Is(err, ErrTeacherInactive):
		response.Fail(w, http.StatusConflict, "TEACHER_INACTIVE", "Only active teachers can be assigned")
	case errors.Is(err, ErrClassNotEnrollable):
		response.Fail(w, http.StatusConflict, "CLASS_STATUS_INVALID", "Class status does not allow enrollment or assignment")
	case errors.Is(err, ErrEnrollmentNotActive):
		response.Fail(w, http.StatusConflict, "ENROLLMENT_NOT_ACTIVE", "Only an active enrollment can be transferred")
	case errors.Is(err, ErrEnrollmentCannotReopen):
		response.Fail(w, http.StatusConflict, "ENROLLMENT_CANNOT_REOPEN", "Only a withdrawn enrollment can return to class")
	case errors.Is(err, ErrReenrollmentDate):
		response.Fail(w, http.StatusConflict, "REENROLLMENT_DATE_INVALID", "Return time must follow the previous withdrawal and fall within the class dates")
	case errors.Is(err, ErrActiveCourseEnrollment):
		response.Fail(w, http.StatusConflict, "ACTIVE_COURSE_ENROLLMENT", "Student is already active in another class for this course; use class transfer instead")
	case errors.Is(err, ErrTransferSameClass):
		response.Fail(w, http.StatusConflict, "TRANSFER_SAME_CLASS", "Target class must differ from source class")
	case errors.Is(err, ErrTransferCourse):
		response.Fail(w, http.StatusConflict, "TRANSFER_COURSE_MISMATCH", "Student can only transfer to another class of the same course")
	default:
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
	}
}
