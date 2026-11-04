-- database/queries/ai_workflows.sql

-- name: UpsertAIWorkflowProposal :one
INSERT INTO ai_workflow_proposals (
  dedup_key,
  workflow_code,
  domain,
  priority,
  status,
  target_lead_id,
  target_order_id,
  target_student_id,
  target_class_id,
  assigned_user_id,
  title,
  bottleneck_summary,
  ai_rationale,
  suggested_script,
  action_type,
  action_payload,
  context_snapshot
) VALUES (
  $1, $2, $3, $4, 'pending',
  $5, $6, $7, $8,
  $9, $10, $11, $12, $13,
  $14, sqlc.arg(action_payload)::jsonb, sqlc.arg(context_snapshot)::jsonb
)
ON CONFLICT (dedup_key) DO UPDATE
SET
  title = EXCLUDED.title,
  bottleneck_summary = EXCLUDED.bottleneck_summary,
  ai_rationale = EXCLUDED.ai_rationale,
  suggested_script = EXCLUDED.suggested_script,
  action_payload = EXCLUDED.action_payload,
  context_snapshot = EXCLUDED.context_snapshot,
  priority = EXCLUDED.priority,
  assigned_user_id = COALESCE(EXCLUDED.assigned_user_id, ai_workflow_proposals.assigned_user_id),
  updated_at = NOW()
WHERE ai_workflow_proposals.status = 'pending'
RETURNING *;

-- name: GetAIWorkflowProposal :one
SELECT
  p.*,
  l.full_name AS target_lead_name,
  l.phone AS target_lead_phone,
  COALESCE(l.pipeline_status::text, '')::text AS target_lead_pipeline_status,
  o.order_code AS target_order_code,
  o.final_amount AS target_order_final_amount,
  COALESCE(o.status::text, '')::text AS target_order_status,
  sp.student_code AS target_student_code,
  sp.full_name AS target_student_name,
  c.class_code AS target_class_code,
  c.name AS target_class_name,
  u_assigned.full_name AS assigned_user_name,
  u_assigned.email AS assigned_user_email,
  u_decided.full_name AS decided_by_name,
  u_decided.email AS decided_by_email
FROM ai_workflow_proposals p
LEFT JOIN leads l ON l.id = p.target_lead_id
LEFT JOIN orders o ON o.id = p.target_order_id
LEFT JOIN student_profiles sp ON sp.id = p.target_student_id
LEFT JOIN classes c ON c.id = p.target_class_id
LEFT JOIN users u_assigned ON u_assigned.id = p.assigned_user_id
LEFT JOIN users u_decided ON u_decided.id = p.decided_by
WHERE p.id = $1;

-- name: ListAIWorkflowProposals :many
SELECT
  p.*,
  l.full_name AS target_lead_name,
  l.phone AS target_lead_phone,
  COALESCE(l.pipeline_status::text, '')::text AS target_lead_pipeline_status,
  o.order_code AS target_order_code,
  o.final_amount AS target_order_final_amount,
  COALESCE(o.status::text, '')::text AS target_order_status,
  sp.student_code AS target_student_code,
  sp.full_name AS target_student_name,
  c.class_code AS target_class_code,
  c.name AS target_class_name,
  u_assigned.full_name AS assigned_user_name,
  u_assigned.email AS assigned_user_email,
  u_decided.full_name AS decided_by_name,
  u_decided.email AS decided_by_email
FROM ai_workflow_proposals p
LEFT JOIN leads l ON l.id = p.target_lead_id
LEFT JOIN orders o ON o.id = p.target_order_id
LEFT JOIN student_profiles sp ON sp.id = p.target_student_id
LEFT JOIN classes c ON c.id = p.target_class_id
LEFT JOIN users u_assigned ON u_assigned.id = p.assigned_user_id
LEFT JOIN users u_decided ON u_decided.id = p.decided_by
WHERE (
  sqlc.narg(domain)::ai_workflow_domain IS NULL
  OR p.domain = sqlc.narg(domain)
)
AND (
  sqlc.narg(status)::ai_proposal_status IS NULL
  OR p.status = sqlc.narg(status)
)
AND (
  sqlc.narg(priority)::ai_proposal_priority IS NULL
  OR p.priority = sqlc.narg(priority)
)
AND (
  sqlc.narg(assigned_user_id)::uuid IS NULL
  OR p.assigned_user_id = sqlc.narg(assigned_user_id)
)
AND (
  sqlc.narg(target_lead_id)::uuid IS NULL
  OR p.target_lead_id = sqlc.narg(target_lead_id)
)
ORDER BY
  CASE p.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END ASC,
  p.created_at DESC,
  p.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountAIWorkflowProposals :one
