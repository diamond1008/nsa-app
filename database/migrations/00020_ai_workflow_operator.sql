-- +goose Up
CREATE TYPE ai_workflow_domain AS ENUM (
  'sales_crm',
  'revenue_ops',
  'training_ops'
);

CREATE TYPE ai_proposal_priority AS ENUM (
  'critical',
  'high',
  'medium',
  'low'
);

CREATE TYPE ai_proposal_status AS ENUM (
  'pending',
  'executed',
  'rejected'
);

CREATE TYPE ai_action_type AS ENUM (
  'assign_lead',
  'create_followup_task',
  'advance_lead_stage',
  'followup_pending_order',
  'alert_attendance_risk'
);

CREATE TABLE ai_workflow_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key VARCHAR(200) NOT NULL UNIQUE,
  workflow_code VARCHAR(80) NOT NULL,
  domain ai_workflow_domain NOT NULL,
  priority ai_proposal_priority NOT NULL DEFAULT 'medium',
  status ai_proposal_status NOT NULL DEFAULT 'pending',

  target_lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  target_order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  target_student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  target_class_id UUID REFERENCES classes(id) ON DELETE CASCADE,

  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  title VARCHAR(300) NOT NULL,
  bottleneck_summary TEXT NOT NULL,
  ai_rationale TEXT NOT NULL,
  suggested_script TEXT NOT NULL DEFAULT '',

  action_type ai_action_type NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  execution_result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_proposals_status_priority ON ai_workflow_proposals(status, priority, created_at DESC);
CREATE INDEX idx_ai_proposals_assigned_user ON ai_workflow_proposals(assigned_user_id, status);
CREATE INDEX idx_ai_proposals_domain ON ai_workflow_proposals(domain, status);
CREATE INDEX idx_ai_proposals_lead ON ai_workflow_proposals(target_lead_id) WHERE target_lead_id IS NOT NULL;

CREATE TRIGGER trg_ai_workflow_proposals_updated_at
  BEFORE UPDATE ON ai_workflow_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TRIGGER IF EXISTS trg_ai_workflow_proposals_updated_at ON ai_workflow_proposals;
DROP TABLE IF EXISTS ai_workflow_proposals CASCADE;
DROP TYPE IF EXISTS ai_action_type;
DROP TYPE IF EXISTS ai_proposal_status;
DROP TYPE IF EXISTS ai_proposal_priority;
DROP TYPE IF EXISTS ai_workflow_domain;
