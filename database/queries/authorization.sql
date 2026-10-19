-- Record-level authorization helpers (ownership and assignment checks).

-- name: CheckStudentProfileOwnership :one
-- True when the given student profile belongs to the given user account.
SELECT EXISTS(
  SELECT 1 FROM student_profiles
  WHERE id = $1 AND user_id = $2
);

-- name: CheckTeacherAssignedToClass :one
-- True when the given user's teacher profile is assigned to the given class.
SELECT EXISTS(
  SELECT 1
  FROM teacher_assignments ta
  JOIN teacher_profiles tp ON tp.id = ta.teacher_id
  WHERE ta.class_id = $1 AND tp.user_id = $2
    AND EXISTS (
      SELECT 1 FROM teacher_assignment_periods tap
      WHERE tap.assignment_id = ta.id AND tap.ended_at IS NULL
    )
);

-- name: CheckSaleAssignedToStudent :one
-- True when the given user is the assigned sale or creator of the lead converted into the given student profile.
SELECT EXISTS(
  SELECT 1 FROM leads
  WHERE converted_student_id = $1
    AND (assigned_to = $2 OR created_by = $2)
    AND deleted_at IS NULL
);
