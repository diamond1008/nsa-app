// Command api runs the NSA Training Platform HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/assessments"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/attendance"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/classes"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/completions"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/courses"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/interactions"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/leads"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/notifications"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/orders"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/config"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/database"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/docs"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/health"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/logging"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/middleware"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/response"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/storage"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/progress"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/reports"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/schedules"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/students"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/tasks"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/teachers"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/testscores"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/users"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "api:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	log := logging.New(cfg.Env, cfg.LogLevel)
	slog.SetDefault(log)

	// Cancel on SIGINT/SIGTERM for graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	pool, err := database.Connect(connectCtx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer pool.Close()
	log.Info("connected to database")

	// Ensure no accounts are blocked by mandatory password reset.
	if _, err := pool.Exec(ctx, "UPDATE users SET must_change_password = FALSE WHERE must_change_password = TRUE"); err != nil {
		log.Warn("startup user cleanup", "error", err)
	}

	healthHandler := health.NewHandler(pool)
	docsHandler := docs.NewHandler(cfg.OpenAPIPath)

	// Authentication (Phase 3).
	tokenService, err := auth.NewTokenService(cfg.JWTAccessSecret, cfg.AccessTokenTTL)
	if err != nil {
		return fmt.Errorf("token service: %w", err)
	}
	queries := db.New(pool)
	authService, err := auth.NewService(queries, tokenService, cfg.RefreshTokenTTLDays, cfg.BcryptCost, log)
	if err != nil {
		return fmt.Errorf("auth service: %w", err)
	}
	authService.SetOAuthConfig(cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.MicrosoftClientID, cfg.MicrosoftClientSecret)
	authHandler := auth.NewHandler(authService, log, cfg.Env != "development" || os.Getenv("RENDER") != "")

	// Business modules (Phases 4-6).
	studentHandler := students.NewHandler(students.NewService(pool, cfg.BcryptCost), log)
	teacherHandler := teachers.NewHandler(teachers.NewService(pool, cfg.BcryptCost), log)
	courseHandler := courses.NewHandler(courses.NewService(pool), log)
	classHandler := classes.NewHandler(classes.NewService(pool), log)
	scheduleHandler := schedules.NewHandler(schedules.NewService(pool), log)
	attendanceService := attendance.NewService(pool)
	attendanceHandler := attendance.NewHandler(attendanceService, log)
	go attendanceService.RunAutoLockWorker(ctx, log)
	storageService := storage.NewStorage(cfg)
	assessmentHandler := assessments.NewHandler(assessments.NewService(pool), log)
	progressHandler := progress.NewHandler(progress.NewService(pool), log)
	completionHandler := completions.NewHandler(completions.NewService(pool, storageService), log)
	notificationHandler := notifications.NewHandler(notifications.NewService(pool), log)
	reportHandler := reports.NewHandler(reports.NewService(pool), log)
	testScoreHandler := testscores.NewHandler(testscores.NewService(pool), log)
	leadHandler := leads.NewHandler(leads.NewService(pool, cfg.BcryptCost), log)
	interactionHandler := interactions.NewHandler(interactions.NewService(pool), log)
	taskHandler := tasks.NewHandler(tasks.NewService(pool), log)
	orderHandler := orders.NewHandler(orders.NewService(pool), log)
	userHandler := users.NewHandler(users.NewService(pool, cfg.BcryptCost), log)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Compress(5))
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.RequestLog(log))
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))
	corsOpts := cors.Options{
		AllowedOrigins:   cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}
	if cfg.Env == "development" {
		corsOpts.AllowOriginFunc = func(r *http.Request, origin string) bool {
			if strings.HasSuffix(origin, ".vercel.app") || strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:") {
				return true
			}
			for _, allowed := range cfg.CORSAllowedOrigins {
				if allowed == "*" || allowed == origin {
					return true
				}
			}
			return false
		}
	}
	r.Use(cors.Handler(corsOpts))

	// Operational endpoints (unversioned by design).
	r.Get("/health", healthHandler.Health)
	r.Head("/health", healthHandler.Health)
	r.Get("/ready", healthHandler.Ready)
	r.Head("/ready", healthHandler.Ready)

	// API documentation (Swagger UI + the OpenAPI contract).
	r.Get("/docs", docsHandler.SwaggerUI)
	r.Get("/openapi.yaml", docsHandler.OpenAPISpec)

	// Business API (versioned).
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/certificates/{verificationCode}", completionHandler.Verify)
		r.Route("/auth", func(r chi.Router) {
			// Brute-force protection on credential endpoints (in-memory, per IP).
			r.With(httprate.LimitByIP(10, time.Minute)).Post("/login", authHandler.Login)
			r.With(httprate.LimitByIP(20, time.Minute)).Post("/refresh", authHandler.Refresh)
			r.Get("/oauth/config", authHandler.OAuthConfig)
			r.With(httprate.LimitByIP(20, time.Minute)).Post("/oauth/callback", authHandler.OAuthCallback)
			r.With(httprate.LimitByIP(20, time.Minute)).Post("/sso", authHandler.SSOLogin)
			r.Post("/logout", authHandler.Logout)

			// Requires a valid access token.
			r.Group(func(r chi.Router) {
				r.Use(auth.Authenticate(tokenService))
				r.Post("/change-password", authHandler.ChangePassword)
				r.Get("/me", authHandler.Me)
			})
		})

		mountAdminRoutes(
			r, tokenService, queries, log, studentHandler, teacherHandler, courseHandler,
			classHandler, scheduleHandler, attendanceHandler, completionHandler, reportHandler,
			testScoreHandler,
		)
		mountRoleRoutes(
			r, tokenService, classHandler, scheduleHandler, attendanceHandler,
			assessmentHandler, progressHandler, completionHandler,
			testScoreHandler,
		)
		mountSaleRoutes(
			r, tokenService, leadHandler, interactionHandler,
			taskHandler, orderHandler, courseHandler, classHandler,
		)
		r.Route("/notifications", func(r chi.Router) {
			r.Use(auth.Authenticate(tokenService))
			r.Get("/", notificationHandler.List)
			r.Put("/{notificationID}/read", notificationHandler.MarkRead)
			r.Delete("/{notificationID}", notificationHandler.Archive)
		})
		r.Route("/users", func(r chi.Router) {
			r.Use(auth.Authenticate(tokenService))
			r.Use(auth.RequireRole(auth.RoleAdmin, auth.RoleAcademicAdmin, auth.RoleSaleAdmin))
			r.Get("/", userHandler.List)
			r.Post("/", userHandler.Create)
			r.Get("/{userID}", userHandler.Get)
			r.Patch("/{userID}/status", userHandler.UpdateStatus)
			r.Patch("/{userID}/profile", userHandler.UpdateProfile)
			r.Patch("/{userID}/lead-routing", userHandler.UpdateLeadRouting)
			r.Put("/reorder-lead-routing", userHandler.ReorderLeadRouting)
			r.Post("/{userID}/reset-password", userHandler.ResetPassword)
			r.Get("/{userID}/audit-logs", userHandler.ListAuditLogs)
		})
	})

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("api listening",
			"addr", srv.Addr,
			"env", cfg.Env,
			"docs_url", fmt.Sprintf("http://localhost:%d/docs", cfg.HTTPPort),
		)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		log.Info("shutdown signal received")
	case listenErr := <-errCh:
		if !errors.Is(listenErr, http.ErrServerClosed) {
			return fmt.Errorf("listen: %w", listenErr)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	log.Info("server stopped gracefully")
	return nil
}

