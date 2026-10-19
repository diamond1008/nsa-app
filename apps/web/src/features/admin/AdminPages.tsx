import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  addCalendarDays,
  currentWeekStart,
  inferTrainingSlot,
  monthRange,
  trainingSlotRange,
  vietnamDateKey,
  WeekCalendar,
  weekRange,
} from "../../components/calendar";
import type {
  CalendarStat,
  CalendarView,
  TrainingSlotKey,
  WeekCalendarEvent,
} from "../../components/calendar";
import {
  DataTable,
  Pagination,
  QueryState,
  QuickAction,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../../components/data";
import { Icon } from "../../components/icons";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { SearchCombobox } from "../../components/SearchCombobox";
import {
  Button,
  Badge,
  Card,
  ErrorBanner,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";
import { ApiRequestError } from "../../lib/apiClient";
import type {
  ClassSession,
  CompletionCandidate,
  Course,
  CourseTest,
  Enrollment,
  EnrollmentTransfer,
  Paginated,
  Student,
  Teacher,
  TeacherAssignment,
  TrainingClass,
  TrainingLocation,
} from "../../lib/domainTypes";
import { formatDate, formatDateTime, statusLabel } from "../../lib/format";
import { patchListQuery, readListQuery } from "../../lib/listQuery";
import type { ListQueryConfig } from "../../lib/listQuery";
import { compressImageToWebP } from "../../lib/image";
import { adminApi } from "./adminApi";
import { EnrollmentActionButtons } from "./EnrollmentActionButtons";
import type { EnrollmentAction } from "./EnrollmentActionButtons";
import { directoryRowNumber, PersonAvatar } from "./PersonIdentity";

function mutationMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.message
    : "Không thể lưu dữ liệu. Vui lòng thử lại.";
}

function vietnamDateTimeLocal(value = new Date()) {
  const nextWholeMinute = Math.ceil(value.getTime() / 60_000) * 60_000;
  return new Date(nextWholeMinute + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function vietnamLocalInputToRFC3339(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

const completionListConfig: ListQueryConfig<string, string> = {
  filterKeys: ["eligibility", "course_id", "class_id"],
  allowedSorts: ["class_code", "student_code"],
  defaultSort: "class_code",
  defaultOrder: "asc",
};

export function AdminOperationsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const listState = readListQuery(searchParams, completionListConfig);
  const [searchInput, setSearchInput] = useState(listState.q);
  const [courseSearch, setCourseSearch] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const debouncedCourseSearch = useDebouncedValue(courseSearch);
  const debouncedClassSearch = useDebouncedValue(classSearch);
  const [selected, setSelected] = useState<CompletionCandidate | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [note, setNote] = useState("");
  const summary = useQuery({
    queryKey: ["admin", "reports", "summary"],
    queryFn: () => adminApi.reportSummary(),
  });
  useEffect(() => setSearchInput(listState.q), [listState.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === listState.q) return;
    setSearchParams(patchListQuery(searchParams, { q: debouncedSearch }, completionListConfig), {
      replace: true,
    });
  }, [debouncedSearch, listState.q, searchParams, setSearchParams]);
  const updateList = (patch: Record<string, string | number | undefined>) =>
    setSearchParams(patchListQuery(searchParams, patch, completionListConfig), { replace: true });
  const courseOptionsQuery = useQuery({
    queryKey: ["admin", "courses", "completion-options", debouncedCourseSearch],
    queryFn: () =>
      adminApi.courses({
        page: 1,
        per_page: 20,
        search: debouncedCourseSearch,
        sort_by: "code",
        sort_order: "asc",
      }),
  });
  const classOptionsQuery = useQuery({
    queryKey: [
      "admin",
      "classes",
      "completion-options",
      debouncedClassSearch,
      listState.filters.course_id,
    ],
    queryFn: () =>
      adminApi.classes({
        page: 1,
        per_page: 20,
        search: debouncedClassSearch,
        course_id: listState.filters.course_id || undefined,
        sort_by: "class_code",
        sort_order: "asc",
      }),
  });
  const selectedCourse = useQuery({
    queryKey: ["admin", "course", listState.filters.course_id],
    queryFn: () => adminApi.getCourse(listState.filters.course_id),
    enabled: Boolean(listState.filters.course_id),
  });
  const selectedClass = useQuery({
    queryKey: ["admin", "class", listState.filters.class_id],
    queryFn: () => adminApi.getClass(listState.filters.class_id),
    enabled: Boolean(listState.filters.class_id),
  });
  const courseOptions = useMemo(() => {
    const items = [...(courseOptionsQuery.data?.items ?? [])];
    if (selectedCourse.data && !items.some((item) => item.id === selectedCourse.data!.id)) {
      items.unshift(selectedCourse.data);
    }
    return items.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }));
  }, [courseOptionsQuery.data?.items, selectedCourse.data]);
  const classOptions = useMemo(() => {
    const items = [...(classOptionsQuery.data?.items ?? [])];
    if (selectedClass.data && !items.some((item) => item.id === selectedClass.data!.id)) {
      items.unshift(selectedClass.data);
    }
    return items.map((item) => ({ value: item.id, label: `${item.class_code} — ${item.name}` }));
  }, [classOptionsQuery.data?.items, selectedClass.data]);
  const candidates = useQuery({
    queryKey: ["admin", "completions", listState],
    queryFn: () =>
      adminApi.completions({
        page: listState.page,
        per_page: 20,
        search: listState.q,
        eligibility: (listState.filters.eligibility || undefined) as
          "eligible" | "ineligible" | undefined,
        course_id: listState.filters.course_id,
        class_id: listState.filters.class_id,
        sort_by: listState.sort,
        sort_order: listState.order,
      }),
  });
  const decide = useMutation({
    mutationFn: () =>
      adminApi.decideCompletion(selected!.class_id, selected!.student_id, decision, note),
    onSuccess: () => {
      setSelected(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "completions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "summary"] });
    },
  });
  const [selectedDiplomaCandidate, setSelectedDiplomaCandidate] =
    useState<CompletionCandidate | null>(null);
  const [diplomaFile, setDiplomaFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadDiplomaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDiplomaCandidate?.current_certificate_id || !diplomaFile) return;
      return adminApi.uploadDiploma(selectedDiplomaCandidate.current_certificate_id, diplomaFile);
    },
    onSuccess: () => {
      setDiplomaFile(null);
      setUploadError(null);
      setSelectedDiplomaCandidate(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "completions"] });
    },
    onError: (err: unknown) => {
      setUploadError(err instanceof Error ? err.message : "Tải lên bản scan thất bại");
    },
  });

  const deleteDiplomaMutation = useMutation({
    mutationFn: async (certId: string) => {
      if (!window.confirm("Bạn có chắc chắn muốn xóa bản scan bằng tốt nghiệp này không?")) return;
      return adminApi.deleteDiploma(certId);
    },
    onSuccess: () => {
      setSelectedDiplomaCandidate(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "completions"] });
    },
  });

  const certificateAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "revoke" | "reissue" }) => {
      const reason = window.prompt(
        action === "reissue"
          ? "Hãy sửa thông tin nguồn trước. Nhập lý do thu hồi và cấp lại chứng nhận:"
          : "Nhập lý do thu hồi chứng nhận:",
      );
      if (!reason?.trim()) throw new Error("Cần nhập lý do");
      return action === "reissue"
        ? adminApi.reissueCertificate(id, reason.trim())
        : adminApi.revokeCertificate(id, reason.trim());
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "completions"] }),
  });
  const downloadCertificate = async (id: string, number: string) => {
    const blob = await adminApi.certificatePDF(id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${number}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const exportReport = useMutation({
    mutationFn: (kind: "attendance" | "competencies" | "classes" | "completions") =>
      adminApi.exportReport(kind).then((blob) => ({ blob, kind })),
    onSuccess: ({ blob, kind }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kind}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const reports = [
    ["attendance", "Chuyên cần"],
    ["competencies", "Năng lực"],
    ["classes", "Lớp học"],
    ["completions", "Hoàn thành"],
  ] as const;
  const eligibilityLabel =
    listState.filters.eligibility === "eligible"
      ? "Đủ điều kiện"
      : listState.filters.eligibility === "ineligible"
        ? "Chưa đủ điều kiện"
        : "";
  const activeCompletionFilters = [
    ...(eligibilityLabel ? [{ key: "eligibility", label: eligibilityLabel }] : []),
    ...(selectedCourse.data
      ? [{ key: "course_id", label: `Khóa: ${selectedCourse.data.code}` }]
      : []),
    ...(selectedClass.data
      ? [{ key: "class_id", label: `Lớp: ${selectedClass.data.class_code}` }]
      : []),
  ];
  const hasCompletionFilter = Boolean(listState.q || activeCompletionFilters.length);
  return (
    <div>
      <PageHeader
        eyebrow="Điều hành đào tạo"
        title="Vận hành & báo cáo"
        subtitle="Theo dõi chỉ số, duyệt hoàn thành khóa học và xuất dữ liệu nghiệp vụ."
      />
      <QueryState loading={summary.isLoading} error={summary.error}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Học viên hoạt động" value={summary.data?.active_students ?? 0} />
          <StatCard label="Lớp đang mở" value={summary.data?.open_classes ?? 0} />
          <StatCard label="Buổi học sắp tới" value={summary.data?.upcoming_sessions ?? 0} />
          <StatCard label="Rủi ro chuyên cần" value={summary.data?.at_risk_students ?? 0} />
          <StatCard label="Đã duyệt hoàn thành" value={summary.data?.approved_completions ?? 0} />
          <StatCard label="Thông báo chưa đọc" value={summary.data?.pending_notifications ?? 0} />
        </div>
      </QueryState>

      <Card className="mt-6">
        <SectionHeader title="Xuất báo cáo CSV" subtitle="Dữ liệu UTF-8 mở trực tiếp bằng Excel." />
        <div className="flex flex-wrap gap-2">
          {reports.map(([kind, label]) => (
            <Button
              key={kind}
              variant="soft"
              loading={exportReport.isPending && exportReport.variables === kind}
              onClick={() => exportReport.mutate(kind)}
            >
              Xuất {label}
            </Button>
          ))}
        </div>
      </Card>

      <section className="mt-6">
        <SectionHeader
          title="Duyệt hoàn thành khóa học"
          subtitle="Chỉ được duyệt khi chuyên cần đạt 80%, đạt toàn bộ bài kiểm tra bắt buộc và điểm thi kết thúc trên 5."
        />
        <FilterBar
          search={searchInput}
          onSearch={setSearchInput}
          resultCount={candidates.data?.meta.total}
          activeFilters={activeCompletionFilters}
          onRemoveFilter={(key) => updateList({ [key]: "" })}
          onClearAll={() => {
            setSearchInput("");
            setSearchParams(new URLSearchParams(), { replace: true });
          }}
          searchPlaceholder="Mã hoặc tên học viên, mã lớp…"
        >
          <div className="w-full min-w-48 sm:w-52">
            <Select
              label="Điều kiện"
              value={listState.filters.eligibility}
              onChange={(event) => updateList({ eligibility: event.target.value })}
            >
              <option value="">Tất cả</option>
              <option value="eligible">Đủ điều kiện</option>
              <option value="ineligible">Chưa đủ điều kiện</option>
            </Select>
          </div>
          <div className="w-full min-w-56 sm:w-64">
            <SearchCombobox
              label="Khóa học"
              value={listState.filters.course_id}
              onChange={(value) => updateList({ course_id: value, class_id: "" })}
              onSearch={setCourseSearch}
              options={courseOptions}
              loading={courseOptionsQuery.isLoading}
            />
          </div>
          <div className="w-full min-w-56 sm:w-64">
            <SearchCombobox
              label="Lớp học"
              value={listState.filters.class_id}
              onChange={(value) => updateList({ class_id: value })}
              onSearch={setClassSearch}
              options={classOptions}
              loading={classOptionsQuery.isLoading}
            />
          </div>
          <div className="w-full min-w-44 sm:w-48">
            <Select
              label="Sắp xếp"
              value={`${listState.sort}:${listState.order}`}
              onChange={(event) => {
                const [sort, order] = event.target.value.split(":");
                updateList({ sort, order });
              }}
            >
              <option value="class_code:asc">Mã lớp A–Z</option>
              <option value="class_code:desc">Mã lớp Z–A</option>
              <option value="student_code:asc">Mã học viên A–Z</option>
              <option value="student_code:desc">Mã học viên Z–A</option>
            </Select>
          </div>
        </FilterBar>
        {certificateAction.error && (
          <ErrorBanner message={mutationMessage(certificateAction.error)} />
        )}
        <QueryState
          loading={candidates.isLoading}
          error={candidates.error}
          empty={!candidates.data?.items.length}
          emptyTitle={
            hasCompletionFilter ? "Không có hồ sơ phù hợp bộ lọc" : "Chưa có hồ sơ hoàn thành"
          }
        >
          <div className="space-y-3">
            {candidates.data?.items.map((item) => (
              <Card key={`${item.class_id}-${item.student_id}`}>
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-navy">
                        {item.student_code} — {item.student_name}
                      </h3>
                      <StatusBadge value={item.status} />
                    </div>
                    <p className="mt-1 text-sm text-gtext">
                      {item.class_code} · {item.course_name}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gtext">
                      <span>
                        Buổi học: {item.completed_sessions}/{item.total_sessions}
                      </span>
                      <span>Chuyên cần: {item.attendance_pct.toFixed(1)}%</span>
                      <span>
                        Năng lực: {item.required_competencies_met}/
                        {item.required_competencies_total}
                      </span>
                      <span>
                        Đánh giá: {item.completed_assessments}/{item.required_assessments}
                      </span>
                      <span>
                        Kiểm tra bắt buộc: {item.required_tests_passed}/{item.required_tests_total}
                      </span>
                      <span>
                        Thi kết thúc:{" "}
                        {item.final_exam_score == null
                          ? "Chưa có"
                          : item.final_exam_score.toFixed(2)}
                      </span>
                    </div>
                    {!!item.failure_reasons.length && (
                      <p className="mt-2 text-xs font-medium text-error">
                        {item.failure_reasons.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {item.current_certificate_id && item.current_certificate_number && (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void downloadCertificate(
                              item.current_certificate_id!,
                              item.current_certificate_number!,
                            )
                          }
                        >
                          Tải {item.current_certificate_number}
                        </Button>
                        <Button
                          variant={item.current_diploma_file_url ? "soft" : "ghost"}
                          onClick={() => {
                            setSelectedDiplomaCandidate(item);
                            setDiplomaFile(null);
                            setUploadError(null);
                          }}
                        >
                          {item.current_diploma_file_url
                            ? "📄 Bản scan bằng"
                            : "📤 Tải scan bằng PDF"}
                        </Button>
                        <Button
                          variant="soft"
                          loading={certificateAction.isPending}
                          onClick={() =>
                            certificateAction.mutate({
                              id: item.current_certificate_id!,
                              action: "reissue",
                            })
                          }
                        >
                          Sửa nguồn & cấp lại
                        </Button>
                        <Button
                          variant="ghost"
                          loading={certificateAction.isPending}
                          onClick={() =>
                            certificateAction.mutate({
                              id: item.current_certificate_id!,
                              action: "revoke",
                            })
                          }
                        >
                          Thu hồi
                        </Button>
                      </>
                    )}
                    <Button
                      variant={item.is_eligible ? "accent" : "soft"}
                      onClick={() => {
                        setSelected(item);
                        setDecision(item.is_eligible ? "approved" : "rejected");
                        setNote("");
                      }}
                    >
                      Xem xét hồ sơ
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            page={listState.page}
            totalPages={candidates.data?.meta.total_pages ?? 1}
            onPage={(page) => updateList({ page })}
          />
        </QueryState>
      </section>

      <Modal open={!!selected} title="Quyết định hoàn thành" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gbg2 p-4">
              <b>
                {selected.student_code} — {selected.student_name}
              </b>
              <p className="mt-1 text-sm text-gtext">
                {selected.class_code} · {selected.course_name}
              </p>
            </div>
            {!selected.is_eligible && (
              <ErrorBanner
                message={`Hồ sơ chưa đủ điều kiện: ${selected.failure_reasons.join("; ")}`}
              />
            )}
            {decide.error && <ErrorBanner message={mutationMessage(decide.error)} />}
            <Select
              label="Quyết định"
              value={decision}
              onChange={(event) => setDecision(event.target.value as "approved" | "rejected")}
            >
              <option value="approved" disabled={!selected.is_eligible}>
                Phê duyệt và cấp chứng nhận
              </option>
              <option value="rejected">Từ chối / yêu cầu bổ sung</option>
            </Select>
            <Textarea
              label="Lý do quyết định"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Hủy
              </Button>
              <Button
                disabled={!note.trim() || (decision === "approved" && !selected.is_eligible)}
                loading={decide.isPending}
                onClick={() => decide.mutate()}
              >
                Lưu quyết định
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!selectedDiplomaCandidate}
        title="Bản scan bằng tốt nghiệp (Cloudflare R2)"
        onClose={() => {
          setSelectedDiplomaCandidate(null);
          setDiplomaFile(null);
          setUploadError(null);
        }}
      >
        {selectedDiplomaCandidate && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gbg2 p-4">
              <p className="text-xs font-semibold text-[#0532e6]">
                Chứng chỉ: {selectedDiplomaCandidate.current_certificate_number}
              </p>
              <h3 className="font-bold text-navy">
                {selectedDiplomaCandidate.student_code} — {selectedDiplomaCandidate.student_name}
              </h3>
              <p className="mt-1 text-sm text-gtext">
                {selectedDiplomaCandidate.class_code} · {selectedDiplomaCandidate.course_name}
              </p>
            </div>

            {selectedDiplomaCandidate.current_diploma_file_url ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gtext">Bản scan PDF hiện tại:</p>
                    <p className="font-semibold text-navy">
                      {selectedDiplomaCandidate.current_diploma_file_name ||
                        "Bản scan bằng tốt nghiệp"}
                    </p>
                  </div>
                  <Badge tone="green">Cloudflare R2</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={selectedDiplomaCandidate.current_diploma_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90"
                  >
                    Xem / Tải file scan ↗
                  </a>
                  <Button
                    variant="soft"
                    loading={deleteDiplomaMutation.isPending}
                    onClick={() =>
                      deleteDiplomaMutation.mutate(selectedDiplomaCandidate.current_certificate_id!)
                    }
                  >
                    Xóa file scan
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-border p-5 text-center">
                <p className="text-sm font-medium text-navy">
                  Chưa có bản scan bằng tốt nghiệp chính thức cho học viên này.
                </p>
                <p className="mt-1 text-xs text-gtext">
                  Chọn tệp PDF (bản scan bằng tốt nghiệp có mộc đỏ, dung lượng tối đa 10 MB) để lưu
                  trữ lên Cloudflare R2 Object Storage.
                </p>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-4 block w-full text-sm text-gtext file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-dark"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
                        setUploadError("Vui lòng chỉ chọn tệp PDF (.pdf)");
                        setDiplomaFile(null);
                        return;
                      }
                      if (f.size > 10 * 1024 * 1024) {
                        setUploadError("Dung lượng tệp không được vượt quá 10 MB");
                        setDiplomaFile(null);
                        return;
                      }
                      setUploadError(null);
                      setDiplomaFile(f);
                    }
                  }}
                />
              </div>
            )}

            {uploadError && <ErrorBanner message={uploadError} />}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedDiplomaCandidate(null);
                  setDiplomaFile(null);
                  setUploadError(null);
                }}
              >
                Đóng
              </Button>
              {diplomaFile && (
                <Button
                  variant="accent"
                  loading={uploadDiplomaMutation.isPending}
                  onClick={() => uploadDiplomaMutation.mutate()}
                >
                  Tải lên R2 ({diplomaFile.name})
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function WeeklySessionChart() {
  const currentWeek = useMemo(() => currentWeekStart(), []);
  const range = useMemo(() => weekRange(currentWeek), [currentWeek]);
  const todayKey = useMemo(() => vietnamDateKey(new Date()), []);

  const weekSessions = useQuery({
    queryKey: ["admin", "sessions", "weekly-chart", currentWeek],
    queryFn: () => adminApi.sessions({ page: 1, per_page: 100, from: range.from, to: range.to }),
  });

  const daysData = useMemo(() => {
    const days = [
      { label: "Thứ 2", short: "T2", offset: 0 },
      { label: "Thứ 3", short: "T3", offset: 1 },
      { label: "Thứ 4", short: "T4", offset: 2 },
      { label: "Thứ 5", short: "T5", offset: 3 },
      { label: "Thứ 6", short: "T6", offset: 4 },
      { label: "Thứ 7", short: "T7", offset: 5 },
      { label: "Chủ nhật", short: "CN", offset: 6 },
    ];

    const items = weekSessions.data?.items ?? [];
    return days.map((day) => {
      const dateKey = addCalendarDays(currentWeek, day.offset);
      const isToday = dateKey === todayKey;
      const daySessions = items.filter((s) => vietnamDateKey(new Date(s.starts_at)) === dateKey);
      const total = daySessions.length;

      return {
        ...day,
        dateKey,
        isToday,
        total,
      };
    });
  }, [currentWeek, todayKey, weekSessions.data?.items]);

  const maxSessions = useMemo(() => Math.max(...daysData.map((d) => d.total), 1), [daysData]);

  const totalWeekSessions = useMemo(
    () => daysData.reduce((acc, d) => acc + d.total, 0),
    [daysData],
  );

  const busiestDay = useMemo(() => {
    const sorted = [...daysData].sort((a, b) => b.total - a.total);
    return sorted[0]?.total > 0 ? sorted[0] : null;
  }, [daysData]);

  return (
    <Card className="flex flex-col justify-between">
      <SectionHeader
        title="Mật độ buổi học trong tuần"
        subtitle="Thống kê tần suất lịch giảng dạy theo ngày (Tuần này)"
        action={
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/5 px-2.5 py-1 text-navy font-semibold">
              <span className="h-2 w-2 rounded-full bg-navy" /> Tổng:{" "}
              <strong>{totalWeekSessions} buổi</strong>
            </span>
            {busiestDay && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0532e6]/10 px-2.5 py-1 text-navy font-semibold">
                <span className="h-2 w-2 rounded-full bg-[#0532e6]" /> Cao điểm:{" "}
                <strong>
                  {busiestDay.label} ({busiestDay.total})
                </strong>
              </span>
            )}
          </div>
        }
      />
      <QueryState loading={weekSessions.isLoading} error={weekSessions.error}>
        <div className="flex flex-col justify-between pt-2">
          <div className="grid h-40 grid-cols-7 items-end gap-2 border-b border-gborder/40 px-2 pb-2 sm:gap-3">
            {daysData.map((d) => {
              const heightPercent = Math.max(Math.round((d.total / maxSessions) * 100), 12);
              return (
                <div
                  key={d.dateKey}
                  className="group relative flex h-full flex-col items-center justify-end"
                >
                  <div className="pointer-events-none absolute -top-9 z-30 opacity-0 transition-all duration-200 group-hover:opacity-100 whitespace-nowrap rounded-xl border border-navy/20 bg-navy px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
                    {d.label}: {d.total} buổi
                  </div>

                  <span
                    className={clsx(
                      "mb-1.5 text-xs font-bold transition-colors",
                      d.isToday ? "scale-110 font-extrabold text-[#0532e6]" : "text-navy/70",
                    )}
                  >
                    {d.total}
                  </span>

                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={clsx(
                      "relative w-full max-w-[2.5rem] overflow-hidden rounded-t-xl shadow-2xs transition-all duration-500 group-hover:scale-105",
                      d.isToday
                        ? "bg-gradient-to-t from-[#001258] via-[#0532e6] to-[#1e45ee] ring-2 ring-[#0532e6]/30 shadow-xs"
                        : d.total > 0
                          ? "bg-gradient-to-t from-navy to-slate-700 group-hover:from-navy group-hover:to-[#0532e6]"
                          : "border border-dashed border-gborder bg-gbg2",
                    )}
                  />
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 gap-2 pt-3 text-center sm:gap-3">
            {daysData.map((d) => (
              <div key={d.dateKey} className="flex flex-col items-center">
                <span
                  className={clsx(
                    "text-xs font-bold",
                    d.isToday ? "font-extrabold text-navy" : "text-gtext",
                  )}
                >
                  {d.short}
                </span>
                {d.isToday && (
                  <span className="mt-0.5 rounded-md bg-[#0532e6]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#0532e6]">
                    Hôm nay
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </QueryState>
    </Card>
  );
}

export function AdminDashboardPage() {
  const students = useQuery({
    queryKey: ["admin", "students", "count"],
    queryFn: () => adminApi.students({ page: 1, per_page: 1 }),
  });
  const teachers = useQuery({
    queryKey: ["admin", "teachers", "count"],
    queryFn: () => adminApi.teachers({ page: 1, per_page: 1 }),
  });
  const courses = useQuery({
    queryKey: ["admin", "courses", "count"],
    queryFn: () => adminApi.courses({ page: 1, per_page: 1 }),
  });
  const classes = useQuery({
    queryKey: ["admin", "classes", "count"],
    queryFn: () => adminApi.classes({ page: 1, per_page: 1 }),
  });
  const schedule = useQuery({
    queryKey: ["admin", "sessions", "dashboard"],
    queryFn: () => adminApi.sessions({ page: 1, per_page: 5, from: new Date().toISOString() }),
  });
  const loading = [students, teachers, courses, classes, schedule].some((q) => q.isLoading);
  const error = [students, teachers, courses, classes, schedule].find((q) => q.error)?.error;
  return (
    <div>
      <PageHeader
        eyebrow="Trung tâm điều hành"
        title="Tổng quan đào tạo"
        subtitle="Nắm bắt quy mô hệ thống, lịch vận hành và truy cập nhanh các nghiệp vụ quan trọng."
        actions={
          <Link to="/admin/lich-hoc">
            <Button variant="accent">
              <Icon name="plus" className="h-4 w-4" />
              Tạo buổi học
            </Button>
          </Link>
        }
      />
      <QueryState loading={loading} error={error}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Học viên"
            value={students.data?.meta.total ?? 0}
            hint="Hồ sơ trên hệ thống"
            icon="users"
          />
          <StatCard
            label="Giảng viên"
            value={teachers.data?.meta.total ?? 0}
            hint="Nguồn lực đào tạo"
            icon="teacher"
            tone="blue"
          />
          <StatCard
            label="Khóa học"
            value={courses.data?.meta.total ?? 0}
            hint="Chương trình đào tạo"
            icon="book"
            tone="gold"
          />
          <StatCard
            label="Lớp học"
            value={classes.data?.meta.total ?? 0}
            hint="Đang được quản lý"
            icon="school"
            tone="green"
          />
        </div>

        <div className="mt-6">
          <WeeklySessionChart />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <Card>
            <SectionHeader
              title="Lịch đào tạo sắp tới"
              subtitle="5 buổi gần nhất trên toàn hệ thống"
              action={
                <Link
                  className="text-xs font-semibold text-[#0532e6] hover:text-[#1e45ee]"
                  to="/admin/lich-hoc"
                >
                  Xem lịch →
                </Link>
              }
            />
            <div className="space-y-2">
              {schedule.data?.items.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-3 rounded-xl border border-gborder px-3.5 py-3"
                >
                  <div className="flex shrink-0 items-center justify-center text-navy/70">
                    <Icon name="calendar" className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{session.title}</b>
                    <p className="mt-0.5 truncate text-xs text-gtext">
                      {session.class_code} · {formatDateTime(session.starts_at)}
                    </p>
                  </div>
                  <StatusBadge value={session.status} />
                </div>
              ))}
              {!schedule.data?.items.length && (
                <p className="rounded-xl bg-gbg2 p-4 text-sm text-gtext">Chưa có lịch sắp tới.</p>
              )}
            </div>
          </Card>
          <Card>
            <SectionHeader title="Tình trạng vận hành" subtitle="Tổng quan nhanh hôm nay" />
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-success-bg p-4">
                <div className="flex items-center gap-3">
                  <Icon name="check" className="h-5 w-5 text-success" />
                  <div>
                    <b className="text-sm">Hệ thống hoạt động</b>
                    <p className="text-xs text-gtext">API và dữ liệu sẵn sàng</p>
                  </div>
                </div>
                <Badge tone="green">Ổn định</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#0532e6]/10 p-4">
                <div className="flex items-center gap-3">
                  <Icon name="clock" className="h-5 w-5 text-[#0532e6]" />
                  <div>
                    <b className="text-sm">Buổi sắp tới</b>
                    <p className="text-xs text-gtext">Cần theo dõi lịch</p>
                  </div>
                </div>
                <b>{schedule.data?.meta.total ?? 0}</b>
              </div>
            </div>
          </Card>
        </div>
      </QueryState>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Link to="/admin/hoc-vien">
          <QuickAction
            title="Quản lý học viên"
            description="Tạo tài khoản và cập nhật hồ sơ học viên."
            icon="users"
          />
        </Link>
        <Link to="/admin/lop-hoc">
          <QuickAction
            title="Lớp học & phân công"
            description="Ghi danh học viên và phân công giảng viên."
            icon="school"
          />
        </Link>
        <Link to="/admin/lich-hoc">
          <QuickAction
            title="Quản lý lịch học"
            description="Tạo buổi học, theo dõi điểm danh và xung đột."
            icon="calendar"
          />
        </Link>
      </div>
    </div>
  );
}

type PersonKind = "student" | "teacher";
type Person = Student | Teacher;

const personListConfigs: Record<PersonKind, ListQueryConfig<string, string>> = {
  student: {
    filterKeys: ["status", "course_id", "class_id", "attendance_risk"],
    allowedSorts: ["created_at", "student_code", "full_name"],
    defaultSort: "created_at",
    defaultOrder: "desc",
  },
  teacher: {
    filterKeys: ["status", "course_id", "class_id", "assignment"],
    allowedSorts: ["created_at", "teacher_code", "full_name"],
    defaultSort: "created_at",
    defaultOrder: "desc",
  },
};

const personStatusOptions: Record<PersonKind, Array<[string, string]>> = {
  student: [
    ["active", "Hoạt động"],
    ["pending", "Chờ xử lý"],
    ["suspended", "Tạm nghỉ"],
    ["completed", "Đã hoàn thành"],
    ["withdrawn", "Đã rút"],
  ],
  teacher: [
    ["active", "Hoạt động"],
    ["inactive", "Không hoạt động"],
  ],
};

function PersonDirectory({ kind }: { kind: PersonKind }) {
  const isStudent = kind === "student";
  const perPage = 10;
  const queryClient = useQueryClient();
  const config = personListConfigs[kind];
  const [searchParams, setSearchParams] = useSearchParams();
  const listState = readListQuery(searchParams, config);
  const [searchInput, setSearchInput] = useState(listState.q);
  const [courseSearch, setCourseSearch] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const debouncedCourseSearch = useDebouncedValue(courseSearch);
  const debouncedClassSearch = useDebouncedValue(classSearch);
  const [editing, setEditing] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const editID = searchParams.get("edit") ?? "";

  const editPersonQuery = useQuery<Person>({
    queryKey: ["admin", kind, editID, "edit-profile"],
    queryFn: async () =>
      (isStudent ? await adminApi.getStudent(editID) : await adminApi.getTeacher(editID)) as Person,
    enabled: Boolean(editID),
  });

  useEffect(() => setSearchInput(listState.q), [listState.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === listState.q) return;
    setSearchParams(patchListQuery(searchParams, { q: debouncedSearch }, config), {
      replace: true,
    });
  }, [config, debouncedSearch, listState.q, searchParams, setSearchParams]);

  const updateList = (patch: Record<string, string | number | undefined>) =>
    setSearchParams(patchListQuery(searchParams, patch, config), { replace: true });

  const courseOptionsQuery = useQuery({
    queryKey: ["admin", "courses", "filter-options", debouncedCourseSearch],
    queryFn: () =>
      adminApi.courses({
        page: 1,
        per_page: 20,
        search: debouncedCourseSearch,
        sort_by: "code",
        sort_order: "asc",
      }),
  });
  const classOptionsQuery = useQuery({
    queryKey: [
      "admin",
      "classes",
      "filter-options",
      debouncedClassSearch,
      listState.filters.course_id,
    ],
    queryFn: () =>
      adminApi.classes({
        page: 1,
        per_page: 20,
        search: debouncedClassSearch,
        course_id: listState.filters.course_id || undefined,
        sort_by: "class_code",
        sort_order: "asc",
      }),
  });
  const selectedCourseQuery = useQuery({
    queryKey: ["admin", "course", listState.filters.course_id],
    queryFn: () => adminApi.getCourse(listState.filters.course_id),
    enabled: Boolean(listState.filters.course_id),
  });
  const selectedClassQuery = useQuery({
    queryKey: ["admin", "class", listState.filters.class_id],
    queryFn: () => adminApi.getClass(listState.filters.class_id),
    enabled: Boolean(listState.filters.class_id),
  });
  const courseOptions = useMemo(() => {
    const items = [...(courseOptionsQuery.data?.items ?? [])];
    if (
      selectedCourseQuery.data &&
      !items.some((item) => item.id === selectedCourseQuery.data!.id)
    ) {
      items.unshift(selectedCourseQuery.data);
    }
    return items.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }));
  }, [courseOptionsQuery.data?.items, selectedCourseQuery.data]);
  const classOptions = useMemo(() => {
    const items = [...(classOptionsQuery.data?.items ?? [])];
    if (selectedClassQuery.data && !items.some((item) => item.id === selectedClassQuery.data!.id)) {
      items.unshift(selectedClassQuery.data);
    }
    return items.map((item) => ({
      value: item.id,
      label: `${item.class_code} — ${item.name}`,
      description: item.course_name,
    }));
  }, [classOptionsQuery.data?.items, selectedClassQuery.data]);

  const query = useQuery<Paginated<Person>>({
    queryKey: [
      "admin",
      kind,
      listState.page,
      listState.q,
      listState.filters.status,
      listState.filters.course_id,
      listState.filters.class_id,
      listState.filters.assignment,
      listState.filters.attendance_risk,
      listState.sort,
      listState.order,
    ],
    queryFn: async () => {
      if (isStudent)
        return (await adminApi.students({
          page: listState.page,
          per_page: perPage,
          search: listState.q,
          status: listState.filters.status,
          course_id: listState.filters.course_id,
          class_id: listState.filters.class_id,
          attendance_risk: (listState.filters.attendance_risk || undefined) as
            "at_risk" | "on_track" | undefined,
          sort_by: listState.sort,
          sort_order: listState.order,
        })) as Paginated<Person>;
      return (await adminApi.teachers({
        page: listState.page,
        per_page: perPage,
        search: listState.q,
        status: listState.filters.status,
        course_id: listState.filters.course_id,
        class_id: listState.filters.class_id,
        assignment: (listState.filters.assignment || undefined) as
          "assigned" | "unassigned" | undefined,
        sort_by: listState.sort,
        sort_order: listState.order,
      })) as Paginated<Person>;
    },
  });
  const mutation = useMutation<Person, Error, { id?: string; body: unknown }>({
    mutationFn: async ({ id, body }) => {
      if (isStudent)
        return (await (id
          ? adminApi.updateStudent(id, body)
          : adminApi.createStudent(body))) as Person;
      return (await (id
        ? adminApi.updateTeacher(id, body)
        : adminApi.createTeacher(body))) as Person;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", kind] });
      setOpen(false);
      setEditing(null);
      if (editID) {
        const next = new URLSearchParams(searchParams);
        next.delete("edit");
        setSearchParams(next, { replace: true });
      }
    },
  });
  useEffect(() => {
    if (!editPersonQuery.data) return;
    setEditing(editPersonQuery.data);
    setOpen(true);
  }, [editPersonQuery.data]);
  const importMutation = useMutation({
    mutationFn: async (file: File) => adminApi.importStudents(await file.text()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "students"] }),
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      adminApi.exportStudents({
        search: listState.q,
        status: listState.filters.status,
        course_id: listState.filters.course_id,
        class_id: listState.filters.class_id,
        attendance_risk: (listState.filters.attendance_risk || undefined) as
          "at_risk" | "on_track" | undefined,
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "danh-sach-hoc-vien.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const items = (query.data?.items ?? []) as Person[];
  const openCreate = () => {
    setEditing(null);
    mutation.reset();
    setOpen(true);
  };
  const title = isStudent ? "Học viên" : "Giảng viên";
  const profilePath = (person: Person) =>
    `${isStudent ? "/admin/hoc-vien" : "/admin/giang-vien"}/${person.id}`;
  const statusLabel = personStatusOptions[kind].find(
    ([value]) => value === listState.filters.status,
  )?.[1];
  const activeFilters = [
    ...(statusLabel ? [{ key: "status", label: `Trạng thái: ${statusLabel}` }] : []),
    ...(selectedCourseQuery.data
      ? [
          {
            key: "course_id",
            label: `Khóa: ${selectedCourseQuery.data.code}`,
          },
        ]
      : []),
    ...(selectedClassQuery.data
      ? [
          {
            key: "class_id",
            label: `Lớp: ${selectedClassQuery.data.class_code}`,
          },
        ]
      : []),
    ...(!isStudent && listState.filters.assignment
      ? [
          {
            key: "assignment",
            label:
              listState.filters.assignment === "assigned"
                ? "Đã được phân công"
                : "Chưa được phân công",
          },
        ]
      : []),
    ...(isStudent && listState.filters.attendance_risk
      ? [
          {
            key: "attendance_risk",
            label:
              listState.filters.attendance_risk === "at_risk"
                ? "Chuyên cần: Có nguy cơ"
                : "Chuyên cần: Đạt tiến độ",
          },
        ]
      : []),
  ];
  const hasActiveFilter = Boolean(listState.q || activeFilters.length);
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`Quản lý tài khoản và hồ sơ ${title.toLowerCase()}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {isStudent ? (
              <>
                <input
                  ref={importInput}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importMutation.mutate(file);
                    event.target.value = "";
                  }}
                />
                <Button variant="soft" onClick={() => importInput.current?.click()}>
                  Nhập CSV
                </Button>
                <Button
                  variant="soft"
                  loading={exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  Xuất CSV
                </Button>
              </>
            ) : null}
            <Button onClick={openCreate}>
              <Icon name="plus" className="h-4 w-4" />
              Thêm {title.toLowerCase()}
            </Button>
          </div>
        }
      />
      <FilterBar
        search={searchInput}
        onSearch={setSearchInput}
        resultCount={query.data?.meta.total}
        activeFilters={activeFilters}
        onRemoveFilter={(key) => updateList({ [key]: "" })}
        onClearAll={() => {
          setSearchInput("");
          setSearchParams(new URLSearchParams(), { replace: true });
        }}
      >
        <div className="w-full min-w-44 sm:w-48">
          <Select
            label="Trạng thái"
            value={listState.filters.status}
            onChange={(event) => updateList({ status: event.target.value })}
          >
            <option value="">Tất cả</option>
            {personStatusOptions[kind].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {!isStudent ? (
          <div className="w-full min-w-44 sm:w-52">
            <Select
              label="Phân công"
              value={listState.filters.assignment}
              onChange={(event) => updateList({ assignment: event.target.value })}
            >
              <option value="">Tất cả</option>
              <option value="assigned">Đã phân công</option>
              <option value="unassigned">Chưa phân công</option>
            </Select>
          </div>
        ) : null}
        {isStudent ? (
          <div className="w-full min-w-44 sm:w-52">
            <Select
              label="Nguy cơ chuyên cần"
              value={listState.filters.attendance_risk}
              onChange={(event) => updateList({ attendance_risk: event.target.value })}
            >
              <option value="">Tất cả</option>
              <option value="at_risk">Có nguy cơ dưới 80%</option>
              <option value="on_track">Đạt tiến độ</option>
            </Select>
          </div>
        ) : null}
        <div className="w-full min-w-56 sm:w-64">
          <SearchCombobox
            label="Khóa học"
            value={listState.filters.course_id}
            onChange={(value) => updateList({ course_id: value, class_id: "" })}
            onSearch={setCourseSearch}
            options={courseOptions}
            loading={courseOptionsQuery.isLoading}
            placeholder="Tìm mã hoặc tên khóa…"
          />
        </div>
        <div className="w-full min-w-56 sm:w-64">
          <SearchCombobox
            label="Lớp học"
            value={listState.filters.class_id}
            onChange={(value) => updateList({ class_id: value })}
            onSearch={setClassSearch}
            options={classOptions}
            loading={classOptionsQuery.isLoading}
            placeholder="Tìm mã hoặc tên lớp…"
          />
        </div>
      </FilterBar>
      {isStudent && importMutation.data ? (
        <Card className="mb-5 border-emerald-200 bg-emerald-50 p-4 text-sm">
          Đã nhập <b>{importMutation.data.imported}</b> học viên; lỗi{" "}
          <b>{importMutation.data.failed}</b> dòng.
          {importMutation.data.errors.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700">
              {importMutation.data.errors.slice(0, 10).map((item) => (
                <li key={`${item.row}-${item.email ?? ""}`}>
                  Dòng {item.row}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      {isStudent && importMutation.error ? (
        <div className="mb-5">
          <ErrorBanner message={mutationMessage(importMutation.error)} />
        </div>
      ) : null}
      {isStudent && exportMutation.error ? (
        <div className="mb-5">
          <ErrorBanner message={mutationMessage(exportMutation.error)} />
        </div>
      ) : null}
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && items.length === 0}
        emptyTitle={hasActiveFilter ? "Không có kết quả phù hợp" : `Chưa có ${title.toLowerCase()}`}
      >
        <DataTable
          items={items}
          sort={{ key: listState.sort, order: listState.order }}
          onSort={(key, order) => updateList({ sort: key, order })}
          columns={[
            {
              header: "STT",
              className: "w-16 text-center",
              cell: (_p, rowIndex) => directoryRowNumber(listState.page, perPage, rowIndex),
            },
            {
              header: "Mã",
              sortKey: isStudent ? "student_code" : "teacher_code",
              cell: (p) => (
                <Link className="font-semibold text-navy hover:text-[#0532e6]" to={profilePath(p)}>
                  {isStudent ? (p as Student).student_code : (p as Teacher).teacher_code}
                </Link>
              ),
            },
            {
              header: "Avatar",
              className: "w-20",
              cell: (p) => <PersonAvatar fullName={p.full_name} avatarUrl={p.avatar_url} />,
            },
            {
              header: "Họ tên",
              sortKey: "full_name",
              cell: (p) => (
                <Link className="font-semibold text-navy hover:text-[#0532e6]" to={profilePath(p)}>
                  {p.full_name}
                </Link>
              ),
            },
            { header: "Email", cell: (p) => p.email },
            ...(isStudent
              ? [
                  {
                    header: "Liên hệ",
                    cell: (p: Person) => (p as Student).phone || "Chưa cập nhật",
                  },
                ]
              : []),
            { header: "Trạng thái", cell: (p) => <StatusBadge value={p.status} /> },
            {
              header: "",
              cell: (p) => (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(p);
                    mutation.reset();
                    setOpen(true);
                  }}
                >
                  Chỉnh sửa
                </Button>
              ),
            },
          ]}
        />
        <Pagination
          page={listState.page}
          totalPages={query.data?.meta.total_pages ?? 0}
          onPage={(page) => updateList({ page })}
        />
      </QueryState>
      <Modal
        open={open}
        title={`${editing ? "Cập nhật" : "Thêm"} ${title.toLowerCase()}`}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          if (editID) {
            const next = new URLSearchParams(searchParams);
            next.delete("edit");
            setSearchParams(next, { replace: true });
          }
        }}
      >
        <PersonForm
          kind={kind}
          initial={editing}
          loading={mutation.isPending}
          error={mutation.error}
          onSubmit={(body) => mutation.mutate({ id: editing?.id, body })}
        />
      </Modal>
    </div>
  );
}

function PersonForm({
  kind,
  initial,
  loading,
  error,
  onSubmit,
}: {
  kind: PersonKind;
  initial: Person | null;
  loading: boolean;
  error: Error | null;
  onSubmit: (body: unknown) => void;
}) {
  const isStudent = kind === "student";
  const initialCode = initial
    ? isStudent
      ? (initial as Student).student_code
      : (initial as Teacher).teacher_code
    : "";
  const [avatarUrl, setAvatarUrl] = useState<string>(initial?.avatar_url ?? "");
  const [compressing, setCompressing] = useState(false);
  const [compressError, setCompressError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFile = async (file: File) => {
    try {
      setCompressing(true);
      setCompressError(null);
      const webpDataUrl = await compressImageToWebP(file, 400, 400, 0.82);
      setAvatarUrl(webpDataUrl);
    } catch (err) {
      setCompressError(err instanceof Error ? err.message : "Không thể nén ảnh.");
    } finally {
      setCompressing(false);
    }
  };

  const [form, setForm] = useState({
    email: initial?.email ?? "",
    temporary_password: "",
    code: initialCode,
    full_name: initial?.full_name ?? "",
    phone: initial?.phone ?? "",
    extra:
      initial && !isStudent
        ? ((initial as Teacher).specialization ?? "")
        : initial && isStudent
          ? ((initial as Student).date_of_birth ?? "")
          : "",
    status: initial?.status ?? "active",
    account_status: initial?.account_status ?? "active",
    enrolled_at: initial && isStudent ? ((initial as Student).enrolled_at ?? "") : "",
    gender: initial && isStudent ? ((initial as Student).gender ?? "") : "",
    address: initial && isStudent ? ((initial as Student).address ?? "") : "",
    emergency_contact_name:
      initial && isStudent ? ((initial as Student).emergency_contact_name ?? "") : "",
    emergency_contact_phone:
      initial && isStudent ? ((initial as Student).emergency_contact_phone ?? "") : "",
    status_change_reason: "",
  });
  const history = useQuery({
    queryKey: ["admin", "students", initial?.id, "status-history"],
    queryFn: () => adminApi.studentStatusHistory(initial!.id),
    enabled: isStudent && Boolean(initial?.id),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const common = {
      email: form.email.trim(),
      account_status: form.account_status,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      status: form.status,
    };
    const body = isStudent
      ? {
          ...common,
          avatar_url: avatarUrl || null,
          date_of_birth: form.extra || null,
          enrolled_at: form.enrolled_at || null,
          gender: form.gender || null,
          address: form.address.trim() || null,
          emergency_contact_name: form.emergency_contact_name.trim() || null,
          emergency_contact_phone: form.emergency_contact_phone.trim() || null,
          status_change_reason: form.status_change_reason.trim() || null,
          ...(initial ? {} : { temporary_password: form.temporary_password }),
        }
      : {
          ...common,
          teacher_code: form.code.trim(),
          avatar_url: avatarUrl || null,
          specialization: form.extra.trim() || null,
          ...(initial ? {} : { temporary_password: form.temporary_password }),
        };
    onSubmit(body);
  };
  const update = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <form className="space-y-4" onSubmit={submit}>
      {error ? <ErrorBanner message={mutationMessage(error)} /> : null}
      <div className="space-y-3 rounded-xl border border-gborder bg-gbg2/50 p-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-gtext">
          Avatar {isStudent ? "học viên" : "giảng viên"} (Tự động nén WebP)
        </label>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Avatar Preview"
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover border-2 border-navy shadow-xs shrink-0"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-bold text-white border border-gborder">
              {form.full_name
                ? form.full_name
                    .split(" ")
                    .filter(Boolean)
                    .slice(-2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()
                : isStudent
                  ? "HV"
                  : "GV"}
            </div>
          )}
          <div className="space-y-1.5 flex-1 min-w-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarFile(file);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="soft"
                loading={compressing}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarUrl ? "Đổi ảnh Avatar" : "Tải ảnh Avatar lên"}
              </Button>
              {avatarUrl && (
                <Button type="button" variant="ghost" onClick={() => setAvatarUrl("")}>
                  Xóa ảnh
                </Button>
              )}
            </div>
            <p className="text-[11px] text-gtext">
              Tự động tối ưu dung lượng và chuyển đổi sang định dạng WebP siêu nhẹ.
            </p>
            {compressError && <p className="text-xs text-error font-medium">{compressError}</p>}
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          required
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
        />
        {isStudent ? (
          <Input
            label="Mã học viên"
            value={initial ? form.code : "Tự động tạo dạng HV00000001"}
            disabled
          />
        ) : (
          <Input
            required
            label="Mã giảng viên"
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
          />
        )}
      </div>
      {isStudent ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Giới tính"
              value={form.gender}
              onChange={(e) => update("gender", e.target.value)}
            >
              <option value="">Chưa cập nhật</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
              <option value="unspecified">Không muốn cung cấp</option>
            </Select>
            <Input
              label="Ngày nhập học"
              type="date"
              value={form.enrolled_at}
              onChange={(e) => update("enrolled_at", e.target.value)}
            />
          </div>
          <Textarea
            label="Địa chỉ"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Người liên hệ khẩn cấp"
              value={form.emergency_contact_name}
              onChange={(e) => update("emergency_contact_name", e.target.value)}
            />
            <Input
              label="SĐT liên hệ khẩn cấp"
              value={form.emergency_contact_phone}
              onChange={(e) => update("emergency_contact_phone", e.target.value)}
            />
          </div>
        </>
      ) : null}
      <Input
        required
        label="Họ và tên"
        value={form.full_name}
        onChange={(e) => update("full_name", e.target.value)}
      />
      {!initial && (
        <Input
          required
          minLength={8}
          label="Mật khẩu tạm thời"
          type="password"
          value={form.temporary_password}
          onChange={(e) => update("temporary_password", e.target.value)}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Điện thoại"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
        />
        <Input
          label={isStudent ? "Ngày sinh" : "Chuyên môn"}
          type={isStudent ? "date" : "text"}
          value={form.extra}
          onChange={(e) => update("extra", e.target.value)}
        />
      </div>
      {isStudent && initial && form.status !== initial.status ? (
        <Textarea
          required
          label="Lý do thay đổi trạng thái"
          value={form.status_change_reason}
          onChange={(e) => update("status_change_reason", e.target.value)}
          placeholder="Ví dụ: Học viên xin tạm nghỉ đến tháng 9"
        />
      ) : null}
      {isStudent && initial ? (
        <div className="rounded-2xl border border-gborder bg-slate-50 p-4">
          <p className="mb-3 text-sm font-semibold text-navy">Lịch sử trạng thái</p>
          {history.isLoading ? <p className="text-sm text-muted">Đang tải…</p> : null}
          {history.error ? <ErrorBanner message="Không thể tải lịch sử trạng thái." /> : null}
          <div className="space-y-3">
            {(history.data ?? []).map((item) => (
              <div key={item.id} className="border-l-2 border-[#0532e6] pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {item.from_status ? <StatusBadge value={item.from_status} /> : <Badge>Mới</Badge>}
                  <span aria-hidden="true">→</span>
                  <StatusBadge value={item.to_status} />
                </div>
                <p className="mt-1 text-navy">{item.reason}</p>
                <p className="text-xs text-muted">
                  {formatDateTime(item.changed_at)} · {item.changed_by_email ?? "Hệ thống"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Trạng thái hồ sơ"
          value={form.status}
          onChange={(e) => update("status", e.target.value)}
        >
          {(isStudent
            ? ["pending", "active", "suspended", "completed", "withdrawn"]
            : ["active", "inactive"]
          ).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        <Select
          label="Trạng thái tài khoản"
          value={form.account_status}
          onChange={(e) => update("account_status", e.target.value)}
        >
          {["pending", "active", "suspended", "inactive"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          Lưu thông tin
        </Button>
      </div>
    </form>
  );
}

export function StudentsPage() {
  return <PersonDirectory kind="student" />;
}
export function TeachersPage() {
  return <PersonDirectory kind="teacher" />;
}

export function CoursesPage() {
  const client = useQueryClient();
  const config: ListQueryConfig<string, string> = useMemo(
    () => ({
      filterKeys: ["status"],
      allowedSorts: ["created_at", "code", "name"],
      defaultSort: "created_at",
      defaultOrder: "desc",
    }),
    [],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const listState = readListQuery(searchParams, config);
  const [searchInput, setSearchInput] = useState(listState.q);
  const debouncedSearch = useDebouncedValue(searchInput);
  const [editing, setEditing] = useState<Course | null>(null);
  const [testsCourse, setTestsCourse] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setSearchInput(listState.q), [listState.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === listState.q) return;
    setSearchParams(patchListQuery(searchParams, { q: debouncedSearch }, config), {
      replace: true,
    });
  }, [config, debouncedSearch, listState.q, searchParams, setSearchParams]);
  const updateList = (patch: Record<string, string | number | undefined>) =>
    setSearchParams(patchListQuery(searchParams, patch, config), { replace: true });
  const query = useQuery({
    queryKey: [
      "admin",
      "courses",
      listState.page,
      listState.q,
      listState.filters.status,
      listState.sort,
      listState.order,
    ],
    queryFn: () =>
      adminApi.courses({
        page: listState.page,
        per_page: 10,
        search: listState.q,
        status: listState.filters.status,
        sort_by: listState.sort,
        sort_order: listState.order,
      }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      id ? adminApi.updateCourse(id, body) : adminApi.createCourse(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "courses"] });
      setOpen(false);
    },
  });
  return (
    <div>
      <PageHeader
        title="Khóa học"
        subtitle="Quản lý chương trình và yêu cầu hoàn thành."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Icon name="plus" className="h-4 w-4" /> Thêm khóa học
          </Button>
        }
      />
      <FilterBar
        search={searchInput}
        onSearch={setSearchInput}
        resultCount={query.data?.meta.total}
        activeFilters={
          listState.filters.status
            ? [
                {
                  key: "status",
                  label: `Trạng thái: ${statusLabel(listState.filters.status)}`,
                },
              ]
            : []
        }
        onRemoveFilter={() => updateList({ status: "" })}
        onClearAll={() => {
          setSearchInput("");
          setSearchParams(new URLSearchParams(), { replace: true });
        }}
      >
        <div className="w-full min-w-44 sm:w-52">
          <Select
            label="Trạng thái"
            value={listState.filters.status}
            onChange={(event) => updateList({ status: event.target.value })}
          >
            <option value="">Tất cả</option>
            <option value="draft">Bản nháp</option>
            <option value="active">Hoạt động</option>
            <option value="inactive">Không hoạt động</option>
            <option value="archived">Lưu trữ</option>
          </Select>
        </div>
      </FilterBar>
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.data?.items.length}
        emptyTitle={
          listState.q || listState.filters.status ? "Không có kết quả phù hợp" : "Chưa có khóa học"
        }
      >
        <DataTable
          items={query.data?.items ?? []}
          sort={{ key: listState.sort, order: listState.order }}
          onSort={(key, order) => updateList({ sort: key, order })}
          columns={[
            {
              header: "Mã",
              sortKey: "code",
              className: "whitespace-nowrap min-w-[120px]",
              cell: (c) => <b className="text-navy">{c.code}</b>,
            },
            {
              header: "Tên khóa học",
              sortKey: "name",
              className: "min-w-[240px]",
              cell: (c) => c.name,
            },
            {
              header: "Số buổi",
              className: "whitespace-nowrap text-center",
              cell: (c) => c.total_sessions,
            },
            {
              header: "Chuyên cần tối thiểu",
              className: "whitespace-nowrap text-center",
              cell: (c) => `${c.minimum_attendance_pct}%`,
            },
            {
              header: "Trạng thái",
              className: "whitespace-nowrap",
              cell: (c) => <StatusBadge value={c.status} />,
            },
            {
              header: "",
              className: "whitespace-nowrap text-right w-1",
              cell: (c) => (
                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                  <Button variant="soft" onClick={() => setTestsCourse(c)}>
                    Bài kiểm tra
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(c);
                      setOpen(true);
                    }}
                  >
                    Chỉnh sửa
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pagination
          page={listState.page}
          totalPages={query.data?.meta.total_pages ?? 0}
          onPage={(page) => updateList({ page })}
        />
      </QueryState>
      <Modal
        open={open}
        title={`${editing ? "Cập nhật" : "Thêm"} khóa học`}
        onClose={() => setOpen(false)}
      >
        <CourseForm
          initial={editing}
          loading={mutation.isPending}
          error={mutation.error}
          onSubmit={(body) => mutation.mutate({ id: editing?.id, body })}
        />
      </Modal>
      <Modal
        open={!!testsCourse}
        title={`Bài kiểm tra · ${testsCourse?.code ?? ""}`}
        onClose={() => setTestsCourse(null)}
      >
        {testsCourse && <CourseTestsPanel course={testsCourse} />}
      </Modal>
    </div>
  );
}

function CourseForm({
  initial,
  loading,
  error,
  onSubmit,
}: {
  initial: Course | null;
  loading: boolean;
  error: Error | null;
  onSubmit: (body: unknown) => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    total_sessions: initial?.total_sessions ?? 1,
    minimum_attendance_pct: 80,
    status: initial?.status ?? "draft",
  });
  const update = (k: string, v: string | number) => setForm((o) => ({ ...o, [k]: v }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, description: form.description || null });
      }}
    >
      {error && <ErrorBanner message={mutationMessage(error)} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          required
          label="Mã khóa học"
          value={form.code}
          onChange={(e) => update("code", e.target.value)}
        />
        <Input
          required
          label="Tên khóa học"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>
      <Textarea
        label="Mô tả"
        value={form.description}
        onChange={(e) => update("description", e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          required
          min={1}
          label="Tổng số buổi"
          type="number"
          value={form.total_sessions}
          onChange={(e) => update("total_sessions", Number(e.target.value))}
        />
        <Input
          disabled
          label="Chuyên cần tối thiểu (%) · cố định"
          type="number"
          value={form.minimum_attendance_pct}
        />
        <Select
          label="Trạng thái"
          value={form.status}
          onChange={(e) => update("status", e.target.value)}
        >
          {["draft", "active", "inactive", "archived"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          Lưu khóa học
        </Button>
      </div>
    </form>
  );
}

function CourseTestsPanel({ course }: { course: Course }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<CourseTest | null>(null);
  const [form, setForm] = useState({
    code: "KT01",
    title: "",
    kind: "class_test",
    pass_score: 5,
    is_required: true,
    sequence_no: 1,
    is_active: true,
  });
  const query = useQuery({
    queryKey: ["admin", "course-tests", course.id],
    queryFn: () => adminApi.courseTests(course.id),
  });
  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? adminApi.updateCourseTest(course.id, editing.id, form)
        : adminApi.createCourseTest(course.id, form),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "course-tests", course.id] });
      setEditing(null);
      setForm({
        code: `KT${String((query.data?.length ?? 0) + 2).padStart(2, "0")}`,
        title: "",
        kind: "class_test",
        pass_score: 5,
        is_required: true,
        sequence_no: (query.data?.length ?? 0) + 2,
        is_active: true,
      });
    },
  });
  const selectTest = (test: CourseTest) => {
    setEditing(test);
    setForm({
      code: test.code,
      title: test.title,
      kind: test.kind,
      pass_score: test.pass_score,
      is_required: test.is_required,
      sequence_no: test.sequence_no,
      is_active: test.is_active,
    });
  };
  const update = (key: string, value: string | number | boolean) =>
    setForm((old) => {
      const next = { ...old, [key]: value };
      if (key === "kind" && value === "final_exam") {
        next.pass_score = 5;
        next.is_required = true;
      }
      return next;
    });
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gbg2 p-4 text-sm text-gtext">
        Bài kiểm tra và thi kết thúc khóa được tổ chức trên giấy. Admin cấu hình đầu điểm; giảng
        viên nhập kết quả sau khi chấm. Mọi bài bắt buộc phải đạt và điểm thi kết thúc phải lớn hơn
        5.
      </div>
      <QueryState loading={query.isLoading} error={query.error}>
        <div className="space-y-2">
          {query.data?.map((test) => (
            <button
              key={test.id}
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-gborder p-3 text-left transition hover:border-[#0532e6] hover:bg-[#0532e6]/5"
              onClick={() => selectTest(test)}
            >
              <span>
                <b>
                  {test.code} · {test.title}
                </b>
                <span className="mt-1 block text-xs text-gtext">
                  {test.kind === "final_exam"
                    ? "Thi kết thúc khóa · yêu cầu > 5"
                    : `Kiểm tra trong lớp · đạt từ ${test.pass_score}`}
                </span>
              </span>
              <StatusBadge value={test.is_active ? "active" : "inactive"} />
            </button>
          ))}
        </div>
      </QueryState>
      <form
        className="space-y-4 border-t border-gborder pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <h3 className="font-bold text-navy">
          {editing ? "Cập nhật bài kiểm tra" : "Thêm bài kiểm tra"}
        </h3>
        {mutation.error && <ErrorBanner message={mutationMessage(mutation.error)} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            required
            label="Mã"
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
          />
          <Input
            required
            label="Tên bài"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
          />
          <Select label="Loại" value={form.kind} onChange={(e) => update("kind", e.target.value)}>
            <option value="class_test">Kiểm tra trong lớp</option>
            <option value="final_exam">Thi kết thúc khóa</option>
          </Select>
          <Input
            required
            min={0}
            max={10}
            step={0.01}
            disabled={form.kind === "final_exam"}
            type="number"
            label={form.kind === "final_exam" ? "Mốc điểm · phải trên 5" : "Điểm đạt từ"}
            value={form.pass_score}
            onChange={(e) => update("pass_score", Number(e.target.value))}
          />
          <Input
            required
            min={1}
            type="number"
            label="Thứ tự"
            value={form.sequence_no}
            onChange={(e) => update("sequence_no", Number(e.target.value))}
          />
          <Select
            label="Trạng thái"
            value={form.is_active ? "active" : "inactive"}
            onChange={(e) => update("is_active", e.target.value === "active")}
          >
            <option value="active">Đang dùng</option>
            <option value="inactive">Ngừng dùng</option>
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          {editing && (
            <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
              Hủy sửa
            </Button>
          )}
          <Button type="submit" loading={mutation.isPending}>
            Lưu bài kiểm tra
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ClassesPage({ readOnly = false }: { readOnly?: boolean } = {}) {
  const client = useQueryClient();
  const config: ListQueryConfig<string, string> = useMemo(
    () => ({
      filterKeys: ["status", "course_id", "teacher_id", "capacity", "from_date", "to_date"],
      allowedSorts: ["created_at", "class_code", "start_date"],
      defaultSort: "created_at",
      defaultOrder: "desc",
    }),
    [],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const listState = readListQuery(searchParams, config);
  const [searchInput, setSearchInput] = useState(listState.q);
  const [courseSearch, setCourseSearch] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const debouncedCourseSearch = useDebouncedValue(courseSearch);
  const debouncedTeacherSearch = useDebouncedValue(teacherSearch);
  const [editing, setEditing] = useState<TrainingClass | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setSearchInput(listState.q), [listState.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === listState.q) return;
    setSearchParams(patchListQuery(searchParams, { q: debouncedSearch }, config), {
      replace: true,
    });
  }, [config, debouncedSearch, listState.q, searchParams, setSearchParams]);
  const updateList = (patch: Record<string, string | number | undefined>) =>
    setSearchParams(patchListQuery(searchParams, patch, config), { replace: true });
  const query = useQuery({
    queryKey: [
      "admin",
      "classes",
      listState.page,
      listState.q,
      listState.filters.status,
      listState.filters.course_id,
      listState.filters.teacher_id,
      listState.filters.capacity,
      listState.filters.from_date,
      listState.filters.to_date,
      listState.sort,
      listState.order,
    ],
    queryFn: () =>
      adminApi.classes({
        page: listState.page,
        per_page: 10,
        search: listState.q,
        status: listState.filters.status,
        course_id: listState.filters.course_id,
        teacher_id: listState.filters.teacher_id,
        capacity: (listState.filters.capacity || undefined) as "available" | "full" | undefined,
        from_date: listState.filters.from_date,
        to_date: listState.filters.to_date,
        sort_by: listState.sort,
        sort_order: listState.order,
      }),
  });
  const courses = useQuery({
    queryKey: ["admin", "courses", "options"],
    queryFn: () => adminApi.courses({ page: 1, per_page: 100 }),
  });
  const courseFilterOptions = useQuery({
    queryKey: ["admin", "courses", "class-filter-options", debouncedCourseSearch],
    queryFn: () =>
      adminApi.courses({
        page: 1,
        per_page: 20,
        search: debouncedCourseSearch,
        sort_by: "code",
        sort_order: "asc",
      }),
  });
  const teacherFilterOptions = useQuery({
    queryKey: ["admin", "teachers", "class-filter-options", debouncedTeacherSearch],
    queryFn: () =>
      adminApi.teachers({
        page: 1,
        per_page: 20,
        search: debouncedTeacherSearch,
        status: "active",
        sort_by: "teacher_code",
        sort_order: "asc",
      }),
  });
  const selectedCourse = useQuery({
    queryKey: ["admin", "course", listState.filters.course_id],
    queryFn: () => adminApi.getCourse(listState.filters.course_id),
    enabled: Boolean(listState.filters.course_id),
  });
  const selectedTeacher = useQuery({
    queryKey: ["admin", "teacher", listState.filters.teacher_id],
    queryFn: () => adminApi.getTeacher(listState.filters.teacher_id),
    enabled: Boolean(listState.filters.teacher_id),
  });
  const courseFilterChoices = useMemo(() => {
    const items = [...(courseFilterOptions.data?.items ?? [])];
    if (selectedCourse.data && !items.some((item) => item.id === selectedCourse.data!.id)) {
      items.unshift(selectedCourse.data);
    }
    return items.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }));
  }, [courseFilterOptions.data?.items, selectedCourse.data]);
  const teacherFilterChoices = useMemo(() => {
    const items = [...(teacherFilterOptions.data?.items ?? [])];
    if (selectedTeacher.data && !items.some((item) => item.id === selectedTeacher.data!.id)) {
      items.unshift(selectedTeacher.data);
    }
    return items.map((item) => ({
      value: item.id,
      label: `${item.teacher_code} — ${item.full_name}`,
    }));
  }, [selectedTeacher.data, teacherFilterOptions.data?.items]);
  const mutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      id ? adminApi.updateClass(id, body) : adminApi.createClass(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "classes"] });
      setOpen(false);
    },
  });
  return (
    <div>
      <PageHeader
        title="Lớp học"
        subtitle={
          readOnly
            ? "Tra cứu danh sách lớp học, sĩ số, ngày khai giảng và tình trạng còn chỗ."
            : "Quản lý lớp, sĩ số, ghi danh và phân công."
        }
        actions={
          readOnly ? null : (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Icon name="plus" className="h-4 w-4" /> Tạo lớp
            </Button>
          )
        }
      />
      <FilterBar
        search={searchInput}
        onSearch={setSearchInput}
        resultCount={query.data?.meta.total}
        activeFilters={[
          ...(listState.filters.status
            ? [{ key: "status", label: `Trạng thái: ${statusLabel(listState.filters.status)}` }]
            : []),
          ...(selectedCourse.data
            ? [{ key: "course_id", label: `Khóa: ${selectedCourse.data.code}` }]
            : []),
          ...(selectedTeacher.data
            ? [{ key: "teacher_id", label: `GV: ${selectedTeacher.data.teacher_code}` }]
            : []),
          ...(listState.filters.capacity
            ? [
                {
                  key: "capacity",
                  label: listState.filters.capacity === "full" ? "Đã đầy" : "Còn chỗ",
                },
              ]
            : []),
          ...(listState.filters.from_date
            ? [{ key: "from_date", label: `Từ ${formatDate(listState.filters.from_date)}` }]
            : []),
          ...(listState.filters.to_date
            ? [{ key: "to_date", label: `Đến ${formatDate(listState.filters.to_date)}` }]
            : []),
        ]}
        onRemoveFilter={(key) => updateList({ [key]: "" })}
        onClearAll={() => {
          setSearchInput("");
          setSearchParams(new URLSearchParams(), { replace: true });
        }}
        searchPlaceholder="Nhập mã hoặc tên lớp…"
      >
        <div className="w-full min-w-44 sm:w-48">
          <Select
            label="Trạng thái"
            value={listState.filters.status}
            onChange={(event) => updateList({ status: event.target.value })}
          >
            <option value="">Tất cả</option>
            <option value="planning">Chuẩn bị</option>
            <option value="open">Đang mở</option>
            <option value="in_progress">Đang diễn ra</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </Select>
        </div>
        <div className="w-full min-w-40 sm:w-44">
          <Select
            label="Sĩ số"
            value={listState.filters.capacity}
            onChange={(event) => updateList({ capacity: event.target.value })}
          >
            <option value="">Tất cả</option>
            <option value="available">Còn chỗ</option>
            <option value="full">Đã đầy</option>
          </Select>
        </div>
        <div className="w-full min-w-56 sm:w-64">
          <SearchCombobox
            label="Khóa học"
            value={listState.filters.course_id}
            onChange={(value) => updateList({ course_id: value })}
            onSearch={setCourseSearch}
            options={courseFilterChoices}
            loading={courseFilterOptions.isLoading}
          />
        </div>
        <div className="w-full min-w-56 sm:w-64">
          <SearchCombobox
            label="Giảng viên"
            value={listState.filters.teacher_id}
            onChange={(value) => updateList({ teacher_id: value })}
            onSearch={setTeacherSearch}
            options={teacherFilterChoices}
            loading={teacherFilterOptions.isLoading}
          />
        </div>
        <div className="w-full min-w-40 sm:w-44">
          <Input
            label="Từ ngày"
            name="class-from-date"
            type="date"
            value={listState.filters.from_date}
            onChange={(event) => updateList({ from_date: event.target.value })}
          />
        </div>
        <div className="w-full min-w-40 sm:w-44">
          <Input
            label="Đến ngày"
            name="class-to-date"
            type="date"
            value={listState.filters.to_date}
            onChange={(event) => updateList({ to_date: event.target.value })}
          />
        </div>
      </FilterBar>
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.data?.items.length}
        emptyTitle={
          listState.q || Object.values(listState.filters).some(Boolean)
            ? "Không có kết quả phù hợp"
            : "Chưa có lớp học"
        }
      >
        <DataTable
          items={query.data?.items ?? []}
          sort={{ key: listState.sort, order: listState.order }}
          onSort={(key, order) => updateList({ sort: key, order })}
          columns={[
            {
              header: "Lớp",
              sortKey: "class_code",
              className: "min-w-[170px]",
              cell: (c) => (
                <div>
                  <b className="text-navy">{c.class_code}</b>
                  <div className="text-xs text-gtext">{c.name}</div>
                </div>
              ),
            },
            {
              header: "Khóa học",
              className: "min-w-[220px]",
              cell: (c) => `${c.course_code} — ${c.course_name}`,
            },
            {
              header: "Thời gian",
              sortKey: "start_date",
              className: "whitespace-nowrap min-w-[150px]",
              cell: (c) => `${formatDate(c.start_date)} – ${formatDate(c.end_date)}`,
            },
            {
              header: "Sĩ số",
              className: "whitespace-nowrap text-center",
              cell: (c) => `${c.enrolled_students}/${c.maximum_students}`,
            },
            {
              header: "Trạng thái",
              className: "whitespace-nowrap",
              cell: (c) => <StatusBadge value={c.status} />,
            },
            {
              header: "",
              className: "whitespace-nowrap text-right w-1",
              cell: (c) => (
                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                  <Link to={readOnly ? `/sale/lop-hoc` : `/admin/lop-hoc/${c.id}`}>
                    <Button variant="ghost">Chi tiết</Button>
                  </Link>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      Sửa
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pagination
          page={listState.page}
          totalPages={query.data?.meta.total_pages ?? 0}
          onPage={(page) => updateList({ page })}
        />
      </QueryState>
      <Modal
        open={open}
        title={`${editing ? "Cập nhật" : "Tạo"} lớp học`}
        onClose={() => setOpen(false)}
      >
        <ClassForm
          initial={editing}
          courses={courses.data?.items ?? []}
          loading={mutation.isPending}
          error={mutation.error}
          onSubmit={(body) => mutation.mutate({ id: editing?.id, body })}
        />
      </Modal>
    </div>
  );
}

function ClassForm({
  initial,
  courses,
  loading,
  error,
  onSubmit,
}: {
  initial: TrainingClass | null;
  courses: Course[];
  loading: boolean;
  error: Error | null;
  onSubmit: (body: unknown) => void;
}) {
  const [form, setForm] = useState({
    course_id: initial?.course_id ?? courses[0]?.id ?? "",
    class_code: initial?.class_code ?? "",
    name: initial?.name ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    maximum_students: initial?.maximum_students ?? 20,
    status: initial?.status ?? "planning",
    change_reason: "",
  });
  const update = (k: string, v: string | number) => setForm((o) => ({ ...o, [k]: v }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      {error && <ErrorBanner message={mutationMessage(error)} />}
      <Select
        required
        label="Khóa học"
        value={form.course_id}
        onChange={(e) => update("course_id", e.target.value)}
      >
        <option value="">Chọn khóa học</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          required
          label="Mã lớp"
          value={form.class_code}
          onChange={(e) => update("class_code", e.target.value)}
        />
        <Input
          required
          label="Tên lớp"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          required
          label="Ngày bắt đầu"
          type="date"
          value={form.start_date}
          onChange={(e) => update("start_date", e.target.value)}
        />
        <Input
          required
          label="Ngày kết thúc"
          type="date"
          value={form.end_date}
          onChange={(e) => update("end_date", e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          required
          min={1}
          label="Sĩ số tối đa"
          type="number"
          value={form.maximum_students}
          onChange={(e) => update("maximum_students", Number(e.target.value))}
        />
        <Select
          label="Trạng thái"
          value={form.status}
          onChange={(e) => update("status", e.target.value)}
        >
          {["planning", "open", "in_progress", "completed", "cancelled", "archived"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </div>
      {initial ? (
        <Textarea
          required
          label="Lý do cập nhật"
          value={form.change_reason}
          onChange={(e) => update("change_reason", e.target.value)}
          placeholder="Ví dụ: Điều chỉnh sĩ số theo tình hình thực tế"
        />
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          Lưu lớp học
        </Button>
      </div>
    </form>
  );
}

export function ClassDetailPage() {
  const { classId = "" } = useParams();
  const client = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [role, setRole] = useState("Giảng viên phụ trách");
  const [enrollmentAction, setEnrollmentAction] = useState<Enrollment | null>(null);
  const [actionType, setActionType] = useState<EnrollmentAction>("transfer");
  const [actionReason, setActionReason] = useState("");
  const [returnEffectiveAt, setReturnEffectiveAt] = useState(vietnamDateTimeLocal);
  const [targetClassId, setTargetClassId] = useState("");
  const [assignmentToRemove, setAssignmentToRemove] = useState<TeacherAssignment | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const closeEnrollmentAction = () => {
    setEnrollmentAction(null);
    setActionReason("");
    setTargetClassId("");
    setReturnEffectiveAt(vietnamDateTimeLocal());
  };
  const detail = useQuery({
    queryKey: ["admin", "class", classId],
    queryFn: () => adminApi.getClass(classId),
    enabled: !!classId,
  });
  const enrollments = useQuery({
    queryKey: ["admin", "class", classId, "enrollments"],
    queryFn: () => adminApi.enrollments(classId),
    enabled: !!classId,
  });
  const assignments = useQuery({
    queryKey: ["admin", "class", classId, "assignments"],
    queryFn: () => adminApi.assignments(classId),
    enabled: !!classId,
  });
  const history = useQuery({
    queryKey: ["admin", "class", classId, "operation-history"],
    queryFn: () => adminApi.classHistory(classId),
    enabled: !!classId,
  });
  const transferTargets = useQuery({
    queryKey: ["admin", "classes", "transfer-targets", detail.data?.course_id],
    queryFn: () => adminApi.classes({ page: 1, per_page: 100, course_id: detail.data!.course_id }),
    enabled: Boolean(detail.data?.course_id),
  });
  const students = useQuery({
    queryKey: ["admin", "students", "options"],
    queryFn: () => adminApi.students({ page: 1, per_page: 100, status: "active" }),
  });
  const teachers = useQuery({
    queryKey: ["admin", "teachers", "options"],
    queryFn: () => adminApi.teachers({ page: 1, per_page: 100, status: "active" }),
  });
  const enroll = useMutation({
    mutationFn: () => adminApi.enroll(classId, studentId),
    onSuccess: () => {
      setStudentId("");
      void client.invalidateQueries({ queryKey: ["admin", "class", classId] });
    },
  });
  const assign = useMutation({
    mutationFn: () => adminApi.assign(classId, teacherId, role),
    onSuccess: () => {
      setTeacherId("");
      void client.invalidateQueries({ queryKey: ["admin", "class", classId, "assignments"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => adminApi.removeAssignment(classId, assignmentToRemove!.id, removeReason),
    onSuccess: () => {
      setAssignmentToRemove(null);
      setRemoveReason("");
      void client.invalidateQueries({ queryKey: ["admin", "class", classId] });
    },
  });
  const enrollmentOperation = useMutation<Enrollment | EnrollmentTransfer, Error>({
    mutationFn: () => {
      if (!enrollmentAction) throw new Error("Chưa chọn học viên");
      return actionType === "transfer"
        ? adminApi.transferEnrollment(classId, enrollmentAction.id, targetClassId, actionReason)
        : adminApi.updateEnrollment(
            classId,
            enrollmentAction.id,
            actionType === "reenroll" ? "enrolled" : actionType,
            actionReason,
            actionType === "reenroll" ? vietnamLocalInputToRFC3339(returnEffectiveAt) : undefined,
          );
    },
    onSuccess: () => {
      closeEnrollmentAction();
      void client.invalidateQueries({ queryKey: ["admin", "class", classId] });
      void client.invalidateQueries({ queryKey: ["admin", "classes"] });
      void client.invalidateQueries({ queryKey: ["admin", "sessions"] });
      void client.invalidateQueries({ queryKey: ["admin", "attendance"] });
    },
  });
  return (
    <div>
      <PageHeader
        title={detail.data ? `${detail.data.class_code} — ${detail.data.name}` : "Chi tiết lớp"}
        subtitle={detail.data?.course_name}
        actions={
          <Link to="/admin/lop-hoc">
            <Button variant="ghost">
              <Icon name="arrow-left" className="h-4 w-4" />
              Danh sách lớp
            </Button>
          </Link>
        }
      />
      <QueryState loading={detail.isLoading} error={detail.error}>
        {detail.data && (
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Sĩ số"
              value={`${detail.data.enrolled_students}/${detail.data.maximum_students}`}
            />
            <StatCard label="Bắt đầu" value={formatDate(detail.data.start_date)} />
            <StatCard label="Trạng thái" value={<StatusBadge value={detail.data.status} />} />
          </div>
        )}
      </QueryState>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold text-navy">Ghi danh học viên</h2>
          {enroll.error && <ErrorBanner message={mutationMessage(enroll.error)} />}
          <div className="mb-4 flex gap-2">
            <Select
              label="Học viên"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Chọn học viên</option>
              {students.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.student_code} — {s.full_name}
                </option>
              ))}
            </Select>
            <Button
              className="mt-6"
              disabled={!studentId}
              loading={enroll.isPending}
              onClick={() => enroll.mutate()}
            >
              Ghi danh
            </Button>
          </div>
          <QueryState
            loading={enrollments.isLoading}
            error={enrollments.error}
            empty={!enrollments.data?.length}
            emptyTitle="Lớp chưa có học viên"
          >
            <div className="space-y-2">
              {enrollments.data?.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-gborder p-3"
                >
                  <div>
                    <b>{e.student_code}</b>
                    <p className="text-sm text-gtext">{e.full_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StatusBadge value={e.status} />
                    <EnrollmentActionButtons
                      enrollment={e}
                      onAction={(action) => {
                        setEnrollmentAction(e);
                        setActionType(action);
                        if (action === "reenroll") setReturnEffectiveAt(vietnamDateTimeLocal());
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </QueryState>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold text-navy">Phân công giảng viên</h2>
          {(assign.error || remove.error) && (
            <ErrorBanner message={mutationMessage(assign.error || remove.error)} />
          )}
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Select
              label="Giảng viên"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">Chọn giảng viên</option>
              {teachers.data?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.teacher_code} — {t.full_name}
                </option>
              ))}
            </Select>
            <Input label="Vai trò" value={role} onChange={(e) => setRole(e.target.value)} />
            <Button
              className="mt-6"
              disabled={!teacherId || !role}
              loading={assign.isPending}
              onClick={() => assign.mutate()}
            >
              Phân công
            </Button>
          </div>
          <QueryState
            loading={assignments.isLoading}
            error={assignments.error}
            empty={!assignments.data?.length}
            emptyTitle="Chưa phân công giảng viên"
          >
            <div className="space-y-2">
              {assignments.data?.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-gborder p-3"
                >
                  <div>
                    <b>
                      {a.teacher_code} — {a.full_name}
                    </b>
                    <p className="text-sm text-gtext">{a.assignment_role}</p>
                  </div>
                  <Button variant="danger" onClick={() => setAssignmentToRemove(a)}>
                    Gỡ
                  </Button>
                </div>
              ))}
            </div>
          </QueryState>
        </Card>
      </div>
      <Card className="mt-6">
        <SectionHeader
          title="Lịch sử vận hành"
          subtitle="Các thay đổi quan trọng được lưu lại để đối soát."
        />
        <QueryState
          loading={history.isLoading}
          error={history.error}
          empty={!history.data?.length}
          emptyTitle="Chưa có lịch sử vận hành"
        >
          <div className="divide-y divide-gborder">
            {history.data?.map((item) => (
              <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr_auto]">
                <div>
                  <p className="font-semibold text-navy">{operationEventLabel(item.event_type)}</p>
                  <p className="text-xs text-gtext">{formatDateTime(item.occurred_at)}</p>
                </div>
                <div className="text-sm text-gtext">
                  <p>{item.reason || "Thao tác khởi tạo dữ liệu"}</p>
                  {Object.keys(item.details ?? {}).length > 0 ? (
                    <p className="mt-1 text-xs text-gtext/80">{operationDetails(item.details)}</p>
                  ) : null}
                </div>
                <span className="text-xs font-medium text-navy">
                  {item.actor_email || "Hệ thống"}
                </span>
              </div>
            ))}
          </div>
        </QueryState>
      </Card>
      <Modal
        open={!!enrollmentAction}
        title={
          actionType === "transfer"
            ? "Chuyển học viên sang lớp khác"
            : actionType === "completed"
              ? "Xác nhận hoàn thành lớp"
              : actionType === "reenroll"
                ? "Đưa học viên trở lại lớp"
                : "Xác nhận rút khỏi lớp"
        }
        onClose={closeEnrollmentAction}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            enrollmentOperation.mutate();
          }}
        >
          {enrollmentAction ? (
            <div className="rounded-xl bg-gbg2 p-4 text-sm text-navy">
              <b>{enrollmentAction.student_code}</b> — {enrollmentAction.full_name}
            </div>
          ) : null}
          {actionType === "transfer" ? (
            <Select
              required
              label="Lớp tiếp nhận"
              value={targetClassId}
              onChange={(event) => setTargetClassId(event.target.value)}
            >
              <option value="">Chọn lớp cùng khóa học</option>
              {transferTargets.data?.items
                .filter(
                  (item) =>
                    item.id !== classId &&
                    ["planning", "open", "in_progress"].includes(item.status),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.class_code} — {item.name} ({item.enrolled_students}/
                    {item.maximum_students})
                  </option>
                ))}
            </Select>
          ) : null}
          {actionType === "reenroll" ? (
            <Input
              required
              type="datetime-local"
              name="reenrollment-effective-at"
              label="Có hiệu lực từ"
              value={returnEffectiveAt}
              min={detail.data ? `${detail.data.start_date}T00:00` : undefined}
              max={detail.data ? `${detail.data.end_date}T23:59` : undefined}
              onChange={(event) => setReturnEffectiveAt(event.target.value)}
              autoComplete="off"
            />
          ) : null}
          <Textarea
            required
            label="Lý do"
            value={actionReason}
            onChange={(event) => setActionReason(event.target.value)}
            placeholder="Nhập lý do để lưu vào lịch sử vận hành"
          />
          {enrollmentOperation.error ? (
            <ErrorBanner message={mutationMessage(enrollmentOperation.error)} />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeEnrollmentAction}>
              Hủy
            </Button>
            <Button
              type="submit"
              loading={enrollmentOperation.isPending}
              disabled={
                !actionReason.trim() ||
                (actionType === "transfer" && !targetClassId) ||
                (actionType === "reenroll" && !returnEffectiveAt)
              }
            >
              {actionType === "reenroll" ? "Đưa trở lại lớp" : "Xác nhận"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!assignmentToRemove}
        title="Gỡ phân công giảng viên"
        onClose={() => {
          setAssignmentToRemove(null);
          setRemoveReason("");
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            remove.mutate();
          }}
        >
          <p className="text-sm text-gtext">
            Phân công của <b className="text-navy">{assignmentToRemove?.full_name}</b> sẽ được gỡ
            khỏi lớp và lưu vào lịch sử.
          </p>
          <Textarea
            required
            label="Lý do"
            value={removeReason}
            onChange={(event) => setRemoveReason(event.target.value)}
          />
          {remove.error ? <ErrorBanner message={mutationMessage(remove.error)} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAssignmentToRemove(null)}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={remove.isPending}
              disabled={!removeReason.trim()}
            >
              Gỡ phân công
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const operationEventLabels: Record<string, string> = {
  class_created: "Tạo lớp học",
  class_updated: "Cập nhật lớp học",
  student_enrolled: "Ghi danh học viên",
  student_reenrolled: "Đưa học viên trở lại lớp",
  enrollment_status_changed: "Cập nhật ghi danh",
  student_transferred_out: "Chuyển học viên đi",
  student_transferred_in: "Tiếp nhận học viên",
  teacher_assigned: "Phân công giảng viên",
  teacher_assignment_updated: "Cập nhật phân công",
  teacher_removed: "Gỡ phân công",
  session_created: "Tạo buổi học",
  session_updated: "Điều chỉnh buổi học",
  session_cancelled: "Hủy buổi học",
  attendance_corrected: "Hiệu chỉnh điểm danh",
};

function operationEventLabel(value: string) {
  return operationEventLabels[value] ?? value.replaceAll("_", " ");
}

function operationDetails(details: Record<string, unknown>) {
  if ("before" in details || "after" in details) {
    return "Đã lưu dữ liệu trước và sau thay đổi";
  }
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 4)
    .map(
      ([key, value]) =>
        `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
    )
    .join(" · ");
}

const scheduleListConfig: ListQueryConfig<string, string> = {
  filterKeys: [
    "status",
    "class_id",
    "teacher_id",
    "location_id",
    "session_type",
    "attendance_state",
  ],
  allowedSorts: ["starts_at", "title", "created_at"],
  defaultSort: "starts_at",
  defaultOrder: "asc",
};

export function ScheduleAdminPage({ readOnly = false }: { readOnly?: boolean } = {}) {
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const listState = readListQuery(searchParams, scheduleListConfig);
  const [searchInput, setSearchInput] = useState(listState.q);
  const [classFilterSearch, setClassFilterSearch] = useState("");
  const [teacherFilterSearch, setTeacherFilterSearch] = useState("");
  const [locationFilterSearch, setLocationFilterSearch] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const debouncedClassFilterSearch = useDebouncedValue(classFilterSearch);
  const debouncedTeacherFilterSearch = useDebouncedValue(teacherFilterSearch);
  const debouncedLocationFilterSearch = useDebouncedValue(locationFilterSearch);
  const [open, setOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState(currentWeekStart);
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const calendarRange =
    calendarView === "week" ? weekRange(calendarAnchor) : monthRange(calendarAnchor);
  useEffect(() => setSearchInput(listState.q), [listState.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === listState.q) return;
    setSearchParams(patchListQuery(searchParams, { q: debouncedSearch }, scheduleListConfig), {
      replace: true,
    });
  }, [debouncedSearch, listState.q, searchParams, setSearchParams]);
  const updateList = (patch: Record<string, string | number | undefined>) =>
    setSearchParams(patchListQuery(searchParams, patch, scheduleListConfig), { replace: true });
  const query = useQuery({
    queryKey: ["admin", "sessions", "calendar", calendarView, calendarAnchor, listState],
    queryFn: () =>
      adminApi.sessions({
        page: 1,
        per_page: 100,
        from: calendarRange.from,
        to: calendarRange.to,
        search: listState.q,
        status: listState.filters.status,
        class_id: listState.filters.class_id,
        teacher_id: listState.filters.teacher_id,
        location_id: listState.filters.location_id,
        session_type: listState.filters.session_type,
        attendance_state: (listState.filters.attendance_state || undefined) as
          "locked" | "unlocked" | undefined,
        sort_by: listState.sort,
        sort_order: listState.order,
      }),
  });
  const classes = useQuery({
    queryKey: ["admin", "classes", "options"],
    queryFn: () => adminApi.classes({ page: 1, per_page: 100 }),
  });
  const teachers = useQuery({
    queryKey: ["admin", "teachers", "options"],
    queryFn: () => adminApi.teachers({ page: 1, per_page: 100, status: "active" }),
  });
  const locations = useQuery({
    queryKey: ["admin", "locations", "options"],
    queryFn: () => adminApi.locations({ page: 1, per_page: 100 }),
  });
  const classFilterOptions = useQuery({
    queryKey: ["admin", "classes", "schedule-filter", debouncedClassFilterSearch],
    queryFn: () =>
      adminApi.classes({
        page: 1,
        per_page: 20,
        search: debouncedClassFilterSearch,
        sort_by: "class_code",
        sort_order: "asc",
      }),
  });
  const teacherFilterOptions = useQuery({
    queryKey: ["admin", "teachers", "schedule-filter", debouncedTeacherFilterSearch],
    queryFn: () =>
      adminApi.teachers({
        page: 1,
        per_page: 20,
        search: debouncedTeacherFilterSearch,
        status: "active",
        sort_by: "teacher_code",
        sort_order: "asc",
      }),
  });
  const locationFilterOptions = useQuery({
    queryKey: ["admin", "locations", "schedule-filter", debouncedLocationFilterSearch],
    queryFn: () =>
      adminApi.locations({ page: 1, per_page: 20, search: debouncedLocationFilterSearch }),
  });
  const mutation = useMutation({
    mutationFn: adminApi.createSession,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "sessions"] });
      setOpen(false);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => adminApi.updateSession(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "sessions"] });
      void client.invalidateQueries({ queryKey: ["admin", "class"] });
      setSelectedSession(null);
    },
  });
  const events: WeekCalendarEvent[] = (query.data?.items ?? []).map((session) => ({
    id: session.id,
    title: session.title,
    subtitle: `${session.class_code} · ${session.teacher_name ?? "Chưa phân công"}`,
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
      label: "Sắp diễn ra",
      value: (query.data?.items ?? []).filter(
        (session) => session.status !== "cancelled" && new Date(session.starts_at).getTime() > now,
      ).length,
      tone: "navy",
    },
    {
      label: "Đã diễn ra",
      value: (query.data?.items ?? []).filter(
        (session) => session.status !== "cancelled" && new Date(session.ends_at).getTime() <= now,
      ).length,
      tone: "green",
    },
    {
      label: "Đã hủy",
      value: (query.data?.items ?? []).filter((session) => session.status === "cancelled").length,
      tone: "red",
    },
  ] satisfies CalendarStat[];
  const scheduleClassOptions = (classFilterOptions.data?.items ?? []).map((item) => ({
    value: item.id,
    label: `${item.class_code} — ${item.name}`,
  }));
  const scheduleTeacherOptions = (teacherFilterOptions.data?.items ?? []).map((item) => ({
    value: item.id,
    label: `${item.teacher_code} — ${item.full_name}`,
  }));
  const scheduleLocationOptions = (locationFilterOptions.data?.items ?? []).map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}`,
  }));
  const selectedScheduleClass = classes.data?.items.find(
    (item) => item.id === listState.filters.class_id,
  );
  const selectedScheduleTeacher = teachers.data?.items.find(
    (item) => item.id === listState.filters.teacher_id,
  );
  const selectedScheduleLocation = locations.data?.items.find(
    (item) => item.id === listState.filters.location_id,
  );
  const activeScheduleFilters = [
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
    ...(selectedScheduleClass
      ? [{ key: "class_id", label: `Lớp: ${selectedScheduleClass.class_code}` }]
      : []),
    ...(selectedScheduleTeacher
      ? [{ key: "teacher_id", label: `GV: ${selectedScheduleTeacher.teacher_code}` }]
      : []),
    ...(selectedScheduleLocation
      ? [{ key: "location_id", label: `Phòng: ${selectedScheduleLocation.code}` }]
      : []),
  ];
  const advancedScheduleFilterCount = [
    listState.filters.class_id,
    listState.filters.teacher_id,
    listState.filters.location_id,
  ].filter(Boolean).length;
  const advancedScheduleFilters = (
    <>
      <div className="w-full min-w-56 sm:w-60">
        <SearchCombobox
          label="Lớp học"
          value={listState.filters.class_id}
          onChange={(value) => updateList({ class_id: value })}
          onSearch={setClassFilterSearch}
          options={
            selectedScheduleClass &&
            !scheduleClassOptions.some((option) => option.value === selectedScheduleClass.id)
              ? [
                  {
                    value: selectedScheduleClass.id,
                    label: `${selectedScheduleClass.class_code} — ${selectedScheduleClass.name}`,
                  },
                  ...scheduleClassOptions,
                ]
              : scheduleClassOptions
          }
          loading={classFilterOptions.isLoading}
        />
      </div>
      <div className="w-full min-w-56 sm:w-60">
        <SearchCombobox
          label="Giảng viên"
          value={listState.filters.teacher_id}
          onChange={(value) => updateList({ teacher_id: value })}
          onSearch={setTeacherFilterSearch}
          options={
            selectedScheduleTeacher &&
            !scheduleTeacherOptions.some((option) => option.value === selectedScheduleTeacher.id)
              ? [
                  {
                    value: selectedScheduleTeacher.id,
                    label: `${selectedScheduleTeacher.teacher_code} — ${selectedScheduleTeacher.full_name}`,
                  },
                  ...scheduleTeacherOptions,
                ]
              : scheduleTeacherOptions
          }
          loading={teacherFilterOptions.isLoading}
        />
      </div>
      <div className="w-full min-w-56 sm:w-60">
        <SearchCombobox
          label="Phòng / xưởng"
          value={listState.filters.location_id}
          onChange={(value) => updateList({ location_id: value })}
          onSearch={setLocationFilterSearch}
          options={
            selectedScheduleLocation &&
            !scheduleLocationOptions.some((option) => option.value === selectedScheduleLocation.id)
              ? [
                  {
                    value: selectedScheduleLocation.id,
                    label: `${selectedScheduleLocation.code} — ${selectedScheduleLocation.name}`,
                  },
                  ...scheduleLocationOptions,
                ]
              : scheduleLocationOptions
          }
          loading={locationFilterOptions.isLoading}
        />
      </div>
    </>
  );
  return (
    <div>
      <PageHeader
        eyebrow="Điều phối đào tạo"
        title="Lịch học"
        subtitle={
          readOnly
            ? "Xem lịch học các lớp, thời khóa biểu và ca học để tư vấn học viên."
            : "Lập lịch, theo dõi giảng viên và xem điểm danh trên một lịch thống nhất."
        }
        actions={
          readOnly ? null : (
            <>
              <Button variant="ghost" onClick={() => setLocationsOpen(true)}>
                Phòng / xưởng
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Icon name="plus" className="h-4 w-4" />
                Tạo buổi học
              </Button>
            </>
          )
        }
      />
      <FilterBar
        search={searchInput}
        onSearch={setSearchInput}
        resultCount={query.data?.meta.total}
        activeFilters={activeScheduleFilters}
        onRemoveFilter={(key) => updateList({ [key]: "" })}
        onClearAll={() => {
          setSearchInput("");
          setSearchParams(new URLSearchParams(), { replace: true });
        }}
        searchPlaceholder="Nội dung buổi học, mã lớp, giảng viên…"
        advancedFilters={advancedScheduleFilters}
        advancedFilterCount={advancedScheduleFilterCount}
      >
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
      </FilterBar>
      <QueryState loading={query.isLoading} error={query.error}>
        <WeekCalendar
          events={events}
          weekStart={calendarAnchor}
          onWeekStartChange={setCalendarAnchor}
          view={calendarView}
          onViewChange={setCalendarView}
          stats={calendarStats}
          onEventClick={(event) =>
            setSelectedSession(query.data?.items.find((item) => item.id === event.id) ?? null)
          }
        />
      </QueryState>
      <Modal open={open} title="Tạo buổi học" onClose={() => setOpen(false)}>
        <SessionForm
          key="new-session"
          classes={classes.data?.items ?? []}
          teachers={teachers.data?.items ?? []}
          locations={locations.data?.items ?? []}
          loading={mutation.isPending}
          error={mutation.error}
          onSubmit={(body) => mutation.mutate(body)}
        />
      </Modal>
      <Modal
        open={!!selectedSession}
        title={selectedSession?.title ?? "Chi tiết buổi học"}
        onClose={() => setSelectedSession(null)}
      >
        {selectedSession ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gbg2 p-4">
              <div className="text-sm text-gtext">
                <b className="text-navy">{selectedSession.class_code}</b>
                <span> · {formatDateTime(selectedSession.starts_at)}</span>
                <p>{selectedSession.location_name || "Chưa xếp phòng"}</p>
              </div>
              <Link
                to={
                  readOnly
                    ? `/sale/diem-danh?session=${selectedSession.id}`
                    : `/admin/diem-danh?session=${selectedSession.id}`
                }
              >
                <Button variant="soft">Xem điểm danh</Button>
              </Link>
            </div>
            {readOnly ? (
              <div className="rounded-xl border border-gborder p-4 text-xs text-slate-600 space-y-2 bg-slate-50">
                <p>
                  <b>Giảng viên:</b> {selectedSession.teacher_name || "Chưa phân công"}
                </p>
                <p>
                  <b>Phòng học:</b> {selectedSession.location_name || "Chưa xếp phòng"}
                </p>
                <p>
                  <b>Thời gian:</b> {formatDateTime(selectedSession.starts_at)} -{" "}
                  {formatDateTime(selectedSession.ends_at)}
                </p>
                <p>
                  <b>Trạng thái:</b> {statusLabel(selectedSession.status)}
                </p>
              </div>
            ) : selectedSession.status === "locked" || selectedSession.attendance_locked_at ? (
              <div className="rounded-xl border border-gborder p-4 text-sm text-gtext">
                Buổi học đã được khóa sau ngày điểm danh. Bạn vẫn có thể xem tình trạng điểm danh
                nhưng không thể thay đổi lịch.
              </div>
            ) : (
              <SessionForm
                key={selectedSession.id}
                initial={selectedSession}
                classes={classes.data?.items ?? []}
                teachers={teachers.data?.items ?? []}
                locations={locations.data?.items ?? []}
                loading={updateMutation.isPending}
                error={updateMutation.error}
                onSubmit={(body) => updateMutation.mutate({ id: selectedSession.id, body })}
              />
            )}
          </div>
        ) : null}
      </Modal>
      <Modal
        open={locationsOpen}
        title="Quản lý phòng và xưởng"
        onClose={() => setLocationsOpen(false)}
      >
        <LocationManager
          locations={locations.data?.items ?? []}
          loading={locations.isLoading}
          error={locations.error}
          onSaved={() => {
            void client.invalidateQueries({ queryKey: ["admin", "locations"] });
          }}
        />
      </Modal>
    </div>
  );
}

function SessionForm({
  initial = null,
  classes,
  teachers,
  locations,
  loading,
  error,
  onSubmit,
}: {
  initial?: ClassSession | null;
  classes: TrainingClass[];
  teachers: Teacher[];
  locations: TrainingLocation[];
  loading: boolean;
  error: Error | null;
  onSubmit: (body: unknown) => void;
}) {
  const [form, setForm] = useState({
    class_id: initial?.class_id ?? "",
    teacher_id: initial?.teacher_id ?? "",
    location_id: initial?.location_id ?? "",
    title: initial?.title ?? "",
    session_type: initial?.session_type ?? "theory",
    session_date: initial?.starts_at
      ? vietnamDateKey(new Date(initial.starts_at))
      : vietnamDateKey(new Date()),
    slot: (initial ? inferTrainingSlot(initial.starts_at, initial.ends_at) : null) ?? "morning",
    status: initial?.status ?? "scheduled",
    change_reason: "",
  });
  const update = (k: string, v: string) => setForm((o) => ({ ...o, [k]: v }));
  const body = useMemo(() => {
    const range = trainingSlotRange(form.session_date, form.slot as TrainingSlotKey);
    return {
      class_id: form.class_id,
      title: form.title,
      session_type: form.session_type,
      status: form.status,
      change_reason: form.change_reason,
      module_id: null,
      teacher_id: form.teacher_id || null,
      location_id: form.location_id || null,
      starts_at: range.startsAt,
      ends_at: range.endsAt,
    };
  }, [form]);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(body);
      }}
    >
      {error && <ErrorBanner message={mutationMessage(error)} />}
      <Select
        required
        label="Lớp học"
        value={form.class_id}
        onChange={(e) => update("class_id", e.target.value)}
      >
        <option value="">Chọn lớp</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.class_code} — {c.name}
          </option>
        ))}
      </Select>
      <Input
        required
        label="Tiêu đề buổi học"
        value={form.title}
        onChange={(e) => update("title", e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          required
          label="Ngày học"
          type="date"
          value={form.session_date}
          onChange={(e) => update("session_date", e.target.value)}
        />
        <Select
          required
          label="Ca học"
          value={form.slot}
          onChange={(e) => update("slot", e.target.value)}
        >
          <option value="morning">Sáng · 08:00–12:00</option>
          <option value="afternoon">Chiều · 13:30–17:30</option>
          <option value="evening">Tối · 18:30–21:30</option>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="Loại buổi"
          value={form.session_type}
          onChange={(e) => update("session_type", e.target.value)}
        >
          <option value="theory">Lý thuyết</option>
          <option value="workshop">Thực hành xưởng</option>
          <option value="assessment">Đánh giá kỹ năng</option>
          <option value="other">Khác</option>
        </Select>
        <Select
          label="Giảng viên"
          value={form.teacher_id}
          onChange={(e) => update("teacher_id", e.target.value)}
        >
          <option value="">Chưa chọn</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.teacher_code} — {t.full_name}
            </option>
          ))}
        </Select>
        <Select
          label="Địa điểm"
          value={form.location_id}
          onChange={(e) => update("location_id", e.target.value)}
        >
          <option value="">Chưa chọn</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </Select>
      </div>
      {initial ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Trạng thái"
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="scheduled">Đã lên lịch</option>
            <option value="completed">Đã diễn ra</option>
            <option value="cancelled">Đã hủy</option>
          </Select>
          <Textarea
            required
            label="Lý do điều chỉnh"
            value={form.change_reason}
            onChange={(e) => update("change_reason", e.target.value)}
            placeholder="Đổi giờ, đổi phòng, hủy buổi…"
          />
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          {initial ? "Lưu thay đổi" : "Tạo buổi học"}
        </Button>
      </div>
    </form>
  );
}

function LocationManager({
  locations,
  loading,
  error,
  onSaved,
}: {
  locations: TrainingLocation[];
  loading: boolean;
  error: Error | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<TrainingLocation | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    location_type: "classroom",
    capacity: "",
    is_active: true,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        capacity: form.capacity ? Number(form.capacity) : null,
      };
      return editing ? adminApi.updateLocation(editing.id, body) : adminApi.createLocation(body);
    },
    onSuccess: () => {
      setEditing(null);
      setForm({ code: "", name: "", location_type: "classroom", capacity: "", is_active: true });
      onSaved();
    },
  });
  const selectLocation = (location: TrainingLocation) => {
    setEditing(location);
    setForm({
      code: location.code,
      name: location.name,
      location_type: location.location_type,
      capacity: location.capacity ? String(location.capacity) : "",
      is_active: location.is_active,
    });
  };
  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-2xl border border-gborder p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            required
            label="Mã địa điểm"
            value={form.code}
            onChange={(event) => setForm((old) => ({ ...old, code: event.target.value }))}
          />
          <Input
            required
            label="Tên phòng / xưởng"
            value={form.name}
            onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))}
          />
          <Select
            label="Loại địa điểm"
            value={form.location_type}
            onChange={(event) => setForm((old) => ({ ...old, location_type: event.target.value }))}
          >
            <option value="classroom">Phòng học</option>
            <option value="workshop">Xưởng thực hành</option>
            <option value="lab">Phòng máy / phòng lab</option>
            <option value="other">Khác</option>
          </Select>
          <Input
            label="Sức chứa"
            type="number"
            min="1"
            value={form.capacity}
            onChange={(event) => setForm((old) => ({ ...old, capacity: event.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-navy">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm((old) => ({ ...old, is_active: event.target.checked }))}
          />
          Cho phép xếp lịch tại địa điểm này
        </label>
        {save.error ? <ErrorBanner message={mutationMessage(save.error)} /> : null}
        <div className="flex justify-end gap-2">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setForm({
                  code: "",
                  name: "",
                  location_type: "classroom",
                  capacity: "",
                  is_active: true,
                });
              }}
            >
              Tạo mới
            </Button>
          ) : null}
          <Button type="submit" loading={save.isPending}>
            {editing ? "Lưu địa điểm" : "Thêm địa điểm"}
          </Button>
        </div>
      </form>
      <QueryState loading={loading} error={error} empty={!locations.length}>
        <div className="space-y-2">
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => selectLocation(location)}
              className="flex w-full items-center justify-between rounded-xl border border-gborder p-3 text-left transition hover:border-[#0532e6] hover:bg-[#0532e6]/5"
            >
              <span>
                <b className="text-navy">
                  {location.code} — {location.name}
                </b>
                <span className="block text-xs text-gtext">
                  {location.location_type} · {location.capacity || "Không giới hạn"} chỗ
                </span>
              </span>
              <StatusBadge value={location.is_active ? "active" : "inactive"} />
            </button>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