SELECT COUNT(*)
FROM ai_workflow_proposals p
WHERE (
  sqlc.narg(domain)::ai_workflow_domain IS NULL
  OR p.domain = sqlc.narg(domain)
)
AND (
  sqlc.narg(status)::ai_proposal_status IS NULL
  OR p.status = sqlc.narg(status)
)
AND (
  sqlc.narg(priority)::ai_proposal_priority IS NULL
  OR p.priority = sqlc.narg(priority)
)
AND (
  sqlc.narg(assigned_user_id)::uuid IS NULL
  OR p.assigned_user_id = sqlc.narg(assigned_user_id)
)
AND (
  sqlc.narg(target_lead_id)::uuid IS NULL
  OR p.target_lead_id = sqlc.narg(target_lead_id)
);

-- name: GetAIWorkflowSummaryStats :one
SELECT
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_total,
  COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'critical') AS critical_pending,
  COUNT(*) FILTER (WHERE status = 'pending' AND domain = 'sales_crm') AS sales_pending,
  COUNT(*) FILTER (WHERE status = 'pending' AND domain = 'revenue_ops') AS revenue_pending,
  COUNT(*) FILTER (WHERE status = 'pending' AND domain = 'training_ops') AS training_pending,
  COUNT(*) FILTER (WHERE status = 'executed' AND decided_at >= CURRENT_DATE) AS executed_today
FROM ai_workflow_proposals
WHERE (
  sqlc.narg(assigned_user_id)::uuid IS NULL
  OR assigned_user_id = sqlc.narg(assigned_user_id)
);

-- name: MarkAIProposalExecuted :one
UPDATE ai_workflow_proposals
SET
  status = 'executed',
  suggested_script = $2,
  decided_by = $3,
  decided_at = NOW(),
  decision_note = $4,
  execution_result = sqlc.arg(execution_result)::jsonb,
  updated_at = NOW()
WHERE id = $1 AND status = 'pending'
RETURNING *;

-- name: MarkAIProposalRejected :one
UPDATE ai_workflow_proposals
SET
  status = 'rejected',
  decided_by = $2,
  decided_at = NOW(),
  decision_note = $3,
  updated_at = NOW()
WHERE id = $1 AND status = 'pending'
RETURNING *;

-- name: DetectUnassignedLeads :many
SELECT
  l.id,
  l.full_name,
  l.phone,
  l.email,
  l.source,
  l.created_at,
  l.pipeline_status,
  c.id AS interested_course_id,
  c.name AS course_name,
  c.code AS course_code
FROM leads l
LEFT JOIN courses c ON c.id = l.interested_course_id
WHERE l.deleted_at IS NULL
  AND l.assigned_to IS NULL
  AND l.pipeline_status = 'data_moi'
ORDER BY l.created_at ASC
LIMIT 25;

-- name: DetectStaleActiveLeads :many
SELECT
  l.id,
  l.full_name,
  l.phone,
  l.email,
  l.source,
  l.pipeline_status,
  l.assigned_to,
  u.full_name AS assigned_to_name,
  u.email AS assigned_to_email,
  c.name AS course_name,
  COALESCE(
    (SELECT MAX(created_at) FROM lead_interactions WHERE lead_id = l.id),
    l.created_at
  ) AS last_activity_at
FROM leads l
LEFT JOIN users u ON u.id = l.assigned_to
LEFT JOIN courses c ON c.id = l.interested_course_id
WHERE l.deleted_at IS NULL
  AND l.assigned_to IS NOT NULL
  AND l.pipeline_status IN ('data_moi', 'knm_thue_bao', 'goi_lai_sau', 'follow')
  AND COALESCE(
    (SELECT MAX(created_at) FROM lead_interactions WHERE lead_id = l.id),
    l.created_at
  ) <= NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM lead_tasks t
    WHERE t.lead_id = l.id
      AND t.completed_at IS NULL
  )
ORDER BY last_activity_at ASC
LIMIT 30;

-- name: DetectPendingOrdersOverdue :many
SELECT
  o.id,
  o.order_code,
  o.final_amount,
  o.amount,
  o.discount_amount,
  o.created_at,
  o.created_by,
  o.lead_id,
  o.student_id,
  l.full_name AS lead_name,
  l.phone AS lead_phone,
  sp.full_name AS student_name,
  sp.student_code,
  c.name AS course_name,
  u.full_name AS creator_name,
  u.email AS creator_email
FROM orders o
LEFT JOIN leads l ON l.id = o.lead_id
LEFT JOIN student_profiles sp ON sp.id = o.student_id
LEFT JOIN courses c ON c.id = o.course_id
LEFT JOIN users u ON u.id = o.created_by
WHERE o.deleted_at IS NULL
  AND o.status = 'pending'
  AND o.created_at <= NOW() - INTERVAL '24 hours'
ORDER BY o.created_at ASC
LIMIT 25;

-- name: DetectActiveSaleStaffForRouting :many
SELECT
  u.id,
  u.email,
  u.full_name,
  u.lead_assignment_order,
  (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.deleted_at IS NULL AND l.pipeline_status NOT IN ('tu_choi', 'da_dang_ky', 'dang_hoc', 'ket_thuc')) AS active_leads_count
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE r.code = 'SALE'
  AND u.status = 'active'
  AND COALESCE(u.is_accepting_leads, TRUE) = TRUE
ORDER BY u.lead_assignment_order ASC, u.email ASC;
