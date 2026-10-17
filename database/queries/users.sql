-- User management queries for scoped account administration and audit history.

-- name: ListUsers :many
SELECT
  u.id,
  u.email,
  u.status,
  u.must_change_password,
  u.last_login_at,
  u.created_at,
  u.updated_at,
  COALESCE(u.full_name, '')::varchar(255) AS full_name,
  COALESCE(u.phone, '')::varchar(50) AS phone,
  COALESCE(u.is_accepting_leads, true)::boolean AS is_accepting_leads,
  COALESCE(u.lead_assignment_order, 0)::int AS lead_assignment_order,
  ARRAY_AGG(DISTINCT r.code ORDER BY r.code)::text[] AS role_codes,
  COALESCE(sp.student_code, '')::varchar(50) AS student_code,
  COALESCE(tp.teacher_code, '')::varchar(50) AS teacher_code,
  COALESCE(
    (
      SELECT creator.email FROM users creator
      JOIN user_roles ur_c ON ur_c.assigned_by = creator.id
      WHERE ur_c.user_id = u.id
      LIMIT 1
    ),
    ''
  )::text AS created_by_email
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
LEFT JOIN student_profiles sp ON sp.user_id = u.id
LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
WHERE
  EXISTS (
    SELECT 1 FROM user_roles ur_chk
    JOIN roles r_chk ON r_chk.id = ur_chk.role_id
    WHERE ur_chk.user_id = u.id AND r_chk.code = ANY(@allowed_roles::text[])
  )
  AND (
    sqlc.narg('role')::text IS NULL
    OR EXISTS (
      SELECT 1 FROM user_roles ur2
      JOIN roles r2 ON r2.id = ur2.role_id
      WHERE ur2.user_id = u.id AND r2.code = sqlc.narg('role')
    )
  )
  AND (sqlc.narg('status')::user_status IS NULL OR u.status = sqlc.narg('status')::user_status)
  AND (
    sqlc.narg('search')::text IS NULL
    OR u.email ILIKE '%' || sqlc.narg('search') || '%'
    OR u.full_name ILIKE '%' || sqlc.narg('search') || '%'
    OR sp.student_code ILIKE '%' || sqlc.narg('search') || '%'
    OR tp.teacher_code ILIKE '%' || sqlc.narg('search') || '%'
  )
GROUP BY u.id, sp.student_code, tp.teacher_code
ORDER BY u.created_at DESC
LIMIT @limit_val OFFSET @offset_val;

-- name: CountUsers :one
SELECT COUNT(DISTINCT u.id)
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
LEFT JOIN student_profiles sp ON sp.user_id = u.id
LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
WHERE
  EXISTS (
    SELECT 1 FROM user_roles ur_chk
    JOIN roles r_chk ON r_chk.id = ur_chk.role_id
    WHERE ur_chk.user_id = u.id AND r_chk.code = ANY(@allowed_roles::text[])
  )
  AND (
    sqlc.narg('role')::text IS NULL
    OR EXISTS (
      SELECT 1 FROM user_roles ur2
      JOIN roles r2 ON r2.id = ur2.role_id
      WHERE ur2.user_id = u.id AND r2.code = sqlc.narg('role')
    )
  )
  AND (sqlc.narg('status')::user_status IS NULL OR u.status = sqlc.narg('status')::user_status)
  AND (
    sqlc.narg('search')::text IS NULL
    OR u.email ILIKE '%' || sqlc.narg('search') || '%'
    OR u.full_name ILIKE '%' || sqlc.narg('search') || '%'
    OR sp.student_code ILIKE '%' || sqlc.narg('search') || '%'
    OR tp.teacher_code ILIKE '%' || sqlc.narg('search') || '%'
  );

-- name: GetUserDetail :one
SELECT
  u.id,
  u.email,
  u.status,
  u.must_change_password,
  u.last_login_at,
  u.created_at,
  u.updated_at,
  COALESCE(u.full_name, '')::varchar(255) AS full_name,
  COALESCE(u.phone, '')::varchar(50) AS phone,
  COALESCE(u.is_accepting_leads, true)::boolean AS is_accepting_leads,
  COALESCE(u.lead_assignment_order, 0)::int AS lead_assignment_order,
  ARRAY_AGG(DISTINCT r.code ORDER BY r.code)::text[] AS role_codes,
  COALESCE(sp.student_code, '')::varchar(50) AS student_code,
  COALESCE(tp.teacher_code, '')::varchar(50) AS teacher_code,
  COALESCE(
    (
      SELECT creator.email FROM users creator
      JOIN user_roles ur_c ON ur_c.assigned_by = creator.id
      WHERE ur_c.user_id = u.id
      LIMIT 1
    ),
    ''
  )::text AS created_by_email
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
LEFT JOIN student_profiles sp ON sp.user_id = u.id
LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
WHERE u.id = $1
GROUP BY u.id, sp.student_code, tp.teacher_code;

-- name: CreateUserAccount :one
INSERT INTO users (email, password_hash, status, must_change_password, full_name, phone)
VALUES ($1, $2, $3, FALSE, $4, $5)
RETURNING id, email, status, must_change_password, full_name, phone, created_at, updated_at;

-- name: UpdateUserStatus :one
UPDATE users
SET status = $2, updated_at = NOW()
WHERE id = $1
RETURNING id, email, status, updated_at;

-- name: UpdateUserAccountProfile :one
UPDATE users
SET full_name = $2, phone = $3, updated_at = NOW()
WHERE id = $1
RETURNING id, email, status, full_name, phone, updated_at;

-- name: UpdateUserLeadRouting :one
UPDATE users
SET
  is_accepting_leads = COALESCE(sqlc.narg('is_accepting_leads')::boolean, is_accepting_leads),
  lead_assignment_order = COALESCE(sqlc.narg('lead_assignment_order')::int, lead_assignment_order),
  updated_at = NOW()
WHERE id = $1
RETURNING id, email, is_accepting_leads, lead_assignment_order, updated_at;

-- name: UpdateLeadAssignmentOrder :exec
UPDATE users
SET
  lead_assignment_order = $2,
  updated_at = NOW()
WHERE id = $1;

-- name: ResetUserAccountPassword :exec
UPDATE users
SET password_hash = $2, must_change_password = FALSE, updated_at = NOW()
WHERE id = $1;

-- name: ListUserAuditLogs :many
SELECT
  al.id,
  al.actor_user_id,
  COALESCE(actor.email, 'Hệ thống')::text AS actor_email,
  COALESCE(actor.full_name, '')::text AS actor_name,
  al.action,
  al.old_values,
  al.new_values,
  al.reason,
  al.created_at
FROM audit_logs al
LEFT JOIN users actor ON actor.id = al.actor_user_id
WHERE al.entity_type = 'user' AND al.entity_id = $1
ORDER BY al.created_at DESC
LIMIT @limit_val OFFSET @offset_val;

-- name: CountUserAuditLogs :one
SELECT COUNT(*)
FROM audit_logs
WHERE entity_type = 'user' AND entity_id = $1;
