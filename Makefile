# ==========================================================================
# NSA Training Platform — Canonical command set
# Requires: GNU Make 4.4+, Docker Desktop, Go 1.22+, Node 20+, Goose v3
# Works on Windows (cmd.exe), macOS, and Linux (sh).
# ==========================================================================

.DEFAULT_GOAL := help

# ---------- Shell / portability ----------
ifeq ($(OS),Windows_NT)
SHELL := cmd.exe
.SHELLFLAGS := /c
CP := copy
else
CP := cp
endif

# Load .env when present (never commit .env).
ifneq (,$(wildcard .env))
include .env
export
endif

# ---------- Variables ----------
GOOSE          ?= goose
MIGRATIONS_DIR ?= database/migrations
DB_URL         ?= $(DATABASE_URL)
API_DIR        := apps/api
WEB_DIR        := apps/web

.PHONY: help setup db-up db-down db-logs db-psql db-reset db-seed db-seed-e2e \
	migrate-up migrate-down migrate-status migrate-create \
	db-test-create db-test-migrate \
	api-run api-test api-test-integration api-build api-vet \
	web-install web-dev web-test web-build web-lint web-format-check web-e2e \
	docker-build-prod prod-config load-test swagger check

# ---------- Help ----------
help: ## Show this help
	@echo NSA App - available commands
	@echo   setup            Copy .env.example to .env (first time only)
	@echo   db-up            Start PostgreSQL via Docker Compose
	@echo   db-down          Stop PostgreSQL
	@echo   db-logs          Tail PostgreSQL logs
	@echo   db-psql          Open psql shell inside the db container
	@echo   db-reset         Drop and recreate the local database (DESTRUCTIVE)
	@echo   db-seed          Load DEV-ONLY demo accounts (never in production)
	@echo   db-seed-e2e      Load deterministic E2E data with UTF-8-safe file transfer
	@echo   migrate-up       Apply all pending Goose migrations
	@echo   migrate-down     Roll back the last migration
	@echo   migrate-status   Show migration status
	@echo   migrate-create   Create a new migration: make migrate-create name=add_x
	@echo   db-test-migrate  Create + migrate the integration test database
	@echo   api-test-integration  Run API tests incl. DB integration tests
	@echo   api-run          Run the Go API locally
	@echo   api-test         Run API tests
	@echo   api-build        Build the API binary
	@echo   api-vet          Run go vet
	@echo   web-install      Install web dependencies
	@echo   web-dev          Start the Vite dev server
	@echo   web-test         Run web unit tests
	@echo   web-build        Build the web app for production
	@echo   web-lint         Run ESLint and TypeScript checks
	@echo   web-format-check Verify Prettier formatting
	@echo   web-e2e          Run Playwright critical-path tests
	@echo   docker-build-prod Build all production images
	@echo   prod-config      Validate production Compose configuration
	@echo   load-test        Exercise authenticated student read paths
	@echo   swagger          Start Swagger UI docs at http://localhost:8081
	@echo   check            Run all available checks for the current phase

# ---------- First-time setup ----------
setup: ## Copy .env.example to .env if it does not exist
ifeq ($(wildcard .env),)
	$(CP) .env.example .env
	@echo Created .env - edit secrets before starting services
else
	@echo .env already exists - nothing to do
endif

# ---------- Database (Phase 1) ----------
db-up: ## Start PostgreSQL container
	docker compose up -d postgres

db-down: ## Stop all containers
	docker compose down

db-logs: ## Tail PostgreSQL logs
	docker compose logs -f postgres

db-psql: ## Open psql in the postgres container
	docker compose exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

db-reset: ## Remove containers AND the local data volume, then start fresh
	docker compose down -v
	docker compose up -d postgres

db-seed: ## Load DEV-ONLY demo data (database/seeds/dev.sql) — never in production
	docker compose exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) < database/seeds/dev.sql
	@echo Dev seed loaded. Demo logins: admin@nsa.local / teacher@nsa.local / student@nsa.local / sale@nsa.local (password: NsaDemo@123)

db-seed-e2e: ## Load deterministic E2E data after db-seed using a byte-preserving container copy
	docker compose cp database/seeds/e2e.sql postgres:/tmp/nsa-e2e.sql
	docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f /tmp/nsa-e2e.sql
	docker compose exec -T postgres rm -f /tmp/nsa-e2e.sql
	@echo E2E seed loaded with UTF-8 preserved.

migrate-up: ## Apply all pending migrations
	$(GOOSE) -dir $(MIGRATIONS_DIR) postgres "$(DB_URL)" up

migrate-down: ## Roll back the last migration
	$(GOOSE) -dir $(MIGRATIONS_DIR) postgres "$(DB_URL)" down

migrate-status: ## Show migration status
	$(GOOSE) -dir $(MIGRATIONS_DIR) postgres "$(DB_URL)" status

migrate-create: ## Create migration: make migrate-create name=add_users
	$(GOOSE) -dir $(MIGRATIONS_DIR) create $(name) sql

# ---------- Test database (integration tests) ----------
db-test-create: ## Create nsa_training_test if it does not exist
	echo SELECT 'CREATE DATABASE nsa_training_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='nsa_training_test')\gexec | docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres

db-test-migrate: db-test-create ## Migrate the test database to latest
	$(GOOSE) -dir $(MIGRATIONS_DIR) postgres "postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/nsa_training_test?sslmode=disable" up

# ---------- API (Phase 2) ----------
api-run:
	cd $(API_DIR) && go run ./cmd/api

api-test:
	cd $(API_DIR) && go test ./...

api-test-integration: export NSA_TEST_DATABASE_URL=postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/nsa_training_test?sslmode=disable
api-test-integration: ## Run API tests including DB integration tests (needs db-test-migrate first)
	cd $(API_DIR) && go test ./...

api-build:
	cd $(API_DIR) && go build -o bin/api.exe ./cmd/api

api-vet:
	cd $(API_DIR) && go vet ./...

# ---------- Web (Phase 8) ----------
web-install:
	cd $(WEB_DIR) && npm install

web-dev:
	cd $(WEB_DIR) && npm run dev

web-test:
	cd $(WEB_DIR) && npm run test

web-build:
	cd $(WEB_DIR) && npm run build

web-lint:
	cd $(WEB_DIR) && npm run lint && npm run typecheck

web-format-check:
	cd $(WEB_DIR) && npm run format:check

web-e2e:
	cd $(WEB_DIR) && npm run test:e2e

docker-build-prod:
	docker compose --env-file .env.production -f compose.production.yaml build

prod-config:
	docker compose --env-file .env.production -f compose.production.yaml config

load-test:
	cd $(API_DIR) && go run ./cmd/loadtest -base-url http://127.0.0.1:8080/api/v1

# ---------- API documentation ----------
swagger: ## Start Swagger UI viewing docs/openapi.yaml at http://localhost:8081
	docker compose up -d swagger-ui
	@echo Swagger UI: http://localhost:8081

# ---------- Quality gate ----------
check: ## Run checks available in the current phase
	@echo Running checks...
ifeq ($(wildcard $(API_DIR)/go.mod),)
	@echo API not initialized yet - skipped
else
	cd $(API_DIR) && go vet ./... && go test ./...
endif
ifeq ($(wildcard $(WEB_DIR)/package.json),)
	@echo Web app not initialized yet - skipped
else
	cd $(WEB_DIR) && npm run lint && npm run format:check && npm run test -- --run && npm run build
endif
	@echo Checks finished.
