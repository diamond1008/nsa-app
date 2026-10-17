# NSA App

Training & Admissions management platform for an automotive vocational training center. It manages the full lifecycle: admissions & lead CRM, student accounts, class assignment, schedules, attendance, practical skill assessment, progress tracking, and course completion.

**Repository model:** monorepo — Go API (`apps/api`) + React SPA (`apps/web`) + one PostgreSQL database.

## Project Status

**Current phase: Phase 25 implemented locally — ADMIN person 360° profiles & Full-Spectrum Management**

| Phase | Name | Status |
| ----- | ---- | ------ |
| 0 | Repository audit and bootstrap | ✅ Completed (commit 28f4d25) |
| 1 | Local infrastructure and database | ✅ Completed (commit e7f8505) |
| 2 | Go API foundation | ✅ Completed (commit bc20225) |
| 3 | Authentication and RBAC | ✅ Completed (commit c5b553a) |
| 4 | Academic core management | ✅ Completed (commit d164a05) |
| 5 | Scheduling | ✅ Completed (commit 346ea36) |
| 6 | Attendance | ✅ Completed (commit b8a580b) |
| 7 | Skill assessment and progress | ✅ Completed (commit fb4813f) |
| 8 | Frontend foundation and auth shell | ✅ Completed (commit 47d26a5) |
| 9 | Feature screens | ✅ Completed (commit 8982788) |
| 10 | Quality, CI, deployment readiness | ✅ Completed locally; first GitHub Actions run pending |
| 11 | Student profiles and lifecycle | ✅ Completed locally |
| 12 | Class and training schedule operations | ✅ Completed locally |
| 13 | Attendance governance | ✅ Completed locally |
| 14 | Practical competency assessment | ✅ Completed locally |
| 15 | Course completion and certificates | ✅ Completed locally |
| 16 | Reports, notifications, and production hardening | ✅ Completed locally |
| 17 | Tests, final exam, transfer-safe completion rules | ✅ Completed and validated locally |
| 18 | Fixed training slots and paper-test operations | ✅ Completed and validated locally |
| 19 | Student avatar persistence and attendance table polish | ✅ Completed and validated locally |
| 20 | Admin attendance corrections and audit workflow | ✅ Completed and validated locally |
| 21 | Operations UX, filters, and focused attendance workspaces | ✅ Completed and validated locally |
| 22 | Dense schedule cells and withdrawal-safe re-enrollment | ✅ Completed and validated locally |
| 23 | Two-state roll-call UX with legacy attendance compatibility | ✅ Completed and validated locally |
| 24 | Student/teacher identity columns and persisted teacher avatars | ✅ Completed and validated locally |
| 25 | ADMIN person 360° profiles, full-spectrum management & session drilldown | ✅ Completed and validated locally |

See `docs/AI_CONTEXT.md` for the detailed, always-current implementation state.

## Product Scope and Roadmap

NSA Training Platform is an internal vocational-training operations system, not a university SIS and not an accounting system. Its core workflow is:

```text
Create student → Assign class → Schedule training → Record attendance
→ Record mandatory tests → Record final exam → Approve completion → Issue certificate
```

### Phase 11 — Student profiles and lifecycle

- Generate concurrency-safe, human-readable student codes (`HV00000001`, `HV00000002`, ...) from PostgreSQL while retaining UUIDs as internal identifiers.
- Maintain contact, date of birth, gender, address, emergency-contact, enrollment-date, and lifecycle information.
- Support the lifecycle states Pending, Active, Suspended, Completed, and Withdrawn with an auditable status history.
- Search and filter the student directory and support controlled CSV import/export for operational handover.
- Never reuse a student code after a profile is removed or deactivated.

### Phase 12 — Class and training schedule operations

- Enroll, transfer, withdraw, and complete students while retaining class-history records.
- Assign teachers and manage class capacity, rooms, and workshops.
- Schedule theory, workshop, and assessment sessions.
- Prevent overlapping class, teacher, and location schedules.
- Reschedule or cancel sessions with a reason and an audit trail.

### Phase 13 — Attendance governance

