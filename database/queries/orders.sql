-- database/queries/orders.sql

-- name: CreateOrder :one
INSERT INTO orders (
  order_code,
  lead_id,
  student_id,
  course_id,
  class_id,
  amount,
  discount_amount,
  final_amount,
  discount_note,
  status,
  payment_method,
  paid_at,
  notes,
  created_by
) VALUES (
  COALESCE(NULLIF(sqlc.arg(order_code)::text, ''), 'DH' || lpad(nextval('order_code_seq')::text, 8, '0')),
  sqlc.narg(lead_id),
  sqlc.narg(student_id),
  sqlc.narg(course_id),
  sqlc.narg(class_id),
  sqlc.arg(amount),
  sqlc.arg(discount_amount),
  sqlc.arg(final_amount),
  sqlc.narg(discount_note),
  sqlc.arg(status),
  sqlc.narg(payment_method),
  sqlc.narg(paid_at),
  sqlc.narg(notes),
  sqlc.arg(created_by)
)
RETURNING *;

-- name: GetOrder :one
SELECT
  o.*,
  l.full_name AS lead_name,
  sp.student_code,
  sp.full_name AS student_name,
  c.name AS course_name,
  c.code AS course_code,
  cl.class_code,
  cl.name AS class_name,
  u.email AS created_by_email
FROM orders o
LEFT JOIN leads l ON l.id = o.lead_id
LEFT JOIN student_profiles sp ON sp.id = o.student_id
LEFT JOIN courses c ON c.id = o.course_id
LEFT JOIN classes cl ON cl.id = o.class_id
LEFT JOIN users u ON u.id = o.created_by
WHERE o.id = $1 AND o.deleted_at IS NULL;

-- name: ListOrders :many
SELECT
  o.*,
  l.full_name AS lead_name,
  sp.student_code,
  sp.full_name AS student_name,
  c.name AS course_name,
  c.code AS course_code,
  cl.class_code,
  cl.name AS class_name,
  u.email AS created_by_email
