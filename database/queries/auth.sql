-- Authentication and identity queries (PostgreSQL, pgx/v5).
-- Naming: sqlc generates one Go method per "name:" annotation.

-- name: GetUserByEmail :one
SELECT id, email, password_hash, status, must_change_password, COALESCE(full_name, '')::varchar(255) AS full_name, avatar_url, COALESCE(phone, '')::varchar(50) AS phone, last_login_at, created_at, COALESCE(employee_code, '')::varchar(50) AS employee_code
FROM users
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, password_hash, status, must_change_password, COALESCE(full_name, '')::varchar(255) AS full_name, avatar_url, COALESCE(phone, '')::varchar(50) AS phone, last_login_at, created_at, COALESCE(employee_code, '')::varchar(50) AS employee_code
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
SELECT id, student_code, full_name, avatar_url
FROM student_profiles
WHERE user_id = $1;

-- name: GetTeacherProfileByUserID :one
SELECT id, teacher_code, full_name, avatar_url
FROM teacher_profiles
WHERE user_id = $1;

-- name: UpdateUserAvatar :exec
UPDATE users
SET avatar_url = $2, updated_at = NOW()
WHERE id = $1;

-- name: UpdateStudentAvatarByUserID :exec
UPDATE student_profiles
SET avatar_url = $2, updated_at = NOW()
WHERE user_id = $1;

-- name: UpdateTeacherAvatarByUserID :exec
UPDATE teacher_profiles
SET avatar_url = $2, updated_at = NOW()
WHERE user_id = $1;

-- name: UpdateUserProfile :exec
UPDATE users
SET full_name = $2, phone = $3, updated_at = NOW()
WHERE id = $1;

-- name: SyncStudentNameAndPhone :exec
UPDATE student_profiles
SET
  full_name = CASE WHEN sqlc.arg('full_name')::text <> '' THEN sqlc.arg('full_name')::text ELSE full_name END,
  phone = sqlc.narg('phone'),
  updated_at = NOW()
WHERE user_id = sqlc.arg('user_id');

-- name: SyncTeacherNameAndPhone :exec
UPDATE teacher_profiles
SET
  full_name = CASE WHEN sqlc.arg('full_name')::text <> '' THEN sqlc.arg('full_name')::text ELSE full_name END,
  phone = sqlc.narg('phone'),
  updated_at = NOW()
WHERE user_id = sqlc.arg('user_id');
