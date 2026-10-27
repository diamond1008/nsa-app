export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface Student {
  id: string;
  email: string;
  account_status: string;
  student_code: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  status: string;
  enrolled_at?: string | null;
}

export interface StudentStatusHistory {
  id: string;
  student_id: string;
  from_status?: string | null;
  to_status: string;
  reason: string;
  changed_by?: string | null;
  changed_by_email?: string | null;
  changed_at: string;
}

export interface Teacher {
  id: string;
  email: string;
  account_status: string;
  teacher_code: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  specialization?: string | null;
  status: string;
}

export interface StudentProfileSummary {
  profile: Student;
  current_classes: number;
  total_classes: number;
  attendance_risk_classes: number;
  upcoming_sessions: number;
}

export interface TeacherProfileSummary {
  profile: Teacher;
  current_classes: number;
  total_classes: number;
  completed_sessions: number;
  upcoming_sessions: number;
}

export interface PersonClassPeriod {
  id: string;
  started_at: string;
  ended_at?: string | null;
  start_reason?: string | null;
  end_reason?: string | null;
}

export interface StudentClassHistory {
  enrollment_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  enrollment_status: string;
  enrolled_at: string;
  ended_at?: string | null;
  periods: PersonClassPeriod[];
}

export interface TeacherClassHistory {
  assignment_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  assignment_role: string;
  assigned_at: string;
  is_current: boolean;
  periods: PersonClassPeriod[];
}

export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  total_sessions: number;
  minimum_attendance_pct: number;
  status: string;
}

export interface TrainingClass {
  id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  class_code: string;
  name: string;
  start_date: string;
  end_date: string;
  maximum_students: number;
  enrolled_students: number;
  status: string;
}

export interface Enrollment {
  id: string;
  class_id: string;
  student_id: string;
  student_code: string;
  full_name: string;
  status: string;
  enrolled_at: string;
  ended_at?: string | null;
}

export interface EnrollmentTransfer {
  source: Enrollment;
  target: Enrollment;
}

export interface ClassOperationHistory {
  id: string;
  class_id: string;
  event_type: string;
  entity_type: string;
  entity_id?: string | null;
  reason?: string | null;
  details: Record<string, unknown>;
  actor_user_id?: string | null;
  actor_email?: string | null;
  occurred_at: string;
}

export interface TeacherAssignment {
  id: string;
  class_id: string;
  teacher_id: string;
  teacher_code: string;
  full_name: string;
  assignment_role: string;
  assigned_at: string;
}

export interface CompetencyCriterion {
  id: string;
  course_id: string;
  module_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  is_required: boolean;
  sequence_no: number;
}

export interface TeacherClassDetail {
  class: TrainingClass;
  students: Enrollment[];
  competencies: CompetencyCriterion[];
}

export interface TrainingLocation {
  id: string;
  code: string;
  name: string;
  location_type: string;
  capacity?: number | null;
  is_active: boolean;
}

export type SessionType = "theory" | "workshop" | "assessment" | "other";
export type SessionStatus = "scheduled" | "completed" | "cancelled" | "locked";

