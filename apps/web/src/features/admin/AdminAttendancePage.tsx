import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useSearchParams } from "react-router-dom";

import { SearchCombobox } from "../../components/SearchCombobox";
import { QueryState } from "../../components/data";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Input,
  Modal,
  PageHeader,
  SuccessBanner,
  Textarea,
} from "../../components/ui";
import type { AttendanceRosterItem, AttendanceStatus } from "../../lib/domainTypes";
import { formatDateTime } from "../../lib/format";
import { useDebouncedValue } from "../../components/filters";
import {
  legacyAttendanceLabel,
  projectAttendanceStatus,
  rollCallOptions,
  studentInitials,
  type RollCallStatus,
} from "../attendance/twoStateAttendance";
import { adminApi } from "./adminApi";
import { adminAttendanceApi } from "./adminAttendanceApi";

type RosterFilter = "all" | "unrecorded" | RollCallStatus;

interface CorrectionTarget {
  item: AttendanceRosterItem;
  targetStatus: RollCallStatus;
}

function statusLabel(value: AttendanceStatus | null | undefined) {
  if (!value) return "Chưa ghi";
  if (value === "late") return "Đi trễ (dữ liệu cũ)";
  if (value === "excused") return "Vắng có phép (dữ liệu cũ)";
  return rollCallOptions.find((option) => option.value === value)?.label ?? value;
}

function rosterFilterLabel(value: RosterFilter) {
  if (value === "all") return "Tất cả";
  if (value === "unrecorded") return "Chưa ghi";
  return statusLabel(value);
}

function selectorDateRange() {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 180);
  return { from: from.toISOString(), to: to.toISOString() };
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Không thể hiệu chỉnh điểm danh. Vui lòng thử lại.";
}

