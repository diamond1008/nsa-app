package users

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

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

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("per_page"))

	filter := ListFilter{
		Role:    q.Get("role"),
		Status:  q.Get("status"),
		Search:  q.Get("search"),
		Page:    page,
		PerPage: perPage,
	}

	result, err := h.service.List(r.Context(), claims, filter)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, result)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	userID := chi.URLParam(r, "userID")
	user, err := h.service.Get(r.Context(), claims, userID)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, user)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	var body CreateUserInput
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	created, err := h.service.Create(r.Context(), claims, body)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.Created(w, created)
}

func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	userID := chi.URLParam(r, "userID")
	var body UpdateStatusInput
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	updated, err := h.service.UpdateStatus(r.Context(), claims, userID, body)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, updated)
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	userID := chi.URLParam(r, "userID")
	var body UpdateProfileInput
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	updated, err := h.service.UpdateProfile(r.Context(), claims, userID, body)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, updated)
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	userID := chi.URLParam(r, "userID")
	var body ResetPasswordInput
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if err := h.service.ResetPassword(r.Context(), claims, userID, body); err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, map[string]string{"message": "Password reset successfully"})
}

func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	userID := chi.URLParam(r, "userID")
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("per_page"))

	logs, err := h.service.ListAuditLogs(r.Context(), claims, userID, page, perPage)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, logs)
}

func (h *Handler) UpdateLeadRouting(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	userID := chi.URLParam(r, "userID")
	var body UpdateLeadRoutingInput
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	user, err := h.service.UpdateLeadRouting(r.Context(), claims, userID, body)
	if err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, user)
}

func (h *Handler) ReorderLeadRouting(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return
	}

	var body ReorderLeadRoutingInput
	if err := request.DecodeJSON(w, r, &body); err != nil {
		response.Fail(w, http.StatusBadRequest, "INVALID_JSON", "Request body must be valid JSON")
		return
	}

	if err := h.service.ReorderLeadRouting(r.Context(), claims, body); err != nil {
		h.handleError(w, r, err)
		return
	}
	response.OK(w, map[string]string{"message": "Lead routing sequence updated successfully"})
}

func (h *Handler) handleError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, ErrNotFound) {
		response.Fail(w, http.StatusNotFound, "NOT_FOUND", "User not found")
		return
	}
	if errors.Is(err, ErrForbidden) {
		response.Fail(w, http.StatusForbidden, "FORBIDDEN", err.Error())
		return
	}
	if errors.Is(err, ErrEmailConflict) {
		response.Fail(w, http.StatusConflict, "EMAIL_CONFLICT", "Email address is already in use")
		return
	}
	if errors.Is(err, ErrInvalidInput) {
		response.Fail(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	response.InternalError(w, h.log, auth.RequestIDFrom(r.Context()), err)
}
