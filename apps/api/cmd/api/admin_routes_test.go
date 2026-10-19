package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/attendance"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/classes"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/completions"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/courses"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/reports"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/schedules"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/students"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/teachers"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/testscores"
)

func TestAllAdminRoutesRequireAdmin(t *testing.T) {
	tokens, err := auth.NewTokenService("phase-4-test-secret-at-least-32-bytes", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		mountAdminRoutes(
			r, tokens, nil, log,
			students.NewHandler(nil, log),
			teachers.NewHandler(nil, log),
			courses.NewHandler(nil, log),
			classes.NewHandler(nil, log),
			schedules.NewHandler(nil, log),
			attendance.NewHandler(nil, log),
			completions.NewHandler(nil, log),
			reports.NewHandler(nil, log),
			testscores.NewHandler(nil, log),
		)
	})
	teacherToken, _, err := tokens.Issue(
		"22222222-2222-2222-2222-222222222222",
		"teacher@test.local",
		[]string{auth.RoleTeacher},
	)
	if err != nil {
		t.Fatal(err)
	}

	const id = "11111111-1111-1111-1111-111111111111"
	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/admin/students"},
		{http.MethodPost, "/api/v1/admin/students"},
		{http.MethodGet, "/api/v1/admin/students/" + id},
		{http.MethodPut, "/api/v1/admin/students/" + id},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/profile-summary"},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/class-history"},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/schedule"},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/status-history"},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/attendance-breakdown"},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/academic-summary"},
		{http.MethodGet, "/api/v1/admin/students/" + id + "/audit-logs"},
		{http.MethodPatch, "/api/v1/admin/students/" + id + "/account-status"},
		{http.MethodGet, "/api/v1/admin/teachers"},
		{http.MethodPost, "/api/v1/admin/teachers"},
		{http.MethodGet, "/api/v1/admin/teachers/" + id},
		{http.MethodPut, "/api/v1/admin/teachers/" + id},
		{http.MethodGet, "/api/v1/admin/teachers/" + id + "/profile-summary"},
		{http.MethodGet, "/api/v1/admin/teachers/" + id + "/class-history"},
		{http.MethodGet, "/api/v1/admin/teachers/" + id + "/workload-summary"},
		{http.MethodGet, "/api/v1/admin/teachers/" + id + "/audit-logs"},
		{http.MethodPatch, "/api/v1/admin/teachers/" + id + "/account-status"},
		{http.MethodGet, "/api/v1/admin/courses"},
		{http.MethodPost, "/api/v1/admin/courses"},
		{http.MethodGet, "/api/v1/admin/courses/" + id},
		{http.MethodPut, "/api/v1/admin/courses/" + id},
		{http.MethodGet, "/api/v1/admin/courses/" + id + "/modules"},
		{http.MethodPost, "/api/v1/admin/courses/" + id + "/modules"},
		{http.MethodPut, "/api/v1/admin/courses/" + id + "/modules/" + id},
		{http.MethodGet, "/api/v1/admin/courses/" + id + "/competencies"},
		{http.MethodPost, "/api/v1/admin/courses/" + id + "/competencies"},
		{http.MethodPut, "/api/v1/admin/courses/" + id + "/competencies/" + id},
		{http.MethodGet, "/api/v1/admin/courses/" + id + "/tests"},
		{http.MethodPost, "/api/v1/admin/courses/" + id + "/tests"},
		{http.MethodPut, "/api/v1/admin/courses/" + id + "/tests/" + id},
		{http.MethodGet, "/api/v1/admin/classes"},
		{http.MethodPost, "/api/v1/admin/classes"},
		{http.MethodGet, "/api/v1/admin/classes/" + id},
		{http.MethodPut, "/api/v1/admin/classes/" + id},
		{http.MethodGet, "/api/v1/admin/classes/" + id + "/enrollments"},
		{http.MethodPost, "/api/v1/admin/classes/" + id + "/enrollments"},
		{http.MethodPut, "/api/v1/admin/classes/" + id + "/enrollments/" + id},
		{http.MethodGet, "/api/v1/admin/classes/" + id + "/teacher-assignments"},
		{http.MethodPost, "/api/v1/admin/classes/" + id + "/teacher-assignments"},
		{http.MethodPut, "/api/v1/admin/classes/" + id + "/teacher-assignments/" + id},
		{http.MethodDelete, "/api/v1/admin/classes/" + id + "/teacher-assignments/" + id},
		{http.MethodGet, "/api/v1/admin/locations"},
		{http.MethodPost, "/api/v1/admin/locations"},
		{http.MethodGet, "/api/v1/admin/locations/" + id},
		{http.MethodPut, "/api/v1/admin/locations/" + id},
		{http.MethodGet, "/api/v1/admin/sessions"},
		{http.MethodPost, "/api/v1/admin/sessions"},
		{http.MethodGet, "/api/v1/admin/sessions/" + id},
		{http.MethodPut, "/api/v1/admin/sessions/" + id},
		{http.MethodGet, "/api/v1/admin/sessions/" + id + "/attendance"},
		{http.MethodPost, "/api/v1/admin/sessions/" + id + "/students/" + id + "/attendance"},
		{http.MethodPut, "/api/v1/admin/attendance/" + id},
		{http.MethodPut, "/api/v1/admin/test-attempts/" + id},
		{http.MethodGet, "/api/v1/admin/test-attempts/" + id + "/history"},
		{http.MethodGet, "/api/v1/admin/completions"},
		{http.MethodPut, "/api/v1/admin/completions/" + id + "/" + id},
		{http.MethodGet, "/api/v1/admin/completions/" + id + "/" + id + "/history"},
		{http.MethodGet, "/api/v1/admin/certificates/" + id + "/pdf"},
		{http.MethodPost, "/api/v1/admin/certificates/" + id + "/revoke"},
		{http.MethodPost, "/api/v1/admin/certificates/" + id + "/reissue"},
		{http.MethodGet, "/api/v1/admin/reports/summary"},
		{http.MethodGet, "/api/v1/admin/reports/attendance.csv"},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			noAuth := httptest.NewRequest(route.method, route.path, strings.NewReader("{}"))
			noAuthRec := httptest.NewRecorder()
			router.ServeHTTP(noAuthRec, noAuth)
			if noAuthRec.Code != http.StatusUnauthorized {
				t.Errorf("without token status=%d, want 401", noAuthRec.Code)
			}

			teacherReq := httptest.NewRequest(route.method, route.path, strings.NewReader("{}"))
			teacherReq.Header.Set("Authorization", "Bearer "+teacherToken)
			teacherRec := httptest.NewRecorder()
			router.ServeHTTP(teacherRec, teacherReq)
			if teacherRec.Code != http.StatusForbidden {
				t.Errorf("teacher token status=%d, want 403", teacherRec.Code)
			}
		})
	}
}