export function AdminAttendancePage({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session") ?? "";
  const client = useQueryClient();
  const [sessionSearch, setSessionSearch] = useState("");
  const debouncedSessionSearch = useDebouncedValue(sessionSearch, 300);
  const [studentSearch, setStudentSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const range = useMemo(() => selectorDateRange(), []);

  const sessions = useQuery({
    queryKey: ["admin", "attendance", "session-options", debouncedSessionSearch],
    queryFn: () =>
      adminApi.sessions({
        page: 1,
        per_page: 20,
        search: debouncedSessionSearch || undefined,
        from: range.from,
        to: range.to,
        sort_by: "starts_at",
        sort_order: "desc",
      }),
  });
  const roster = useQuery({
    queryKey: ["admin", "attendance", sessionId],
    queryFn: () => adminAttendanceApi.getSessionAttendance(sessionId),
    enabled: Boolean(sessionId),
  });
  const history = useQuery({
    queryKey: ["admin", "class-history", roster.data?.session.class_id],
    queryFn: () => adminApi.classHistory(roster.data!.session.class_id),
    enabled: Boolean(roster.data?.session.class_id),
  });

  const correct = useMutation({
    mutationFn: async (current: CorrectionTarget) => {
      const payload = {
        status: current.targetStatus,
        note: note.trim() || null,
        reason: reason.trim(),
      };
      return current.item.attendance_id
        ? adminAttendanceApi.correctAttendance(current.item.attendance_id, payload)
        : adminAttendanceApi.correctStudentAttendance(sessionId, current.item.student_id, payload);
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "attendance", sessionId] }),
        client.invalidateQueries({ queryKey: ["admin", "class-history"] }),
      ]);
      closeCorrection();
    },
  });

  const closeCorrection = () => {
    setTarget(null);
    setReason("");
    setNote("");
  };
  const openCorrection = (item: AttendanceRosterItem, targetStatus: RollCallStatus) => {
    if (item.attendance_id && projectAttendanceStatus(item.attendance_status) === targetStatus) {
      return;
    }
    correct.reset();
    setTarget({ item, targetStatus });
    setReason("");
    setNote(item.note ?? "");
  };

  const sessionOptions = useMemo(() => {
    const map = new Map(
      (sessions.data?.items ?? []).map((session) => [
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
  }, [roster.data, sessions.data?.items]);

  const visibleItems = useMemo(() => {
    const normalized = studentSearch.trim().toLocaleLowerCase("vi");
    return [...(roster.data?.items ?? [])]
      .filter((item) => {
        if (filter === "unrecorded" && item.attendance_id) return false;
        if (
          filter !== "all" &&
          filter !== "unrecorded" &&
          projectAttendanceStatus(item.attendance_status) !== filter
        ) {
          return false;
        }
        return `${item.student_code} ${item.full_name}`
          .toLocaleLowerCase("vi")
          .includes(normalized);
      })
      .sort((a, b) => Number(Boolean(a.attendance_id)) - Number(Boolean(b.attendance_id)));
  }, [filter, roster.data?.items, studentSearch]);

  const counts: Record<RosterFilter, number> = {
    all: roster.data?.summary.total ?? 0,
    unrecorded: roster.data?.summary.unrecorded ?? 0,
    present:
      roster.data?.items.filter(
        (item) => projectAttendanceStatus(item.attendance_status) === "present",
      ).length ?? 0,
    absent:
      roster.data?.items.filter(
        (item) => projectAttendanceStatus(item.attendance_status) === "absent",
      ).length ?? 0,
  };
  const attendanceHistory = (history.data ?? []).filter(
    (event) => event.event_type === "attendance_corrected",
  );

  return (
    <div>
      <PageHeader
        eyebrow="Kiểm soát dữ liệu"
        title="Quản lý điểm danh"
        subtitle={
          readOnly
            ? "Xem tình trạng chuyên cần và điểm danh học viên từng buổi học."
            : "Xem mọi buổi học và hiệu chỉnh có kiểm soát. Mỗi thay đổi đều bắt buộc có lý do và được lưu vào nhật ký kiểm toán."
        }
      />

      <Card className="mb-5">
        <SearchCombobox
          label="Buổi học"
          value={sessionId}
          onChange={(value) => {
            setParams(value ? { session: value } : {});
            setStudentSearch("");
            setFilter("all");
          }}
          onSearch={setSessionSearch}
          options={sessionOptions}
          loading={sessions.isLoading}
          placeholder="Tìm theo mã lớp hoặc nội dung buổi học…"
        />
      </Card>

      {!sessionId ? (
        <Card>
          <p className="text-sm text-gtext">
            Chọn một buổi học để xem danh sách và lịch sử hiệu chỉnh.
          </p>
        </Card>
      ) : (
        <QueryState loading={roster.isLoading} error={roster.error}>
          {roster.data ? (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-navy">{roster.data.session.title}</h2>
                      <Badge tone={roster.data.session.attendance_locked_at ? "gray" : "green"}>
                        {roster.data.session.attendance_locked_at ? "Đã khóa" : "Đang mở"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-gtext">
                      {roster.data.session.class_code} ·{" "}
                      {formatDateTime(roster.data.session.starts_at)}
                      {roster.data.session.teacher_name
                        ? ` · ${roster.data.session.teacher_name}`
                        : ""}
                      {roster.data.session.location_name
                        ? ` · ${roster.data.session.location_name}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-xs text-gtext">
                    Admin được phép hiệu chỉnh ngay cả sau khi khóa.
                  </p>
                </div>
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

              {correct.isSuccess ? (
                <SuccessBanner message="Đã lưu hiệu chỉnh và nhật ký kiểm toán." />
              ) : null}
              {correct.error ? <ErrorBanner message={errorText(correct.error)} /> : null}

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
                    Hiển thị {visibleItems.length}/{roster.data.summary.total} học viên
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
                          {readOnly ? "Trạng thái chuyên cần" : "Trạng thái & Điều chỉnh"}
                        </th>
                        <th className="min-w-[14rem] px-4 py-3.5 whitespace-nowrap">Ghi chú</th>
                        <th className="min-w-[12rem] px-4 py-3.5 whitespace-nowrap">
                          Người ghi nhận
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gborder">
                      {visibleItems.map((item, index) => {
                        const projectedStatus = projectAttendanceStatus(item.attendance_status);
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
                              {readOnly ? (
                                <div className="flex items-center justify-center">
                                  {projectedStatus === "present" ? (
                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                      ✓ Có mặt
                                    </span>
                                  ) : projectedStatus === "absent" ? (
                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                      ✗ Vắng mặt
                                    </span>
                                  ) : (
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                      Chưa ghi
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                  <button
                                    type="button"
                                    disabled={
                                      item.attendance_id ? projectedStatus === "present" : false
                                    }
                                    aria-label="Có mặt"
                                    aria-pressed={projectedStatus === "present"}
                                    onClick={() => openCorrection(item, "present")}
                                    className={clsx(
                                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-2xs hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100",
                                      projectedStatus === "present"
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200 scale-105"
                                        : "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-600 hover:text-white",
                                    )}
                                  >
                                    ✓ Có mặt
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      item.attendance_id ? projectedStatus === "absent" : false
                                    }
                                    aria-label="Vắng"
                                    aria-pressed={projectedStatus === "absent"}
                                    onClick={() => openCorrection(item, "absent")}
                                    className={clsx(
                                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-2xs hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100",
                                      projectedStatus === "absent"
                                        ? "bg-red-600 text-white border-red-600 shadow-xs ring-2 ring-red-200 scale-105"
                                        : "bg-red-50 text-red-700 border border-red-300 hover:bg-red-600 hover:text-white",
                                    )}
                                  >
                                    ✗ Vắng
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-gtext">
                              {item.note?.trim() || "—"}
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

              <Card>
                <h2 className="text-base font-bold text-navy">Nhật ký hiệu chỉnh của lớp</h2>
                <div className="mt-3 space-y-3">
                  {history.isLoading ? (
                    <p role="status" className="text-sm text-gtext">
                      Đang tải nhật ký…
                    </p>
                  ) : attendanceHistory.length ? (
                    attendanceHistory.slice(0, 10).map((event) => (
                      <div key={event.id} className="rounded-xl border border-gborder p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <b className="text-navy">{event.actor_email ?? "Hệ thống"}</b>
                          <time className="text-xs text-gtext">
                            {formatDateTime(event.occurred_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-gtext">{event.reason || "Không có lý do"}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gtext">Chưa có hiệu chỉnh điểm danh nào.</p>
                  )}
                </div>
              </Card>
            </div>
          ) : null}
        </QueryState>
      )}

      <Modal
        open={!readOnly && Boolean(target)}
        title="Xác nhận hiệu chỉnh"
        onClose={closeCorrection}
      >
        {target ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim()) correct.mutate(target);
            }}
          >
            <div className="rounded-xl border border-gborder bg-gbg2 p-4 text-sm">
              <b className="text-navy">{target.item.full_name}</b>
              <span className="text-gtext"> ({target.item.student_code})</span>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-lg bg-white p-3">
                  <span className="block text-xs text-gtext">Trước</span>
                  <strong>{statusLabel(target.item.attendance_status)}</strong>
                </div>
                <span aria-hidden>→</span>
                <div className="rounded-lg bg-white p-3">
                  <span className="block text-xs text-gtext">Sau</span>
                  <strong>{statusLabel(target.targetStatus)}</strong>
                </div>
              </div>
            </div>
            <Textarea
              label="Lý do hiệu chỉnh"
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Lý do sẽ được lưu trong nhật ký kiểm toán…"
            />
            <Textarea
              label="Ghi chú điểm danh"
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {correct.error ? <ErrorBanner message={errorText(correct.error)} /> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeCorrection}>
                Hủy
              </Button>
              <Button type="submit" loading={correct.isPending} disabled={!reason.trim()}>
                Lưu hiệu chỉnh
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
