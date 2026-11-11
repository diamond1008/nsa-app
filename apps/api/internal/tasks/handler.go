package tasks

import (
	"errors"
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

type taskCreateRequest struct {
	AssignedTo  string  `json:"assigned_to"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	DueAt       string  `json:"due_at"`
}

type taskUpdateRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description"`
	DueAt       string  `json:"due_at"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	actorID, _ := auth.UserIDFrom(r.Context())

	var body taskCreateRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.Title == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "title is required")
		return
	}
	dueAt, err := time.Parse(time.RFC3339, body.DueAt)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "due_at must be valid RFC3339 timestamp")
		return
	}

	assignee := body.AssignedTo
	if assignee == "" {
		assignee = actorID
	}

	view, err := h.service.Create(r.Context(), actorID, CreateInput{
		LeadID:      leadID,
		AssignedTo:  assignee,
		Title:       body.Title,
		Description: body.Description,
		DueAt:       dueAt,
	})
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.Created(w, view)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	filter := ListFilter{
		AssignedTo:   r.URL.Query().Get("assigned_to"),
		LeadID:       r.URL.Query().Get("lead_id"),
		FilterStatus: r.URL.Query().Get("status"),
	}

	items, err := h.service.List(r.Context(), actorID, isAdmin, filter)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, items)
}

func (h *Handler) ListByLead(w http.ResponseWriter, r *http.Request) {
	leadID := chi.URLParam(r, "leadID")
	items, err := h.service.ListByLead(r.Context(), leadID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, items)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	var body taskUpdateRequest
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if body.Title == "" {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "title is required")
		return
	}
	dueAt, err := time.Parse(time.RFC3339, body.DueAt)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "due_at must be valid RFC3339 timestamp")
		return
	}

	view, err := h.service.Update(r.Context(), actorID, isAdmin, taskID, UpdateInput{
		Title:       body.Title,
		Description: body.Description,
		DueAt:       dueAt,
	})
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) Complete(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	actorID, _ := auth.UserIDFrom(r.Context())
	claims, _ := auth.ClaimsFrom(r.Context())
	isAdmin := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)

	view, err := h.service.Complete(r.Context(), actorID, isAdmin, taskID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}

	response.OK(w, view)
}

func (h *Handler) handleError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrTaskNotFound):
		response.Fail(w, http.StatusNotFound, "TASK_NOT_FOUND", "Task not found")
	case errors.Is(err, ErrLeadNotFound):
		response.Fail(w, http.StatusNotFound, "LEAD_NOT_FOUND", "Lead not found")
	case errors.Is(err, ErrUnauthorizedAccess):
		response.Fail(w, http.StatusForbidden, "FORBIDDEN", "You do not have access to this task")
	case errors.Is(err, ErrTitleRequired):
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "title is required")
	case errors.Is(err, ErrDueAtRequired):
		response.Fail(w, http.StatusBadRequest, "VALIDATION_ERROR", "due_at is required")
	default:
		response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
	}
}
