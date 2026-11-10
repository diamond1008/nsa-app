import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { currentWeekStart, monthRange, WeekCalendar, weekRange } from "../../components/calendar";
import type { CalendarStat, CalendarView, WeekCalendarEvent } from "../../components/calendar";
import {
  QueryState,
  QuickAction,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../../components/data";
import { Icon } from "../../components/icons";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Button, Card, ErrorBanner, Input, Modal, PageHeader, Select } from "../../components/ui";
import { ApiRequestError } from "../../lib/apiClient";
import { formatDate, formatDateTime, statusLabel } from "../../lib/format";
import { patchListQuery, readListQuery } from "../../lib/listQuery";
import type { ListQueryConfig } from "../../lib/listQuery";
import { teacherApi } from "./teacherApi";

const errorText = (error: unknown) =>
  error instanceof ApiRequestError
    ? error.message
    : "Không thể thực hiện thao tác. Vui lòng thử lại.";

export function TeacherDashboardPage() {
  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const schedule = useQuery({
    queryKey: ["teacher", "schedule", "dashboard"],
    queryFn: () => teacherApi.schedule({ page: 1, per_page: 5, from: new Date().toISOString() }),
  });
  return (
    <div>
      <PageHeader
        eyebrow="Không gian giảng viên"
        title="Chào ngày mới 👋"
        subtitle="Theo dõi lịch dạy, lớp phụ trách và hoàn thành các tác vụ trong ngày."
        actions={
          <Link to="/teacher/lich-day">
            <Button variant="accent">
              <Icon name="calendar" className="h-4 w-4" />
              Xem lịch dạy
            </Button>
          </Link>
        }
      />
      <QueryState
        loading={classes.isLoading || schedule.isLoading}
        error={classes.error || schedule.error}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Lớp phụ trách"
            value={classes.data?.length ?? 0}
            hint="Đang được phân công"
            icon="school"
          />
          <StatCard
            label="Buổi sắp tới"
            value={schedule.data?.meta.total ?? 0}
            hint="Trong lịch giảng dạy"
            icon="calendar"
            tone="blue"
          />
          <StatCard
            label="Học viên"
            value={classes.data?.reduce((sum, item) => sum + item.enrolled_students, 0) ?? 0}
            hint="Trong các lớp phụ trách"
            icon="users"
            tone="green"
          />
          <StatCard
            label="Tác vụ hôm nay"
            value="Điểm danh"
            hint="Có thể chỉnh sửa đến 00:00"
            icon="check"
            tone="gold"
          />
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <Card>
            <SectionHeader
              title="Lịch dạy sắp tới"
              subtitle="Các buổi gần nhất theo giờ Việt Nam"
              action={
                <Link
                  className="text-xs font-semibold text-[#0532e6] hover:text-[#1e45ee]"
                  to="/teacher/lich-day"
                >
                  Xem toàn bộ →
                </Link>
              }
            />
            <div className="space-y-3">
              {schedule.data?.items.map((s) => (
                <Link
                  key={s.id}
                  to={`/teacher/diem-danh?session=${s.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-gborder p-3.5 transition hover:border-[#0532e6]/50 hover:bg-[#0532e6]/5"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-navy text-white">
                    <span className="text-[10px] uppercase opacity-60">Ngày</span>
                    <b>
                      {new Intl.DateTimeFormat("vi-VN", {
                        day: "2-digit",
                        timeZone: "Asia/Ho_Chi_Minh",
                      }).format(new Date(s.starts_at))}
                    </b>
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{s.title}</b>
                    <p className="mt-1 truncate text-xs text-gtext">
                      {formatDateTime(s.starts_at)} · {s.class_code}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gtext">
                      <Icon name="location" className="h-3 w-3" />
                      {s.location_name ?? "Chưa xếp phòng"}
                    </p>
                  </div>
                  <Icon
                    name="chevron-right"
                    className="h-4 w-4 text-gtext transition group-hover:translate-x-1"
                  />
                </Link>
              ))}
              {!schedule.data?.items.length && (
                <p className="rounded-xl bg-gbg2 p-4 text-sm text-gtext">
                  Chưa có buổi dạy sắp tới.
                </p>
              )}
            </div>
          </Card>
          <Card>
            <SectionHeader title="Lớp đang phụ trách" subtitle="Tổng quan sĩ số và trạng thái" />
            <div className="space-y-3">
              {classes.data?.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  to={`/teacher/lop-phu-trach/${c.id}`}
                  className="block rounded-xl border border-gborder p-3.5 transition hover:border-[#0532e6]/50 hover:bg-[#0532e6]/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <b className="block truncate text-sm">
                        {c.class_code} — {c.name}
                      </b>
                      <p className="mt-1 truncate text-xs text-gtext">{c.course_name}</p>
                    </div>
                    <StatusBadge value={c.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-gtext">
                    <span>
                      {c.enrolled_students}/{c.maximum_students} học viên
                    </span>
                    <span>
                      {Math.round((c.enrolled_students / Math.max(c.maximum_students, 1)) * 100)}%
                      sĩ số
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gbg2">
                    <div
                      className="h-full rounded-full bg-[#0532e6]"
                      style={{
                        width: `${Math.min(100, (c.enrolled_students / Math.max(c.maximum_students, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Link to="/teacher/diem-danh">
            <QuickAction
              title="Điểm danh nhanh"
              description="Mở danh sách và lưu trạng thái trong ngày."
              icon="check"
            />
          </Link>
          <Link to="/teacher/danh-gia">
            <QuickAction
              title="Đánh giá kỹ năng"
              description="Cập nhật năng lực thực hành của học viên."
              icon="award"
            />
          </Link>
          <Link to="/teacher/lop-phu-trach">
            <QuickAction
              title="Danh sách lớp"
              description="Xem sĩ số và hồ sơ học viên phụ trách."
              icon="users"
            />
          </Link>
        </div>
      </QueryState>
    </div>
  );
}

export function TeacherClassesPage() {
  const query = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  return (
    <div>
      <PageHeader
        title="Lớp học phụ trách"
        subtitle="Chỉ hiển thị các lớp bạn được phân công giảng dạy."
      />
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.data?.length}
        emptyTitle="Bạn chưa được phân công lớp"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data?.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#0532e6]">{c.course_code}</p>
                  <h2 className="mt-1 text-lg font-bold text-navy">{c.name}</h2>
                  <p className="text-sm text-gtext">{c.class_code}</p>
                </div>
                <StatusBadge value={c.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gtext">Sĩ số</p>
                  <b>
                    {c.enrolled_students}/{c.maximum_students}
                  </b>
                </div>
                <div>
                  <p className="text-xs text-gtext">Thời gian</p>
                  <b>
                    {formatDate(c.start_date)} – {formatDate(c.end_date)}
                  </b>
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <Link className="flex-1" to={`/teacher/lop-phu-trach/${c.id}`}>
                  <Button className="w-full">Xem lớp</Button>
                </Link>
                <Link to="/teacher/diem-danh">
                  <Button variant="ghost">Điểm danh</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </QueryState>
    </div>
  );
}

export function TeacherClassDetailPage() {
  const { classId = "" } = useParams();
  const query = useQuery({
    queryKey: ["teacher", "class", classId],
    queryFn: () => teacherApi.classDetail(classId),
    enabled: !!classId,
  });
  return (
    <div>
      <PageHeader
        title={
          query.data ? `${query.data.class.class_code} — ${query.data.class.name}` : "Chi tiết lớp"
        }
        subtitle={query.data?.class.course_name}
        actions={
          <Link to="/teacher/lop-phu-trach">
            <Button variant="ghost">← Danh sách lớp</Button>
          </Link>
        }
      />
      <QueryState loading={query.isLoading} error={query.error}>
        {query.data && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Học viên đang học"
                value={query.data.students.filter((s) => s.status === "enrolled").length}
              />
              <StatCard label="Tiêu chí kỹ năng" value={query.data.competencies.length} />
              <StatCard
                label="Trạng thái"
                value={<StatusBadge value={query.data.class.status} />}
              />
            </div>
            <Card className="p-0">
              <div className="border-b border-gborder px-5 py-4">
                <h2 className="font-bold text-navy">Danh sách học viên</h2>
              </div>
              <div className="divide-y divide-gborder">
                {(query.data.students ?? []).map((student) => (
                  <div
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <b className="text-navy">
                        {student.student_code} — {student.full_name}
                      </b>
                      <div className="mt-1">
                        <StatusBadge value={student.status} />
                      </div>
                    </div>
                    <Link
                      to={`/teacher/lop-phu-trach/${classId}/hoc-vien/${student.student_id}/danh-gia`}
                    >
                      <Button variant="ghost">Nhập điểm kiểm tra</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}

const teacherScheduleListConfig: ListQueryConfig<string, string> = {
  filterKeys: ["status", "session_type", "attendance_state", "class_id"],
  allowedSorts: ["starts_at", "title", "created_at"],
  defaultSort: "starts_at",
  defaultOrder: "asc",
};

export function TeacherSchedulePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const listState = readListQuery(searchParams, teacherScheduleListConfig);
  const [searchInput, setSearchInput] = useState(listState.q);
  const debouncedSearch = useDebouncedValue(searchInput);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const range = calendarView === "week" ? weekRange(weekStart) : monthRange(weekStart);
  useEffect(() => setSearchInput(listState.q), [listState.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === listState.q) return;
    setSearchParams(
      patchListQuery(searchParams, { q: debouncedSearch }, teacherScheduleListConfig),
      { replace: true },
    );
  }, [debouncedSearch, listState.q, searchParams, setSearchParams]);
  const updateList = (patch: Record<string, string | number | undefined>) =>
    setSearchParams(patchListQuery(searchParams, patch, teacherScheduleListConfig), {
      replace: true,
    });
  const query = useQuery({
    queryKey: ["teacher", "schedule", "calendar", calendarView, weekStart, listState],
    queryFn: () =>
      teacherApi.schedule({
        page: 1,
        per_page: 100,
        from: range.from,
        to: range.to,
        search: listState.q,
        status: listState.filters.status,
        session_type: listState.filters.session_type,
        attendance_state: (listState.filters.attendance_state || undefined) as
          "locked" | "unlocked" | undefined,
        class_id: listState.filters.class_id,
        sort_by: listState.sort,
        sort_order: listState.order,
      }),
  });
  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  const events: WeekCalendarEvent[] = (query.data?.items ?? []).map((session) => ({
    id: session.id,
    title: session.title,
    subtitle: `${session.class_code} · ${session.location_name ?? "Chưa xếp phòng"}`,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    tone:
      session.status === "cancelled"
        ? "red"
        : session.attendance_locked_at
          ? "green"
          : session.session_type === "assessment"
            ? "gold"
            : "navy",
  }));
  const now = Date.now();
  const calendarStats = [
    {
      label: "Sắp dạy",
      value: (query.data?.items ?? []).filter(
        (session) => session.status !== "cancelled" && new Date(session.starts_at).getTime() > now,
      ).length,
      tone: "navy",
    },
    {
      label: "Đã dạy",
      value: (query.data?.items ?? []).filter(
        (session) => session.status !== "cancelled" && new Date(session.ends_at).getTime() <= now,
      ).length,
      tone: "green",
    },
    {
      label: "Chưa điểm danh",
      value: (query.data?.items ?? []).filter(
        (session) =>
          session.status !== "cancelled" &&
          !session.attendance_locked_at &&
          new Date(session.ends_at).getTime() <= now,
      ).length,
      tone: "red",
    },
  ] satisfies CalendarStat[];
  const selectedClass = classes.data?.find((item) => item.id === listState.filters.class_id);
  const activeFilters = [
    ...(listState.filters.status
      ? [{ key: "status", label: `Trạng thái: ${statusLabel(listState.filters.status)}` }]
      : []),
    ...(listState.filters.session_type
      ? [
          {
            key: "session_type",
            label: `Loại buổi: ${statusLabel(listState.filters.session_type)}`,
          },
        ]
      : []),
    ...(listState.filters.attendance_state
      ? [
          {
            key: "attendance_state",
            label:
              listState.filters.attendance_state === "locked"
                ? "Điểm danh đã khóa"
                : "Điểm danh đang mở",
          },
        ]
      : []),
    ...(selectedClass ? [{ key: "class_id", label: `Lớp: ${selectedClass.class_code}` }] : []),
  ];
  return (
    <div>
      <PageHeader
        title="Lịch giảng dạy"
        subtitle="Bấm vào một buổi học để mở danh sách điểm danh. Thời gian hiển thị theo giờ Việt Nam."
      />
      <FilterBar
        compact
        search={searchInput}
        onSearch={setSearchInput}
        resultCount={query.data?.meta.total}
        resultCountLabel="buổi"
        activeFilters={activeFilters}
        advancedFilterCount={activeFilters.length}
        onRemoveFilter={(key) => updateList({ [key]: "" })}
        onClearAll={() => {
          setSearchInput("");
          setSearchParams(new URLSearchParams(), { replace: true });
        }}
        searchPlaceholder="Nội dung buổi học, mã lớp, phòng…"
        advancedFilters={
          <>
            <div className="w-full min-w-44 sm:w-48">
              <Select
                label="Lớp phụ trách"
                value={listState.filters.class_id}
                onChange={(event) => updateList({ class_id: event.target.value })}
              >
                <option value="">Tất cả</option>
                {(classes.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.class_code}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full min-w-40 sm:w-44">
              <Select
                label="Trạng thái"
                value={listState.filters.status}
                onChange={(event) => updateList({ status: event.target.value })}
              >
                <option value="">Tất cả</option>
                <option value="scheduled">Đã lên lịch</option>
                <option value="completed">Đã diễn ra</option>
                <option value="locked">Đã khóa</option>
                <option value="cancelled">Đã hủy</option>
              </Select>
            </div>
            <div className="w-full min-w-40 sm:w-44">
              <Select
                label="Loại buổi"
                value={listState.filters.session_type}
                onChange={(event) => updateList({ session_type: event.target.value })}
              >
                <option value="">Tất cả</option>
                <option value="theory">Lý thuyết</option>
                <option value="workshop">Thực hành</option>
                <option value="assessment">Đánh giá</option>
                <option value="other">Khác</option>
              </Select>
            </div>
            <div className="w-full min-w-44 sm:w-48">
              <Select
                label="Khóa điểm danh"
                value={listState.filters.attendance_state}
                onChange={(event) => updateList({ attendance_state: event.target.value })}
              >
                <option value="">Tất cả</option>
                <option value="unlocked">Đang mở</option>
                <option value="locked">Đã khóa</option>
              </Select>
            </div>
          </>
        }
      />
      <QueryState loading={query.isLoading} error={query.error}>
        <WeekCalendar
          events={events}
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
          view={calendarView}
          onViewChange={setCalendarView}
          stats={calendarStats}
          onEventClick={(event) => navigate(`/teacher/diem-danh?session=${event.id}`)}
        />
      </QueryState>
    </div>
  );
}

export function AssessmentPage() {
  const { classId = "", studentId = "" } = useParams();
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ["teacher", "class", classId],
    queryFn: () => teacherApi.classDetail(classId),
    enabled: !!classId,
  });
  const testResults = useQuery({
    queryKey: ["teacher", "test-results", classId, studentId],
    queryFn: () => teacherApi.testResults(classId, studentId),
    enabled: !!classId && !!studentId,
  });
  const [scoreMap, setScoreMap] = useState<Record<string, string>>({});
  const [scoreNotes, setScoreNotes] = useState<Record<string, string>>({});

  const student = (detail.data?.students ?? []).find((s) => s.student_id === studentId);

  const recordScore = useMutation({
    mutationFn: (testId: string) =>
      teacherApi.recordTestAttempt(classId, studentId, testId, {
        score: Number(scoreMap[testId]),
        note: scoreNotes[testId]?.trim() || null,
      }),
    onSuccess: (_, testId) => {
      setScoreMap((old) => ({ ...old, [testId]: "" }));
      setScoreNotes((old) => ({ ...old, [testId]: "" }));
      void client.invalidateQueries({ queryKey: ["teacher", "test-results", classId, studentId] });
    },
  });
  const [correctingAttempt, setCorrectingAttempt] = useState<{
    attemptId: string;
    testTitle: string;
    attemptNo: number;
    oldScore: number;
    oldNote?: string | null;
  } | null>(null);
  const [correctForm, setCorrectForm] = useState({
    score: 0,
    note: "",
    reason: "",
  });

  const correctScore = useMutation({
    mutationFn: ({
      attemptId,
      score,
      note,
      reason,
    }: {
      attemptId: string;
      score: number;
      note: string | null;
      reason: string;
    }) => {
      return teacherApi.correctTestAttempt(attemptId, {
        score,
        note,
        reason,
      });
    },
    onSuccess: () => {
      setCorrectingAttempt(null);
      void client.invalidateQueries({ queryKey: ["teacher", "test-results", classId, studentId] });
    },
  });
  return (
    <div>
      <PageHeader
        title={`Điểm kiểm tra${student ? ` — ${student.full_name}` : ""}`}
        subtitle={
          student
            ? `${student.student_code} · ${detail.data?.class.class_code}`
            : "Nhập và quản lý điểm kiểm tra của học viên."
        }
        actions={
          <Link to={`/teacher/lop-phu-trach/${classId}`}>
            <Button variant="ghost">← Về lớp</Button>
          </Link>
        }
      />
      <QueryState
        loading={detail.isLoading || testResults.isLoading}
        error={detail.error || testResults.error}
      >
        {detail.data && (
          <div className="space-y-6">
            <Card>
              <SectionHeader
                title="Điểm kiểm tra và thi kết thúc khóa"
                subtitle="Học viên làm bài trên giấy. Nhập điểm sau khi chấm; nếu thi lại (Lần 2), điểm Lần 2 là điểm chính thức và được lưu cố định."
              />
              {(recordScore.error || correctScore.error) && (
                <ErrorBanner message={errorText(recordScore.error || correctScore.error)} />
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {(testResults.data?.tests ?? []).map((result) => (
                  <div key={result.test.id} className="rounded-xl border border-gborder p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <b>
                          {result.test.code} · {result.test.title}
                        </b>
                        <p className="mt-1 text-xs text-gtext">
                          {result.test.kind === "final_exam"
                            ? "Thi kết thúc khóa · phải trên 5"
                            : `Bài trong lớp · đạt từ ${result.test.pass_score}`}
                        </p>
                      </div>
                      <StatusBadge value={result.passed ? "passed" : "pending"} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {(result.attempts ?? []).map((attempt) => {
                        const totalAttempts = result.attempts?.length ?? 0;
                        const isOfficial =
                          totalAttempts >= 2 ? attempt.attempt_no === 2 : attempt.attempt_no === 1;
                        const canEdit = attempt.attempt_no === 1 && totalAttempts < 2;

                        return (
                          <div
                            key={attempt.id}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                              isOfficial
                                ? "border border-[#0532e6]/25 bg-[#0532e6]/5 font-medium text-navy"
                                : "bg-gbg2 text-gtext"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span>
                                Lần {attempt.attempt_no}:{" "}
                                <b className={isOfficial ? "font-bold text-navy-heading" : ""}>
                                  {attempt.score.toFixed(2)}
                                </b>{" "}
                                · {formatDateTime(attempt.taken_at)}
                              </span>
                              {isOfficial && (
                                <span className="rounded bg-[#0532e6]/15 px-2 py-0.5 text-[11px] font-bold text-[#0532e6]">
                                  Điểm chính thức
                                </span>
                              )}
                            </span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setCorrectingAttempt({
                                    attemptId: attempt.id,
                                    testTitle: `${result.test.code} · ${result.test.title}`,
                                    attemptNo: attempt.attempt_no,
                                    oldScore: attempt.score,
                                    oldNote: attempt.note,
                                  });
                                  setCorrectForm({
                                    score: attempt.score,
                                    note: attempt.note || "",
                                    reason: "",
                                  });
                                }}
                              >
                                Sửa
                              </Button>
                            )}
                          </div>
                        );
                      })}

                      {(result.attempts?.length ?? 0) >= 2 ? (
                        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                          ✓ <b>Đã hoàn thành 2 lần thi.</b> Điểm <b>Lần 2</b> là điểm chính thức của
                          bài thi này và đã được lưu cố định.
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
                          <Input
                            required
                            min={0}
                            max={10}
                            step={0.01}
                            type="number"
                            label={`Điểm (Lần ${(result.attempts?.length ?? 0) + 1})`}
                            value={scoreMap[result.test.id] ?? ""}
                            onChange={(e) =>
                              setScoreMap((old) => ({ ...old, [result.test.id]: e.target.value }))
                            }
                          />
                          <Input
                            label="Ghi chú"
                            value={scoreNotes[result.test.id] ?? ""}
                            onChange={(e) =>
                              setScoreNotes((old) => ({
                                ...old,
                                [result.test.id]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            disabled={
                              scoreMap[result.test.id] === undefined ||
                              scoreMap[result.test.id] === ""
                            }
                            loading={
                              recordScore.isPending && recordScore.variables === result.test.id
                            }
                            onClick={() => recordScore.mutate(result.test.id)}
                          >
                            Lưu điểm
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {!(testResults.data?.tests ?? []).length && (
                  <p className="text-sm text-gtext">Khóa học chưa được cấu hình bài kiểm tra.</p>
                )}
              </div>
            </Card>

            <Modal
              open={Boolean(correctingAttempt)}
              title="Hiệu chỉnh điểm bài kiểm tra"
              onClose={() => setCorrectingAttempt(null)}
            >
              {correctingAttempt && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    correctScore.mutate({
                      attemptId: correctingAttempt.attemptId,
                      score: Number(correctForm.score),
                      note: correctForm.note.trim() || null,
                      reason: correctForm.reason.trim(),
                    });
                  }}
                >
                  <div className="space-y-1 rounded-xl bg-gbg2 p-3.5 text-sm">
                    <div className="font-semibold text-navy-heading">
                      {correctingAttempt.testTitle}
                    </div>
                    <div className="text-xs text-gtext">
                      Lần thi: <b>Lần {correctingAttempt.attemptNo}</b> · Điểm hiện tại:{" "}
                      <b className="font-bold text-navy">{correctingAttempt.oldScore.toFixed(2)}</b>
                    </div>
                  </div>

                  <Input
                    required
                    min={0}
                    max={10}
                    step={0.01}
                    type="number"
                    label="Điểm mới (thang điểm 0 - 10)"
                    value={correctForm.score}
                    onChange={(e) =>
                      setCorrectForm((f) => ({ ...f, score: Number(e.target.value) }))
                    }
                  />

                  <Input
                    label="Ghi chú cập nhật (tùy chọn)"
                    value={correctForm.note}
                    placeholder="Ghi chú về bài làm của học viên..."
                    onChange={(e) => setCorrectForm((f) => ({ ...f, note: e.target.value }))}
                  />

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-navy-heading">
                      Lý do chỉnh sửa <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      className="w-full rounded-xl border border-gborder bg-white p-3 text-sm text-navy placeholder:text-gtext focus:border-[#0532e6] focus:outline-none focus:ring-1 focus:ring-[#0532e6]"
                      placeholder="Ví dụ: Chấm lại bài phúc khảo, cộng điểm câu tự luận..."
                      value={correctForm.reason}
                      onChange={(e) => setCorrectForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-gtext">
                      Lý do chỉnh sửa sẽ được lưu lại trong lịch sử vận hành lớp học để đối soát.
                    </p>
                  </div>

                  {correctScore.error && <ErrorBanner message={errorText(correctScore.error)} />}

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCorrectingAttempt(null)}
                      disabled={correctScore.isPending}
                    >
                      Hủy
                    </Button>
                    <Button type="submit" loading={correctScore.isPending}>
                      Lưu điểm hiệu chỉnh
                    </Button>
                  </div>
                </form>
              )}
            </Modal>
          </div>
        )}
      </QueryState>
    </div>
  );
}

export function TeacherAssessmentLandingPage() {
  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  return (
    <div>
      <PageHeader
        title="Đánh giá kỹ năng"
        subtitle="Chọn lớp và học viên để tạo hoặc xem lịch sử đánh giá."
      />
      <QueryState loading={classes.isLoading} error={classes.error} empty={!classes.data?.length}>
        <div className="grid gap-4 md:grid-cols-2">
          {classes.data?.map((c) => (
            <Link key={c.id} to={`/teacher/lop-phu-trach/${c.id}`}>
              <Card className="hover:border-[#0532e6]/50 transition">
                <b>
                  {c.class_code} — {c.name}
                </b>
                <p className="mt-1 text-sm text-gtext">
                  {c.enrolled_students} học viên · Mở danh sách lớp để chọn học viên
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