export interface ClassSession {
  id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  module_id?: string | null;
  teacher_id?: string | null;
  teacher_code?: string | null;
  teacher_name?: string | null;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  title: string;
  session_type: SessionType;
  starts_at: string;
  ends_at: string;
  status: SessionStatus;
  attendance_locked_at?: string | null;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceRosterItem {
  student_id: string;
  student_code: string;
  full_name: string;
  avatar_url?: string | null;
  enrollment_status: string;
  attendance_id?: string | null;
  attendance_status?: AttendanceStatus | null;
  note?: string | null;
  recorded_by?: string | null;
  recorded_by_email?: string | null;
  recorded_at?: string | null;
  updated_at?: string | null;
}

export interface SessionAttendance {
  session: ClassSession;
  items: AttendanceRosterItem[];
  summary: {
    total: number;
    recorded: number;
    unrecorded: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

export interface AttendanceRecord {
  id: string;
  class_session_id: string;
  class_id: string;
  student_id: string;
  student_code?: string;
  full_name?: string;
  status: AttendanceStatus;
  note?: string | null;
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}

export interface StudentAttendanceHistoryItem {
  id: string;
  class_session_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  course_code: string;
  course_name: string;
  session_title: string;
  starts_at: string;
  ends_at: string;
  status: AttendanceStatus;
  note?: string | null;
}

export interface StudentAttendanceSummary {
  class_id: string;
  class_code: string;
  class_name: string;
  course_code: string;
  course_name: string;
  recorded_sessions: number;
  present_sessions: number;
  absent_sessions: number;
  late_sessions: number;
  excused_sessions: number;
  attendance_pct: number;
  minimum_attendance_pct: number;
  is_at_risk: boolean;
}

export type CompetencyRating =
  "not_assessed" | "needs_improvement" | "competent" | "good" | "excellent";

export interface AssessmentItem {
  id: string;
  competency_criterion_id: string;
  criterion_code: string;
  criterion_name: string;
  is_required: boolean;
  sequence_no: number;
  rating: CompetencyRating;
  comment?: string | null;
}

export interface StudentAssessment {
  id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  course_code: string;
  course_name: string;
  student_id: string;
  student_code: string;
  student_name: string;
  teacher_code: string;
  teacher_name: string;
  session_id?: string | null;
  session_title?: string | null;
  assessment_no: number;
  status: string;
  overall_comment?: string | null;
  evidence_url?: string | null;
  submitted_at?: string | null;
  locked_at?: string | null;
  items: AssessmentItem[];
}

export interface StudentProgress {
  class_id: string;
  class_code: string;
  class_name: string;
  class_status: string;
  enrollment_status: string;
  course_code: string;
  course_name: string;
  course_id: string;
  sessions: { completed: number; required: number; percent: number };
  attendance: {
    records: number;
    attended: number;
    excused: number;
    percent: number;
    minimum_required_pct: number;
    requirement_met: boolean;
  };
  competencies: { met: number; required: number; percent: number; requirement_met: boolean };
  assessments: { completed: number; required: number; percent: number; requirement_met: boolean };
  tests: { passed: number; required: number; percent: number; requirement_met: boolean };
  final_exam: { score?: number | null; required_score: number; requirement_met: boolean };
  failure_reasons: string[];
  overall_progress_pct: number;
  completion_status: string;
}

export interface ProgressDashboard {
  items: StudentProgress[];
  summary: { classes: number; eligible_classes: number; average_progress_pct: number };
}

export interface CompletionCandidate {
  class_id: string;
  class_code: string;
  class_name: string;
  student_id: string;
  student_code: string;
  student_name: string;
  course_code: string;
  course_name: string;
  completed_sessions: number;
  total_sessions: number;
  attendance_pct: number;
  minimum_attendance_pct: number;
  required_competencies_met: number;
  required_competencies_total: number;
  completed_assessments: number;
  required_assessments: number;
  required_tests_passed: number;
  required_tests_total: number;
  final_exam_score?: number | null;
  final_exam_passed: boolean;
  failure_reasons: string[];
  current_certificate_id?: string | null;
  current_certificate_number?: string | null;
  current_diploma_file_url?: string | null;
  current_diploma_file_name?: string | null;
  is_eligible: boolean;
  status: string;
  review_note?: string | null;
  reviewed_at?: string | null;
}

export type CourseTestKind = "class_test" | "final_exam";

export interface CourseTest {
  id: string;
  course_id: string;
  code: string;
  title: string;
  kind: CourseTestKind;
  pass_score: number;
  is_required: boolean;
  sequence_no: number;
  is_active: boolean;
}

export interface TestAttempt {
  id: string;
  test_id: string;
  class_id: string;
  class_code: string;
  test_code: string;
  test_title: string;
  kind: CourseTestKind;
  attempt_no: number;
  score: number;
  pass_score: number;
  passed: boolean;
  is_required: boolean;
  note?: string | null;
  recorded_by_email: string;
  taken_at: string;
}

export interface TestRetakePermit {
  id: string;
  test_id: string;
  target_attempt_no: number;
  granted_by_email: string;
  reason: string;
  granted_at: string;
}

export interface TestResult {
  test: CourseTest;
  attempts: TestAttempt[];
  passed: boolean;
  best_score?: number | null;
  next_attempt_no?: number;
  retake_permitted?: boolean;
  retake_permits?: TestRetakePermit[];
}

export interface CourseTestResults {
  course_id: string;
  course_code: string;
  course_name: string;
  student_id: string;
  tests: TestResult[];
}

export interface Certificate {
  id: string;
  completion_id: string;
  certificate_number: string;
  verification_code: string;
  class_code: string;
  class_name: string;
  course_code: string;
  course_name: string;
  student_code: string;
  student_name: string;
  issued_at: string;
  is_current: boolean;
  revoked_at?: string | null;
  revoke_reason?: string | null;
  diploma_file_url?: string | null;
  diploma_file_name?: string | null;
  diploma_uploaded_at?: string | null;
}

export interface CompletionDecisionResult {
  candidate: CompletionCandidate;
  certificate?: Certificate | null;
}

export interface ReportSummary {
  active_students: number;
  open_classes: number;
  upcoming_sessions: number;
  at_risk_students: number;
  approved_completions: number;
  pending_notifications: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  status: string;
  action_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationList {
  items: NotificationItem[];
  meta: PaginationMeta;
  unread: number;
}

export interface PersonAttendanceBreakdown {
  class_id: string;
  class_code: string;
  class_name: string;
  course_name: string;
  minimum_attendance_pct: number;
  total_sessions: number;
  recorded_sessions: number;
  attended_sessions: number;
  absent_sessions: number;
  attendance_pct: number;
  at_risk: boolean;
}

export interface PersonAcademicSummary {
  test_id: string;
  test_title: string;
  pass_score: number;
  class_id: string;
  class_name: string;
  course_id: string;
  course_name: string;
  score: number;
  graded_at: string;
  passed: boolean;
}

export interface PersonWorkloadSummary {
  class_id: string;
  class_code: string;
  class_name: string;
  course_name: string;
  completed_sessions: number;
  recorded_rollcall_sessions: number;
  punctuality_pct: number;
}

export interface AuditLogItem {
  id: number;
  actor_user_id: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: string;
  new_values: string;
  reason?: string | null;
  created_at: string;
}

export interface ClassSessionAttendanceItem {
  session_id: string;
  starts_at: string;
  ends_at: string;
  session_title: string;
  session_status: string;
  location_name: string;
  teacher_name: string;
  attendance_status: string;
  remarks: string;
}

// ---------------------------------------------------------------------------
// Sale CRM Domain Types (Phase 26)
// ---------------------------------------------------------------------------

export type LeadSource =
  | "facebook"
  | "tiktok"
  | "google"
  | "zalo"
  | "website"
  | "referral"
  | "walk_in"
  | "event"
  | "other";

export type LeadPipelineStatus =
  | "data_moi"
  | "knm_thue_bao"
  | "goi_lai_sau"
  | "follow"
  | "tu_choi"
  | "da_dang_ky"
  | "dang_hoc"
  | "ket_thuc";

export type InteractionChannel =
  "phone_call" | "zalo" | "facebook" | "email" | "in_person" | "sms" | "other";

export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";

export interface Lead {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  source: LeadSource;
  source_detail?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  interested_course_id?: string | null;
  interested_course_code?: string | null;
  interested_course_name?: string | null;
  notes?: string | null;
  pipeline_status: LeadPipelineStatus;
  assigned_to?: string | null;
  assigned_to_email?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  assigned_by_email?: string | null;
  converted_student_id?: string | null;
  converted_student_code?: string | null;
  converted_student_name?: string | null;
  converted_student_status?: string | null;
  converted_at?: string | null;
  converted_by?: string | null;
  created_by: string;
  created_by_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadInteraction {
  id: string;
  lead_id: string;
  channel: InteractionChannel;
  summary: string;
  outcome?: string | null;
  created_by: string;
  created_by_email?: string | null;
  created_at: string;
}

export interface LeadPipelineHistory {
  id: string;
  lead_id: string;
  old_status?: LeadPipelineStatus | null;
  new_status: LeadPipelineStatus;
  reason?: string | null;
  changed_by: string;
  changed_by_email?: string | null;
  changed_at: string;
}

export interface LeadTask {
  id: string;
  lead_id: string;
  lead_name?: string;
  lead_phone?: string;
  assigned_to: string;
  assigned_to_email?: string;
  title: string;
  description?: string | null;
  due_at: string;
  completed_at?: string | null;
  created_by: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_code: string;
  lead_id?: string | null;
  lead_name?: string | null;
  student_id?: string | null;
  student_code?: string | null;
  student_name?: string | null;
  course_id?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  class_id?: string | null;
  class_code?: string | null;
  class_name?: string | null;
  amount: number;
  discount_amount: number;
  final_amount: number;
  discount_note?: string | null;
  status: OrderStatus;
  payment_method?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  created_by: string;
  created_by_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleStaff {
  id: string;
  email: string;
}

export interface SaleDashboardStats {
  assigned_leads: number;
  new_leads_today: number;
  overdue_tasks: number;
  today_tasks: number;
  converted_this_month: number;
  total_this_month: number;
  conversion_rate: number;
  month_revenue?: number;
  team_month_revenue?: number;
}

export interface AssigneeStat {
  user_id: string;
  email: string;
  total_leads: number;
  converted_leads: number;
  month_revenue?: number;
}

export interface ActionAlerts {
  unassigned_leads: number;
  overdue_tasks: number;
  pending_orders: number;
}

export interface DailyLeadTrendPoint {
  day: string;
  total_leads: number;
  converted_leads: number;
}

export interface DailyRevenueTrendPoint {
  day: string;
  paid_orders: number;
  revenue: number;
}

export interface TopCourseStat {
  course_id: string;
  course_code: string;
  course_name: string;
  total_orders: number;
  paid_orders: number;
  revenue: number;
}
export interface DashboardOverview {
  alerts?: ActionAlerts;
  daily_lead_trend?: DailyLeadTrendPoint[];
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  by_assignee: AssigneeStat[];
}

export interface RevenueReport {
  summary: {
    month_revenue: number;
    total_revenue: number;
    month_orders: number;
    month_paid_orders: number;
  };
  by_month: Array<{
    month: string;
    total_orders: number;
    paid_orders: number;
    total_revenue: number;
  }>;
  by_week?: Array<{
    week: string;
    total_orders: number;
    paid_orders: number;
    total_revenue: number;
  }>;
  by_year?: Array<{
    year: string;
    total_orders: number;
    paid_orders: number;
    total_revenue: number;
  }>;
  by_source: Array<{
    source: string;
    total_orders: number;
    revenue: number;
  }>;
  daily_revenue_trend?: DailyRevenueTrendPoint[];
  top_courses?: TopCourseStat[];
}

export interface ConvertResult {
  student_id: string;
  student_code: string;
  order_id: string;
  order_code: string;
  initial_password?: string;
}
