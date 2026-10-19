-- database/queries/leads.sql

-- name: CreateLead :one
INSERT INTO leads (
  full_name,
  phone,
  email,
  date_of_birth,
  gender,
  address,
  source,
  source_detail,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  interested_course_id,
  notes,
  pipeline_status,
  assigned_to,
  assigned_at,
  assigned_by,
  created_by
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18, $19,
  $20
)
RETURNING *;

-- name: GetLead :one
SELECT
  l.*,
  c.code AS course_code,
  c.name AS course_name,
  u_assignee.email AS assigned_to_email,
  u_assigner.email AS assigned_by_email,
  sp.student_code AS converted_student_code,
  sp.full_name AS converted_student_name,
  sp.status AS converted_student_status,
  u_creator.email AS created_by_email
FROM leads l
LEFT JOIN courses c ON c.id = l.interested_course_id
LEFT JOIN users u_assignee ON u_assignee.id = l.assigned_to
LEFT JOIN users u_assigner ON u_assigner.id = l.assigned_by
LEFT JOIN student_profiles sp ON sp.id = l.converted_student_id
LEFT JOIN users u_creator ON u_creator.id = l.created_by
WHERE l.id = $1 AND l.deleted_at IS NULL;

-- name: ListLeads :many
SELECT
  l.*,
  c.code AS course_code,
  c.name AS course_name,
  u_assignee.email AS assigned_to_email,
  sp.student_code AS converted_student_code,
  sp.full_name AS converted_student_name,
  sp.status AS converted_student_status
FROM leads l
LEFT JOIN courses c ON c.id = l.interested_course_id
LEFT JOIN users u_assignee ON u_assignee.id = l.assigned_to
LEFT JOIN student_profiles sp ON sp.id = l.converted_student_id
WHERE l.deleted_at IS NULL
AND (
  sqlc.arg(search)::text = ''
  OR l.full_name ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.phone, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.email::text, '') ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.narg(pipeline_status)::lead_pipeline_status IS NULL
  OR l.pipeline_status = sqlc.narg(pipeline_status)
)
AND (
  sqlc.narg(source)::lead_source IS NULL
  OR l.source = sqlc.narg(source)
)
AND (
  sqlc.narg(assigned_to)::uuid IS NULL
  OR l.assigned_to = sqlc.narg(assigned_to)::uuid
)
AND (
  sqlc.narg(created_from)::timestamptz IS NULL
  OR l.created_at >= sqlc.narg(created_from)::timestamptz
)
AND (
  sqlc.narg(created_to)::timestamptz IS NULL
  OR l.created_at <= sqlc.narg(created_to)::timestamptz
)
ORDER BY
  CASE WHEN sqlc.arg(sort_by)::text = 'full_name' AND sqlc.arg(sort_order)::text = 'asc' THEN l.full_name END ASC,
  CASE WHEN sqlc.arg(sort_by)::text = 'full_name' AND sqlc.arg(sort_order)::text = 'desc' THEN l.full_name END DESC,
  CASE WHEN sqlc.arg(sort_by)::text = 'created_at' AND sqlc.arg(sort_order)::text = 'asc' THEN l.created_at END ASC,
  CASE WHEN sqlc.arg(sort_by)::text = 'created_at' AND sqlc.arg(sort_order)::text = 'desc' THEN l.created_at END DESC,
  l.created_at DESC,
  l.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountLeads :one
SELECT COUNT(*)
FROM leads l
WHERE l.deleted_at IS NULL
AND (
  sqlc.arg(search)::text = ''
  OR l.full_name ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.phone, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.email::text, '') ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.narg(pipeline_status)::lead_pipeline_status IS NULL
  OR l.pipeline_status = sqlc.narg(pipeline_status)
)
AND (
  sqlc.narg(source)::lead_source IS NULL
  OR l.source = sqlc.narg(source)
)
AND (
  sqlc.narg(assigned_to)::uuid IS NULL
  OR l.assigned_to = sqlc.narg(assigned_to)::uuid
)
AND (
  sqlc.narg(created_from)::timestamptz IS NULL
  OR l.created_at >= sqlc.narg(created_from)::timestamptz
)
AND (
  sqlc.narg(created_to)::timestamptz IS NULL
  OR l.created_at <= sqlc.narg(created_to)::timestamptz
);

-- name: UpdateLead :one
UPDATE leads
SET
  full_name = $2,
  phone = $3,
  email = $4,
  date_of_birth = $5,
  gender = $6,
  address = $7,
  source = $8,
  source_detail = $9,
  utm_source = $10,
  utm_medium = $11,
  utm_campaign = $12,
  utm_content = $13,
  utm_term = $14,
  interested_course_id = $15,
  notes = $16