// mountAdminRoutes keeps every administrative endpoint behind the same
// authentication and ADMIN-role boundary.
func mountAdminRoutes(
	r chi.Router,
	tokenService *auth.TokenService,
	queries *db.Queries,
	log *slog.Logger,
	studentHandler *students.Handler,
	teacherHandler *teachers.Handler,
	courseHandler *courses.Handler,
	classHandler *classes.Handler,
	scheduleHandler *schedules.Handler,
	attendanceHandler *attendance.Handler,
	completionHandler *completions.Handler,
	reportHandler *reports.Handler,
	testScoreHandler *testscores.Handler,
) {
	r.Route("/admin", func(r chi.Router) {
		r.Use(auth.Authenticate(tokenService))

		adminOnly := auth.RequireRole(auth.RoleAdmin, auth.RoleAcademicAdmin)
		saleAndAdmin := auth.RequireRole(auth.RoleAdmin, auth.RoleAcademicAdmin, auth.RoleSaleAdmin, auth.RoleSale)

		studentAccessMiddleware := func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				studentIDStr := chi.URLParam(r, "studentID")
				studentID, err := data.UUID(studentIDStr)
				if err != nil {
					response.Fail(w, http.StatusNotFound, "STUDENT_NOT_FOUND", "Student not found")
					return
				}
				if queries != nil {
					claims, ok := auth.ClaimsFrom(r.Context())
					if !ok {
						response.Fail(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
						return
					}
					allowed, err := auth.CanAccessStudentProfile(r.Context(), queries, claims, studentID)
					if err != nil {
						response.InternalError(w, log, auth.RequestIDFrom(r.Context()), err)
						return
					}
					if !allowed {
						response.Fail(w, http.StatusForbidden, "FORBIDDEN", "Bạn chỉ được xem thông tin học viên thuộc quyền quản lý của mình")
						return
					}
				}
				next.ServeHTTP(w, r)
			})
		}

		r.Route("/students", func(r chi.Router) {
			r.With(adminOnly).Get("/", studentHandler.List)
			r.With(adminOnly).Post("/", studentHandler.Create)
			r.With(adminOnly).Get("/export", studentHandler.ExportCSV)
			r.With(adminOnly).Post("/import", studentHandler.ImportCSV)

			r.Route("/{studentID}", func(r chi.Router) {
				r.Use(studentAccessMiddleware)
				r.With(saleAndAdmin).Get("/", studentHandler.Get)
				r.With(adminOnly).Put("/", studentHandler.Update)
				r.With(saleAndAdmin).Get("/profile-summary", studentHandler.ProfileSummary)
				r.With(saleAndAdmin).Get("/class-history", studentHandler.ClassHistory)
				r.With(saleAndAdmin).Get("/schedule", scheduleHandler.AdminStudentSchedule)
				r.With(saleAndAdmin).Get("/status-history", studentHandler.StatusHistory)
				r.With(saleAndAdmin).Get("/attendance-breakdown", studentHandler.AttendanceBreakdown)
				r.With(saleAndAdmin).Get("/classes/{classID}/attendance", studentHandler.ClassSessionAttendance)
				r.With(saleAndAdmin).Get("/academic-summary", studentHandler.AcademicSummary)
				r.With(adminOnly).Get("/audit-logs", studentHandler.AuditLogs)
				r.With(adminOnly).Patch("/account-status", studentHandler.UpdateAccountStatus)
			})
		})

		r.Route("/teachers", func(r chi.Router) {
			r.With(saleAndAdmin).Get("/", teacherHandler.List)
			r.With(adminOnly).Post("/", teacherHandler.Create)
			r.With(saleAndAdmin).Get("/{teacherID}", teacherHandler.Get)
			r.With(adminOnly).Put("/{teacherID}", teacherHandler.Update)
			r.With(saleAndAdmin).Get("/{teacherID}/profile-summary", teacherHandler.ProfileSummary)
			r.With(saleAndAdmin).Get("/{teacherID}/class-history", teacherHandler.ClassHistory)
			r.With(saleAndAdmin).Get("/{teacherID}/workload-summary", teacherHandler.WorkloadSummary)
			r.With(adminOnly).Get("/{teacherID}/audit-logs", teacherHandler.AuditLogs)
			r.With(adminOnly).Patch("/{teacherID}/account-status", teacherHandler.UpdateAccountStatus)
		})

		r.Route("/courses", func(r chi.Router) {
			r.With(saleAndAdmin).Get("/", courseHandler.List)
			r.With(adminOnly).Post("/", courseHandler.Create)
			r.With(saleAndAdmin).Get("/{courseID}", courseHandler.Get)
			r.With(adminOnly).Put("/{courseID}", courseHandler.Update)

			r.With(saleAndAdmin).Get("/{courseID}/modules", courseHandler.ListModules)
			r.With(adminOnly).Post("/{courseID}/modules", courseHandler.CreateModule)
			r.With(adminOnly).Put("/{courseID}/modules/{moduleID}", courseHandler.UpdateModule)

			r.With(saleAndAdmin).Get("/{courseID}/competencies", courseHandler.ListCriteria)
			r.With(adminOnly).Post("/{courseID}/competencies", courseHandler.CreateCriterion)
			r.With(adminOnly).Put("/{courseID}/competencies/{criterionID}", courseHandler.UpdateCriterion)

			r.With(saleAndAdmin).Get("/{courseID}/tests", testScoreHandler.ListTests)
			r.With(adminOnly).Post("/{courseID}/tests", testScoreHandler.CreateTest)
			r.With(adminOnly).Put("/{courseID}/tests/{testID}", testScoreHandler.UpdateTest)
			r.With(adminOnly).Post("/{courseID}/students/{studentID}/tests/{testID}/grant-retake", testScoreHandler.GrantRetakePermit)
		})

		r.Route("/classes", func(r chi.Router) {
			r.With(saleAndAdmin).Get("/", classHandler.List)
			r.With(adminOnly).Post("/", classHandler.Create)
			r.With(saleAndAdmin).Get("/{classID}", classHandler.Get)
			r.With(adminOnly).Put("/{classID}", classHandler.Update)
			r.With(saleAndAdmin).Get("/{classID}/operation-history", classHandler.OperationHistory)

			r.With(saleAndAdmin).Get("/{classID}/enrollments", classHandler.ListEnrollments)
			r.With(adminOnly).Post("/{classID}/enrollments", classHandler.Enroll)
			r.With(adminOnly).Put("/{classID}/enrollments/{enrollmentID}", classHandler.UpdateEnrollment)
			r.With(adminOnly).Post("/{classID}/enrollments/{enrollmentID}/transfer", classHandler.TransferEnrollment)

			r.With(saleAndAdmin).Get("/{classID}/teacher-assignments", classHandler.ListAssignments)
			r.With(adminOnly).Post("/{classID}/teacher-assignments", classHandler.AssignTeacher)
			r.With(adminOnly).Put("/{classID}/teacher-assignments/{assignmentID}", classHandler.UpdateAssignment)
			r.With(adminOnly).Delete("/{classID}/teacher-assignments/{assignmentID}", classHandler.DeleteAssignment)
		})

		r.Route("/locations", func(r chi.Router) {
			r.With(saleAndAdmin).Get("/", scheduleHandler.ListLocations)
			r.With(adminOnly).Post("/", scheduleHandler.CreateLocation)
			r.With(saleAndAdmin).Get("/{locationID}", scheduleHandler.GetLocation)
			r.With(adminOnly).Put("/{locationID}", scheduleHandler.UpdateLocation)
		})

		r.Route("/sessions", func(r chi.Router) {
			r.With(saleAndAdmin).Get("/", scheduleHandler.ListAdminSessions)
			r.With(adminOnly).Post("/", scheduleHandler.CreateSession)
			r.With(saleAndAdmin).Get("/{sessionID}", scheduleHandler.GetSession)
			r.With(adminOnly).Put("/{sessionID}", scheduleHandler.UpdateSession)
			r.With(saleAndAdmin).Get("/{sessionID}/attendance", attendanceHandler.AdminSession)
			r.With(adminOnly).Post("/{sessionID}/students/{studentID}/attendance", attendanceHandler.AdminCorrectStudent)
		})

		r.With(adminOnly).Put("/attendance/{attendanceID}", attendanceHandler.Correct)
		r.With(adminOnly).Put("/test-attempts/{attemptID}", testScoreHandler.CorrectAdmin)
		r.With(adminOnly).Get("/test-attempts/{attemptID}/history", testScoreHandler.History)

		r.With(adminOnly).Get("/completions", completionHandler.List)
		r.With(adminOnly).Put("/completions/{classID}/{studentID}", completionHandler.Decide)
		r.With(adminOnly).Get("/completions/{classID}/{studentID}/history", completionHandler.History)
		r.With(adminOnly).Get("/certificates/{certificateID}/pdf", completionHandler.AdminPDF)
		r.With(adminOnly).Post("/certificates/{certificateID}/diploma", completionHandler.UploadDiploma)
		r.With(adminOnly).Delete("/certificates/{certificateID}/diploma", completionHandler.DeleteDiploma)
		r.With(adminOnly).Post("/certificates/{certificateID}/revoke", completionHandler.Revoke)
		r.With(adminOnly).Post("/certificates/{certificateID}/reissue", completionHandler.Reissue)
		r.With(adminOnly).Get("/reports/summary", reportHandler.Summary)
		r.With(adminOnly).Get("/reports/{reportKind}.csv", reportHandler.Export)
	})
}