FROM orders o
LEFT JOIN leads l ON l.id = o.lead_id
LEFT JOIN student_profiles sp ON sp.id = o.student_id
LEFT JOIN courses c ON c.id = o.course_id
LEFT JOIN classes cl ON cl.id = o.class_id
LEFT JOIN users u ON u.id = o.created_by
WHERE o.deleted_at IS NULL
AND (
  sqlc.arg(search)::text = ''
  OR o.order_code ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(sp.student_code, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(sp.full_name, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.full_name, '') ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.narg(status)::order_status IS NULL
  OR o.status = sqlc.narg(status)
)
AND (
  sqlc.narg(student_id)::uuid IS NULL
  OR o.student_id = sqlc.narg(student_id)::uuid
)
AND (
  sqlc.narg(lead_id)::uuid IS NULL
  OR o.lead_id = sqlc.narg(lead_id)::uuid
)
AND (
  sqlc.narg(created_by)::uuid IS NULL
  OR o.created_by = sqlc.narg(created_by)::uuid
)
AND (
  sqlc.narg(created_from)::timestamptz IS NULL
  OR o.created_at >= sqlc.narg(created_from)::timestamptz
)
AND (
  sqlc.narg(created_to)::timestamptz IS NULL
  OR o.created_at <= sqlc.narg(created_to)::timestamptz
)
ORDER BY
  o.created_at DESC,
  o.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountOrders :one
SELECT COUNT(*)
FROM orders o
LEFT JOIN leads l ON l.id = o.lead_id
LEFT JOIN student_profiles sp ON sp.id = o.student_id
WHERE o.deleted_at IS NULL
AND (
  sqlc.arg(search)::text = ''
  OR o.order_code ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(sp.student_code, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(sp.full_name, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.full_name, '') ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.narg(status)::order_status IS NULL
  OR o.status = sqlc.narg(status)
)
AND (
  sqlc.narg(student_id)::uuid IS NULL
  OR o.student_id = sqlc.narg(student_id)::uuid
)
AND (
  sqlc.narg(lead_id)::uuid IS NULL
  OR o.lead_id = sqlc.narg(lead_id)::uuid
)
AND (
  sqlc.narg(created_by)::uuid IS NULL
  OR o.created_by = sqlc.narg(created_by)::uuid
)
AND (
  sqlc.narg(created_from)::timestamptz IS NULL
  OR o.created_at >= sqlc.narg(created_from)::timestamptz
)
AND (
  sqlc.narg(created_to)::timestamptz IS NULL
  OR o.created_at <= sqlc.narg(created_to)::timestamptz
);

-- name: UpdateOrderStatus :one
UPDATE orders
SET
  status = $2,
  paid_at = sqlc.narg(paid_at),
  payment_method = COALESCE(sqlc.narg(payment_method), payment_method),
  notes = COALESCE(sqlc.narg(notes), notes)
WHERE id = $1
RETURNING *;

-- name: GetRevenueByMonth :many
SELECT
  TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS month,
  COUNT(*)::bigint AS total_orders,
  COUNT(*) FILTER (WHERE status = 'paid')::bigint AS paid_orders,
  COALESCE(SUM(final_amount) FILTER (WHERE status = 'paid'), 0)::numeric AS total_revenue
FROM orders
WHERE deleted_at IS NULL
GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
ORDER BY month DESC
LIMIT 12;

-- name: GetRevenueByWeek :many
SELECT
  TO_CHAR(DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-"W"IW') AS week,
  COUNT(*)::bigint AS total_orders,
  COUNT(*) FILTER (WHERE status = 'paid')::bigint AS paid_orders,
  COALESCE(SUM(final_amount) FILTER (WHERE status = 'paid'), 0)::numeric AS total_revenue
FROM orders
WHERE deleted_at IS NULL
  AND created_at >= NOW() - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
ORDER BY week ASC;

-- name: GetRevenueByYear :many
SELECT
  TO_CHAR(DATE_TRUNC('year', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY') AS year,
  COUNT(*)::bigint AS total_orders,
  COUNT(*) FILTER (WHERE status = 'paid')::bigint AS paid_orders,
  COALESCE(SUM(final_amount) FILTER (WHERE status = 'paid'), 0)::numeric AS total_revenue
FROM orders
WHERE deleted_at IS NULL
GROUP BY DATE_TRUNC('year', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
ORDER BY year ASC;

-- name: GetRevenueBySource :many
SELECT
  l.source,
  COUNT(o.id)::bigint AS total_orders,
  COALESCE(SUM(o.final_amount) FILTER (WHERE o.status = 'paid'), 0)::numeric AS revenue
FROM orders o
JOIN leads l ON l.id = o.lead_id
WHERE o.deleted_at IS NULL AND l.deleted_at IS NULL
GROUP BY l.source
ORDER BY revenue DESC;

-- name: GetRevenueSummary :one
SELECT
  COALESCE(SUM(final_amount) FILTER (
    WHERE status = 'paid'
      AND DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  ), 0)::numeric AS month_revenue,
  COALESCE(SUM(final_amount) FILTER (WHERE status = 'paid'), 0)::numeric AS total_revenue,
  COUNT(*) FILTER (
    WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  )::bigint AS month_orders,
  COUNT(*) FILTER (
    WHERE status = 'paid'
      AND DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  )::bigint AS month_paid_orders
FROM orders
WHERE deleted_at IS NULL;

-- name: ListAllOrdersForExport :many
SELECT
  o.id,
  o.order_code,
  o.amount,
  o.discount_amount,
  o.final_amount,
  o.discount_note,
  o.status,
  o.payment_method,
  o.paid_at,
  o.notes,
  o.created_at,
  l.full_name AS lead_name,
  sp.student_code,
  sp.full_name AS student_name,
  c.name AS course_name,
  c.code AS course_code,
  cl.class_code,
  cl.name AS class_name,
  u.email AS created_by_email
FROM orders o
LEFT JOIN leads l ON l.id = o.lead_id
LEFT JOIN student_profiles sp ON sp.id = o.student_id
LEFT JOIN courses c ON c.id = o.course_id
LEFT JOIN classes cl ON cl.id = o.class_id
LEFT JOIN users u ON u.id = o.created_by
WHERE o.deleted_at IS NULL
AND (
  sqlc.arg(search)::text = ''
  OR o.order_code ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(sp.student_code, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(sp.full_name, '') ILIKE '%' || sqlc.arg(search) || '%'
  OR COALESCE(l.full_name, '') ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.narg(status)::order_status IS NULL
  OR o.status = sqlc.narg(status)
)
AND (
  sqlc.narg(student_id)::uuid IS NULL
  OR o.student_id = sqlc.narg(student_id)::uuid
)
AND (
  sqlc.narg(lead_id)::uuid IS NULL
  OR o.lead_id = sqlc.narg(lead_id)::uuid
)
AND (
  sqlc.narg(created_from)::timestamptz IS NULL
  OR o.created_at >= sqlc.narg(created_from)::timestamptz
)
AND (
  sqlc.narg(created_to)::timestamptz IS NULL
  OR o.created_at <= sqlc.narg(created_to)::timestamptz
)
ORDER BY o.created_at DESC;

-- name: SoftDeleteOrder :exec
UPDATE orders
SET deleted_at = NOW()
WHERE id = $1;

-- name: HasActiveOrderForStudentClass :one
SELECT EXISTS (
    SELECT 1
    FROM orders
    WHERE student_id = $1
      AND class_id = $2
      AND status NOT IN ('cancelled', 'refunded')
) AS exists;

-- name: GetDailyRevenueTrend :many
SELECT
  TO_CHAR(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
  COUNT(*)::bigint AS paid_orders,
  COALESCE(SUM(final_amount), 0)::numeric AS revenue
FROM orders
WHERE deleted_at IS NULL
  AND status = 'paid'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY TO_CHAR(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
ORDER BY day ASC;

-- name: GetTopCoursesRevenue :many
SELECT
  c.id AS course_id,
  c.code AS course_code,
  c.name AS course_name,
  COUNT(o.id)::bigint AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'paid')::bigint AS paid_orders,
  COALESCE(SUM(o.final_amount) FILTER (WHERE o.status = 'paid'), 0)::numeric AS revenue
FROM courses c
LEFT JOIN orders o ON o.course_id = c.id AND o.deleted_at IS NULL
WHERE c.status = 'active'
GROUP BY c.id, c.code, c.name
ORDER BY revenue DESC, paid_orders DESC, total_orders DESC
LIMIT 5;

-- name: CountPendingOrders :one
SELECT COUNT(*)::bigint AS count
FROM orders
WHERE status = 'pending' AND deleted_at IS NULL;


