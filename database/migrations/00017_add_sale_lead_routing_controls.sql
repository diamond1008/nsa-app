-- +goose Up
-- Add lead distribution control columns for Sale staff
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_accepting_leads BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_assignment_order INT NOT NULL DEFAULT 0;

-- Index to optimize round-robin ordering
CREATE INDEX IF NOT EXISTS idx_users_sale_lead_routing ON users(lead_assignment_order ASC, email ASC) WHERE is_accepting_leads = true;

-- +goose Down
DROP INDEX IF EXISTS idx_users_sale_lead_routing;
ALTER TABLE users DROP COLUMN IF EXISTS lead_assignment_order;
ALTER TABLE users DROP COLUMN IF EXISTS is_accepting_leads;
