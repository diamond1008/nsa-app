import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useSearchParams } from "react-router-dom";

import { SearchCombobox } from "../../components/SearchCombobox";
import { QueryState } from "../../components/data";
import { useDebouncedValue } from "../../components/filters";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Input,
  Modal,
  PageHeader,
  SuccessBanner,
} from "../../components/ui";
import { ApiRequestError } from "../../lib/apiClient";
import type { AttendanceRosterItem, ClassSession } from "../../lib/domainTypes";
import { formatDateTime } from "../../lib/format";
import {
  attendanceStatusForSave,
  legacyAttendanceLabel,
  projectAttendanceStatus,
  rollCallOptions,
  studentInitials,
  type RollCallStatus,
} from "../attendance/twoStateAttendance";
import { teacherApi } from "./teacherApi";

type RosterFilter = "all" | "unrecorded" | RollCallStatus;
type DraftRecord = { status: RollCallStatus; note: string };

function vietnamDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function teacherAttendanceEditState(session: ClassSession, now = new Date()) {
  if (session.attendance_locked_at || session.status === "locked") {
    return { editable: false, label: "Đã khóa" };
  }
  if (session.status === "cancelled") return { editable: false, label: "Đã hủy" };
  if (now < new Date(session.starts_at)) return { editable: false, label: "Chưa đến giờ" };
  if (vietnamDateKey(now) !== vietnamDateKey(session.starts_at)) {
    return { editable: false, label: "Đã hết ngày" };
  }
  return { editable: true, label: "Đang mở" };
}

function initialDraft(item: AttendanceRosterItem): DraftRecord {
  return { status: projectAttendanceStatus(item.attendance_status), note: item.note ?? "" };
}

function isDirty(item: AttendanceRosterItem, draft: DraftRecord | undefined) {
  const current = draft ?? initialDraft(item);
  if (!item.attendance_id) return true;
  return (
    current.status !== projectAttendanceStatus(item.attendance_status) ||
    current.note !== (item.note ?? "")
  );
}

function errorText(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : "Không thể lưu điểm danh. Vui lòng thử lại.";
}

function rosterFilterLabel(filter: RosterFilter) {
  if (filter === "all") return "Tất cả";
  if (filter === "unrecorded") return "Chưa ghi";
  return rollCallOptions.find((item) => item.value === filter)?.label ?? filter;
}

