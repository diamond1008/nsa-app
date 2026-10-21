import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { currentWeekStart, monthRange, WeekCalendar, weekRange } from "../../components/calendar";
import type { CalendarStat, CalendarView, WeekCalendarEvent } from "../../components/calendar";
import { QueryState, StatusBadge } from "../../components/data";
import { Icon } from "../../components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";
import type {
  Paginated,
  PersonClassPeriod,
  Student,
  StudentClassHistory,
  StudentProfileSummary,
  TeacherClassHistory,
  TeacherProfileSummary,
  Teacher,
} from "../../lib/domainTypes";
import { formatDate, formatDateTime, mutationMessage, statusLabel } from "../../lib/format";
import { useOptionalAuth } from "../auth/AuthContext";
import { adminApi } from "./adminApi";
import { PersonAvatar } from "./PersonIdentity";

type PersonKind = "student" | "teacher";
type ProfileTab =
  "overview" | "classes" | "schedule" | "attendance" | "academic" | "workload" | "audit";
type ProfileSummary = StudentProfileSummary | TeacherProfileSummary;
type ClassHistory = StudentClassHistory | TeacherClassHistory;

const getTabs = (
  isStudent: boolean,
  isReadOnly?: boolean,
): Array<{ value: ProfileTab; label: string }> => [
  { value: "overview", label: "Tổng quan" },
  { value: "classes", label: "Lớp hiện tại & lịch sử" },
  { value: "schedule", label: "Lịch cá nhân" },
  ...(isStudent
    ? ([
        { value: "attendance", label: "Chuyên cần & Cảnh báo" },
        { value: "academic", label: "Kết quả kiểm tra" },
      ] as const)
    : ([{ value: "workload", label: "Tải giảng dạy & Điểm danh" }] as const)),
  ...(!isReadOnly ? ([{ value: "audit", label: "Nhật ký tác vụ (Audit)" }] as const) : []),
];

function isStudentSummary(summary: ProfileSummary): summary is StudentProfileSummary {
  return "attendance_risk_classes" in summary;
}

function isStudentHistory(item: ClassHistory): item is StudentClassHistory {
  return "enrollment_id" in item;
}

function periodLabel(period: PersonClassPeriod) {
  const end = period.ended_at ? formatDate(period.ended_at) : "Hiện tại";
  return `${formatDate(period.started_at)} – ${end}`;
}

function metricCards(summary: ProfileSummary) {
  if (isStudentSummary(summary)) {
    return [
      ["Lớp đang học", summary.current_classes],
      ["Tổng lớp đã tham gia", summary.total_classes],
      ["Lớp có nguy cơ chuyên cần", summary.attendance_risk_classes],
      ["Buổi học sắp tới", summary.upcoming_sessions],
    ] as const;
  }
  return [
    ["Lớp đang phụ trách", summary.current_classes],
    ["Tổng lớp đã phụ trách", summary.total_classes],
    ["Buổi đã giảng dạy", summary.completed_sessions],
    ["Buổi dạy sắp tới", summary.upcoming_sessions],
  ] as const;
}

