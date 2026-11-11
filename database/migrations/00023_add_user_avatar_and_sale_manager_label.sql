-- +goose Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Sync existing student and teacher avatars into users.avatar_url where missing
UPDATE users u
SET avatar_url = sp.avatar_url
FROM student_profiles sp
WHERE sp.user_id = u.id AND u.avatar_url IS NULL AND sp.avatar_url IS NOT NULL;

UPDATE users u
SET avatar_url = tp.avatar_url
FROM teacher_profiles tp
WHERE tp.user_id = u.id AND u.avatar_url IS NULL AND tp.avatar_url IS NOT NULL;

-- Backfill display names for seeded demo staff accounts if empty
UPDATE users SET full_name = 'Quản trị viên Hệ thống' WHERE email = 'admin@nsa.local' AND (full_name IS NULL OR btrim(full_name) = '');
UPDATE users SET full_name = 'Nguyễn Minh Quản Lý' WHERE email = 'sale_admin@nsa.local' AND (full_name IS NULL OR btrim(full_name) = '');
UPDATE users SET full_name = 'Trần Hoàng Nam' WHERE email = 'sale@nsa.local' AND (full_name IS NULL OR btrim(full_name) = '');
UPDATE users SET full_name = 'Lê Thu Hương' WHERE email = 'sale2@nsa.local' AND (full_name IS NULL OR btrim(full_name) = '');
UPDATE users SET full_name = 'Phạm Tuấn Anh' WHERE email = 'sale3@nsa.local' AND (full_name IS NULL OR btrim(full_name) = '');

-- Update SALE_ADMIN role display name to Sale Manager
UPDATE roles
SET name = 'Sale Manager',
    description = 'Sale Manager - Manages admissions, assigns leads, approves orders, and views sales reports.'
WHERE code = 'SALE_ADMIN';

-- Ensure partial unique index on active orders excludes soft-deleted rows
DROP INDEX IF EXISTS idx_unique_active_student_class_order;
CREATE UNIQUE INDEX idx_unique_active_student_class_order
  ON orders (student_id, class_id)
  WHERE student_id IS NOT NULL
    AND class_id IS NOT NULL
    AND status NOT IN ('cancelled', 'refunded')
    AND deleted_at IS NULL;

-- Ensure order_receipts table and sequence exist in schema with RLS enabled
CREATE SEQUENCE IF NOT EXISTS receipt_code_seq START 1;
CREATE TABLE IF NOT EXISTS order_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code VARCHAR(32) NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  installment_no INT NOT NULL DEFAULT 1,
  amount NUMERIC(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer',
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_receipts ENABLE ROW LEVEL SECURITY;

-- +goose Down
DROP TABLE IF EXISTS order_receipts CASCADE;
DROP SEQUENCE IF EXISTS receipt_code_seq;

DROP INDEX IF EXISTS idx_unique_active_student_class_order;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_student_class_order
  ON orders (student_id, class_id)
  WHERE class_id IS NOT NULL AND status NOT IN ('cancelled', 'refunded');

UPDATE roles
SET name = 'Sale Administrator',
    description = 'Manages admissions, assigns leads, approves orders, and views sales reports.'
WHERE code = 'SALE_ADMIN';

ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
