-- +goose Up
WITH ranked_dups AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY student_id, class_id 
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM orders
    WHERE class_id IS NOT NULL 
      AND status NOT IN ('cancelled', 'refunded')
)
UPDATE orders
SET status = 'cancelled',
    notes = COALESCE(notes, '') || ' [System: Auto-cancelled duplicate order before applying unique index]'
WHERE id IN (
    SELECT id FROM ranked_dups WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_class_enrollment
ON class_enrollments (class_id, student_id)
WHERE status = 'enrolled';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_student_class_order
ON orders (student_id, class_id)
WHERE class_id IS NOT NULL AND status NOT IN ('cancelled', 'refunded');

-- +goose Down
DROP INDEX IF EXISTS idx_unique_active_student_class_order;
DROP INDEX IF EXISTS idx_unique_active_class_enrollment;
