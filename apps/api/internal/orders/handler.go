package orders

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/request"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/response"
)

type Handler struct {
	service *Service
	log     *slog.Logger
}

func NewHandler(service *Service, log *slog.Logger) *Handler {
	return &Handler{service: service, log: log}
}

type orderCreateRequest struct {
	LeadID         *string `json:"lead_id"`
	StudentID      *string `json:"student_id"`
	CourseID       *string `json:"course_id"`
	ClassID        *string `json:"class_id"`
	Amount         float64 `json:"amount"`
	DiscountAmount float64 `json:"discount_amount"`
	DiscountNote   *string `json:"discount_note"`
	PaymentMethod  *string `json:"payment_method"`
	Notes          *string `json:"notes"`
}

type orderStatusRequest struct {
	Status        string  `json:"status"`
	PaymentMethod *string `json:"payment_method"`
	Notes         *string `json:"notes"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserIDFrom(r.Context())

	var body orderCreateRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.Amount < 0 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "amount cannot be negative")
		return
	}
	if body.DiscountAmount < 0 {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "discount_amount cannot be negative")
		return
	}
	if body.DiscountAmount > body.Amount {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "discount_amount cannot exceed amount")
		return
	}

	view, err := h.service.Create(r.Context(), actorID, CreateInput{
		LeadID:         body.LeadID,
		StudentID:      body.StudentID,
		CourseID:       body.CourseID,
		ClassID:        body.ClassID,
		Amount:         body.Amount,
		DiscountAmount: body.DiscountAmount,
		DiscountNote:   body.DiscountNote,
		PaymentMethod:  body.PaymentMethod,
		Notes:          body.Notes,
	})
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.Created(w, view)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderID")
	view, err := h.service.Get(r.Context(), orderID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	claims, _ := auth.ClaimsFrom(r.Context())
	isManager := claims != nil && claims.HasAnyRole(auth.RoleAdmin, "SALE_ADMIN", "ACADEMIC_ADMIN")
	actorID, _ := auth.UserIDFrom(r.Context())
	if !isManager && view.CreatedBy != actorID {
		response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Chuyên viên chỉ được xem phiếu do chính mình lập")
		return
	}

	response.OK(w, view)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, perPage, _ := request.Page(r)

	claims, _ := auth.ClaimsFrom(r.Context())
	isManager := claims != nil && claims.HasAnyRole(auth.RoleAdmin, "SALE_ADMIN", "ACADEMIC_ADMIN")

	var createdBy string
	if !isManager {
		actorID, _ := auth.UserIDFrom(r.Context())
		createdBy = actorID
	} else if reqCreatedBy := r.URL.Query().Get("created_by"); reqCreatedBy != "" {
		createdBy = reqCreatedBy
	}

	filter := ListFilter{
		Status:      r.URL.Query().Get("status"),
		StudentID:   r.URL.Query().Get("student_id"),
		LeadID:      r.URL.Query().Get("lead_id"),
		CreatedBy:   createdBy,
		Search:      r.URL.Query().Get("search"),
		CreatedFrom: r.URL.Query().Get("created_from"),
		CreatedTo:   r.URL.Query().Get("created_to"),
		Page:        page,
		PerPage:     perPage,
	}

	res, err := h.service.List(r.Context(), filter)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, res)
}

func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderID")
	actorID, _ := auth.UserIDFrom(r.Context())

	var body orderStatusRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.Status == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "status is required")
		return
	}

	view, err := h.service.UpdateStatus(r.Context(), actorID, orderID, UpdateStatusInput{
		Status:        body.Status,
		PaymentMethod: body.PaymentMethod,
		Notes:         body.Notes,
	})
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) Revenue(w http.ResponseWriter, r *http.Request) {
	report, err := h.service.RevenueReport(r.Context())
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, report)
}

func (h *Handler) handleError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrOrderNotFound):
		response.Fail(w, http.StatusNotFound, "ORDER_NOT_FOUND", "Order not found")
	case errors.Is(err, ErrInvalidStatus):
		response.Fail(w, http.StatusBadRequest, "INVALID_ORDER_STATUS", "Invalid order status value")
	case errors.Is(err, ErrForbiddenOrderAccess):
		response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Chỉ chuyên viên tạo phiếu đăng ký hoặc cấp quản lý mới có quyền lập phiếu thu cho đơn này")
	case errors.Is(err, ErrClassAlreadyStarted):
		response.Fail(w, http.StatusBadRequest, "CLASS_ALREADY_STARTED", "Lớp học đã tới ngày khai giảng, không thể lập phiếu đăng ký mới")
	case errors.Is(err, ErrLeadAlreadyHasOrder):
		response.Fail(w, http.StatusBadRequest, "LEAD_ALREADY_HAS_ORDER", "Học viên này đã có phiếu đăng ký trong hệ thống, không thể lập thêm phiếu trùng lặp")
	case errors.Is(err, ErrLeadNotConverted):
		response.Fail(w, http.StatusBadRequest, "LEAD_NOT_CONVERTED", "Chỉ học viên đã được chốt (đã cấp mã học viên) mới được phép lập phiếu đăng ký")
	default:
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
	}
}

func (h *Handler) ExportExcel(w http.ResponseWriter, r *http.Request) {
	filter := ListFilter{
		Status:      r.URL.Query().Get("status"),
		StudentID:   r.URL.Query().Get("student_id"),
		LeadID:      r.URL.Query().Get("lead_id"),
		Search:      r.URL.Query().Get("search"),
		CreatedFrom: r.URL.Query().Get("created_from"),
		CreatedTo:   r.URL.Query().Get("created_to"),
	}

	file, err := h.service.ExportOrdersExcel(r.Context(), filter)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	defer file.Close()

	filename := fmt.Sprintf("danh_sach_don_hang_%s.xlsx", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	if err := file.Write(w); err != nil {
		h.log.Error("failed to write orders excel file to response", "error", err)
	}
}