WHERE id = $1
RETURNING *;

-- name: UpdateLeadPipelineStatus :one
UPDATE leads
SET pipeline_status = $2
WHERE id = $1
RETURNING *;

-- name: AssignLead :one
UPDATE leads
SET
  assigned_to = $2,
  assigned_at = $3,
  assigned_by = $4
WHERE id = $1
RETURNING *;

-- name: ConvertLead :one
UPDATE leads
SET
  converted_student_id = $2,
  converted_at = $3,
  converted_by = $4,
  pipeline_status = 'da_dang_ky'
WHERE id = $1
RETURNING *;

-- name: CountLeadsByStatus :many
SELECT
  pipeline_status,
  COUNT(*)::bigint AS count
FROM leads
GROUP BY pipeline_status;

-- name: CountLeadsBySource :many
SELECT
  source,
  COUNT(*)::bigint AS count
FROM leads
GROUP BY source;

-- name: CountLeadsByAssignee :many
SELECT
  u.id AS user_id,
  u.email,
  COUNT(l.id)::bigint AS total_leads,
  COUNT(l.id) FILTER (WHERE l.pipeline_status = 'da_dang_ky')::bigint AS converted_leads
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
LEFT JOIN leads l ON l.assigned_to = u.id
WHERE r.code IN ('SALE', 'SALE_ADMIN', 'ADMIN') AND u.status = 'active'
GROUP BY u.id, u.email
ORDER BY total_leads DESC, u.email ASC;

-- name: ListSaleStaff :many
SELECT DISTINCT
  u.id,
  u.email
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE r.code IN ('SALE', 'SALE_ADMIN', 'ADMIN') AND u.status = 'active'
ORDER BY u.email ASC;

-- name: ListActiveSaleStaffForRoundRobin :many
SELECT DISTINCT
  u.id,
  u.email
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE r.code = 'SALE' AND u.status = 'active' AND u.is_accepting_leads = true
ORDER BY u.lead_assignment_order ASC, u.email ASC;

-- name: FindDuplicateLead :one
SELECT
  l.id,
  l.full_name,
  l.phone,
  l.email,
  l.pipeline_status,
  l.assigned_to,
  l.created_at,
  u.email AS assigned_to_email
FROM leads l
LEFT JOIN users u ON u.id = l.assigned_to
WHERE l.deleted_at IS NULL
AND (
  (sqlc.narg(phone)::text IS NOT NULL AND sqlc.narg(phone)::text <> '' AND l.phone = sqlc.narg(phone)::text)
  OR
  (sqlc.narg(email)::citext IS NOT NULL AND sqlc.narg(email)::citext <> '' AND l.email = sqlc.narg(email)::citext)
)
AND (
  sqlc.narg(exclude_id)::uuid IS NULL
  OR l.id <> sqlc.narg(exclude_id)::uuid
)
ORDER BY l.created_at DESC
LIMIT 1;

-- name: ListAllLeadsForExport :many
SELECT
  l.id,
  l.full_name,
  l.phone,
  l.email,
  l.gender,
  l.date_of_birth,
  l.address,
  l.source,
  l.source_detail,
  l.pipeline_status,
  l.notes,
  l.created_at,
  c.code AS course_code,
  c.name AS course_name,
  u_assignee.email AS assigned_to_email,
  sp.student_code AS converted_student_code,
  sp.full_name AS converted_student_name
FROM leads l
LEFT JOIN courses c ON c.id = l.interested_course_id
LEFT JOIN users u_assignee ON u_assignee.id = l.assigned_to
LEFT JOIN student_profiles sp ON sp.id = l.converted_student_id
WHERE l.deleted_at IS NULL
AND (
  sqlc.arg(search)::text = ''
  OR l.full_name ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.phone, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.email::text, '') ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.narg(pipeline_status)::lead_pipeline_status IS NULL
  OR l.pipeline_status = sqlc.narg(pipeline_status)
)
AND (
  sqlc.narg(source)::lead_source IS NULL
  OR l.source = sqlc.narg(source)
)
AND (
  sqlc.narg(assigned_to)::uuid IS NULL
  OR l.assigned_to = sqlc.narg(assigned_to)::uuid
)
AND (
  sqlc.narg(created_from)::timestamptz IS NULL
  OR l.created_at >= sqlc.narg(created_from)::timestamptz
)
AND (
  sqlc.narg(created_to)::timestamptz IS NULL
  OR l.created_at <= sqlc.narg(created_to)::timestamptz
)
ORDER BY l.created_at DESC;

-- name: SoftDeleteLead :exec
UPDATE leads
SET deleted_at = NOW()
WHERE id = $1;

