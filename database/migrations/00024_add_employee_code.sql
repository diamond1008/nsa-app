-- +goose Up

-- 1. Create sequence for employee code starting from 1
CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1;

-- 2. Add employee_code column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(32) UNIQUE;

-- 3. Backfill employee_code for all existing staff and admin users
-- Excludes pure students and teachers, sorted from oldest to newest by created_at, id
WITH staff_users AS (
  SELECT u.id,
         ROW_NUMBER() OVER (ORDER BY u.created_at ASC, u.id ASC) AS rn
  FROM users u
  WHERE EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND r.code NOT IN ('STUDENT', 'TEACHER')
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_profiles sp WHERE sp.user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM teacher_profiles tp WHERE tp.user_id = u.id
  )
)
UPDATE users u
SET employee_code = 'NV' || lpad(staff_users.rn::text, 6, '0')
FROM staff_users
WHERE u.id = staff_users.id;

-- 4. Fast-forward employee_code_seq to match max backfilled code
-- +goose StatementBegin
DO $$
DECLARE
  max_num bigint;
BEGIN
  SELECT MAX(substring(employee_code FROM '^NV0*([0-9]+)$')::bigint)
  INTO max_num
  FROM users
  WHERE employee_code IS NOT NULL;

  IF max_num IS NOT NULL AND max_num > 0 THEN
    PERFORM setval('employee_code_seq', max_num, true);
  ELSE
    PERFORM setval('employee_code_seq', 1, false);
  END IF;
END $$;
-- +goose StatementEnd

-- 5. Trigger function to auto-assign sequential employee_code when an employee/admin role is assigned
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION trg_auto_assign_employee_code()
RETURNS TRIGGER AS $$
DECLARE
  v_role_code text;
  v_has_student boolean;
  v_has_teacher boolean;
  v_existing_code text;
BEGIN
  SELECT code INTO v_role_code FROM roles WHERE id = NEW.role_id;

  -- Only apply to staff/admin roles (excluding STUDENT and TEACHER)
  IF v_role_code IS NOT NULL AND v_role_code NOT IN ('STUDENT', 'TEACHER') THEN
    SELECT employee_code INTO v_existing_code FROM users WHERE id = NEW.user_id;

    -- If user does not have an employee_code yet
    IF v_existing_code IS NULL OR btrim(v_existing_code) = '' THEN
      SELECT EXISTS(SELECT 1 FROM student_profiles WHERE user_id = NEW.user_id) INTO v_has_student;
      SELECT EXISTS(SELECT 1 FROM teacher_profiles WHERE user_id = NEW.user_id) INTO v_has_teacher;

      IF NOT v_has_student AND NOT v_has_teacher THEN
        UPDATE users
        SET employee_code = 'NV' || lpad(nextval('employee_code_seq')::text, 6, '0')
        WHERE id = NEW.user_id AND (employee_code IS NULL OR btrim(employee_code) = '');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_assign_employee_code_on_role ON user_roles;
CREATE TRIGGER trg_assign_employee_code_on_role
AFTER INSERT ON user_roles
FOR EACH ROW
EXECUTE FUNCTION trg_auto_assign_employee_code();

-- +goose Down
DROP TRIGGER IF EXISTS trg_assign_employee_code_on_role ON user_roles;
DROP FUNCTION IF EXISTS trg_auto_assign_employee_code();
ALTER TABLE users DROP COLUMN IF EXISTS employee_code;
DROP SEQUENCE IF EXISTS employee_code_seq;
