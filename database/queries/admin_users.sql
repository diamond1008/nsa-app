-- Shared account-management queries used by the student and teacher modules.

-- name: CreateManagedUser :one
INSERT INTO users (email, password_hash, status, must_change_password)
VALUES ($1, $2, $3, FALSE)
RETURNING id, email, status, must_change_password, created_at, updated_at;

-- name: AssignManagedUserRole :exec
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT $1, id, $3
FROM roles
WHERE code = $2;

-- name: UpdateManagedUser :one
UPDATE users
SET email = $2, status = $3
WHERE id = $1
RETURNING id, email, status, must_change_password, created_at, updated_at;

-- name: InsertAuditLog :exec
INSERT INTO audit_logs (
  actor_user_id, action, entity_type, entity_id, old_values, new_values, reason
)
VALUES (
  sqlc.narg(actor_user_id),
  sqlc.arg(action),
  sqlc.arg(entity_type),
  sqlc.narg(entity_id),
  NULLIF(sqlc.narg(old_values)::text, '')::jsonb,
  NULLIF(sqlc.narg(new_values)::text, '')::jsonb,
  sqlc.narg(reason)
);