// mountRoleRoutes exposes only the authenticated teacher's or student's data.
func mountRoleRoutes(
	r chi.Router,
	tokenService *auth.TokenService,
	classHandler *classes.Handler,
	scheduleHandler *schedules.Handler,
	attendanceHandler *attendance.Handler,
	assessmentHandler *assessments.Handler,
	progressHandler *progress.Handler,
	completionHandler *completions.Handler,
	testScoreHandler *testscores.Handler,
) {
	r.Route("/teacher", func(r chi.Router) {
		r.Use(auth.Authenticate(tokenService))
		r.Use(auth.RequireRole(auth.RoleTeacher))
		r.Get("/classes", classHandler.ListTeacherClasses)
		r.Get("/classes/{classID}", classHandler.GetTeacherClass)
		r.Get("/schedule", scheduleHandler.TeacherSchedule)
		r.Get("/sessions/{sessionID}/attendance", attendanceHandler.TeacherSession)
		r.Post("/sessions/{sessionID}/attendance", attendanceHandler.RecordBatch)
		r.Get("/classes/{classID}/students/{studentID}/assessments", assessmentHandler.ListTeacher)
		r.Post("/classes/{classID}/students/{studentID}/assessments", assessmentHandler.Create)
		r.Get("/assessments/{assessmentID}", assessmentHandler.GetTeacher)
		r.Put("/assessments/{assessmentID}", assessmentHandler.Update)
		r.Post("/assessments/{assessmentID}/submit", assessmentHandler.Submit)
		r.Post("/assessments/{assessmentID}/lock", assessmentHandler.Lock)
		r.Get("/classes/{classID}/students/{studentID}/test-results", testScoreHandler.TeacherResults)
		r.Post("/classes/{classID}/students/{studentID}/tests/{testID}/attempts", testScoreHandler.RecordAttempt)
		r.Put("/test-attempts/{attemptID}", testScoreHandler.CorrectTeacher)
		r.Get("/test-attempts/{attemptID}/history", testScoreHandler.TeacherHistory)
	})
	r.Route("/student", func(r chi.Router) {
		r.Use(auth.Authenticate(tokenService))
		r.Use(auth.RequireRole(auth.RoleStudent))
		r.Get("/schedule", scheduleHandler.StudentSchedule)
		r.Get("/sessions/{sessionID}/attendance", attendanceHandler.StudentSession)
		r.Get("/attendance", attendanceHandler.StudentHistory)
		r.Get("/attendance/summary", attendanceHandler.StudentSummary)
		r.Get("/assessments", assessmentHandler.ListStudent)
		r.Get("/assessments/{assessmentID}", assessmentHandler.GetStudent)
		r.Get("/test-results", testScoreHandler.StudentResults)
		r.Get("/progress", progressHandler.Dashboard)
		r.Get("/certificates", completionHandler.StudentList)
		r.Get("/certificates/{certificateID}/pdf", completionHandler.StudentPDF)
	})
}

