-- +goose Up

ALTER TABLE student_profiles
  ALTER COLUMN student_code SET DEFAULT (
    'HV' || lpad(nextval('student_code_seq')::TEXT, 6, '0')
  );

UPDATE student_profiles
SET student_code = 'HV' || lpad(substring(student_code FROM '^HV0*([0-9]+)$'), 6, '0')
WHERE student_code ~ '^HV[0-9]+$';

-- +goose Down

ALTER TABLE student_profiles
  ALTER COLUMN student_code SET DEFAULT (
    'HV' || lpad(nextval('student_code_seq')::TEXT, 8, '0')
  );

UPDATE student_profiles
SET student_code = 'HV' || lpad(substring(student_code FROM '^HV0*([0-9]+)$'), 8, '0')
WHERE student_code ~ '^HV[0-9]+$';
