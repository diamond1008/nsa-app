package leads

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
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

type leadWriteRequest struct {
	FullName           string  `json:"full_name"`
	Phone              *string `json:"phone"`
	Email              *string `json:"email"`
	DateOfBirth        *string `json:"date_of_birth"`
	Gender             *string `json:"gender"`
	Address            *string `json:"address"`
	Source             string  `json:"source"`
	SourceDetail       *string `json:"source_detail"`
	UTMSource          *string `json:"utm_source"`
	UTMMedium          *string `json:"utm_medium"`
	UTMCampaign        *string `json:"utm_campaign"`
	UTMContent         *string `json:"utm_content"`
	UTMTerm            *string `json:"utm_term"`
	InterestedCourseID *string `json:"interested_course_id"`
	Notes              *string `json:"notes"`
	AssignedTo         *string `json:"assigned_to"`
}

type statusRequest struct {
	PipelineStatus string `json:"pipeline_status"`
	Reason         string `json:"reason"`
}

type assignRequest struct {
	AssignedTo string `json:"assigned_to"`
}

type convertRequest struct {
	ClassID        string  `json:"class_id"`
	Amount         float64 `json:"amount"`
	DiscountAmount float64 `json:"discount_amount"`
	DiscountNote   string  `json:"discount_note"`
	PaymentMethod  string  `json:"payment_method"`
	Notes          string  `json:"notes"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var body leadWriteRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	input, msg := validateLeadWrite(body)
	if msg != "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", msg)
		return
	}

	actorID, _ := auth.UserIDFrom(r.Context())
	view, err := h.service.Create(r.Context(), actorID, input)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.Created(w, view)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	view, err := h.service.Get(r.Context(), actorID, isAdmin, leadID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	page, perPage, _ := request.Page(r)
	filter := ListFilter{
		Search:         r.URL.Query().Get("search"),
		PipelineStatus: r.URL.Query().Get("pipeline_status"),
		Source:         r.URL.Query().Get("source"),
		AssignedTo:     r.URL.Query().Get("assigned_to"),
		CreatedFrom:    r.URL.Query().Get("created_from"),
		CreatedTo:      r.URL.Query().Get("created_to"),
		SortBy:         r.URL.Query().Get("sort_by"),
		SortOrder:      r.URL.Query().Get("sort_order"),
		Page:           page,
		PerPage:        perPage,
	}

	res, err := h.service.List(r.Context(), actorID, isAdmin, filter)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, res)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	var body leadWriteRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	input, msg := validateLeadWrite(body)
	if msg != "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", msg)
		return
	}

	view, err := h.service.Update(r.Context(), actorID, isAdmin, leadID, input)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	var body statusRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.PipelineStatus == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "pipeline_status is required")
		return
	}

	view, err := h.service.UpdateStatus(r.Context(), actorID, isAdmin, leadID, StatusInput{
		PipelineStatus: body.PipelineStatus,
		Reason:         body.Reason,
	})
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) Assign(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	actorID, _ := auth.UserIDFrom(r.Context())

	var body assignRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.AssignedTo == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "assigned_to is required")
		return
	}

	view, err := h.service.Assign(r.Context(), actorID, leadID, body.AssignedTo)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) Convert(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	var body convertRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.ClassID == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "class_id is required")
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

	result, err := h.service.Convert(r.Context(), actorID, isAdmin, leadID, ConvertInput{
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

	response.OK(w, result)
}

func (h *Handler) ListStaff(w http.ResponseWriter, r *http.Request) {
	staff, err := h.service.ListSaleStaff(r.Context())
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, staff)
}

func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	overview, err := h.service.DashboardOverview(r.Context())
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, overview)
}

func (h *Handler) MyStats(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserIDFrom(r.Context())
	stats, err := h.service.MyDashboardStats(r.Context(), actorID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, stats)
}

func (h *Handler) Template(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("format") == "csv" {
		h.TemplateCSV(w, r)
		return
	}

	excelBytes, err := GenerateTemplateExcel()
	if err != nil {
		h.log.Error("generate template excel", "request_id", auth.RequestIDFrom(r.Context()), "error", err)
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="mau_nhap_lead_tuyen_sinh.xlsx"`)
	_, _ = w.Write(excelBytes)
}