- Let assigned teachers save and revise attendance during the Vietnamese calendar day.
- Automatically fill missing records as Absent and lock attendance at the next `00:00` in `Asia/Ho_Chi_Minh`.
- Permit audited ADMIN corrections after locking only when a reason is supplied.
- Retain Present, Late, Excused, and Absent in the canonical API/database history while presenting operational roll call as only Có mặt/Vắng; attendance rates and absence-risk warnings keep using the canonical values.
- Scope visibility to all sessions for ADMIN, assigned classes for TEACHER, and the enrolled class roster for STUDENT.

### Phase 14 — Practical competency assessment

- Configure course-specific competency criteria and required skills.
- Record repeated assessments using Needs Improvement, Competent, Good, and Excellent ratings.
- Keep teacher comments and optional evidence while preserving assessment history.
- Show each student's latest competency status and progress toward the course outcome.

### Phase 15 — Course completion and certificates

- Configure completion rules from attendance, required competencies, and final assessments.
- Provide an ADMIN approval workflow with a permanent decision history.
- Generate certificate numbers and downloadable PDFs.
- Support QR/code verification, reissue, and audited revocation.

### Phase 16 — Reports, notifications, and production hardening

- Build operational dashboards and exportable attendance, competency, class, and completion reports.
- Notify users about schedule changes, absence risk, pending work, and course completion.
- Complete server-side filtering/pagination, audit coverage, recovery procedures, authorization tests, and deployment checks.

### Phase 17 — Formal results and completion rules

- Fix the attendance requirement at **80% for every course**.
- Let ADMIN configure required in-class tests and exactly one active final exam per course.
- Let an assigned TEACHER record repeated attempts and correct a score only with a reason; every correction is kept in immutable history and notifies the student.
- Determine course completion from exactly three formal rules: attendance `>= 80%`, all active mandatory in-class tests passed, and the best active final-exam score strictly `> 5.0`.
- Aggregate attendance and score attempts by **student + course**, so a same-course class transfer preserves and counts all earlier results and produces only one course completion/certificate.
- Keep session, practical competency, and assessment metrics visible for learning-progress context; they no longer add undocumented blockers to formal completion.
- Preserve every ended/archived class, student profile, score attempt, decision, and revoked certificate. Returning students keep their profile/code and receive a new enrollment.
- Correct a certificate with wrong information by fixing the source student/course data, revoking the current certificate with a reason, then reissuing a new immutable certificate. Issued documents are never edited in place.

#### Formal completion decision table

| Rule | Pass condition |
| --- | --- |
| Attendance | Present + Late rate, excluding Excused from the denominator, is at least 80% |
| Mandatory in-class tests | Best attempt for every active required test is at least its configured pass score |
| Final exam | Exactly one active final exam exists and its best attempt is strictly greater than 5.0 |

ADMIN remains the only role allowed to approve/reject completion and issue, revoke, or reissue certificates.

### Phase 18 — Fixed training slots and paper-test operations

- Restrict every class session to one Vietnam-time slot: Morning `08:00–12:00`, Afternoon `13:30–17:30`, or Evening `18:30–21:30`.
- Replace free-form Admin datetime inputs with a date and slot selector while preserving RFC3339 timestamps at the API boundary.
- Show the weekly calendar as a compact three-row timetable with role-specific counters for Admin, Teacher, and Student.
- Remove pre-existing sessions that do not match a fixed slot during migration `00007`; linked attendance is removed and optional assessment-session links are detached while assessment results remain.
- Conduct all in-class tests and final exams on paper. ADMIN configures the required tests, assigned TEACHER users enter scores after marking, and STUDENT users only view results.

### Phase 21 — Operations UX and focused attendance workspaces

- Keep management search, filters, pagination, and sorting in the URL so an operational view survives reload and can be shared.
- Apply bounded server-side filters to students, teachers, courses, classes, schedules, and completion candidates instead of loading an entire directory into the browser.
- Let ADMIN identify attendance-risk students by course/class, inspect any session roster, and record or correct a result only after confirming the before/after state with a mandatory reason.
- Let assigned TEACHER users search their schedule and roster, filter recorded/unrecorded states, mark only Có mặt/Vắng, and save pending rows during the editable Vietnam calendar day.
- Keep the calendar focused on schedule management. Attendance review and correction use the canonical `/admin/diem-danh` and `/teacher/diem-danh` workspaces.
- Improve keyboard and screen-reader support with a skip link, sortable-table state, labelled combobox/listbox controls, focus-trapped modals, restored trigger focus, and reduced-motion-safe transitions.

