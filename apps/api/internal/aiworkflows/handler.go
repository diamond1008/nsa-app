package aiworkflows

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
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

func (h *Handler) ListProposals(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	query := r.URL.Query()
	page, _ := strconv.Atoi(query.Get("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(query.Get("per_page"))
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	var domainPtr *string
	if d := query.Get("domain"); d != "" {
		switch d {
		case "sales_crm", "revenue_ops", "training_ops":
			domainPtr = &d
		default:
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid domain filter")
			return
		}
	}

	var statusPtr *string
	if s := query.Get("status"); s != "" {
		switch s {
		case "pending", "executed", "rejected":
			statusPtr = &s
		default:
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid status filter")
			return
		}
	}

	var priorityPtr *string
	if p := query.Get("priority"); p != "" {
		switch p {
		case "critical", "high", "medium", "low":
			priorityPtr = &p
		default:
			response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid priority filter")
			return
		}
	}

	var assignedUserPtr *string
	if u := query.Get("assigned_user_id"); u != "" {
		assignedUserPtr = &u
	}

	var targetLeadPtr *string
	if l := query.Get("target_lead_id"); l != "" {
		targetLeadPtr = &l
	}

	items, total, err := h.service.List(r.Context(), claims, ListParams{
		Domain:         domainPtr,
		Status:         statusPtr,
		Priority:       priorityPtr,
		AssignedUserID: assignedUserPtr,
		TargetLeadID:   targetLeadPtr,
		Page:           page,
		PerPage:        perPage,
	})
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Forbidden")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, pagination.New(items, page, perPage, total))
}

func (h *Handler) GetProposal(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	proposalID := chi.URLParam(r, "proposalID")
	view, err := h.service.Get(r.Context(), claims, proposalID)
	if err != nil {
		if errors.Is(err, ErrProposalNotFound) {
			response.Fail(w, http.StatusNotFound, "NOT_FOUND", "Proposal not found")
			return
		}
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Forbidden")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) Summary(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	summary, err := h.service.Summary(r.Context(), claims)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Forbidden")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, summary)
}

func (h *Handler) Scan(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	scanResult, err := h.service.Scan(r.Context(), claims)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Chỉ quản lý mới có quyền chạy quét điểm nghẽn")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, scanResult)
}

type approveRequest struct {
	SuggestedScript *string `json:"suggested_script"`
	DecisionNote    *string `json:"decision_note"`
	AssignedTo      *string `json:"assigned_to"`
	DueAt           *string `json:"due_at"`
}

func (h *Handler) Approve(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	proposalID := chi.URLParam(r, "proposalID")

	var body approveRequest
	if err := request.DecodeJSON(w, r, &body); err != nil && !errors.Is(err, io.EOF) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	var dueAtPtr *time.Time
	if body.DueAt != nil && *body.DueAt != "" {
		if parsed, err := time.Parse(time.RFC3339, *body.DueAt); err == nil {
			dueAtPtr = &parsed
		}
	}

	result, err := h.service.Approve(r.Context(), claims, proposalID, ApproveProposalInput{
		SuggestedScript: body.SuggestedScript,
		DecisionNote:    body.DecisionNote,
		AssignedTo:      body.AssignedTo,
		DueAt:           dueAtPtr,
	})
	if err != nil {
		if errors.Is(err, ErrProposalNotFound) {
			response.Fail(w, http.StatusNotFound, "NOT_FOUND", "Proposal not found")
			return
		}
		if errors.Is(err, ErrProposalNotPending) {
			response.Fail(w, http.StatusBadRequest, "ALREADY_DECIDED", "Đề xuất này đã được phê duyệt hoặc bỏ qua trước đó")
			return
		}
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Bạn không có quyền phê duyệt đề xuất này")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, result)
}

type rejectRequest struct {
	DecisionNote *string `json:"decision_note"`
}

func (h *Handler) Reject(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	proposalID := chi.URLParam(r, "proposalID")

	var body rejectRequest
	if err := request.DecodeJSON(w, r, &body); err != nil && !errors.Is(err, io.EOF) {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	result, err := h.service.Reject(r.Context(), claims, proposalID, RejectProposalInput{
		DecisionNote: body.DecisionNote,
	})
	if err != nil {
		if errors.Is(err, ErrProposalNotFound) {
			response.Fail(w, http.StatusNotFound, "NOT_FOUND", "Proposal not found")
			return
		}
		if errors.Is(err, ErrProposalNotPending) {
			response.Fail(w, http.StatusBadRequest, "ALREADY_DECIDED", "Đề xuất này đã được quyết định trước đó")
			return
		}
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Forbidden")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, result)
}

func (h *Handler) LeadCopilot(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	leadID := chi.URLParam(r, "leadID")
	insight, err := h.service.LeadCopilot(r.Context(), claims, leadID)
	if err != nil {
		if errors.Is(err, ErrLeadNotFound) {
			response.Fail(w, http.StatusNotFound, "NOT_FOUND", "Lead not found")
			return
		}
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Forbidden")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, insight)
}

func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	var req AgentChatRequest
	if err := request.DecodeJSON(w, r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "Message is required")
		return
	}

	res, err := h.service.Chat(r.Context(), claims, req)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Forbidden")
			return
		}
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
		return
	}

	response.OK(w, res)
}