function selectorDateRange() {
  const from = new Date();
  from.setDate(from.getDate() - 180);
  const to = new Date();
  to.setDate(to.getDate() + 180);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function TeacherAttendancePage() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session") ?? "";
  const client = useQueryClient();
  const [sessionSearch, setSessionSearch] = useState("");
  const debouncedSessionSearch = useDebouncedValue(sessionSearch, 300);
  const [studentSearch, setStudentSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const [confirmAbsent, setConfirmAbsent] = useState(false);
  const selectorRange = useMemo(() => selectorDateRange(), []);

  const schedule = useQuery({
    queryKey: ["teacher", "schedule", "attendance", debouncedSessionSearch],
    queryFn: () =>
      teacherApi.schedule({
        page: 1,
        per_page: 20,
        search: debouncedSessionSearch || undefined,
        from: selectorRange.from,
        to: selectorRange.to,
        sort_by: "starts_at",
        sort_order: "desc",
      }),
  });
  const roster = useQuery({
    queryKey: ["teacher", "attendance", sessionId],
    queryFn: () => teacherApi.attendance(sessionId),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (!roster.data) return;
    setDrafts(
      Object.fromEntries(roster.data.items.map((item) => [item.student_id, initialDraft(item)])),
    );
    setStudentSearch("");
    setFilter("all");
  }, [roster.data]);

  const dirtyItems = useMemo(
    () => (roster.data?.items ?? []).filter((item) => isDirty(item, drafts[item.student_id])),
    [drafts, roster.data?.items],
  );

  const save = useMutation({
    mutationFn: (records: Parameters<typeof teacherApi.recordAttendance>[1]) =>
      teacherApi.recordAttendance(sessionId, records),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["teacher", "attendance", sessionId] });
    },
  });

  const handleSave = () => {
    const payload = dirtyItems.map((item) => {
      const draft = drafts[item.student_id] ?? initialDraft(item);
      return {
        student_id: item.student_id,
        status: attendanceStatusForSave(item.attendance_status, draft.status),
        note: draft.note.trim() || null,
      };
    });
    save.mutate(payload);
  };

  const options = useMemo(() => {
    const map = new Map(
      (schedule.data?.items ?? []).map((session) => [
        session.id,
        {
          value: session.id,
          label: `${session.class_code} — ${session.title}`,
          description: formatDateTime(session.starts_at),
        },
      ]),
    );
    if (roster.data && !map.has(roster.data.session.id)) {
      map.set(roster.data.session.id, {
        value: roster.data.session.id,
        label: `${roster.data.session.class_code} — ${roster.data.session.title}`,
        description: formatDateTime(roster.data.session.starts_at),
      });
    }
    return [...map.values()];
  }, [roster.data, schedule.data?.items]);

  const visibleItems = useMemo(() => {
    const normalized = studentSearch.trim().toLocaleLowerCase("vi");
    return [...(roster.data?.items ?? [])]
      .filter((item) => {
        const draft = drafts[item.student_id] ?? initialDraft(item);
        if (filter === "unrecorded" && item.attendance_id) return false;
        if (filter !== "all" && filter !== "unrecorded" && draft.status !== filter) return false;
        return `${item.student_code} ${item.full_name}`
          .toLocaleLowerCase("vi")
          .includes(normalized);
      })
      .sort((a, b) => Number(Boolean(a.attendance_id)) - Number(Boolean(b.attendance_id)));
  }, [drafts, filter, roster.data?.items, studentSearch]);

  const setStatus = (item: AttendanceRosterItem, status: RollCallStatus) => {
    setDrafts((current) => ({
      ...current,
      [item.student_id]: { ...(current[item.student_id] ?? initialDraft(item)), status },
    }));
    save.reset();
  };

  const markAll = (status: RollCallStatus) => {
    setDrafts((current) =>
      Object.fromEntries(
        (roster.data?.items ?? []).map((item) => [
          item.student_id,
          { ...(current[item.student_id] ?? initialDraft(item)), status },
        ]),
      ),
    );
    save.reset();
  };

  const editState = roster.data
    ? teacherAttendanceEditState(roster.data.session)
    : { editable: false, label: "Đang tải" };
  const counts: Record<RosterFilter, number> = {
    all: roster.data?.items.length ?? 0,
    unrecorded: roster.data?.items.filter((item) => !item.attendance_id).length ?? 0,
    present:
      roster.data?.items.filter((item) => drafts[item.student_id]?.status === "present").length ??
      0,
    absent:
      roster.data?.items.filter((item) => drafts[item.student_id]?.status === "absent").length ?? 0,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Nghiệp vụ lớp học"
        title="Điểm danh"
        subtitle="Học viên chưa ghi nhận được mặc định Vắng. Giảng viên đánh dấu người Có mặt rồi lưu; sau 00:00 giờ Việt Nam dữ liệu sẽ bị khóa."
      />

      <Card className="mb-5 relative z-20">
        <SearchCombobox
          label="Buổi học"
          value={sessionId}
          onChange={(value) => {
            setParams(value ? { session: value } : {});
            save.reset();
          }}
          onSearch={setSessionSearch}
          options={options}
          loading={schedule.isLoading}
          placeholder="Tìm theo mã lớp hoặc nội dung buổi học…"
        />
      </Card>

      {!sessionId ? (
        <Card>
          <p className="text-sm text-gtext">Chọn một buổi học để bắt đầu điểm danh.</p>
        </Card>
      ) : (
        <QueryState loading={roster.isLoading} error={roster.error}>
          {roster.data ? (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-navy">{roster.data.session.title}</h2>
                    <Badge tone={editState.editable ? "green" : "gray"}>{editState.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gtext">
                    {roster.data.session.class_code} ·{" "}
                    {formatDateTime(roster.data.session.starts_at)}
                    {roster.data.session.location_name
                      ? ` · ${roster.data.session.location_name}`
                      : ""}
                  </p>
                </div>
                {editState.editable ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => markAll("present")}>
                      Đánh dấu tất cả Có mặt
                    </Button>
                    <Button variant="danger" onClick={() => setConfirmAbsent(true)}>
                      Đánh dấu tất cả Vắng
                    </Button>
                  </div>
                ) : null}
              </Card>

              <div
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                aria-label="Lọc danh sách điểm danh"
              >
                {(["all", "unrecorded", "present", "absent"] as RosterFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${rosterFilterLabel(value)}: ${counts[value]}`}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={clsx(
                      "rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer shadow-2xs hover:scale-105 active:scale-95",
                      filter === value
                        ? "border-[#0532e6] bg-[#0532e6]/10 text-navy font-bold ring-2 ring-[#0532e6]/25 shadow-xs scale-[1.02]"
                        : "border-gborder bg-white text-navy hover:bg-gbg2 hover:border-slate-300",
                    )}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wider text-gtext">
                      {rosterFilterLabel(value)}
                    </span>
                    <strong className="mt-1 block text-2xl font-black text-navy">
                      {counts[value]}
                    </strong>
                  </button>
                ))}
              </div>

              <Card>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-[16rem] flex-1 sm:max-w-md">
                    <Input
                      label="Tìm học viên"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder="Mã hoặc tên học viên…"
                    />
                  </div>
                  <p role="status" className="text-sm font-semibold text-gtext">
                    {dirtyItems.length > 0
                      ? `${dirtyItems.length} thay đổi chưa lưu`
                      : "Không có thay đổi chưa lưu"}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gborder bg-gbg2/80 text-xs font-bold uppercase tracking-wider text-gtext">
                        <th className="w-12 px-4 py-3.5 text-center whitespace-nowrap">STT</th>
                        <th className="w-48 px-4 py-3.5 whitespace-nowrap">Mã học viên</th>
                        <th className="w-16 px-4 py-3.5 text-center whitespace-nowrap">Avatar</th>
                        <th className="min-w-[12rem] px-4 py-3.5 whitespace-nowrap">
                          Tên học viên
                        </th>
                        <th className="min-w-[14rem] px-4 py-3.5 text-center whitespace-nowrap">
                          Trạng thái & Điều chỉnh
                        </th>
                        <th className="min-w-[14rem] px-4 py-3.5 whitespace-nowrap">Ghi chú</th>
                        <th className="min-w-[12rem] px-4 py-3.5 whitespace-nowrap">
                          Người ghi nhận
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gborder">
                      {visibleItems.map((item, index) => {
                        const draft = drafts[item.student_id] ?? initialDraft(item);
                        const legacyLabel = legacyAttendanceLabel(item.attendance_status);
                        return (
                          <tr key={item.student_id} className="hover:bg-gbg2/50">
                            <td className="px-4 py-3.5 text-center font-semibold text-gtext">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3.5 font-bold text-navy">{item.student_code}</td>
                            <td className="px-4 py-3.5">
                              <div className="mx-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-navy text-xs font-bold text-white shadow-2xs">
                                {item.avatar_url ? (
                                  <img
                                    src={item.avatar_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <span aria-hidden>{studentInitials(item.full_name)}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <b className="block text-navy">{item.full_name}</b>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {!item.attendance_id ? <Badge tone="gray">Chưa ghi</Badge> : null}
                                {legacyLabel ? <Badge tone="gold">{legacyLabel}</Badge> : null}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={!editState.editable}
                                  aria-label="Có mặt"
                                  aria-pressed={draft.status === "present"}
                                  onClick={() => setStatus(item, "present")}
                                  className={clsx(
                                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-2xs hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100",
                                    draft.status === "present"
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200 scale-105"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-600 hover:text-white",
                                    !editState.editable && "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  ✓ Có mặt
                                </button>
                                <button
                                  type="button"
                                  disabled={!editState.editable}
                                  aria-label="Vắng"
                                  aria-pressed={draft.status === "absent"}
                                  onClick={() => setStatus(item, "absent")}
                                  className={clsx(
                                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-2xs hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100",
                                    draft.status === "absent"
                                      ? "bg-red-600 text-white border-red-600 shadow-xs ring-2 ring-red-200 scale-105"
                                      : "bg-red-50 text-red-700 border border-red-300 hover:bg-red-600 hover:text-white",
                                    !editState.editable && "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  ✗ Vắng
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <input
                                aria-label={`Ghi chú cho ${item.full_name}`}
                                value={draft.note}
                                onChange={(event) => {
                                  setDrafts((current) => ({
                                    ...current,
                                    [item.student_id]: {
                                      ...(current[item.student_id] ?? initialDraft(item)),
                                      note: event.target.value,
                                    },
                                  }));
                                  save.reset();
                                }}
                                disabled={!editState.editable}
                                className="h-10 w-full rounded-xl border border-gborder px-3 text-sm text-navy outline-none transition-all focus:border-[#0532e6] focus:ring-2 focus:ring-[#0532e6]/20 disabled:bg-gbg2"
                                placeholder="Ghi chú tùy chọn…"
                              />
                            </td>
                            <td className="px-4 py-3.5 text-xs text-gtext">
                              {item.recorded_by_email ?? "Chưa ghi nhận"}
                              {item.updated_at ? (
                                <time className="mt-1 block">
                                  {formatDateTime(item.updated_at)}
                                </time>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {visibleItems.length === 0 ? (
                    <p className="py-10 text-center text-sm text-gtext">
                      Không có học viên phù hợp bộ lọc.
                    </p>
                  ) : null}
                </div>
              </Card>

              {save.error ? <ErrorBanner message={errorText(save.error)} /> : null}
              {save.isSuccess && !save.isPending ? (
                <SuccessBanner message="Đã lưu các thay đổi điểm danh." />
              ) : null}
              {editState.editable && dirtyItems.length > 0 ? (
                <div className="sticky bottom-3 z-20 flex justify-end rounded-2xl border border-gborder bg-white/95 p-3 shadow-elevated backdrop-blur">
                  <Button loading={save.isPending} onClick={handleSave}>
                    Lưu {dirtyItems.length} thay đổi
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </QueryState>
      )}

      <Modal
        open={confirmAbsent}
        title="Xác nhận vắng toàn bộ"
        onClose={() => setConfirmAbsent(false)}
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-gtext">
            Thao tác này sẽ đánh dấu tất cả học viên trong buổi học là Vắng. Bạn vẫn có thể kiểm tra
            lại trước khi lưu.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAbsent(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                markAll("absent");
                setConfirmAbsent(false);
              }}
            >
              Xác nhận đánh dấu Vắng
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