#### List query contract

Management endpoints accept bounded `page`/`per_page`, optional `search`, domain filters, and allow-listed `sort_by`/`sort_order` values. Invalid UUIDs, filter enums, date ranges, and sort fields return the normal validation error envelope. Student CSV export accepts the same course, class, status, search, and attendance-risk filters as the visible directory.

### Phase 22 — Dense schedules and temporal re-enrollment

- Keep the primary schedule filters on one compact toolbar and place class, teacher, and room/workshop selectors in a labelled advanced disclosure.
- Render at most two class cards in a weekly day/slot cell; `+N lớp khác` opens the complete keyboard-accessible list without a nested scrollbar.
- Preserve one stable class enrollment while recording each active interval in `class_enrollment_periods`.
- Let ADMIN return only a withdrawn student to the same class with an effective RFC3339 timestamp and mandatory reason.
- Treat enrollment periods as half-open intervals `[started_at, ended_at)`, excluding sessions that begin exactly when a withdrawal takes effect as well as every session in the withdrawal gap.
- Exclude those sessions from Student schedules, attendance rosters, automatic absence, and the attendance denominator while retaining all earlier attendance and scores.
- Reject re-enrollment when the class is full/inactive, the student is inactive, the timestamp is invalid, or another class in the same course is already active.

### Phase 23 — Two-state roll call

- Keep the backend/database `present`, `late`, `excused`, and `absent` contract unchanged so historical attendance and attendance-rate calculations remain valid.
- Project `present/late` to **Có mặt** and `absent/excused/unrecorded` to **Vắng** in Teacher and Admin attendance workspaces; legacy `late/excused` records receive an explicit historical-data badge.
- Default every unrecorded roster row to Vắng in the Teacher draft. The teacher marks attendees Có mặt and saves the batch; unchanged legacy records are not silently rewritten.
- Use the same operational columns on both workspaces: STT, student code, avatar, learner name, Có mặt, Vắng, note, and recorder. ADMIN corrections still require a reason and remain audited.

### Phase 24 — Person-directory identity and avatar parity

- Use the same leading identity columns in both ADMIN directories: STT, code, avatar, and full name; the remaining filters, fields, and actions stay unchanged.
- Calculate STT across pagination instead of restarting at 1 on every page.
- Persist optional Teacher avatars in PostgreSQL with the same browser-side 400×400 WebP compression and API-side 256 KiB validation used for Student avatars.
- Show a deterministic initials fallback when a Student or Teacher has no stored photo, and redact inline image payloads from audit records.

### Phase 25 — ADMIN person 360° profiles & Full-Spectrum Management

- Open a dedicated core profile from either the student or teacher directory, with identity, account/profile state, contact information, operational metrics, and current classes on one screen.
- Keep current classes and the complete historical class timeline together. Student enrollment periods and Teacher assignment periods remain explicit, including withdrawal/removal gaps followed by a return to the same class.
- Preserve one stable Teacher assignment record per Teacher/Class pair while migration `00011_add_teacher_assignment_periods.sql` stores every non-overlapping assignment interval and actor/reason metadata.
- Show the selected person's own week/month schedule using the existing fixed-slot calendar. Student results are limited to sessions inside effective enrollment periods; Teacher results use sessions actually assigned to that Teacher.
- Provide full 360° management capabilities:
  - **Attendance risk breakdown**: Course/class-scoped attendance statistics and quick session attendance drill-down modal (`GET /api/v1/admin/students/{studentID}/classes/{classID}/attendance`) displaying session titles, timestamps, location, assigned teacher, attendance badge (`Có mặt`, `Đến trễ`, `Vắng có phép`, `Vắng không phép`, `Chưa điểm danh`), and remarks.
  - **Academic test summaries**: Overview of required in-class tests, final exam attempts, scores, and pass eligibility status.
  - **Teacher workload & roll-call punctuality**: Detailed teaching stats, assigned class roster counts, session completion ratios, and same-day attendance punctuality metrics.
  - **Person audit log timeline**: Filtered operational audit history tracking every profile edit, status change, enrollment action, and score correction associated with the user.
  - **Account status locking/unlocking**: Admin action to active/suspend/deactivate user accounts with a mandatory audit reason logged in PostgreSQL audit logs.
