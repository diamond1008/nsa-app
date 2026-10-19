-- +goose Up
-- Enterprise Scale Optimizations: Trigram Substring Indexes & Soft Deletes

-- 1. Trigram extension for fast sub-string / ILIKE search over large datasets
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Drop composite trigram indexes if they exist from early iteration
DROP INDEX IF EXISTS idx_students_trgm_search;
DROP INDEX IF EXISTS idx_leads_trgm_search;

-- 3. Dedicated single-column GIN trigram indexes for instantaneous ILIKE substring searches
CREATE INDEX IF NOT EXISTS idx_leads_full_name_trgm ON leads USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm ON leads USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_full_name_trgm ON student_profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_code_trgm ON student_profiles USING gin (student_code gin_trgm_ops);

-- 4. Soft-delete support for leads and orders to prevent accidental data loss
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at) WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_orders_deleted_at;
ALTER TABLE orders DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_leads_deleted_at;
ALTER TABLE leads DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_students_code_trgm;
DROP INDEX IF EXISTS idx_students_full_name_trgm;
DROP INDEX IF EXISTS idx_leads_phone_trgm;
DROP INDEX IF EXISTS idx_leads_full_name_trgm;
DROP INDEX IF EXISTS idx_students_trgm_search;
DROP INDEX IF EXISTS idx_leads_trgm_search;
DROP EXTENSION IF EXISTS pg_trgm;