export function PersonProfilePage({
  kind,
  readOnly = false,
}: {
  kind: PersonKind;
  readOnly?: boolean;
}) {
  const { personId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useOptionalAuth();
  const isStudent = kind === "student";
  const isReadOnly = Boolean(
    readOnly ||
      (auth?.user &&
        !auth.hasRole("ADMIN", "ACADEMIC_ADMIN") &&
        auth.hasRole("SALE", "SALE_ADMIN")),
  );
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const range = calendarView === "week" ? weekRange(weekStart) : monthRange(weekStart);

  const summaryQuery = useQuery<ProfileSummary>({
    queryKey: ["admin", kind, personId, "profile-summary"],
    queryFn: async () =>
      isStudent
        ? await adminApi.studentProfileSummary(personId)
        : await adminApi.teacherProfileSummary(personId),
    enabled: Boolean(personId),
  });
  const historyQuery = useQuery<Paginated<ClassHistory>>({
    queryKey: ["admin", kind, personId, "class-history"],
    queryFn: async () =>
      isStudent
        ? await adminApi.studentClassHistory(personId, { page: 1, per_page: 50 })
        : await adminApi.teacherClassHistory(personId, { page: 1, per_page: 50 }),
    enabled: Boolean(personId),
  });
  const scheduleQuery = useQuery({
    queryKey: ["admin", kind, personId, "personal-schedule", range.from, range.to],
    queryFn: () =>
      isStudent
        ? adminApi.studentSchedule(personId, {
            page: 1,
            per_page: 100,
            from: range.from,
            to: range.to,
          })
        : adminApi.sessions({
            teacher_id: personId,
            page: 1,
            per_page: 100,
            from: range.from,
            to: range.to,
          }),
    enabled: Boolean(personId),
  });

  const profile = summaryQuery.data?.profile;
  const summary = summaryQuery.data;
  const history = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data?.items]);

  const currentClasses = useMemo(
    () =>
      history.filter((item) =>
        isStudentHistory(item) ? item.periods.some((period) => !period.ended_at) : item.is_current,
      ),
    [history],
  );

  const events = useMemo<WeekCalendarEvent[]>(
    () =>
      (scheduleQuery.data?.items ?? []).map((session) => ({
        id: session.id,
        title: `${session.class_code} · ${session.title}`,
        subtitle: [session.teacher_name, session.location_name].filter(Boolean).join(" · "),
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        tone:
          session.status === "cancelled"
            ? "red"
            : session.status === "completed" || session.status === "locked"
              ? "green"
              : session.session_type === "assessment"
                ? "gold"
                : "navy",
      })),
    [scheduleQuery.data?.items],
  );
  const scheduleStats = useMemo<CalendarStat[]>(
    () => [
      {
        label: "Sắp diễn ra",
        value: (scheduleQuery.data?.items ?? []).filter((item) => item.status === "scheduled")
          .length,
        tone: "navy",
      },
      {
        label: "Đã diễn ra",
        value: (scheduleQuery.data?.items ?? []).filter((item) =>
          ["completed", "locked"].includes(item.status),
        ).length,
        tone: "green",
      },
      {
        label: "Đã hủy",
        value: (scheduleQuery.data?.items ?? []).filter((item) => item.status === "cancelled")
          .length,
        tone: "red",
      },
    ],
    [scheduleQuery.data?.items],
  );

  return (
    <QueryState loading={summaryQuery.isLoading} error={summaryQuery.error}>
      {profile && summary ? (
        <div>
          <PageHeader
            eyebrow="Hồ sơ 360°"
            title={profile.full_name}
            subtitle={`Theo dõi hồ sơ, lớp học và lịch ${isStudent ? "học" : "dạy"} trên một màn hình.`}
            actions={
              isReadOnly ? (
                <>
                  <Link
                    to="/sale/hoc-vien"
                    className="inline-flex h-10 items-center rounded-xl border border-gborder bg-white px-4 text-sm font-semibold text-navy hover:bg-gbg2"
                  >
                    Quay lại danh sách
                  </Link>
                  <Link
                    to={`/sale/phieu-dang-ky?student_id=${profile.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 shadow-xs"
                  >
                    <Icon name="shopping-bag" className="h-4 w-4" />
                    Phiếu đăng ký
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to={isStudent ? "/admin/hoc-vien" : "/admin/giang-vien"}
                    className="inline-flex h-10 items-center rounded-xl border border-gborder bg-white px-4 text-sm font-semibold text-navy hover:bg-gbg2"
                  >
                    Quay lại danh sách
                  </Link>
                  <Button variant="ghost" onClick={() => setStatusModalOpen(true)}>
                    Khóa / Mở tài khoản
                  </Button>
                  <Link
                    to={`${isStudent ? "/admin/hoc-vien" : "/admin/giang-vien"}?edit=${profile.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-soft"
                  >
                    <Icon name="info" className="h-4 w-4" />
                    Chỉnh sửa hồ sơ
                  </Link>
                </>
              )
            }
          />

          <Card className="mb-5 p-5 md:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
              <div className="shrink-0 [&_div]:h-20 [&_div]:w-20 [&_div]:text-xl [&_img]:h-20 [&_img]:w-20">
                <PersonAvatar fullName={profile.full_name} avatarUrl={profile.avatar_url} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-navy-dark">
                    {isStudent
                      ? (profile as Student).student_code
                      : (profile as Teacher).teacher_code}
                  </h2>
                  <StatusBadge value={profile.status} />
                  <Badge tone={profile.account_status === "active" ? "green" : "gray"}>
                    Tài khoản {statusLabel(profile.account_status).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-gtext">{profile.email}</p>
                <p className="mt-1 text-sm text-gtext">
                  {profile.phone || "Chưa cập nhật số điện thoại"}
                </p>
              </div>
              <div className="grid w-full grid-cols-2 gap-3 xl:w-auto xl:grid-cols-4">
                {metricCards(summary).map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl bg-gbg2 p-3 xl:min-w-28">
                    <p className="text-xl font-bold text-navy-dark">{value}</p>
                    <p className="mt-1 text-xs leading-4 text-gtext">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div
            role="tablist"
            className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-gborder bg-white p-1"
          >
            {getTabs(isStudent, isReadOnly).map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  tab === item.value
                    ? "bg-navy text-white"
                    : "text-gtext hover:bg-gbg2 hover:text-navy"
                }`}
                onClick={() => setTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <OverviewTab kind={kind} summary={summary} currentClasses={currentClasses} readOnly={isReadOnly} />
          ) : null}
          {tab === "classes" ? (
            <ClassHistoryTab
              items={history}
              loading={historyQuery.isLoading}
              error={historyQuery.error}
              readOnly={isReadOnly}
            />
          ) : null}
          {tab === "schedule" ? (
            <QueryState loading={scheduleQuery.isLoading} error={scheduleQuery.error}>
              <WeekCalendar
                events={events}
                weekStart={weekStart}
                onWeekStartChange={setWeekStart}
                onEventClick={(event) => {
                  const session = scheduleQuery.data?.items.find((item) => item.id === event.id);
                  if (session) navigate(isReadOnly ? `/sale/lop-hoc/${session.class_id}` : `/admin/lop-hoc/${session.class_id}`);
                }}
                view={calendarView}
                onViewChange={setCalendarView}
                stats={scheduleStats}
              />
            </QueryState>
          ) : null}
          {tab === "attendance" && isStudent ? (
            <AttendanceBreakdownTab studentId={personId} readOnly={isReadOnly} />
          ) : null}
          {tab === "academic" && isStudent ? <AcademicSummaryTab studentId={personId} /> : null}
          {tab === "workload" && !isStudent ? <WorkloadSummaryTab teacherId={personId} readOnly={isReadOnly} /> : null}
          {tab === "audit" && !isReadOnly ? <AuditLogsTab kind={kind} personId={personId} /> : null}

          {statusModalOpen && !isReadOnly && (
            <AccountStatusModal
              open={statusModalOpen}
              kind={kind}
              personId={personId}
              currentStatus={profile.account_status}
              onClose={() => setStatusModalOpen(false)}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["admin", kind, personId] });
              }}
            />
          )}
        </div>
      ) : null}
    </QueryState>
  );
}

function OverviewTab({
  kind,
  summary,
  currentClasses,
  readOnly,
}: {
  kind: PersonKind;
  summary: ProfileSummary;
  currentClasses: ClassHistory[];
  readOnly?: boolean;
}) {
  const profile = summary.profile;
  const isStudent = kind === "student";
  const student = isStudent ? (profile as Student) : null;
  const teacher = !isStudent ? (profile as Teacher) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <Card>
        <h3 className="text-base font-bold text-navy-dark">Thông tin cốt lõi</h3>
        <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <ProfileField label="Họ và tên" value={profile.full_name} />
          <ProfileField label="Email" value={profile.email} />
          <ProfileField label="Điện thoại" value={profile.phone} />
          <ProfileField label="Trạng thái hồ sơ" value={statusLabel(profile.status)} />
          {isStudent ? (
            <>
              <ProfileField
                label="Ngày sinh"
                value={student?.date_of_birth ? formatDate(student.date_of_birth) : null}
              />
              <ProfileField
                label="Ngày tiếp nhận"
                value={student?.enrolled_at ? formatDate(student.enrolled_at) : null}
              />
              <ProfileField label="Giới tính" value={genderLabel(student?.gender)} />
              <ProfileField label="Địa chỉ" value={student?.address} />
              <ProfileField label="Liên hệ khẩn cấp" value={student?.emergency_contact_name} />
              <ProfileField label="SĐT khẩn cấp" value={student?.emergency_contact_phone} />
            </>
          ) : (
            <ProfileField label="Chuyên môn" value={teacher?.specialization} />
          )}
        </dl>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-navy-dark">
            {isStudent ? "Lớp đang học" : "Lớp đang phụ trách"}
          </h3>
          <Badge tone="gold">{currentClasses.length} lớp</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {currentClasses.length ? (
            currentClasses.map((item) => <ClassSummaryCard key={item.class_id} item={item} readOnly={readOnly} />)
          ) : (
            <EmptyState
              title="Chưa có lớp hiện tại"
              hint="Lịch sử lớp vẫn được lưu đầy đủ ở tab bên cạnh."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gtext">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-navy-dark">
        {value || "Chưa cập nhật"}
      </dd>
    </div>
  );
}

function genderLabel(value?: string | null) {
  return (
    {
      male: "Nam",
      female: "Nữ",
      other: "Khác",
      unspecified: "Chưa xác định",
    }[value ?? ""] ?? value
  );
}

function ClassSummaryCard({ item, readOnly }: { item: ClassHistory; readOnly?: boolean }) {
  return (
    <Link
      to={readOnly ? `/sale/lop-hoc/${item.class_id}` : `/admin/lop-hoc/${item.class_id}`}
      className="block rounded-xl border border-gborder p-4 transition hover:border-[#0532e6]/50 hover:bg-[#0532e6]/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-navy-dark">{item.class_code}</p>
          <p className="mt-1 text-sm text-gtext">{item.class_name}</p>
        </div>
        <Badge tone="gray">{item.course_code}</Badge>
      </div>
    </Link>
  );
}

function ClassHistoryTab({
  items,
  loading,
  error,
  readOnly,
}: {
  items: ClassHistory[];
  loading: boolean;
  error: unknown;
  readOnly?: boolean;
}) {
  return (
    <QueryState
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyTitle="Chưa có lịch sử lớp"
    >
      <div className="space-y-4">
        {items.map((item) => {
          const current = isStudentHistory(item)
            ? item.periods.some((period) => !period.ended_at)
            : item.is_current;
          return (
            <Card key={isStudentHistory(item) ? item.enrollment_id : item.assignment_id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={readOnly ? `/sale/lop-hoc/${item.class_id}` : `/admin/lop-hoc/${item.class_id}`}
                      className="text-base font-bold text-navy-dark hover:text-[#0532e6]"
                    >
                      {item.class_code} · {item.class_name}
                    </Link>
                    <Badge tone={current ? "green" : "gray"}>
                      {current ? "Hiện tại" : "Lịch sử"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-gtext">
                    {item.course_code} · {item.course_name}
                  </p>
                </div>
                {isStudentHistory(item) ? (
                  <StatusBadge value={item.enrollment_status} />
                ) : (
                  <Badge tone="gold">{item.assignment_role}</Badge>
                )}
              </div>
              <div className="mt-4 border-t border-gborder pt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gtext">
                  Các giai đoạn tham gia
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {item.periods.map((period) => (
                    <div key={period.id} className="rounded-xl bg-gbg2 px-3 py-2.5">
                      <p className="text-sm font-semibold text-navy-dark">{periodLabel(period)}</p>
                      {(period.end_reason || period.start_reason) && (
                        <p className="mt-1 text-xs leading-5 text-gtext">
                          {period.end_reason || period.start_reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gtext">
                  Bắt đầu ghi nhận:{" "}
                  {formatDateTime(isStudentHistory(item) ? item.enrolled_at : item.assigned_at)}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </QueryState>
  );
}

function AccountStatusModal({
  open,
  kind,
  personId,
  currentStatus,
  onClose,
  onSuccess,
}: {
  open: boolean;
  kind: PersonKind;
  personId: string;
  currentStatus: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [accountStatus, setAccountStatus] = useState(currentStatus || "active");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Vui lòng nhập lý do thay đổi trạng thái tài khoản");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await adminApi.updateAccountStatus(kind, personId, accountStatus, reason.trim());
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Không thể cập nhật trạng thái tài khoản";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="Cập nhật trạng thái tài khoản (Khóa/Mở)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Select
          label="Trạng thái tài khoản"
          value={accountStatus}
          onChange={(e) => setAccountStatus(e.target.value)}
        >
          <option value="active">Hoạt động (Active)</option>
          <option value="suspended">Tạm khóa (Suspended)</option>
          <option value="inactive">Tắt kích hoạt (Inactive)</option>
        </Select>
        <Textarea
          label="Lý do thay đổi (Bắt buộc - Ghi audit log)"
          placeholder="Nhập chi tiết lý do khóa / mở tài khoản..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={loading}>
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AttendanceBreakdownTab({ studentId, readOnly }: { studentId: string; readOnly?: boolean }) {
  const [selectedClass, setSelectedClass] = useState<{ id: string; name: string } | null>(null);

  const query = useQuery({
    queryKey: ["admin", "student", studentId, "attendance-breakdown"],
    queryFn: () => adminApi.studentAttendanceBreakdown(studentId),
  });

  return (
    <>
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && query.data?.length === 0}
        emptyTitle="Chưa có dữ liệu điểm danh"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.map((item) => (
            <Card key={item.class_id} className={item.at_risk ? "border-red-300 bg-red-50/20" : ""}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    to={readOnly ? `/sale/lop-hoc/${item.class_id}` : `/admin/lop-hoc/${item.class_id}`}
                    className="font-bold text-navy-dark hover:text-[#0532e6]"
                  >
                    {item.class_code} · {item.class_name}
                  </Link>
                  <p className="mt-1 text-xs text-gtext">{item.course_name}</p>
                </div>
                <Badge tone={item.at_risk ? "red" : "green"}>
                  {item.at_risk ? "Nguy cơ" : "An toàn"}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                <div className="rounded-lg border border-gborder bg-white p-2">
                  <p className="text-xs text-gtext">Số buổi có mặt</p>
                  <p className="font-bold text-navy-dark">
                    {item.attended_sessions} / {item.recorded_sessions}
                  </p>
                  <p className="text-[10px] text-gtext">(Tổng khóa: {item.total_sessions} buổi)</p>
                </div>
                <div className="rounded-lg border border-gborder bg-white p-2">
                  <p className="text-xs text-gtext">Tỷ lệ hiện tại</p>
                  <p className={`font-bold ${item.at_risk ? "text-red-600" : "text-emerald-600"}`}>
                    {item.attendance_pct.toFixed(1)}% (Cần {item.minimum_attendance_pct}%)
                  </p>
                  <p className="text-[10px] text-gtext">(Theo buổi đã diễn ra)</p>
                </div>
              </div>
              <div className="mt-4 border-t border-gborder pt-3 text-right">
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setSelectedClass({ id: item.class_id, name: item.class_name })}
                >
                  Xem chi tiết từng buổi
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </QueryState>

      {selectedClass && (
        <ClassAttendanceDetailModal
          open={Boolean(selectedClass)}
          studentId={studentId}
          classId={selectedClass.id}
          className={selectedClass.name}
          onClose={() => setSelectedClass(null)}
        />
      )}
    </>
  );
}

function ClassAttendanceDetailModal({
  open,
  studentId,
  classId,
  className,
  onClose,
}: {
  open: boolean;
  studentId: string;
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "student", studentId, "class", classId, "attendance"],
    queryFn: () => adminApi.studentClassAttendance(studentId, classId),
    enabled: open && Boolean(classId),
  });

  return (
    <Modal open={open} title={`Chi tiết điểm danh · ${className}`} onClose={onClose}>
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && query.data?.length === 0}
        emptyTitle="Chưa có buổi học nào trong lớp này"
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {query.data?.map((session) => {
            const status = session.attendance_status;

            let label = "Chưa điểm danh";
            let cardBg = "border border-gborder bg-gbg2 text-slate-700";
            let badgeClass = "bg-white/80 text-gtext border-slate-200";
            let titleClass = "text-navy-dark";
            let textClass = "text-gtext";
            let remarksClass = "text-navy-dark";

            if (status === "present") {
              label = "Có mặt";
              cardBg = "border-2 border-blue-400 bg-blue-100/90 shadow-xs";
              badgeClass = "bg-[#0532e6] text-white border-transparent font-bold shadow-xs";
              titleClass = "text-blue-950 font-bold";
              textClass = "text-blue-800 font-medium";
              remarksClass = "text-blue-950 font-medium";
            } else if (status === "late") {
              label = "Đến trễ";
              cardBg = "border-2 border-blue-400 bg-blue-100/90 shadow-xs";
              badgeClass = "bg-[#1e45ee] text-white border-transparent font-bold shadow-xs";
              titleClass = "text-blue-950 font-bold";
              textClass = "text-blue-800 font-medium";
              remarksClass = "text-blue-950 font-medium";
            } else if (status === "excused") {
              label = "Vắng có phép";
              cardBg = "border-2 border-red-400 bg-red-100/90 shadow-xs";
              badgeClass = "bg-red-600 text-white border-transparent font-bold shadow-xs";
              titleClass = "text-red-950 font-bold";
              textClass = "text-red-800 font-medium";
              remarksClass = "text-red-950 font-medium";
            } else if (status === "absent") {
              label = "Vắng không phép";
              cardBg = "border-2 border-red-400 bg-red-100/90 shadow-xs";
              badgeClass = "bg-red-600 text-white border-transparent font-bold shadow-xs";
              titleClass = "text-red-950 font-bold";
              textClass = "text-red-800 font-medium";
              remarksClass = "text-red-950 font-medium";
            }

            return (
              <div
                key={session.session_id}
                className={`rounded-xl p-3.5 text-sm transition-all ${cardBg}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={`text-base ${titleClass}`}>{session.session_title}</p>
                    <p className={`mt-0.5 text-xs ${textClass}`}>
                      {formatDateTime(session.starts_at)} ·{" "}
                      {session.location_name || "Chưa xếp phòng"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs leading-none shadow-2xs ${badgeClass}`}
                  >
                    {label}
                  </span>
                </div>
                {session.teacher_name && (
                  <p className={`mt-2 text-xs ${textClass}`}>
                    Giảng viên: <span className="font-semibold">{session.teacher_name}</span>
                  </p>
                )}
                {session.remarks && (
                  <p className={`mt-1 text-xs italic ${remarksClass}`}>
                    Ghi chú: {session.remarks}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </QueryState>
    </Modal>
  );
}

function AcademicSummaryTab({ studentId }: { studentId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "student", studentId, "academic-summary"],
    queryFn: () => adminApi.studentAcademicSummary(studentId),
  });

  const [retakeTarget, setRetakeTarget] = useState<{
    course_id: string;
    test_id: string;
    test_title: string;
    attempt_no: number;
  } | null>(null);
  const [reason, setReason] = useState("");

  const grantMutation = useMutation({
    mutationFn: () =>
      adminApi.grantTestRetakePermit(
        retakeTarget!.course_id,
        studentId,
        retakeTarget!.test_id,
        retakeTarget!.attempt_no,
        reason,
      ),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["admin", "student", studentId, "academic-summary"],
      });
      setRetakeTarget(null);
      setReason("");
    },
  });

  return (
    <QueryState
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && query.data?.length === 0}
      emptyTitle="Chưa có điểm bài kiểm tra"
    >
      <div className="overflow-hidden rounded-xl border border-gborder bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gborder bg-gbg2 text-xs font-bold uppercase tracking-wider text-gtext">
              <tr>
                <th className="px-4 py-3">Bài kiểm tra</th>
                <th className="px-4 py-3">Lớp học / Khóa học</th>
                <th className="px-4 py-3 text-center">Điểm đạt</th>
                <th className="px-4 py-3 text-center">Điểm học viên</th>
                <th className="px-4 py-3 text-center">Kết quả</th>
                <th className="px-4 py-3">Ngày nộp / Chấm</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gborder">
              {query.data?.map((item) => (
                <tr key={`${item.test_id}-${item.class_id}`} className="hover:bg-gbg2/50">
                  <td className="px-4 py-3 font-semibold text-navy-dark">{item.test_title}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy-dark">{item.class_name}</p>
                    <p className="text-xs text-gtext">{item.course_name}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{item.pass_score}</td>
                  <td className="px-4 py-3 text-center font-bold text-navy-dark">{item.score}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={item.passed ? "green" : "red"}>
                      {item.passed ? "Đạt" : "Không đạt"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gtext">{formatDateTime(item.graded_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setRetakeTarget({
                          course_id: item.course_id,
                          test_id: item.test_id,
                          test_title: item.test_title,
                          attempt_no: 2,
                        })
                      }
                    >
                      Duyệt thi lại
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!retakeTarget}
        title={`Duyệt quyền thi lại · ${retakeTarget?.test_title ?? ""}`}
        onClose={() => setRetakeTarget(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            grantMutation.mutate();
          }}
        >
          {grantMutation.error && <ErrorBanner message={mutationMessage(grantMutation.error)} />}
          <Input
            required
            min={2}
            type="number"
            label="Lượt thi lại mở quyền (Lần thứ)"
            value={retakeTarget?.attempt_no ?? 2}
            onChange={(e) =>
              setRetakeTarget((old) => old && { ...old, attempt_no: Number(e.target.value) })
            }
          />
          <Textarea
            required
            label="Lý do cấp phép thi lại (Audit mandatory)"
            placeholder="Ví dụ: Học viên nộp đơn xin thi lại cải thiện điểm, đã được Ban đào tạo chấp thuận."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setRetakeTarget(null)}>
              Hủy
            </Button>
            <Button type="submit" loading={grantMutation.isPending}>
              Cấp phép thi lại
            </Button>
          </div>
        </form>
      </Modal>
    </QueryState>
  );
}

function WorkloadSummaryTab({ teacherId, readOnly }: { teacherId: string; readOnly?: boolean }) {
  const query = useQuery({
    queryKey: ["admin", "teacher", teacherId, "workload-summary"],
    queryFn: () => adminApi.teacherWorkloadSummary(teacherId),
  });

  return (
    <QueryState
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && query.data?.length === 0}
      emptyTitle="Chưa có dữ liệu tải giảng dạy"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.data?.map((item) => (
          <Card key={item.class_id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to={readOnly ? `/sale/lop-hoc/${item.class_id}` : `/admin/lop-hoc/${item.class_id}`}
                  className="font-bold text-navy-dark hover:text-[#0532e6]"
                >
                  {item.class_code} · {item.class_name}
                </Link>
                <p className="mt-1 text-xs text-gtext">{item.course_name}</p>
              </div>
              <Badge tone="navy">{item.punctuality_pct.toFixed(0)}% Điểm danh</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-lg bg-gbg2 p-2">
                <p className="text-xs text-gtext">Buổi hoàn thành</p>
                <p className="font-bold text-navy-dark">{item.completed_sessions}</p>
              </div>
              <div className="rounded-lg bg-gbg2 p-2">
                <p className="text-xs text-gtext">Đã ghi sổ điểm danh</p>
                <p className="font-bold text-navy-dark">{item.recorded_rollcall_sessions}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </QueryState>
  );
}

function AuditLogsTab({ kind, personId }: { kind: PersonKind; personId: string }) {
  const query = useQuery({
    queryKey: ["admin", kind, personId, "audit-logs"],
    queryFn: () => adminApi.personAuditLogs(kind, personId, { page: 1, per_page: 50 }),
  });

  return (
    <QueryState
      loading={query.isLoading}
      error={query.error}
      empty={!query.isLoading && query.data?.items.length === 0}
      emptyTitle="Chưa có nhật ký tác vụ"
    >
      <div className="overflow-hidden rounded-xl border border-gborder bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gborder bg-gbg2 text-xs font-bold uppercase tracking-wider text-gtext">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Người thực hiện</th>
                <th className="px-4 py-3">Tác vụ</th>
                <th className="px-4 py-3">Lý do</th>
                <th className="px-4 py-3">Chi tiết thay đổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gborder">
              {query.data?.items.map((item) => (
                <tr key={item.id} className="hover:bg-gbg2/50">
                  <td className="px-4 py-3 text-xs text-gtext whitespace-nowrap">
                    {formatDateTime(item.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-navy-dark">
                    {item.actor_email || "Hệ thống"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="navy">{item.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy-dark">{item.reason || "N/A"}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs font-mono text-gtext">
                    {item.new_values}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </QueryState>
  );
}