- Provide controlled actions only: profile edits reuse the existing validated editor, and class links open the canonical class workspace for reasoned enrollment/assignment operations and their audit history.

### Explicitly Out of Scope

- Tuition, payment collection, debt tracking, accounting, and third-party payment integrations. Admissions handles payment outside this platform.
- University credit registration, semesters, GPA, prerequisites, dormitory, library, payroll, and HR management.
- Public admissions CRM, real-time chat, native mobile apps, and microservice infrastructure for the current product stage.

## Quick Start (Run Locally)

**Every time you start working** (in the repo root):

```powershell
make db-up        # 1. Start PostgreSQL 16 (Docker container)
make migrate-up   # 2. Apply the schema (needed on first run / after new migrations)
make db-seed      # 3. Load demo accounts (dev only, safe to re-run)
make api-run      # 4. Start the API at http://localhost:8080
make web-dev      # 5. In another terminal, start the SPA at http://localhost:5173
```

Stop: `Ctrl+C` in the API terminal, then `make db-down` to stop the database.

**First-time on a new machine:** `make setup` (creates `.env` from `.env.example`).

## Open Swagger UI (API Documentation)

- **Option A — built into the API:** run `make api-run`, then open **http://localhost:8080/docs**
- **Option B — standalone container:** run `make swagger`, then open **http://localhost:8081**

## Demo Accounts (DEV ONLY)

| Email | Password | Role |
| ----- | -------- | ---- |
| `admin@nsa.local` | `NsaDemo@123` | ADMIN |
| `teacher@nsa.local` | `NsaDemo@123` | TEACHER |
| `student@nsa.local` | `NsaDemo@123` | STUDENT |

**Log in via Swagger UI:**

1. Open http://localhost:8080/docs
2. Expand `POST /api/v1/auth/login` → click **Try it out**
3. Body: `{"email": "admin@nsa.local", "password": "NsaDemo@123"}` → **Execute**
4. Copy the `access_token` value from the response body
5. Click **Authorize** (top of page) → paste the token → **Authorize** → Close
6. Call `GET /api/v1/auth/me` → it returns your profile and roles

**Log in via curl (PowerShell):**

```powershell
curl.exe -s -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@nsa.local\",\"password\":\"NsaDemo@123\"}'
```

The response contains `data.access_token` — send it as `Authorization: Bearer <token>` on protected endpoints. The refresh token arrives automatically as an HttpOnly cookie (`nsa_refresh`).

## View the Database with pgAdmin 4

pgAdmin 4 is installed on this machine (via winget). Connect it to the local Docker database:

1. Start the database first: `make db-up`
2. Open **pgAdmin 4** (Start Menu). On first launch it asks for a **master password** — this protects pgAdmin itself; pick anything memorable (it is NOT the database password).
3. Right-click **Servers** → **Create** → **Server…**
4. **General** tab: Name = `NSA Local`
5. **Connection** tab:
   - Host name/address: `localhost`
   - Port: `5432`
   - Maintenance database: `nsa_training`
   - Username: `nsa`
   - Password: `change-me-local-only` (value of `POSTGRES_PASSWORD` in `.env`)
   - Enable **Save password** (dev convenience)
6. **Save**, then browse: `Servers → NSA Local → Databases → nsa_training → Schemas → public → Tables`
7. To see rows: right-click a table (e.g. `users`, `roles`, `student_profiles`) → **View/Edit Data → All Rows**

## Implemented Features