func (h *Handler) TemplateCSV(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="mau_nhap_lead_tuyen_sinh.csv"`)
	_, _ = io.WriteString(w, "\xEF\xBB\xBF") // UTF-8 BOM for Microsoft Excel compatibility
	writer := csv.NewWriter(w)
	_ = writer.Write([]string{
		"ho_va_ten", "so_dien_thoai", "email", "khoa_hoc", "nguon", "ghi_chu",
		"ngay_sinh", "gioi_tinh", "dia_chi", "nhan_vien_phu_trach",
	})
	_ = writer.Write([]string{
		"Trần Văn An", "0901234567", "tranvanan@example.com", "AUTO-EV-HYBRID", "facebook",
		"Quan tâm khóa kỹ thuật xe điện & Hybrid", "15/05/1998", "Nam", "Hà Nội", "sale@nsa.local",
	})
	_ = writer.Write([]string{
		"Nguyễn Thị Mai", "0912345678", "mainguyen@example.com", "AUTO-ELEC-PRO", "tiktok",
		"Tư vấn lịch học thực hành buổi tối", "20/10/2001", "Nữ", "TP. Hồ Chí Minh", "sale2@nsa.local",
	})
	_ = writer.Write([]string{
		"Lê Quốc Huy", "0987654321", "huy.le@example.com", "AUTO-ENG-EFI", "zalo",
		"Muốn bổ túc chẩn đoán động cơ GDI", "08/12/1995", "Nam", "Đà Nẵng", "",
	})
	writer.Flush()
	if err := writer.Error(); err != nil {
		h.log.Error("write lead template CSV", "request_id", auth.RequestIDFrom(r.Context()), "error", err)
	}
}

func (h *Handler) Import(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserIDFrom(r.Context())

	var dataBytes []byte
	var err error

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			response.Fail(w, http.StatusBadRequest, "INVALID_FILE", "Lỗi tải file: "+err.Error())
			return
		}
		file, _, fileErr := r.FormFile("file")
		if fileErr != nil {
			response.Fail(w, http.StatusBadRequest, "INVALID_FILE", "Không tìm thấy file trong form upload")
			return
		}
		defer file.Close()
		dataBytes, err = io.ReadAll(io.LimitReader(file, 10<<20+1))
		if err != nil {
			response.Fail(w, http.StatusBadRequest, "INVALID_FILE", "Lỗi đọc file: "+err.Error())
			return
		}
	} else {
		dataBytes, err = io.ReadAll(io.LimitReader(r.Body, 10<<20+1))
		if err != nil {
			response.Fail(w, http.StatusBadRequest, "INVALID_FILE", "Lỗi đọc dữ liệu: "+err.Error())
			return
		}
	}

	result, err := h.service.ImportFileData(r.Context(), actorID, dataBytes)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, result)
}

func (h *Handler) ImportCSV(w http.ResponseWriter, r *http.Request) {
	h.Import(w, r)
}

func (h *Handler) handleError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrInvalidCSV):
		response.Fail(w, http.StatusBadRequest, "INVALID_CSV", err.Error())
	case errors.Is(err, ErrNotFound):
		response.Fail(w, http.StatusNotFound, "LEAD_NOT_FOUND", "Lead not found")
	case errors.Is(err, ErrAlreadyConverted):
		response.Fail(w, http.StatusBadRequest, "LEAD_ALREADY_CONVERTED", "Lead has already been converted into a student")
	case errors.Is(err, ErrClassNotFound):
		response.Fail(w, http.StatusBadRequest, "CLASS_NOT_FOUND", "Target class not found or not active for enrollment")
	case errors.Is(err, ErrClassFull):
		response.Fail(w, http.StatusBadRequest, "CLASS_FULL", "Target class is at maximum capacity")
	case errors.Is(err, ErrInvalidStatusTransition):
		response.Fail(w, http.StatusBadRequest, "INVALID_PIPELINE_TRANSITION", "Invalid pipeline status value")
	case errors.Is(err, ErrUnauthorizedAccess):
		response.Fail(w, http.StatusForbidden, "FORBIDDEN", "You do not have access to this lead")
	case errors.Is(err, ErrInvalidAssignee):
		response.Fail(w, http.StatusBadRequest, "INVALID_ASSIGNEE", "Invalid assignee user ID")
	case errors.Is(err, ErrEmailAlreadyExists):
		response.Fail(w, http.StatusConflict, "EMAIL_EXISTS", "Email này đã được sử dụng cho một tài khoản khác trong hệ thống")
	default:
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
	}
}

func validateLeadWrite(body leadWriteRequest) (WriteInput, string) {
	name := strings.TrimSpace(body.FullName)
	if name == "" {
		return WriteInput{}, "full_name is required"
	}
	if len(name) > 200 {
		return WriteInput{}, "full_name must be 200 characters or fewer"
	}

	source := db.LeadSource(body.Source)
	if source == "" {
		source = db.LeadSourceOther
	}

	return WriteInput{
		FullName:           name,
		Phone:              body.Phone,
		Email:              body.Email,
		DateOfBirth:        body.DateOfBirth,
		Gender:             body.Gender,
		Address:            body.Address,
		Source:             source,
		SourceDetail:       body.SourceDetail,
		UTMSource:          body.UTMSource,
		UTMMedium:          body.UTMMedium,
		UTMCampaign:        body.UTMCampaign,
		UTMContent:         body.UTMContent,
		UTMTerm:            body.UTMTerm,
		InterestedCourseID: body.InterestedCourseID,
		Notes:              body.Notes,
		AssignedTo:         body.AssignedTo,
	}, ""
}

func (h *Handler) CheckDuplicate(w http.ResponseWriter, r *http.Request) {
	phone := r.URL.Query().Get("phone")
	email := r.URL.Query().Get("email")
	excludeID := r.URL.Query().Get("exclude_id")

	result, err := h.service.CheckDuplicate(r.Context(), phone, email, excludeID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, result)
}

func (h *Handler) ExportExcel(w http.ResponseWriter, r *http.Request) {
	filter := ListFilter{
		Search:         r.URL.Query().Get("search"),
		PipelineStatus: r.URL.Query().Get("pipeline_status"),
		Source:         r.URL.Query().Get("source"),
		AssignedTo:     r.URL.Query().Get("assigned_to"),
		CreatedFrom:    r.URL.Query().Get("created_from"),
		CreatedTo:      r.URL.Query().Get("created_to"),
	}

	file, err := h.service.ExportLeadsExcel(r.Context(), filter)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	defer file.Close()

	filename := fmt.Sprintf("danh_sach_lead_%s.xlsx", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	if err := file.Write(w); err != nil {
		h.log.Error("failed to write excel file to response", "error", err)
	}
}