// mountSaleRoutes provides the CRM workspace for SALE staff and ADMIN.
func mountSaleRoutes(
	r chi.Router,
	tokenService *auth.TokenService,
	leadHandler *leads.Handler,
	interactionHandler *interactions.Handler,
	taskHandler *tasks.Handler,
	orderHandler *orders.Handler,
	courseHandler *courses.Handler,
	classHandler *classes.Handler,
) {
	r.Route("/sale", func(r chi.Router) {
		r.Use(auth.Authenticate(tokenService))
		r.Use(auth.RequireRole(auth.RoleSale, auth.RoleSaleAdmin, auth.RoleAdmin))

		saleManagerOnly := auth.RequireRole(auth.RoleSaleAdmin, auth.RoleAdmin)

		r.Get("/staff", leadHandler.ListStaff)
		r.Get("/courses", courseHandler.List)
		r.Get("/classes", classHandler.List)

		r.Route("/dashboard", func(r chi.Router) {
			r.Get("/my-stats", leadHandler.MyStats)
			r.With(saleManagerOnly).Get("/overview", leadHandler.Overview)
			r.With(saleManagerOnly).Get("/revenue", orderHandler.Revenue)
		})

		r.Route("/leads", func(r chi.Router) {
			r.Get("/", leadHandler.List)
			r.Post("/", leadHandler.Create)
			r.Get("/check-duplicate", leadHandler.CheckDuplicate)
			r.With(saleManagerOnly).Get("/export", leadHandler.ExportExcel)
			r.With(saleManagerOnly).Get("/template", leadHandler.Template)
			r.With(saleManagerOnly).Post("/import", leadHandler.Import)
			r.Get("/{leadID}", leadHandler.Get)
			r.Put("/{leadID}", leadHandler.Update)
			r.Patch("/{leadID}/status", leadHandler.UpdateStatus)
			r.With(saleManagerOnly).Patch("/{leadID}/assign", leadHandler.Assign)
			r.Post("/{leadID}/convert", leadHandler.Convert)

			r.Get("/{leadID}/interactions", interactionHandler.List)
			r.Post("/{leadID}/interactions", interactionHandler.Create)
			r.Get("/{leadID}/pipeline-history", interactionHandler.PipelineHistory)

			r.Post("/{leadID}/tasks", taskHandler.Create)
			r.Get("/{leadID}/tasks", taskHandler.ListByLead)
		})

		r.Route("/tasks", func(r chi.Router) {
			r.Get("/", taskHandler.List)
			r.Put("/{taskID}", taskHandler.Update)
			r.Patch("/{taskID}/complete", taskHandler.Complete)
		})

		r.Route("/orders", func(r chi.Router) {
			r.Get("/", orderHandler.List)
			r.Post("/", orderHandler.Create)
			r.With(saleManagerOnly).Get("/export", orderHandler.ExportExcel)
			r.Get("/{orderID}", orderHandler.Get)
			r.Patch("/{orderID}/status", orderHandler.UpdateStatus)
		})
	})
}