- **Local infrastructure:** PostgreSQL 16 via Docker Compose with health check and persistent named volume (`make db-up`)
- **Migrations:** Goose v3 through `00011_add_teacher_assignment_periods.sql`; fixed training slots, non-overlapping temporal enrollment/Teacher-assignment periods, and optional Student/Teacher profile avatars are supported in PostgreSQL
- **Seeds:** roles (ADMIN/TEACHER/STUDENT) ship in the baseline; DEV-ONLY demo accounts via `make db-seed`
- **API docs:** OpenAPI 3.1 at `docs/openapi.yaml` — served by the API at `/docs` + `/openapi.yaml`, or via container (`make swagger` → http://localhost:8081)
- **ERD:** `database/schema.dbml` for dbdiagram.io
- **Go API foundation (`apps/api`):** Chi router, env config (godotenv), pgxpool (pool tuning + ping), slog structured logging, middleware (RequestID, RealIP, request logging, recovery, timeout, CORS), standard success/error envelopes
- **Operational endpoints:** `GET /health` (liveness), `GET /ready` (readiness incl. DB), graceful shutdown on SIGINT/SIGTERM (verified in container)
- **API Docker image:** multi-stage `apps/api/Dockerfile` → `nsa-api` (build from repo root)
- **Authentication (`POST /api/v1/auth/*`):** login, refresh (rotation + reuse detection), logout, change-password (revokes all sessions), me — JWT access tokens (HS256) + opaque refresh tokens (SHA-256 hashed in DB, HttpOnly cookie)
- **Security:** bcrypt passwords, generic 401 on bad credentials (no user enumeration), per-IP rate limiting on login/refresh, request body limits, RBAC middleware (`Authenticate`, `RequireRole`), ownership/assignment helpers
- **Academic core administration (`/api/v1/admin/*`):** create/list/detail/update students and teachers (account + role + profile transaction), inspect 360° profile summaries/class histories/personal schedules, and manage courses, ordered modules, competency criteria, and classes
- **Generated student codes:** PostgreSQL sequence-backed `HV00000001`, `HV00000002`, ... codes are assigned atomically, remain immutable through profile updates, are never reused after rollback/deletion, and coexist with UUID internal identifiers
- **Student lifecycle profiles:** gender, address, emergency contact, enrollment date, and Pending/Active/Suspended/Completed/Withdrawn states are managed from the Admin workspace
- **Lifecycle history:** every initial state and subsequent status transition is stored immutably with actor, timestamp, and a required reason; Admin can inspect the timeline from the student form
- **Student CSV exchange:** filtered UTF-8/Excel-safe export plus size-limited import with generated codes, strict headers/validation, and per-row success/error reporting
- **Class operations:** capacity-safe enrollment plus atomic same-course transfers, withdrawal/completion transitions, active-account checks, duplicate prevention, and teacher assignment management
- **Class operation history:** enrollment, transfer, assignment, class, and schedule changes retain actor, timestamp, reason, entity, and structured before/after details in an immutable per-class timeline
- **Administration safeguards:** every Phase 4 route requires `ADMIN`; list endpoints use search/status filters and bounded pagination; important writes create audit logs in the same transaction
- **Scheduling (`/api/v1/admin/sessions`):** create/list/detail/update/cancel class sessions with optional module, assigned teacher, and training location; each session must use Morning `08:00–12:00`, Afternoon `13:30–17:30`, or Evening `18:30–21:30` in Vietnam time; changes require a reason and locked sessions are immutable
- **Conflict protection:** PostgreSQL exclusion constraints prevent overlapping non-cancelled sessions for a class, teacher, or location; API returns distinct conflict codes
- **Training locations (`/api/v1/admin/locations`):** create/list/detail/update workshops and rooms, including capacity and active state; Admin manages them alongside the calendar
- **Role schedules:** `GET /api/v1/teacher/schedule` returns the authenticated teacher's assigned sessions; `GET /api/v1/student/schedule` returns only active-enrollment sessions
- **Timezone contract:** API accepts RFC3339 offsets, stores/returns UTC, and evaluates class date boundaries plus fixed-slot validity in `Asia/Ho_Chi_Minh`
- **Teacher attendance:** assigned teachers can view their class rosters and save or revise transactional two-state roll-call batches (Có mặt/Present or Vắng/Absent) only after the session starts and during its Vietnamese calendar day; unrecorded rows begin as an unsaved Vắng draft
- **Automatic attendance lock:** at 00:00 Asia/Ho_Chi_Minh, unrecorded historical-roster students are saved as Absent and completed sessions are locked; cross-midnight sessions remain writable until the next valid boundary
- **Attendance corrections:** ADMIN can correct an existing record even after locking; the required reason and old/new values are written to both the audit log and class operation timeline in the same transaction
- **Attendance visibility:** administrators can inspect and correct every session, assigned teachers can inspect their classes, and students can view classmates' statuses without staff notes or recorder metadata
- **Historical roster integrity:** transfer, withdrawal, or completion never removes a student from sessions held while the enrollment was active and never adds a later enrollment to an earlier session
- **Attendance risk:** Student summaries compare the Present/Late rate against each course's configured threshold and display clear absence-risk warnings
- **Practical assessments:** assigned teachers create and replace drafts containing competency ratings/comments, submit only after every required criterion is rated, then lock immutable results; assessment numbers retain history over time
- **Assessment integrity:** student enrollment, teacher assignment/ownership, optional session class/course, and every competency's course are validated transactionally and backed by composite PostgreSQL constraints
- **Student assessment history:** authenticated students see only their own submitted/locked assessments through `/api/v1/student/assessments`
- **Test and exam results:** tests are conducted on paper; ADMIN configures course tests, assigned teachers record scores/repeat attempts and reasoned corrections after marking, and students only see their own results
- **Progress dashboard:** `/api/v1/student/progress` aggregates by student/course, shows attendance, required-test and final-exam status plus explicit missing conditions, while retaining sessions, competencies, and practical assessments as context
- **Formal completion rules:** attendance is fixed at 80%; all mandatory in-class tests must pass; final-exam best score must be strictly above 5.0
- **Transfer-safe outcomes:** same-course transfers preserve historical attendance/scores and continue toward one completion and one current certificate for the course
- **sqlc:** type-safe queries generated from `database/queries/*.sql` into `database/generated` (committed; own Go module linked via `replace`)
- **React SPA foundation (`apps/web`):** React 18, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS, and shared NSA design tokens/components
- **Frontend authentication:** login, silent cookie-based refresh, in-memory access tokens, deduplicated 401 refresh/retry, logout, forced password change, and role-aware home redirects
- **Authenticated shells:** responsive Admin, Teacher, and Student navigation with route guards, 403/404 handling, and shared loading/error/empty patterns
- **Admin feature screens:** searchable/paginated student, teacher, course, and class management; class transfer/withdrawal/completion and operation timeline; teacher assignment; room/workshop management; session creation, rescheduling, cancellation, and attendance inspection from the calendar
- **Teacher feature screens:** assigned-class workspaces, rosters, compact three-slot weekly teaching schedule with summary counters, batch attendance, practical skill assessments, and paper-test/final-exam score entry with audited corrections
- **Student feature screens:** dashboard, enrolled courses, compact three-slot weekly calendar with attendance counters, attendance history/summary, paper-test/final-exam results, assessment results, explicit completion blockers, and certificates
- **Teacher class API:** assignment-scoped class list/detail endpoints provide roster and competency data without exposing unassigned classes
- **Web delivery:** multi-stage Node/Caddy Docker image, SPA route fallback, security headers, health check, and root `.dockerignore` rules that exclude nested frontend artifacts

## Technology Stack

- **Backend:** Go, net/http, Chi router, slog, pgx/pgxpool, sqlc, Goose migrations, REST/JSON
- **Frontend:** React, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS, shadcn/ui, Vitest
- **Database:** PostgreSQL 15+ (schema baseline: `NSA_Training_Portal_PostgreSQL_v1.2.sql`, applied via Goose migrations in Phase 1)
- **Infrastructure:** Docker, Docker Compose, Caddy reverse proxy/TLS, GitHub Actions
- **Architecture:** modular monolith, vertical slices by business module, CQRS-lite

## Repository Structure

```
nsa-training-platform/
├── apps/
│   ├── api/                  # Go backend (Phase 2+)
│   │   ├── cmd/api/          # entrypoint
│   │   └── internal/         # business modules (auth, users, students, ...)
│   │       └── platform/     # shared infra (database, middleware, security, ...)
│   └── web/                  # React frontend (Phase 8+)
│       └── src/
│           ├── app/          # app-level setup
│           ├── components/   # shared UI components
│           ├── features/     # feature modules (auth, students, ...)
│           ├── lib/          # utilities, typed API client
│           └── routes/       # route definitions
├── database/
│   ├── migrations/           # Goose SQL migrations (Phase 1+)
│   ├── queries/              # sqlc query files
│   └── generated/            # sqlc generated Go code (committed)
├── docs/
│   ├── AI_CONTEXT.md         # current state for AI agents — READ FIRST
│   ├── adr/                  # architecture decision records
│   └── diagrams/             # architecture/ER diagrams
├── infra/
│   └── caddy/                # reverse proxy config (Phase 10)
├── .github/
│   ├── workflows/            # CI (Phase 10)
│   └── pull_request_template.md
├── .env.example              # environment variable template
├── compose.yaml              # local infrastructure (Phase 1)
├── Makefile                  # canonical command set
└── README.md
```

## Local Development Setup

**Prerequisites** (already verified on the lead dev machine):

- Go 1.22+ (`go version`)
- Node.js 20+ and npm (`node --version`)
- Docker Desktop with Compose (`docker version`, `docker compose version`)
- GNU Make 4.4+ (`make --version`) — optional but recommended; all commands below have plain-CLI equivalents
- Goose v3 (Phase 1): `go install github.com/pressly/goose/v3/cmd/goose@latest`

**First-time setup:**

```sh
make setup        # copies .env.example to .env — then edit secrets in .env
```

Without make (PowerShell): `Copy-Item .env.example .env`

## Required Environment Variables

See `.env.example` for the full annotated list. Key groups:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` — local database container
- `DATABASE_URL` — full connection string used by the API and Goose
- `API_PORT`, `APP_ENV`, `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS` — API runtime
- `JWT_ACCESS_SECRET`, token TTLs, `BCRYPT_COST` — authentication (refresh tokens are opaque; no refresh secret needed)
- `VITE_API_BASE_URL` — web app → API base URL (Phase 8)

**Never commit `.env` or any real secrets.**

## Database Commands

PostgreSQL 16 runs via Docker Compose; migrations run via Goose v3.

| Task | Make | Plain CLI equivalent |
| ---- | ---- | -------------------- |
| Start PostgreSQL | `make db-up` | `docker compose up -d postgres` |
| Stop containers | `make db-down` | `docker compose down` |
| DB logs | `make db-logs` | `docker compose logs -f postgres` |
| psql shell | `make db-psql` | `docker compose exec postgres psql -U nsa -d nsa_training` |
| Reset database (destructive) | `make db-reset` | `docker compose down -v; docker compose up -d postgres` |
| Apply migrations | `make migrate-up` | `goose -dir database/migrations postgres "$DATABASE_URL" up` |
| Roll back one migration | `make migrate-down` | `goose -dir database/migrations postgres "$DATABASE_URL" down` |
| Migration status | `make migrate-status` | `goose -dir database/migrations postgres "$DATABASE_URL" status` |
| New migration | `make migrate-create name=add_x` | `goose -dir database/migrations create add_x sql` |
| Load DEV demo data | `make db-seed` | `docker compose exec -T postgres psql -U nsa -d nsa_training < database/seeds/dev.sql` |
| Load deterministic E2E data | `make db-seed-e2e` | Run after `make db-seed`; uses a byte-preserving container copy |
| Swagger UI (API docs) | `make swagger` | `docker compose up -d swagger-ui` → http://localhost:8081 |

**Demo accounts (DEV ONLY, password `NsaDemo@123`):** `admin@nsa.local` (ADMIN), `teacher@nsa.local` (TEACHER), `student@nsa.local` (STUDENT). Never use these in any shared environment.

## API Commands

| Task | Make | Plain CLI |
| ---- | ---- | --------- |
| Run API (needs `.env` + database up) | `make api-run` | `cd apps/api; go run ./cmd/api` |
| API tests | `make api-test` | `cd apps/api; go test ./...` |
| Vet | `make api-vet` | `cd apps/api; go vet ./...` |
| Build binary | `make api-build` | `cd apps/api; go build -o bin/api.exe ./cmd/api` |
| Build Docker image | — | `docker build -f apps/api/Dockerfile -t nsa-api .` |

Local URLs when running: API `http://localhost:8080` — Swagger UI `http://localhost:8080/docs` — probes `/health`, `/ready` — auth `/api/v1/auth/*` — administration `/api/v1/admin/*` — Teacher attendance/assessments under `/api/v1/teacher/*` — Student schedule/attendance/assessments/progress under `/api/v1/student/*`.

Try it: `POST /api/v1/auth/login` with `{"email":"admin@nsa.local","password":"NsaDemo@123"}` (after `make db-seed`) → use the returned `access_token` as `Authorization: Bearer <token>` for `GET /api/v1/auth/me`.

## Testing Commands

| Scope | Make | Plain CLI |
| ----- | ---- | --------- |
| API unit tests | `make api-test` | `cd apps/api; go test ./...` |
| API + DB integration tests | `make api-test-integration` | needs `make db-test-migrate` first |
| Web tests | `make web-test` | `cd apps/web; npm run test` |
| Web lint + typecheck | `make web-lint` | `cd apps/web; npm run lint && npm run typecheck` |
| Web format check | `make web-format-check` | `cd apps/web; npm run format:check` |
| Browser E2E | `make web-e2e` | first run `make db-seed` and `make db-seed-e2e`, then start API/web |
| Web production build | `make web-build` | `cd apps/web; npm run build` |
| Production image build | `make docker-build-prod` | needs `.env.production` |
| Read-path load smoke | `make load-test` | needs `LOADTEST_EMAIL` / `LOADTEST_PASSWORD` |
| All checks for current phase | `make check` | — |

## Current Limitations

- Attendance percentages count Present and Late as attended. In the 360° profile breakdown, attendance percentage is calculated against sessions recorded to date (`recorded_sessions`), excluding future unrecorded sessions. For formal course completion eligibility, Excused records are excluded from the denominator, and the required threshold is fixed at 80%.
- Progress exposes deterministic Pending/Eligible status from attendance, required tests, and final exam; ADMIN records the final approval/rejection with immutable history and verifiable PDF certificates.
- The latest submitted or locked rating for each required competency supersedes its earlier rating when progress is calculated.
- Rate limiting is in-memory per instance (fine for the single-instance MVP).
- Swagger UI page loads its assets from a CDN; use `make swagger` (container) for fully offline docs.
- Phase 9 forms use the backend's validation and standard error envelopes; richer client-side field schemas can be expanded as workflows evolve.
- Playwright integration and production image builds run in CI; locally they require Docker Desktop.
- Out of MVP scope (by design): admission/enrollment pipeline (handled by the existing public website), payments, real-time chat, mobile apps, microservices, Redis/Kafka, AI features.

## Completed vocational-training scope (Phases 11–17)

- Student lifecycle profiles and generated `HV********` codes; no tuition/payment workflow.
- Class operations: enrollments, transfers, teacher assignments, locations, schedule changes, and immutable operation history.
- Same-day Teacher attendance with automatic Vietnam-midnight locking, ADMIN corrections, temporal rosters, and attendance-risk alerts.
- Practical competency assessments with draft/submitted/locked lifecycle and optional HTTP(S) evidence links.
- ADMIN completion decisions, immutable decision history, `CC########` certificates, PDF download, revocation/reissue, and public verification codes.
- Role dashboards, responsive calendars, in-app notifications, operational summary, and CSV exports for attendance, competencies, classes, and completions.
- Required in-class tests, a strict `> 5.0` final exam, repeat attempts, reasoned score corrections, and transfer-safe course completion.

## Documentation

- `docs/AI_CONTEXT.md` — **read first**: current phase, decisions, commands, git state (for developers and AI agents)
- `docs/openapi.yaml` — API contract source of truth (view with `make swagger`)
- `docs/DEPLOYMENT.md` — production deployment and rollback
- `docs/OPERATIONS.md` — health, logs, backup/restore, and load smoke
- `docs/SECURITY_REVIEW.md` — Phase 10 controls and residual risks
- `database/schema.dbml` — ERD for dbdiagram.io (regenerate when schema changes)
- `docs/adr/` — architecture decision records (created when a significant decision is made)

## Git Rules for Contributors and AI Agents

- No commits without explicit user permission. Conventional Commits when permitted.
- No push/merge/rebase/tag/PR without explicit separate permission.
# Phase 10 — production readiness

Phase 10 adds GitHub Actions quality gates, migration up/down/up validation, Playwright critical-path tests, hardened Caddy/Docker Compose deployment, dependency monitoring, security review, backup/restore instructions, and an authenticated read-path load smoke test.

- Production deployment and rollback: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Operations, backup/restore, and load test: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- Security review: [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md)

Run the local quality gate with `make check`. E2E requires a migrated database loaded with `make db-seed` followed by `make db-seed-e2e`, plus a running API; then run `make web-e2e`. The dedicated E2E seed target preserves UTF-8 bytes on Windows and repairs deterministic fake rows on repeat runs; do not pipe `e2e.sql` through Windows PowerShell 5. Local Phase 10 validation completed the Goose up/down/up cycle, all three production image builds, Caddy validation, 3/3 Playwright paths, and a 200-request authenticated load smoke with zero failures.
