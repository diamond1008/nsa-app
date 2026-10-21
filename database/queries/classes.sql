-- Class, enrollment, and teacher-assignment administration queries.

-- name: CreateClass :one
INSERT INTO classes (
  course_id, class_code, name, start_date, end_date, maximum_students, status
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, course_id, class_code, name, start_date, end_date,
  maximum_students, status, created_at, updated_at;

-- name: GetAdminClass :one
SELECT
  c.id, c.course_id, co.code AS course_code, co.name AS course_name,
  c.class_code, c.name, c.start_date, c.end_date, c.maximum_students, c.status,
  COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled')::int AS enrolled_students,
  c.created_at, c.updated_at
FROM classes c
JOIN courses co ON co.id = c.course_id
LEFT JOIN class_enrollments ce ON ce.class_id = c.id
WHERE c.id = $1
GROUP BY c.id, co.code, co.name;

-- name: ListAdminClasses :many
SELECT
  c.id, c.course_id, co.code AS course_code, co.name AS course_name,
  c.class_code, c.name, c.start_date, c.end_date, c.maximum_students, c.status,
  COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled')::int AS enrolled_students,
  c.created_at, c.updated_at
FROM classes c
JOIN courses co ON co.id = c.course_id
LEFT JOIN class_enrollments ce ON ce.class_id = c.id
WHERE (
  sqlc.arg(search)::text = ''
  OR c.class_code ILIKE '%' || sqlc.arg(search) || '%'
  OR c.name ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.arg(status)::text = ''
  OR c.status::text = sqlc.arg(status)::text
)
AND (
  sqlc.narg(course_id)::uuid IS NULL
  OR c.course_id = sqlc.narg(course_id)::uuid
)
AND (
  sqlc.narg(teacher_id)::uuid IS NULL
  OR EXISTS (
    SELECT 1 FROM teacher_assignments ta
    WHERE ta.class_id = c.id AND ta.teacher_id = sqlc.narg(teacher_id)::uuid
      AND EXISTS (SELECT 1 FROM teacher_assignment_periods tap WHERE tap.assignment_id = ta.id AND tap.ended_at IS NULL)
  )
)
AND (sqlc.narg(from_date)::date IS NULL OR c.end_date >= sqlc.narg(from_date)::date)
AND (sqlc.narg(to_date)::date IS NULL OR c.start_date <= sqlc.narg(to_date)::date)
AND (
  sqlc.narg(upcoming_only)::boolean IS NULL
  OR sqlc.narg(upcoming_only)::boolean = FALSE
  OR c.start_date > CURRENT_DATE
)
AND (
  sqlc.narg(sale_user_id)::uuid IS NULL
  OR EXISTS (
    SELECT 1 FROM class_enrollments ce2
    JOIN leads l ON l.converted_student_id = ce2.student_id
    WHERE ce2.class_id = c.id
      AND (l.assigned_to = sqlc.narg(sale_user_id)::uuid OR l.created_by = sqlc.narg(sale_user_id)::uuid)
      AND l.deleted_at IS NULL
  )
)
GROUP BY c.id, co.code, co.name
HAVING (
  sqlc.arg(capacity)::text = ''
  OR (sqlc.arg(capacity)::text = 'available' AND COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled') < c.maximum_students)
  OR (sqlc.arg(capacity)::text = 'full' AND COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled') >= c.maximum_students)
)
ORDER BY
  CASE WHEN sqlc.arg(sort_by)::text = 'class_code' AND sqlc.arg(sort_order)::text = 'asc' THEN c.class_code END ASC,
  CASE WHEN sqlc.arg(sort_by)::text = 'class_code' AND sqlc.arg(sort_order)::text = 'desc' THEN c.class_code END DESC,
  CASE WHEN sqlc.arg(sort_by)::text = 'start_date' AND sqlc.arg(sort_order)::text = 'asc' THEN c.start_date END ASC,
  CASE WHEN sqlc.arg(sort_by)::text = 'start_date' AND sqlc.arg(sort_order)::text = 'desc' THEN c.start_date END DESC,
  CASE WHEN sqlc.arg(sort_by)::text = 'created_at' AND sqlc.arg(sort_order)::text = 'asc' THEN c.created_at END ASC,
  CASE WHEN sqlc.arg(sort_by)::text = 'created_at' AND sqlc.arg(sort_order)::text = 'desc' THEN c.created_at END DESC,
  c.id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountAdminClasses :one
SELECT COUNT(*) FROM (
SELECT c.id
FROM classes c
LEFT JOIN class_enrollments ce ON ce.class_id = c.id
WHERE (
  sqlc.arg(search)::text = ''
  OR c.class_code ILIKE '%' || sqlc.arg(search) || '%'
  OR c.name ILIKE '%' || sqlc.arg(search) || '%'
)
AND (
  sqlc.arg(status)::text = ''
  OR c.status::text = sqlc.arg(status)::text
)
AND (
  sqlc.narg(course_id)::uuid IS NULL
  OR c.course_id = sqlc.narg(course_id)::uuid
)
AND (
  sqlc.narg(teacher_id)::uuid IS NULL
  OR EXISTS (
    SELECT 1 FROM teacher_assignments ta
    WHERE ta.class_id = c.id AND ta.teacher_id = sqlc.narg(teacher_id)::uuid
      AND EXISTS (SELECT 1 FROM teacher_assignment_periods tap WHERE tap.assignment_id = ta.id AND tap.ended_at IS NULL)
  )
)
AND (sqlc.narg(from_date)::date IS NULL OR c.end_date >= sqlc.narg(from_date)::date)
AND (sqlc.narg(to_date)::date IS NULL OR c.start_date <= sqlc.narg(to_date)::date)
AND (
  sqlc.narg(upcoming_only)::boolean IS NULL
  OR sqlc.narg(upcoming_only)::boolean = FALSE
  OR c.start_date > CURRENT_DATE
)
AND (
  sqlc.narg(sale_user_id)::uuid IS NULL
  OR EXISTS (
    SELECT 1 FROM class_enrollments ce2
    JOIN leads l ON l.converted_student_id = ce2.student_id
    WHERE ce2.class_id = c.id
      AND (l.assigned_to = sqlc.narg(sale_user_id)::uuid OR l.created_by = sqlc.narg(sale_user_id)::uuid)
      AND l.deleted_at IS NULL
  )
)
GROUP BY c.id
HAVING (
  sqlc.arg(capacity)::text = ''
  OR (sqlc.arg(capacity)::text = 'available' AND COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled') < c.maximum_students)
  OR (sqlc.arg(capacity)::text = 'full' AND COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled') >= c.maximum_students)
)
) filtered_classes;

-- name: ListTeacherClasses :many
SELECT
  c.id, c.course_id, co.code AS course_code, co.name AS course_name,
  c.class_code, c.name, c.start_date, c.end_date, c.maximum_students, c.status,
  COUNT(ce.id) FILTER (WHERE ce.status = 'enrolled')::int AS enrolled_students,
  c.created_at, c.updated_at
FROM classes c
JOIN courses co ON co.id = c.course_id
JOIN teacher_assignments ta ON ta.class_id = c.id
JOIN teacher_profiles tp ON tp.id = ta.teacher_id
LEFT JOIN class_enrollments ce ON ce.class_id = c.id
WHERE tp.user_id = $1
  AND EXISTS (
    SELECT 1 FROM teacher_assignment_periods tap
    WHERE tap.assignment_id = ta.id AND tap.ended_at IS NULL
  )
GROUP BY c.id, co.code, co.name
ORDER BY c.start_date DESC, c.class_code;

-- name: UpdateClass :one
UPDATE classes
SET
  course_id = $2,
  class_code = $3,
  name = $4,
  start_date = $5,
  end_date = $6,
  maximum_students = $7,
  status = $8
WHERE id = $1
RETURNING id, course_id, class_code, name, start_date, end_date,
  maximum_students, status, created_at, updated_at;

-- name: CreateClassEnrollment :one
INSERT INTO class_enrollments (class_id, student_id, created_by)
VALUES ($1, $2, $3)
RETURNING id, class_id, student_id, status, enrolled_at, ended_at,
  created_by, created_at, updated_at;

-- name: GetEnrollmentByClassStudent :one
SELECT id
FROM class_enrollments
WHERE class_id = $1 AND student_id = $2;

-- name: GetClassEnrollment :one
SELECT
  ce.id, ce.class_id, ce.student_id, sp.student_code, sp.full_name,
  ce.status, ce.enrolled_at, ce.ended_at, ce.created_by,
  ce.created_at, ce.updated_at
FROM class_enrollments ce
JOIN student_profiles sp ON sp.id = ce.student_id
WHERE ce.id = $1 AND ce.class_id = $2;

-- name: GetClassEnrollmentForUpdate :one
SELECT
  ce.id, ce.class_id, ce.student_id, sp.student_code, sp.full_name,
  ce.status, ce.enrolled_at, ce.ended_at, ce.created_by,
  ce.created_at, ce.updated_at
FROM class_enrollments ce
JOIN student_profiles sp ON sp.id = ce.student_id
WHERE ce.id = $1 AND ce.class_id = $2
FOR UPDATE OF ce;

-- name: ListClassEnrollments :many
SELECT
  ce.id, ce.class_id, ce.student_id, sp.student_code, sp.full_name,
  ce.status, ce.enrolled_at, ce.ended_at, ce.created_by,
  ce.created_at, ce.updated_at
FROM class_enrollments ce
JOIN student_profiles sp ON sp.id = ce.student_id
WHERE ce.class_id = $1
AND (
  sqlc.narg(sale_user_id)::uuid IS NULL
  OR EXISTS (
    SELECT 1 FROM leads l
    WHERE l.converted_student_id = ce.student_id
      AND (l.assigned_to = sqlc.narg(sale_user_id)::uuid OR l.created_by = sqlc.narg(sale_user_id)::uuid)
      AND l.deleted_at IS NULL
  )
)
ORDER BY ce.enrolled_at DESC, ce.id;

-- name: UpdateClassEnrollmentStatus :one
UPDATE class_enrollments
SET
  status = $3,
  ended_at = CASE WHEN $3 = 'enrolled'::enrollment_status THEN NULL ELSE NOW() END
WHERE id = $1 AND class_id = $2
RETURNING id, class_id, student_id, status, enrolled_at, ended_at,
  created_by, created_at, updated_at;

-- name: EndClassEnrollmentAt :one
UPDATE class_enrollments
SET status = $3, ended_at = $4
WHERE id = $1 AND class_id = $2
RETURNING id, class_id, student_id, status, enrolled_at, ended_at,
  created_by, created_at, updated_at;

-- name: ReopenClassEnrollment :one
UPDATE class_enrollments
SET status = 'enrolled', ended_at = NULL
WHERE id = $1 AND class_id = $2
RETURNING id, class_id, student_id, status, enrolled_at, ended_at,
  created_by, created_at, updated_at;

-- name: LockStudentForEnrollment :one
SELECT id
FROM student_profiles
WHERE id = $1
FOR UPDATE;

-- name: CreateEnrollmentPeriod :one
INSERT INTO class_enrollment_periods (
  enrollment_id, started_at, created_by, start_reason
)
VALUES ($1, $2, $3, $4)
RETURNING id, enrollment_id, started_at, ended_at, created_by, ended_by,
  start_reason, end_reason, created_at;

-- name: CloseOpenEnrollmentPeriod :one
UPDATE class_enrollment_periods
SET ended_at = $2, ended_by = $3, end_reason = $4
WHERE enrollment_id = $1
  AND ended_at IS NULL
  AND started_at <= $2
RETURNING id, enrollment_id, started_at, ended_at, created_by, ended_by,
  start_reason, end_reason, created_at;

-- name: GetLatestEnrollmentPeriod :one
SELECT id, enrollment_id, started_at, ended_at, created_by, ended_by,
  start_reason, end_reason, created_at
FROM class_enrollment_periods
WHERE enrollment_id = $1
ORDER BY started_at DESC, id DESC
LIMIT 1;

-- name: HasOtherActiveEnrollmentForCourse :one
SELECT EXISTS(
  SELECT 1
  FROM class_enrollments ce
  JOIN classes c ON c.id = ce.class_id
  WHERE ce.student_id = sqlc.arg(student_id)
    AND c.course_id = sqlc.arg(course_id)
    AND ce.status = 'enrolled'
    AND ce.id <> sqlc.arg(enrollment_id)
);

-- name: CreateTeacherAssignment :one
INSERT INTO teacher_assignments (
  class_id, teacher_id, assignment_role, assigned_by
)
VALUES ($1, $2, $3, $4)
RETURNING id, class_id, teacher_id, assignment_role, assigned_at,
  assigned_by, created_at, updated_at;

-- name: GetTeacherAssignment :one
SELECT
  ta.id, ta.class_id, ta.teacher_id, tp.teacher_code, tp.full_name,
  ta.assignment_role, ta.assigned_at, ta.assigned_by,
  ta.created_at, ta.updated_at
FROM teacher_assignments ta
JOIN teacher_profiles tp ON tp.id = ta.teacher_id
WHERE ta.id = $1 AND ta.class_id = $2
  AND EXISTS (
    SELECT 1 FROM teacher_assignment_periods tap
    WHERE tap.assignment_id = ta.id AND tap.ended_at IS NULL
  );

-- name: ListTeacherAssignments :many
SELECT
  ta.id, ta.class_id, ta.teacher_id, tp.teacher_code, tp.full_name,
  ta.assignment_role, ta.assigned_at, ta.assigned_by,
  ta.created_at, ta.updated_at
FROM teacher_assignments ta
JOIN teacher_profiles tp ON tp.id = ta.teacher_id
WHERE ta.class_id = $1
  AND EXISTS (
    SELECT 1 FROM teacher_assignment_periods tap
    WHERE tap.assignment_id = ta.id AND tap.ended_at IS NULL
  )
ORDER BY ta.assigned_at, ta.id;

-- name: GetTeacherAssignmentByPair :one
SELECT id, class_id, teacher_id, assignment_role, assigned_at,
  assigned_by, created_at, updated_at
FROM teacher_assignments
WHERE class_id = $1 AND teacher_id = $2
FOR UPDATE;

-- name: HasOpenTeacherAssignmentPeriod :one
SELECT EXISTS (
  SELECT 1 FROM teacher_assignment_periods
  WHERE assignment_id = $1 AND ended_at IS NULL
);

-- name: CreateTeacherAssignmentPeriod :one
INSERT INTO teacher_assignment_periods (
  assignment_id, started_at, created_by, start_reason
)
VALUES ($1, $2, $3, $4)
RETURNING id, assignment_id, started_at, ended_at, created_by,
  ended_by, start_reason, end_reason, created_at;

-- name: EndTeacherAssignmentPeriod :one
UPDATE teacher_assignment_periods
SET ended_at = $2, ended_by = $3, end_reason = $4
WHERE assignment_id = $1 AND ended_at IS NULL
RETURNING id, assignment_id, started_at, ended_at, created_by,
  ended_by, start_reason, end_reason, created_at;

-- name: ListTeacherAssignmentPeriods :many
SELECT id, assignment_id, started_at, ended_at, created_by,
  ended_by, start_reason, end_reason, created_at
FROM teacher_assignment_periods
WHERE assignment_id = $1
ORDER BY started_at DESC, id DESC;

-- name: ReopenTeacherAssignment :one
UPDATE teacher_assignments
SET assignment_role = $2, assigned_at = $3, assigned_by = $4
WHERE id = $1
RETURNING id, class_id, teacher_id, assignment_role, assigned_at,
  assigned_by, created_at, updated_at;

-- name: CheckTeacherAssignmentHasUpcomingSessions :one
SELECT EXISTS (
  SELECT 1 FROM class_sessions
  WHERE class_id = $1 AND teacher_id = $2
    AND status <> 'cancelled'
    AND ends_at > NOW()
);

-- name: UpdateTeacherAssignment :one
UPDATE teacher_assignments
SET assignment_role = $3
WHERE id = $1 AND class_id = $2
RETURNING id, class_id, teacher_id, assignment_role, assigned_at,
  assigned_by, created_at, updated_at;

-- name: CreateClassOperationEvent :one
INSERT INTO class_operation_history (
  class_id, event_type, entity_type, entity_id, reason, details, actor_user_id
)
VALUES (
  sqlc.arg(class_id),
  sqlc.arg(event_type),
  sqlc.arg(entity_type),
  sqlc.narg(entity_id),
  sqlc.narg(reason),
  COALESCE(NULLIF(sqlc.narg(details)::text, '')::jsonb, '{}'::jsonb),
  sqlc.narg(actor_user_id)
)
RETURNING id, class_id, event_type, entity_type, entity_id, reason,
  details, actor_user_id, occurred_at;

-- name: ListClassOperationHistory :many
SELECT
  coh.id, coh.class_id, coh.event_type, coh.entity_type, coh.entity_id,
  coh.reason, coh.details, coh.actor_user_id, u.email AS actor_email,
  coh.occurred_at
FROM class_operation_history coh
LEFT JOIN users u ON u.id = coh.actor_user_id
WHERE coh.class_id = $1
ORDER BY coh.occurred_at DESC, coh.id DESC;
