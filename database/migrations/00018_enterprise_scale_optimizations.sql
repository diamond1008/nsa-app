-- +goose Up
-- Enterprise Scale Optimizations: Trigram Substring Indexes & Soft Deletes

-- 1. Trigram extension for fast sub-string / ILIKE search over large datasets
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes for instantaneous full-name & phone search
CREATE INDEX IF NOT EXISTS idx_leads_trgm_search ON leads USING gin (full_name gin_trgm_ops, phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_trgm_search ON student_profiles USING gin (full_name gin_trgm_ops, student_code gin_trgm_ops);

-- 3. Soft-delete support for leads and orders to prevent accidental data loss
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at) WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_orders_deleted_at;
ALTER TABLE orders DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_leads_deleted_at;
ALTER TABLE leads DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_students_trgm_search;
DROP INDEX IF EXISTS idx_leads_trgm_search;
