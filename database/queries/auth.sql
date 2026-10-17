-- Authentication and identity queries (PostgreSQL, pgx/v5).
-- Naming: sqlc generates one Go method per "name:" annotation.

-- name: GetUserByEmail :one
SELECT id, email, password_hash, status, must_change_password
FROM users
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, password_hash, status, must_change_password
FROM users
WHERE id = $1;

-- name: GetUserRoleCodes :many
SELECT r.code
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = $1
ORDER BY r.code;

-- name: UpdateLastLogin :exec
UPDATE users SET last_login_at = NOW()
WHERE id = $1;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2, must_change_password = FALSE
WHERE id = $1;

-- name: ClearMustChangePassword :exec
UPDATE users SET must_change_password = FALSE
WHERE id = $1;

-- name: InsertRefreshToken :one
INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING id;

-- name: GetRefreshTokenByHash :one
SELECT id, user_id, expires_at, revoked_at
FROM refresh_tokens
WHERE token_hash = $1;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = NOW()
WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeAllRefreshTokensForUser :exec
UPDATE refresh_tokens SET revoked_at = NOW()
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: GetStudentProfileByUserID :one
SELECT id, student_code, full_name
FROM student_profiles
WHERE user_id = $1;

-- name: GetTeacherProfileByUserID :one
SELECT id, teacher_code, full_name
FROM teacher_profiles
WHERE user_id = $1;