import { useState, useMemo, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";

import {
  Badge,
  Button,
  Card,
  Drawer,
  ErrorBanner,
  Input,
  Modal,
  Select,
  SuccessBanner,
  Textarea,
} from "../../components/ui";
import { QueryState } from "../../components/data";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";
import { formatDateTime } from "../../lib/format";
import type { Role } from "../../lib/types";
import type { Paginated } from "../../lib/domainTypes";
import { useAuth } from "../auth/AuthContext";
import {
  usersApi,
  type CreateUserInput,
  type ManagedUser,
  type UpdateProfileInput,
  type UpdateLeadRoutingInput,
  type UserListParams,
} from "./usersApi";

const ROLE_LABELS: Record<
  Role,
  { label: string; tone: "blue" | "green" | "red" | "gray" | "gold" | "navy" }
> = {
  ADMIN: { label: "Admin tổng", tone: "red" },
  ACADEMIC_ADMIN: { label: "Admin Đào tạo", tone: "navy" },
  SALE_ADMIN: { label: "Sale Manager", tone: "gold" },
  SALE: { label: "Nhân viên Sale", tone: "blue" },
  TEACHER: { label: "Giảng viên", tone: "green" },
  STUDENT: { label: "Học viên", tone: "gray" },
};

const ROLE_DESCRIPTIONS: Record<Role, { desc: string; icon: IconName }> = {
  ADMIN: { desc: "Toàn quyền quản trị hệ thống, dữ liệu và phân quyền", icon: "lock" },
  ACADEMIC_ADMIN: { desc: "Quản lý khóa học, lớp học, giảng viên và học viên", icon: "academic" },
  SALE_ADMIN: {
    desc: "Trưởng phòng Tuyển sinh - Quản lý leads, doanh thu, báo cáo và đội ngũ sale",
    icon: "user-check",
  },
  SALE: { desc: "Quản lý lead được phân công, tạo phiếu đăng ký và thu tiền", icon: "user" },
  TEACHER: { desc: "Quản lý lớp phụ trách, lịch dạy, điểm danh và đánh giá", icon: "teacher" },
  STUDENT: { desc: "Theo dõi lịch học, chuyên cần và tiến độ học tập", icon: "academic" },
};

function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pass = "Nsa" + Math.floor(100 + Math.random() * 900) + "@";
  for (let i = 0; i < 4; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_LABELS[role] ?? { label: role, tone: "gray" };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge tone="green">Hoạt động</Badge>;
    case "suspended":
      return <Badge tone="red">Tạm khóa</Badge>;
    case "inactive":
      return <Badge tone="gray">Ngừng hoạt động</Badge>;
    default:
      return <Badge tone="gold">Chờ kích hoạt</Badge>;
  }
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  status: "Trạng thái",
  full_name: "Họ và tên",
  phone: "Số điện thoại",
  email: "Email",
  roles: "Vai trò",
  role: "Vai trò",
  date_of_birth: "Ngày sinh",
  gender: "Giới tính",
  address: "Địa chỉ",
};

const AUDIT_STATUS_LABELS: Record<
  string,
  { label: string; tone: "green" | "red" | "gray" | "gold" }
> = {
  active: { label: "Hoạt động", tone: "green" },
  suspended: { label: "Tạm khóa", tone: "red" },
  inactive: { label: "Ngừng hoạt động", tone: "gray" },
  pending_activation: { label: "Chờ kích hoạt", tone: "gold" },
};

function parseAuditValues(val: unknown): Record<string, unknown> | null {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof val === "object") return val as Record<string, unknown>;
  return null;
}

function getInitials(name?: string, email?: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email?.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

interface UserManagementPageProps {
  mode?: "all" | "sale" | "academic";
}

export function UserManagementPage({ mode = "all" }: UserManagementPageProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isOnlyAcademic = Boolean(
    user?.roles.includes("ACADEMIC_ADMIN") && !user?.roles.includes("ADMIN"),
  );
  const isOnlySaleAdmin = Boolean(
    user?.roles.includes("SALE_ADMIN") && !user?.roles.includes("ADMIN"),
  );

  // Mode overrides / defaults
  const isSaleMode = mode === "sale" || isOnlySaleAdmin;
  const isAcademicMode = mode === "academic" || (!isSaleMode && isOnlyAcademic);

  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>(isSaleMode ? "SALE" : "");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  // Slide-over Drawer state
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [drawerTab, setDrawerTab] = useState<"account" | "audit">("account");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Modals & Inline forms state (Actions triggered from Drawer or Header)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState<CreateUserInput>({
    email: "",
    password: "",
    role: isSaleMode ? "SALE" : isAcademicMode ? "TEACHER" : "SALE",
    full_name: "",
    phone: "",
    status: "active",
  });
  const [newStatus, setNewStatus] = useState<"active" | "suspended" | "inactive">("active");
  const [statusReason, setStatusReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Drag & drop and row transition animation states
  const [draggedUser, setDraggedUser] = useState<ManagedUser | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragRowWidth, setDragRowWidth] = useState(600);
  const [dragRowLeft, setDragRowLeft] = useState(0);
  const [editingOrderUserId, setEditingOrderUserId] = useState<string | null>(null);
  const [editingOrderValue, setEditingOrderValue] = useState<string>("");
  const [animatedRow, setAnimatedRow] = useState<{ id: string; direction: "up" | "down" } | null>(
    null,
  );
  const [landingRowId, setLandingRowId] = useState<string | null>(null);

  const queryParams: UserListParams = {
    search: search.trim() || undefined,
    role: selectedRole || (isSaleMode ? "SALE" : undefined),
    status: selectedStatus || undefined,
    page,
    per_page: 15,
  };

  const usersQuery = useQuery({
    queryKey: ["users", queryParams],
    queryFn: () => usersApi.list(queryParams),
  });

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsCreateOpen(false);
      setCreateForm({
        email: "",
        password: "",
        role: isSaleMode ? "SALE" : isAcademicMode ? "TEACHER" : "SALE",
        full_name: "",
        phone: "",
        status: "active",
      });
      setActionSuccess(`Đã tạo thành công tài khoản cho ${created.email}`);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Không thể tạo tài khoản");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { status: "active" | "suspended" | "inactive"; reason?: string };
    }) => usersApi.updateStatus(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setSelectedUser(updated);
      setIsStatusModalOpen(false);
      setStatusReason("");
      setActionSuccess(
        `Đã cập nhật trạng thái tài khoản ${updated.email} sang "${updated.status}"`,
      );
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Không thể cập nhật trạng thái");
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProfileInput }) =>
      usersApi.updateProfile(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setSelectedUser(updated);
      setIsEditingProfile(false);
      setActionSuccess(`Đã cập nhật thông tin tài khoản ${updated.email}`);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Không thể cập nhật thông tin");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { new_password: string; reason?: string } }) =>
      usersApi.resetPassword(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsResettingPassword(false);
      setNewPassword("");
      setResetReason("");
      setActionSuccess("Đã đặt lại mật khẩu tạm thành công.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Không thể đặt lại mật khẩu");
    },
  });

  // Audit log query for drawer
  const auditLogsQuery = useQuery({
    queryKey: ["userAuditLogs", selectedUser?.id],
    queryFn: () => usersApi.listAuditLogs(selectedUser!.id, 1, 50),
    enabled: Boolean(selectedUser?.id && drawerTab === "audit"),
  });

  // Lead routing mutations (Sale Mode)
  const updateLeadRoutingMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeadRoutingInput }) =>
      usersApi.updateLeadRouting(id, data),
    onSuccess: (updated) => {
      if (updated && selectedUser?.id === updated.id) {
        setSelectedUser(updated);
      }
    },
    onError: (err: unknown) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setActionError(
        err instanceof Error ? err.message : "Không thể cập nhật trạng thái nhận lead",
      );
    },
  });

  const reorderLeadRoutingMutation = useMutation({
    mutationFn: (orderedUserIDs: string[]) =>
      usersApi.reorderLeadRouting({ ordered_user_ids: orderedUserIDs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"], refetchType: "none" });
    },
    onError: (err: unknown) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setActionError(err instanceof Error ? err.message : "Không thể cập nhật thứ tự xoay vòng");
    },
  });

  const userItems = usersQuery.data?.items;

  const saleSortedUsers = useMemo(() => {
    if (!userItems) return [];
    if (!isSaleMode) return userItems;
    return [...userItems].sort((a, b) => {
      const orderA = a.lead_assignment_order || 0;
      const orderB = b.lead_assignment_order || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.email.localeCompare(b.email);
    });
  }, [userItems, isSaleMode]);

  const activeLeadTakersCount = useMemo(() => {
    return (
      userItems?.filter((u) => u.is_accepting_leads !== false && u.status === "active").length ?? 0
    );
  }, [userItems]);

  const totalSaleCount = userItems?.length ?? 0;

  const handleToggleAcceptingLeads = (u: ManagedUser) => {
    const nextVal = !(u.is_accepting_leads !== false);

    // Optimistically update drawer state if selected
    if (selectedUser?.id === u.id) {
      setSelectedUser({ ...selectedUser, is_accepting_leads: nextVal });
    }

    // Optimistically update queryClient cache immediately for zero-delay UI flip
    queryClient.setQueriesData<Paginated<ManagedUser>>({ queryKey: ["users"] }, (old) => {
      if (!old?.items) return old;
      return {
        ...old,
        items: old.items.map((item) =>
          item.id === u.id ? { ...item, is_accepting_leads: nextVal } : item,
        ),
      };
    });

    updateLeadRoutingMutation.mutate({
      id: u.id,
      data: { is_accepting_leads: nextVal },
    });
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0 || !saleSortedUsers) return;
    const items = [...saleSortedUsers];
    const movedItem = items[index];
    const partnerItem = items[index - 1];
    items[index] = partnerItem;
    items[index - 1] = movedItem;

    // Trigger visual motion animation
    setAnimatedRow({ id: movedItem.id, direction: "up" });
    setTimeout(() => setAnimatedRow(null), 350);

    // Optimistically update order in queryClient cache so row moves instantly with 0ms delay
    const orderMap = new Map(items.map((u, i) => [u.id, i + 1]));
    queryClient.setQueriesData<Paginated<ManagedUser>>({ queryKey: ["users"] }, (old) => {
      if (!old?.items) return old;
      return {
        ...old,
        items: old.items.map((item) => {
          const newOrder = orderMap.get(item.id);
          return newOrder !== undefined ? { ...item, lead_assignment_order: newOrder } : item;
        }),
      };
    });

    reorderLeadRoutingMutation.mutate(items.map((u) => u.id));
  };

  const handleMoveDown = (index: number) => {
    if (!saleSortedUsers || index >= saleSortedUsers.length - 1) return;
    const items = [...saleSortedUsers];
    const movedItem = items[index];
    const partnerItem = items[index + 1];
    items[index] = partnerItem;
    items[index + 1] = movedItem;

    // Trigger visual motion animation
    setAnimatedRow({ id: movedItem.id, direction: "down" });
    setTimeout(() => setAnimatedRow(null), 350);

    // Optimistically update order in queryClient cache so row moves instantly with 0ms delay
    const orderMap = new Map(items.map((u, i) => [u.id, i + 1]));
    queryClient.setQueriesData<Paginated<ManagedUser>>({ queryKey: ["users"] }, (old) => {
      if (!old?.items) return old;
      return {
        ...old,
        items: old.items.map((item) => {
          const newOrder = orderMap.get(item.id);
          return newOrder !== undefined ? { ...item, lead_assignment_order: newOrder } : item;
        }),
      };
    });

    reorderLeadRoutingMutation.mutate(items.map((u) => u.id));
  };

  const handleApplyDirectOrder = (userId: string, targetOrder: number) => {
    if (!saleSortedUsers || isNaN(targetOrder)) {
      setEditingOrderUserId(null);
      return;
    }
    const currIdx = saleSortedUsers.findIndex((u) => u.id === userId);
    if (currIdx === -1) {
      setEditingOrderUserId(null);
      return;
    }

    const targetIdx = Math.max(0, Math.min(saleSortedUsers.length - 1, targetOrder - 1));
    if (targetIdx === currIdx) {
      setEditingOrderUserId(null);
      return;
    }

    const items = [...saleSortedUsers];
    const [movedItem] = items.splice(currIdx, 1);
    items.splice(targetIdx, 0, movedItem);

    setLandingRowId(movedItem.id);
    setTimeout(() => setLandingRowId(null), 900);

    const orderMap = new Map(items.map((u, i) => [u.id, i + 1]));
    queryClient.setQueriesData<Paginated<ManagedUser>>({ queryKey: ["users"] }, (old) => {
      if (!old?.items) return old;
      return {
        ...old,
        items: old.items.map((item) => {
          const newOrder = orderMap.get(item.id);
          return newOrder !== undefined ? { ...item, lead_assignment_order: newOrder } : item;
        }),
      };
    });

    reorderLeadRoutingMutation.mutate(items.map((u) => u.id));
    setEditingOrderUserId(null);
  };

  // Pointer-based Drag & Drop: Full element follows mouse cursor vertically with edge auto-scrolling
  const handleRowPointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    index: number,
    user: ManagedUser,
  ) => {
    if (e.button !== 0 || !isSaleMode) return;
    const trEl = (e.currentTarget.closest("tr") as HTMLTableRowElement) || null;
    if (!trEl) return;

    const rect = trEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let hasMoved = false;
    let animFrameId: number | null = null;
    let currentClientX = e.clientX;
    let currentClientY = e.clientY;
    let isDraggingActive = false;

    const SCROLL_ZONE = 90;
    const MAX_SPEED = 18;

    const autoScrollLoop = () => {
      if (!isDraggingActive) return;
      const viewportHeight = window.innerHeight;
      if (currentClientY < SCROLL_ZONE) {
        const intensity = Math.min(1, (SCROLL_ZONE - currentClientY) / SCROLL_ZONE);
        window.scrollBy({ top: -MAX_SPEED * intensity, behavior: "auto" });
      } else if (currentClientY > viewportHeight - SCROLL_ZONE) {
        const intensity = Math.min(
          1,
          (currentClientY - (viewportHeight - SCROLL_ZONE)) / SCROLL_ZONE,
        );
        window.scrollBy({ top: MAX_SPEED * intensity, behavior: "auto" });
      }
      animFrameId = requestAnimationFrame(autoScrollLoop);
    };

    const updateDropTarget = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const targetTr = el?.closest("[data-row-index]");
      const targetIdx = targetTr?.getAttribute("data-row-index");
      if (targetIdx !== null && targetIdx !== undefined) {
        const parsedIdx = Number(targetIdx);
        if (!isNaN(parsedIdx) && parsedIdx !== index) {
          setDragOverIndex(parsedIdx);
        }
      } else {
        const targetGap = el?.closest("[data-drop-gap-index]");
        if (!targetGap) {
          setDragOverIndex(null);
        }
      }
    };

    const onPointerMove = (moveEv: PointerEvent) => {
      currentClientX = moveEv.clientX;
      currentClientY = moveEv.clientY;
      const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);
      if (!hasMoved && dist > 3) {
        hasMoved = true;
        isDraggingActive = true;
        setDraggedUser(user);
        setDraggedIndex(index);
        setDragRowWidth(rect.width);
        setDragRowLeft(rect.left);
        setDragOffset({ x: offsetX, y: offsetY });
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        animFrameId = requestAnimationFrame(autoScrollLoop);
      }

      if (hasMoved) {
        setPointerPos({ x: moveEv.clientX, y: moveEv.clientY });
        updateDropTarget(moveEv.clientX, moveEv.clientY);
      }
    };

    const onWheel = () => {
      if (!hasMoved) return;
      requestAnimationFrame(() => {
        updateDropTarget(currentClientX, currentClientY);
      });
    };

    const onPointerUp = (upEv: PointerEvent) => {
      isDraggingActive = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("wheel", onWheel);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      if (hasMoved) {
        const el = document.elementFromPoint(upEv.clientX, upEv.clientY);
        const targetTr = el?.closest("[data-row-index]");
        const targetGap = el?.closest("[data-drop-gap-index]");
        const targetIdx =
          targetTr?.getAttribute("data-row-index") ||
          targetGap?.getAttribute("data-drop-gap-index");

        if (targetIdx !== null && targetIdx !== undefined && saleSortedUsers) {
          const parsedIdx = Number(targetIdx);
          if (!isNaN(parsedIdx) && parsedIdx !== index) {
            const items = [...saleSortedUsers];
            const [movedItem] = items.splice(index, 1);
            items.splice(parsedIdx, 0, movedItem);

            // Set landing animation
            setLandingRowId(movedItem.id);
            setTimeout(() => setLandingRowId(null), 900);

            // Optimistically update order in queryClient cache
            const orderMap = new Map(items.map((u, i) => [u.id, i + 1]));
            queryClient.setQueriesData<Paginated<ManagedUser>>({ queryKey: ["users"] }, (old) => {
              if (!old?.items) return old;
              return {
                ...old,
                items: old.items.map((item) => {
                  const newOrder = orderMap.get(item.id);
                  return newOrder !== undefined
                    ? { ...item, lead_assignment_order: newOrder }
                    : item;
                }),
              };
            });

            reorderLeadRoutingMutation.mutate(items.map((u) => u.id));
          }
        }

        setDraggedUser(null);
        setDraggedIndex(null);
        setDragOverIndex(null);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("wheel", onWheel, { passive: true });
  };

  // Page title & subtitle based on mode
  let pageTitle = "Quản lý Tài khoản & Phân quyền";
  let pageSubtitle = "Toàn bộ tài khoản người dùng trong hệ thống, phân quyền và kiểm toán bảo mật";
  if (isSaleMode) {
    pageTitle = "Đội ngũ Tuyển sinh";
    pageSubtitle = "Quản lý tài khoản nhân viên Sale, cấp quyền và theo dõi trạng thái hoạt động";
  } else if (isAcademicMode) {
    pageTitle = "Tài khoản Đào tạo";
    pageSubtitle = "Quản lý tài khoản Giảng viên và Học viên chính thức trong hệ thống";
  }

  // Available roles for filter & create
  const availableRoles: { value: Role; label: string }[] = isSaleMode
    ? [
        { value: "SALE", label: "Nhân viên Sale" },
        { value: "SALE_ADMIN", label: "Sale Manager (Trưởng phòng)" },
      ]
    : isAcademicMode
      ? [
          { value: "TEACHER", label: "Giảng viên" },
          { value: "STUDENT", label: "Học viên" },
        ]
      : [
          { value: "ADMIN", label: "Admin tổng" },
          { value: "ACADEMIC_ADMIN", label: "Admin Đào tạo" },
          { value: "SALE_ADMIN", label: "Sale Manager (Trưởng phòng Tuyển sinh)" },
          { value: "SALE", label: "Nhân viên Sale" },
          { value: "TEACHER", label: "Giảng viên" },
          { value: "STUDENT", label: "Học viên" },
        ];

  const handleRowClick = (u: ManagedUser) => {
    setSelectedUser(u);
    setDrawerTab("account");
    setIsEditingProfile(false);
    setIsResettingPassword(false);
    setEditFullName(u.full_name || "");
    setEditPhone(u.phone || "");
    setNewPassword("");
    setResetReason("");
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    updateProfileMutation.mutate({
      id: selectedUser.id,
      data: {
        full_name: editFullName.trim(),
        phone: editPhone.trim(),
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Notifications */}
      {actionSuccess && <SuccessBanner message={actionSuccess} />}
      {actionError && <ErrorBanner message={actionError} />}

      {/* Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy-heading tracking-tight">{pageTitle}</h1>
            <p className="mt-1 text-sm text-gtext">{pageSubtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setActionError(null);
                setIsCreateOpen(true);
              }}
            >
              <Icon name="plus" className="h-4 w-4" />
              Thêm tài khoản mới
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Tìm kiếm"
            placeholder="Email, họ tên, mã số..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          {!isSaleMode && (
            <Select
              label="Vai trò"
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">-- Tất cả vai trò --</option>
              {availableRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}

          <Select
            label="Trạng thái"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">-- Tất cả trạng thái --</option>
            <option value="active">Đang hoạt động</option>
            <option value="suspended">Tạm khóa</option>
            <option value="inactive">Ngừng hoạt động</option>
          </Select>

          {isSaleMode && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-navy-heading">
                Nhận Lead tự động
              </label>
              <div className="flex h-11 items-center justify-between rounded-xl border border-blue-200/70 bg-gradient-to-r from-blue-50/60 to-indigo-50/30 px-3.5 shadow-2xs">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Đang nhận
                </span>
                <span className="text-xs font-bold text-navy">
                  <span className="text-[#0532e6] text-sm font-extrabold">
                    {activeLeadTakersCount}
                  </span>
                  <span className="text-slate-500 font-normal"> / {totalSaleCount} Sale</span>
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label
              className="block text-sm font-semibold text-transparent select-none pointer-events-none"
              aria-hidden="true"
            >
              &nbsp;
            </label>
            <Button
              variant="ghost"
              className="w-full h-11"
              onClick={() => {
                setSearch("");
                setSelectedRole(isSaleMode ? "SALE" : "");
                setSelectedStatus("");
                setPage(1);
              }}
            >
              Đặt lại bộ lọc
            </Button>
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden p-0">
        <QueryState
          loading={usersQuery.isLoading}
          error={usersQuery.error}
          empty={!usersQuery.data?.items || usersQuery.data.items.length === 0}
          emptyTitle="Chưa có tài khoản nào"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white/75 text-[11px] uppercase tracking-[0.08em] text-gtext backdrop-blur-md">
                <tr>
                  <th className="w-12 border-b border-white/70 px-3 py-3.5 text-center font-bold">
                    STT
                  </th>
                  <th className="w-16 border-b border-white/70 px-3 py-3.5 text-center font-bold">
                    Avatar
                  </th>
                  <th className="border-b border-white/70 px-5 py-3.5 font-bold">Họ và tên</th>
                  {isSaleMode && (
                    <th className="border-b border-white/70 px-4 py-3.5 font-bold">
                      Thứ tự xoay vòng
                    </th>
                  )}
                  {isSaleMode && (
                    <th className="border-b border-white/70 px-4 py-3.5 font-bold">
                      Nhận Lead tự động
                    </th>
                  )}
                  {!isSaleMode && (
                    <th className="border-b border-white/70 px-4 py-3.5 font-bold">Mã đối tượng</th>
                  )}
                  {!isSaleMode && (
                    <th className="border-b border-white/70 px-4 py-3.5 font-bold">Vai trò</th>
                  )}
                  <th className="border-b border-white/70 px-4 py-3.5 font-bold">
                    Trạng thái tài khoản
                  </th>
                  {!isSaleMode && (
                    <th className="border-b border-white/70 px-4 py-3.5 font-bold">Người tạo</th>
                  )}
                  {!isSaleMode && (
                    <th className="border-b border-white/70 px-4 py-3.5 font-bold">Ngày tạo</th>
                  )}
                  <th className="border-b border-white/70 px-5 py-3.5 text-right font-bold">
                    Chi tiết
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/40">
                {saleSortedUsers.map((u, index) => {
                  const initials = getInitials(u.full_name, u.email);
                  const isSelected = selectedUser?.id === u.id;
                  const isRowDragging = draggedIndex === index;
                  const isRowAnimatedUp =
                    animatedRow?.id === u.id && animatedRow.direction === "up";
                  const isRowAnimatedDown =
                    animatedRow?.id === u.id && animatedRow.direction === "down";
                  const isRowLanding = landingRowId === u.id;

                  const showGapBefore =
                    dragOverIndex === index &&
                    draggedIndex !== null &&
                    dragOverIndex < draggedIndex;
                  const showGapAfter =
                    dragOverIndex === index &&
                    draggedIndex !== null &&
                    dragOverIndex > draggedIndex;

                  return (
                    <Fragment key={u.id}>
                      {/* Khoảng trắng drop slot mở ra phía trên khi kéo lên */}
                      {showGapBefore && (
                        <tr data-drop-gap-index={index} className="transition-all duration-150">
                          <td colSpan={isSaleMode ? 7 : 9} className="p-2.5 bg-blue-50/20">
                            <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#0532e6]/70 bg-white/80 text-xs font-bold text-[#0532e6] shadow-2xs backdrop-blur-md animate-pulse">
                              <Icon name="chevron-down" className="h-4 w-4" />
                              <span>Thả vào đây để xếp vị trí #{index + 1}</span>
                            </div>
                          </td>
                        </tr>
                      )}

                      <tr
                        data-row-index={index}
                        onClick={() => handleRowClick(u)}
                        className={clsx(
                          "group cursor-pointer transition-colors select-none",
                          isSelected ? "bg-white/90 shadow-2xs" : "hover:bg-white/70",
                          isRowDragging &&
                            "opacity-25 bg-blue-50/20 border-dashed border-2 border-blue-300",
                          isRowAnimatedUp && "animate-row-up",
                          isRowAnimatedDown && "animate-row-down",
                          isRowLanding && "animate-row-landing",
                        )}
                      >
                        <td className="relative w-12 border-b border-white/60 px-3 py-4 text-center font-bold text-slate-500 tabular-nums text-xs">
                          {isSelected && (
                            <span className="absolute inset-y-2 left-0 w-1 rounded-r-md bg-[#0532e6]" />
                          )}
                          {index + 1}
                        </td>

                        {/* Cột 1: Avatar riêng biệt */}
                        <td className="w-16 border-b border-white/60 px-3 py-4 text-center">
                          <div className="mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#001258] to-[#0532e6] text-xs font-bold text-white shadow-2xs transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
                            {initials}
                          </div>
                        </td>

                        {/* Cột 2: Tên nhân viên riêng biệt, đã bỏ tag STT */}
                        <td className="border-b border-white/60 px-5 py-4">
                          <p className="font-semibold text-navy text-sm transition-colors duration-150 group-hover:text-[#0532e6]">
                            {u.full_name || "Chưa cập nhật tên"}
                          </p>
                          <p className="text-xs text-gtext">{u.email}</p>
                          {u.phone && <p className="text-[11px] text-gtext/80">SĐT: {u.phone}</p>}
                        </td>

                        {/* Cột Thứ tự xoay vòng khi ở Sale Mode */}
                        {isSaleMode && (
                          <td
                            className="border-b border-white/60 px-4 py-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {editingOrderUserId === u.id ? (
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="number"
                                  min={1}
                                  max={saleSortedUsers.length}
                                  value={editingOrderValue}
                                  onChange={(e) => setEditingOrderValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleApplyDirectOrder(u.id, Number(editingOrderValue));
                                    } else if (e.key === "Escape") {
                                      setEditingOrderUserId(null);
                                    }
                                  }}
                                  autoFocus
                                  className="w-16 h-8 text-center rounded-lg border-2 border-[#0532e6] bg-white text-xs font-bold text-navy shadow-xs focus:outline-hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplyDirectOrder(u.id, Number(editingOrderValue))
                                  }
                                  className="h-8 px-2.5 rounded-lg bg-[#0532e6] text-white flex items-center justify-center text-xs font-bold hover:bg-blue-700 shadow-2xs active:scale-95"
                                  title="Lưu thứ tự mới"
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingOrderUserId(null)}
                                  className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-100 active:scale-95"
                                  title="Hủy"
                                >
                                  <Icon name="close" className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {/* Grip handle kéo thả theo con trỏ chuột */}
                                <span
                                  onPointerDown={(e) => handleRowPointerDown(e, index, u)}
                                  className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-[#0532e6] hover:bg-blue-50/80 p-1.5 rounded-lg transition-colors touch-none"
                                  title="Giữ chuột và kéo lên/xuống để đổi thứ tự trực tiếp"
                                >
                                  <Icon name="grip-vertical" className="h-4 w-4" />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingOrderUserId(u.id);
                                    setEditingOrderValue(
                                      String(u.lead_assignment_order || index + 1),
                                    );
                                  }}
                                  className="inline-flex h-7 min-w-8 items-center justify-center gap-1 rounded-lg bg-blue-50/90 border border-blue-200/90 px-2 text-xs font-bold text-[#0532e6] tabular-nums shadow-2xs hover:bg-blue-100 hover:border-[#0532e6] transition-all cursor-pointer group/badge"
                                  title="Bấm để nhập nhanh số thứ tự nhận lead"
                                >
                                  #{u.lead_assignment_order || index + 1}
                                  <Icon
                                    name="edit"
                                    className="h-2.5 w-2.5 opacity-40 group-hover/badge:opacity-100 transition-opacity"
                                  />
                                </button>
                                <div className="inline-flex rounded-lg border border-white/80 bg-white/70 p-0.5 shadow-2xs backdrop-blur-xs">
                                  <button
                                    type="button"
                                    title="Đẩy lên trước"
                                    disabled={index === 0}
                                    onClick={() => handleMoveUp(index)}
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-[#0532e6] hover:shadow-2xs active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                  >
                                    <Icon name="chevron-up" className="h-3.5 w-3.5 stroke-[2.5]" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Đẩy xuống sau"
                                    disabled={index === saleSortedUsers.length - 1}
                                    onClick={() => handleMoveDown(index)}
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-[#0532e6] hover:shadow-2xs active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                  >
                                    <Icon
                                      name="chevron-down"
                                      className="h-3.5 w-3.5 stroke-[2.5]"
                                    />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        )}

                        {/* Cột Công tắc nhận lead khi ở Sale Mode */}
                        {isSaleMode && (
                          <td
                            className="border-b border-white/60 px-4 py-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleAcceptingLeads(u)}
                              disabled={updateLeadRoutingMutation.isPending}
                              title="Bấm để bật/tắt nhận lead tự động cho nhân viên này"
                              className={clsx(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border transition-all duration-150 active:scale-95 shadow-2xs",
                                u.is_accepting_leads !== false && u.status === "active"
                                  ? "bg-emerald-50/90 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                  : "bg-slate-100/90 text-slate-600 border-slate-300 hover:bg-slate-200",
                              )}
                            >
                              <span
                                className={clsx(
                                  "h-1.5 w-1.5 rounded-full",
                                  u.is_accepting_leads !== false && u.status === "active"
                                    ? "bg-emerald-600 animate-pulse"
                                    : "bg-slate-400",
                                )}
                              />
                              {u.is_accepting_leads !== false && u.status === "active"
                                ? "Đang nhận"
                                : "Tạm dừng"}
                            </button>
                          </td>
                        )}

                        {!isSaleMode && (
                          <td className="border-b border-white/60 px-4 py-4">
                            {u.student_code ? (
                              <span className="font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs tabular-nums">
                                HV: {u.student_code}
                              </span>
                            ) : u.teacher_code ? (
                              <span className="font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-xs tabular-nums">
                                GV: {u.teacher_code}
                              </span>
                            ) : (
                              <span className="text-gtext">—</span>
                            )}
                          </td>
                        )}

                        {!isSaleMode && (
                          <td className="border-b border-white/60 px-4 py-4">
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((r) => (
                                <RoleBadge key={r} role={r} />
                              ))}
                            </div>
                          </td>
                        )}

                        <td className="border-b border-white/60 px-4 py-4">
                          <StatusBadge status={u.status} />
                        </td>
                        {!isSaleMode && (
                          <td className="border-b border-white/60 px-4 py-4 text-gtext">
                            {u.created_by_email || "Hệ thống"}
                          </td>
                        )}
                        {!isSaleMode && (
                          <td className="border-b border-white/60 px-4 py-4 text-gtext tabular-nums">
                            {formatDateTime(u.created_at)}
                          </td>
                        )}
                        <td className="border-b border-white/60 px-5 py-4 text-right">
                          <Button
                            variant="soft"
                            className="h-8 px-3 text-xs font-semibold rounded-xl"
                          >
                            Chi tiết
                          </Button>
                        </td>
                      </tr>

                      {/* Khoảng trắng drop slot mở ra phía dưới khi kéo xuống */}
                      {showGapAfter && (
                        <tr data-drop-gap-index={index} className="transition-all duration-150">
                          <td colSpan={isSaleMode ? 7 : 9} className="p-2.5 bg-blue-50/20">
                            <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#0532e6]/70 bg-white/80 text-xs font-bold text-[#0532e6] shadow-2xs backdrop-blur-md animate-pulse">
                              <Icon name="chevron-down" className="h-4 w-4" />
                              <span>Thả vào đây để xếp vị trí #{index + 1}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {usersQuery.data && usersQuery.data.meta.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-white/70 px-5 py-3.5 bg-white/50 backdrop-blur-md">
              <span className="text-xs text-gtext">
                Trang {usersQuery.data.meta.page} / {usersQuery.data.meta.total_pages} (Tổng{" "}
                {usersQuery.data.meta.total} tài khoản)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  disabled={page >= usersQuery.data.meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </QueryState>
      </Card>

      {/* THẺ SALE NGUYÊN VẸN 100% SẮC NÉT BAY THEO CON TRỎ CHUỘT KHI KÉO - CHỈ KÉO DỌC, THẲNG ĐỨNG */}
      {draggedUser && (
        <div
          className="fixed pointer-events-none z-50 select-none shadow-2xl transition-transform duration-75"
          style={{
            left: `${dragRowLeft}px`,
            top: `${pointerPos.y - dragOffset.y}px`,
            width: `${dragRowWidth}px`,
            transform: "none",
          }}
        >
          <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-[#0532e6] bg-white/95 backdrop-blur-md px-5 py-3.5 shadow-2xl ring-4 ring-[#0532e6]/20">
            <div className="flex items-center gap-3">
              <span className="text-[#0532e6] p-1">
                <Icon name="grip-vertical" className="h-4 w-4" />
              </span>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#001258] to-[#0532e6] text-xs font-bold text-white shadow-md">
                {getInitials(draggedUser.full_name, draggedUser.email)}
              </div>
              <div>
                <p className="font-bold text-navy text-sm">
                  {draggedUser.full_name || "Chưa cập nhật tên"}
                </p>
                <p className="text-xs text-gtext">{draggedUser.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 min-w-8 items-center justify-center rounded-lg bg-blue-100 border border-blue-300 px-2.5 text-xs font-bold text-[#0532e6] tabular-nums shadow-xs">
                #
                {draggedUser.lead_assignment_order ||
                  (draggedIndex !== null ? draggedIndex + 1 : 1)}
              </span>

              <span
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border",
                  draggedUser.is_accepting_leads !== false && draggedUser.status === "active"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-slate-100 text-slate-600 border-slate-300",
                )}
              >
                <span
                  className={clsx(
                    "h-1.5 w-1.5 rounded-full",
                    draggedUser.is_accepting_leads !== false && draggedUser.status === "active"
                      ? "bg-emerald-600 animate-pulse"
                      : "bg-slate-400",
                  )}
                />
                {draggedUser.is_accepting_leads !== false && draggedUser.status === "active"
                  ? "Đang nhận"
                  : "Tạm dừng"}
              </span>

              <span className="rounded-full bg-[#0532e6] text-white font-bold px-3 py-1 text-xs shadow-xs animate-pulse">
                Đang di chuyển...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Drawer (Phong cách Microsoft 365 Admin Center) */}
      <Drawer open={Boolean(selectedUser)} onClose={() => setSelectedUser(null)} width="max-w-2xl">
        {selectedUser && (
          <div className="flex h-full flex-col bg-slate-50/50">
            {/* Top Navigation bar of Drawer */}
            <div className="flex shrink-0 items-center justify-between border-b border-gborder/60 bg-white/90 px-6 py-3.5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-semibold text-gtext">
                <span className="text-gtext/80">Quản lý người dùng</span>
                <Icon name="chevron-right" className="h-3 w-3 text-gtext/60" />
                <span className="font-bold text-navy">
                  {selectedUser.full_name || selectedUser.email}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-gtext transition-all duration-300 hover:scale-110 hover:rotate-90 active:scale-95 hover:bg-slate-100 hover:text-navy"
                aria-label="Đóng"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            {/* Profile Header Box (Microsoft 365 + Liquid Glass Style) */}
            <div className="shrink-0 border-b border-gborder/60 bg-white/95 px-6 pt-6 pb-4 backdrop-blur-md">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#001258] via-[#0532e6] to-[#001258] text-xl font-bold text-white shadow-lg ring-4 ring-blue-100/90 transition-all duration-300 hover:scale-105 hover:rotate-1">
                  {getInitials(selectedUser.full_name, selectedUser.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="truncate text-xl font-bold tracking-tight text-navy-heading">
                      {selectedUser.full_name || "Chưa cập nhật tên"}
                    </h2>
                    <StatusBadge status={selectedUser.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-gtext">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <p className="text-xs text-gtext">SĐT: {selectedUser.phone}</p>
                  )}

                  {/* Quick Action Links (Dạng ngang trực tiếp dưới thông tin như Microsoft 365) */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isResettingPassword) {
                          const generated = generateSecurePassword();
                          setNewPassword(generated);
                          setResetReason("");
                        }
                        setIsResettingPassword(!isResettingPassword);
                        setIsEditingProfile(false);
                      }}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-all duration-200 hover:scale-105 active:scale-95",
                        isResettingPassword
                          ? "border-[#0532e6] bg-blue-50 text-[#0532e6] ring-1 ring-[#0532e6]/30"
                          : "border-gborder bg-white text-navy hover:border-[#0532e6] hover:bg-blue-50/50 hover:text-[#0532e6]",
                      )}
                    >
                      <Icon name="sparkles" className="h-3.5 w-3.5 text-[#0532e6]" />
                      {isResettingPassword ? "Hủy đặt lại" : "Đặt lại mật khẩu"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewStatus(selectedUser.status === "active" ? "suspended" : "active");
                        setStatusReason("");
                        setIsStatusModalOpen(true);
                      }}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-xs",
                        selectedUser.status === "active"
                          ? "border-red-200 bg-white text-red-700 hover:bg-red-50 hover:border-red-300"
                          : "border-green-200 bg-white text-green-700 hover:bg-green-50 hover:border-green-300",
                      )}
                    >
                      <Icon name="lock" className="h-3.5 w-3.5" />
                      {selectedUser.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(!isEditingProfile)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gborder bg-white px-2.5 py-1.5 text-xs font-semibold text-navy shadow-2xs transition-all duration-200 hover:scale-105 hover:border-gborder/90 hover:bg-slate-50 hover:shadow-xs active:scale-95"
                    >
                      <Icon name="edit" className="h-3.5 w-3.5 text-slate-500" />
                      {isEditingProfile ? "Hủy sửa" : "Sửa thông tin"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Segmented Control Pill Tabs (Fluent / Apple Style) */}
              <div className="mt-5 inline-flex items-center rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 shadow-inner backdrop-blur-xs">
                <button
                  type="button"
                  onClick={() => setDrawerTab("account")}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                    drawerTab === "account"
                      ? "scale-[1.02] bg-white font-bold text-[#0532e6] shadow-sm"
                      : "text-slate-600 hover:bg-white/50 hover:text-navy",
                  )}
                >
                  <Icon name="user-check" className="h-3.5 w-3.5" />
                  Tài khoản & Phân quyền
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("audit")}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                    drawerTab === "audit"
                      ? "scale-[1.02] bg-white font-bold text-[#0532e6] shadow-sm"
                      : "text-slate-600 hover:bg-white/50 hover:text-navy",
                  )}
                >
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  Lịch sử & Kiểm toán
                </button>
              </div>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-gradient-to-b from-slate-50/40 to-slate-100/20">
              {drawerTab === "account" ? (
                <>
                  {/* Inline Password Reset Form */}
                  {isResettingPassword && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        resetPasswordMutation.mutate({
                          id: selectedUser.id,
                          data: {
                            new_password: newPassword,
                            reason: resetReason.trim() || undefined,
                          },
                        });
                      }}
                      className="animate-fade-in-up rounded-2xl border border-amber-200/90 bg-amber-50/60 p-5 shadow-xs backdrop-blur-md space-y-3.5 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
                        <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
                          <Icon name="sparkles" className="h-4 w-4 text-amber-600" />
                          Đặt lại mật khẩu tài khoản
                        </h3>
                        <span className="text-[11px] font-medium text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded-md">
                          Mật khẩu mới trực tiếp
                        </span>
                      </div>

                      <div className="rounded-xl border border-blue-200/80 bg-white/70 p-3 text-xs text-blue-900 leading-relaxed">
                        <span className="font-semibold">Lưu ý: </span>
                        Mật khẩu mới có hiệu lực ngay lập tức. Người dùng có thể đăng nhập ngay mà
                        không bị bắt buộc phải đổi lại mật khẩu.
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-semibold text-navy-heading">
                            Mật khẩu tạm thời mới *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const generated = generateSecurePassword();
                              setNewPassword(generated);
                            }}
                            className="text-[11px] font-semibold text-[#0532e6] hover:underline cursor-pointer"
                          >
                            Tạo mật khẩu ngẫu nhiên
                          </button>
                        </div>
                        <Input
                          label=""
                          type="text"
                          required
                          placeholder="Tối thiểu 8 ký tự"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>

                      <Input
                        label="Lý do đặt lại mật khẩu"
                        placeholder="VD: Người dùng quên mật khẩu, yêu cầu cấp lại..."
                        value={resetReason}
                        onChange={(e) => setResetReason(e.target.value)}
                      />

                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 text-xs hover:bg-white/80"
                          onClick={() => setIsResettingPassword(false)}
                        >
                          Hủy
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          className="h-8 text-xs shadow-xs hover:scale-105 active:scale-95 transition-transform"
                          loading={resetPasswordMutation.isPending}
                        >
                          Xác nhận đặt lại
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* Inline Profile Editing Form */}
                  {isEditingProfile && (
                    <form
                      onSubmit={handleProfileSubmit}
                      className="animate-fade-in-up rounded-2xl border border-blue-200/90 bg-blue-50/60 p-5 shadow-xs backdrop-blur-md space-y-3.5 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between border-b border-blue-200/70 pb-2">
                        <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
                          <Icon name="edit" className="h-4 w-4 text-[#0532e6]" />
                          Chỉnh sửa thông tin người dùng
                        </h3>
                        <span className="text-[11px] font-medium text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded-md">
                          Tự động ghi vết kiểm toán
                        </span>
                      </div>
                      <Input
                        label="Họ và tên"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        required
                        placeholder="vd: Nguyễn Văn A"
                      />
                      <Input
                        label="Số điện thoại"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="vd: 0912345678"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 text-xs hover:bg-white/80"
                          onClick={() => setIsEditingProfile(false)}
                        >
                          Hủy
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          className="h-8 text-xs shadow-xs hover:scale-105 active:scale-95 transition-transform"
                          loading={updateProfileMutation.isPending}
                        >
                          Lưu thay đổi
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* Section 1: Thông tin phân quyền & Trạng thái */}
                  <div className="animate-fade-in-up animation-delay-75 rounded-2xl border border-white/90 bg-white/85 p-5 shadow-xs backdrop-blur-md transition-all duration-300 hover:shadow-card hover:-translate-y-0.5 space-y-3.5">
                    <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[#0532e6]">
                        <Icon name="user-check" className="h-3.5 w-3.5" />
                      </span>
                      Phân quyền & Trạng thái
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                      <div>
                        <span className="text-gtext font-medium">Vai trò trong hệ thống:</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {selectedUser.roles.map((r) => (
                            <RoleBadge key={r} role={r} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-gtext font-medium">Trạng thái đăng nhập:</span>
                        <div className="mt-1.5">
                          <StatusBadge status={selectedUser.status} />
                        </div>
                      </div>
                      <div>
                        <span className="text-gtext font-medium">Mã định danh liên kết:</span>
                        <p className="mt-1 font-semibold text-navy">
                          {selectedUser.student_code ? (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-mono text-xs">
                              Học viên: {selectedUser.student_code}
                            </span>
                          ) : selectedUser.teacher_code ? (
                            <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-mono text-xs">
                              Giảng viên: {selectedUser.teacher_code}
                            </span>
                          ) : (
                            <span className="text-gtext font-normal italic">
                              Không có (Nhân sự nội bộ)
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-gtext font-medium">Bắt buộc đổi mật khẩu:</span>
                        <p className="mt-1 font-semibold text-navy">
                          {selectedUser.must_change_password ? (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-xs">
                              Có (Cần đổi khi đăng nhập)
                            </span>
                          ) : (
                            <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
                              Không
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-gtext font-medium">Lần đăng nhập cuối:</span>
                        <p className="mt-1 font-semibold text-navy">
                          {selectedUser.last_login_at ? (
                            <span className="tabular-nums text-slate-800">
                              {formatDateTime(selectedUser.last_login_at)}
                            </span>
                          ) : (
                            <span className="text-gtext/80 italic font-normal">
                              Chưa từng đăng nhập
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Section for Sale: Cấu hình nhận Lead xoay vòng */}
                  {selectedUser.roles.includes("SALE") && (
                    <div className="animate-fade-in-up animation-delay-100 rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/60 to-white p-5 shadow-xs backdrop-blur-md space-y-3.5">
                      <div className="flex items-center justify-between border-b border-blue-200/50 pb-2.5">
                        <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-[#0532e6]">
                            <Icon name="filter" className="h-3.5 w-3.5" />
                          </span>
                          Cơ chế nhận Lead tự động (Round-Robin)
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleToggleAcceptingLeads(selectedUser)}
                          disabled={updateLeadRoutingMutation.isPending}
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all duration-200 shadow-2xs active:scale-95 cursor-pointer",
                            selectedUser.is_accepting_leads !== false &&
                              selectedUser.status === "active"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200",
                          )}
                        >
                          <span
                            className={clsx(
                              "h-2 w-2 rounded-full",
                              selectedUser.is_accepting_leads !== false &&
                                selectedUser.status === "active"
                                ? "bg-emerald-600 animate-pulse"
                                : "bg-slate-400",
                            )}
                          />
                          {selectedUser.is_accepting_leads !== false &&
                          selectedUser.status === "active"
                            ? "Đang nhận lead"
                            : "Tạm dừng nhận lead"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                        <div>
                          <span className="text-gtext font-medium">
                            Trạng thái trong vòng xoay:
                          </span>
                          <p className="mt-1 font-semibold text-navy">
                            {selectedUser.is_accepting_leads !== false &&
                            selectedUser.status === "active" ? (
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md font-medium text-xs">
                                Sẵn sàng nhận lead mới
                              </span>
                            ) : (
                              <span className="text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md font-medium text-xs">
                                Đang tạm ngưng nhận lead
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="text-gtext font-medium">Thứ tự ưu tiên xoay vòng:</span>
                          <p className="mt-1 font-semibold text-navy">
                            <span className="text-[#0532e6] bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md font-bold text-xs tabular-nums">
                              #{selectedUser.lead_assignment_order || 0}
                            </span>
                          </p>
                        </div>
                        <div className="sm:col-span-2 text-[11px] text-slate-500 bg-white/70 rounded-xl p-3 border border-blue-100/80 leading-relaxed">
                          Khi có lead mới từ web form hoặc file import, thuật toán sẽ chia lần lượt
                          cho các Sale đang ở trạng thái <strong>Sẵn sàng</strong> theo thứ tự số ưu
                          tiên (#1 → #2 → #3...).
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section 2: Quản trị & Nguồn gốc */}
                  <div className="animate-fade-in-up animation-delay-150 rounded-2xl border border-white/90 bg-white/85 p-5 shadow-xs backdrop-blur-md transition-all duration-300 hover:shadow-card hover:-translate-y-0.5 space-y-3.5">
                    <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[#0532e6]">
                        <Icon name="info" className="h-3.5 w-3.5" />
                      </span>
                      Thông tin tạo & Quản trị
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                      <div>
                        <span className="text-gtext font-medium">Người tạo tài khoản:</span>
                        <p className="mt-1 font-semibold text-navy">
                          {selectedUser.created_by_email || "Hệ thống (Seed/Admin)"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gtext font-medium">Ngày khởi tạo:</span>
                        <p className="mt-1 font-semibold text-navy tabular-nums">
                          {formatDateTime(selectedUser.created_at)}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-gtext font-medium">Cập nhật lần cuối:</span>
                        <p className="mt-1 font-semibold text-navy tabular-nums">
                          {formatDateTime(selectedUser.updated_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Tab 2: Lịch sử & Kiểm toán (Audit Logs) */
                <div className="space-y-4">
                  <div className="animate-fade-in-up flex items-center justify-between border-b border-gborder/50 pb-2">
                    <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[#0532e6]">
                        <Icon name="clock" className="h-3.5 w-3.5" />
                      </span>
                      Nhật ký thay đổi tài khoản
                    </h3>
                    <span className="text-[11px] text-gtext">
                      Ghi nhận mọi thao tác tạo, sửa, reset pass
                    </span>
                  </div>

                  <QueryState
                    loading={auditLogsQuery.isLoading}
                    error={auditLogsQuery.error}
                    empty={!auditLogsQuery.data?.items || auditLogsQuery.data.items.length === 0}
                    emptyTitle="Chưa có lịch sử thay đổi"
                  >
                    <div className="relative ml-4 border-l border-slate-200 space-y-6 py-2">
                      {auditLogsQuery.data?.items.map((log, index) => {
                        let actionTitle = log.action;
                        let badgeBg = "bg-slate-100 text-slate-700 border-slate-200";
                        let actionIcon: IconName = "clock";

                        if (log.action === "user.create") {
                          actionTitle = "Khởi tạo tài khoản";
                          badgeBg = "bg-emerald-50 text-emerald-800 border-emerald-200/80";
                          actionIcon = "user";
                        } else if (log.action === "user.update_status") {
                          actionTitle = "Cập nhật trạng thái";
                          badgeBg = "bg-amber-50 text-amber-800 border-amber-200/80";
                          actionIcon = "user-check";
                        } else if (log.action === "user.reset_password") {
                          actionTitle = "Đặt lại mật khẩu";
                          badgeBg = "bg-purple-50 text-purple-800 border-purple-200/80";
                          actionIcon = "lock";
                        } else if (
                          log.action === "user.update" ||
                          log.action === "user.update_profile"
                        ) {
                          actionTitle = "Chỉnh sửa thông tin";
                          badgeBg = "bg-blue-50 text-blue-800 border-blue-200/80";
                          actionIcon = "edit";
                        }

                        const newVals = parseAuditValues(log.new_values);
                        const oldVals = parseAuditValues(log.old_values);

                        const delayClass =
                          index === 0
                            ? "animation-delay-75"
                            : index === 1
                              ? "animation-delay-150"
                              : index === 2
                                ? "animation-delay-225"
                                : "animation-delay-300";

                        return (
                          <div
                            key={log.id}
                            className={clsx("animate-fade-in-up relative pl-6 text-xs", delayClass)}
                          >
                            {/* Subtle clean timeline node */}
                            <div
                              className={clsx(
                                "absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white shadow-2xs",
                                index === 0 ? "bg-[#0532e6]" : "bg-slate-300",
                              )}
                            />

                            {/* Card Content with refined liquid glass polish */}
                            <div className="group rounded-2xl border border-white/90 bg-white/90 p-4 shadow-2xs backdrop-blur-md transition-all duration-300 hover:shadow-card hover:-translate-y-0.5 hover:border-blue-200">
                              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-gborder/40 pb-2">
                                <span
                                  className={clsx(
                                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
                                    badgeBg,
                                  )}
                                >
                                  <Icon name={actionIcon} className="h-3 w-3" />
                                  {actionTitle}
                                </span>
                                <span className="text-gtext tabular-nums text-[11px]">
                                  {formatDateTime(log.created_at)}
                                </span>
                              </div>
                              <div className="mt-2.5 space-y-2 text-gtext">
                                <p className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <span className="text-slate-500">Người thực hiện:</span>
                                  <strong className="text-navy bg-slate-100 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                                    {log.actor_name || log.actor_email}
                                  </strong>
                                </p>
                                {log.reason && (
                                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-700">
                                    <span className="text-slate-500 font-medium">Lý do:</span>{" "}
                                    <span className="font-medium text-slate-800">{log.reason}</span>
                                  </div>
                                )}

                                {/* Clean, human-readable change details (NO raw JSON) */}
                                {Boolean(
                                  newVals && log.action === "user.update_status" && newVals.status,
                                ) && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-slate-500 font-medium text-xs">
                                      Trạng thái:
                                    </span>
                                    {Boolean(
                                      oldVals?.status && typeof oldVals.status === "string",
                                    ) && (
                                      <>
                                        <StatusBadge status={String(oldVals?.status)} />
                                        <span className="text-slate-400">→</span>
                                      </>
                                    )}
                                    <StatusBadge status={String(newVals?.status)} />
                                  </div>
                                )}

                                {Boolean(newVals && log.action !== "user.update_status") && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {Object.entries(newVals || {}).map(([key, val]) => {
                                      if (val === null || val === undefined || val === "")
                                        return null;
                                      const label =
                                        AUDIT_FIELD_LABELS[key] || key.replace(/_/g, " ");
                                      let displayVal: string;
                                      if (key === "roles" && Array.isArray(val)) {
                                        displayVal = val
                                          .map((r: Role) => ROLE_LABELS[r]?.label || r)
                                          .join(", ");
                                      } else if (key === "role" && typeof val === "string") {
                                        displayVal = ROLE_LABELS[val as Role]?.label || val;
                                      } else if (key === "status" && typeof val === "string") {
                                        displayVal = AUDIT_STATUS_LABELS[val]?.label || val;
                                      } else if (typeof val === "object") {
                                        displayVal = Object.values(val as Record<string, unknown>)
                                          .filter(Boolean)
                                          .join(", ");
                                      } else {
                                        displayVal = String(val);
                                      }
                                      if (!displayVal) return null;
                                      return (
                                        <span
                                          key={key}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1 text-xs text-slate-700"
                                        >
                                          <span className="text-slate-500 font-medium">
                                            {label}:
                                          </span>
                                          <span className="font-semibold text-slate-900">
                                            {displayVal}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </QueryState>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Slide-over Drawer: Thêm tài khoản người dùng mới (Apple Liquid Glass) */}
      <Drawer open={isCreateOpen} onClose={() => setIsCreateOpen(false)} width="max-w-2xl">
        <div className="flex flex-col h-full">
          {/* Top Bar with Breadcrumb Navigation */}
          <div className="flex shrink-0 items-center justify-between border-b border-gborder/50 bg-white/70 px-6 py-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs text-gtext">
              <span className="font-medium hover:text-navy cursor-default">{pageTitle}</span>
              <Icon name="chevron-right" className="h-3 w-3 text-gtext/60" />
              <span className="font-bold text-navy">Thêm tài khoản mới</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gtext transition-colors hover:bg-gbg2 hover:text-navy"
              aria-label="Đóng"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>

          {/* Profile Header Box (Microsoft 365 + Liquid Glass Style) */}
          <div className="shrink-0 border-b border-gborder/60 bg-white/95 px-6 pt-6 pb-4 backdrop-blur-md">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#001258] via-[#0532e6] to-[#001258] text-xl font-bold text-white shadow-lg ring-4 ring-blue-100/90 transition-all duration-300">
                {createForm.full_name || createForm.email ? (
                  getInitials(createForm.full_name, createForm.email)
                ) : (
                  <Icon name="user-check" className="h-7 w-7 text-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="truncate text-xl font-bold tracking-tight text-navy-heading">
                    Thêm tài khoản người dùng
                  </h2>
                  <RoleBadge role={createForm.role} />
                  <StatusBadge status={createForm.status ?? "active"} />
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Form Body */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(createForm);
            }}
            className="flex-1 flex flex-col justify-between overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-gradient-to-b from-slate-50/40 to-slate-100/20">
              {/* Section 1: Thông tin đăng nhập & Bảo mật */}
              <div className="animate-fade-in-up rounded-2xl border border-white/90 bg-white/85 p-5 shadow-xs backdrop-blur-md space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[#0532e6]">
                    <Icon name="lock" className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
                    Thông tin đăng nhập & Bảo mật
                  </h3>
                </div>

                <div className="space-y-3.5">
                  <Input
                    label="Email đăng nhập *"
                    type="email"
                    required
                    placeholder="vd: nhanvien@congty.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-navy-heading">
                        Mật khẩu tạm thời *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const generated = generateSecurePassword();
                          setCreateForm((prev) => ({ ...prev, password: generated }));
                        }}
                        className="text-[11px] font-semibold text-[#0532e6] hover:underline"
                      >
                        Tạo mật khẩu ngẫu nhiên
                      </button>
                    </div>
                    <Input
                      label=""
                      type="text"
                      required
                      placeholder="Tối thiểu 8 ký tự"
                      value={createForm.password}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                    />
                  </div>

                  <Select
                    label="Trạng thái khởi tạo *"
                    value={createForm.status ?? "active"}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="active">Hoạt động ngay (active)</option>
                    <option value="suspended">Tạm khóa (suspended)</option>
                    <option value="pending">Chờ kích hoạt (pending)</option>
                  </Select>
                </div>
              </div>

              {/* Section 2: Hồ sơ cá nhân */}
              <div className="animate-fade-in-up animation-delay-75 rounded-2xl border border-white/90 bg-white/85 p-5 shadow-xs backdrop-blur-md space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[#0532e6]">
                    <Icon name="user" className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
                    Hồ sơ cá nhân
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Họ và tên"
                    placeholder="vd: Nguyễn Văn A"
                    value={createForm.full_name ?? ""}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))
                    }
                  />

                  <Input
                    label="Số điện thoại"
                    placeholder="vd: 0912345678"
                    value={createForm.phone ?? ""}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>

              {/* Section 3: Phân quyền vai trò hệ thống */}
              <div className="animate-fade-in-up animation-delay-150 rounded-2xl border border-white/90 bg-white/85 p-5 shadow-xs backdrop-blur-md space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[#0532e6]">
                      <Icon name="user-check" className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
                      Phân quyền vai trò hệ thống *
                    </h3>
                  </div>
                  <RoleBadge role={createForm.role} />
                </div>

                <Select
                  label="Vai trò tài khoản *"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, role: e.target.value as Role }))
                  }
                >
                  {availableRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>

                {ROLE_DESCRIPTIONS[createForm.role] && (
                  <p className="text-xs text-gtext leading-relaxed">
                    {ROLE_DESCRIPTIONS[createForm.role].desc}
                  </p>
                )}
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="shrink-0 flex items-center justify-end gap-3 border-t border-white/80 bg-white/80 px-6 py-4 backdrop-blur-2xl shadow-[0_-10px_25px_rgba(0,18,88,0.04)]">
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" loading={createMutation.isPending}>
                <Icon name="plus" className="h-4 w-4" />
                Tạo tài khoản
              </Button>
            </div>
          </form>
        </div>
      </Drawer>

      {/* Modal 2: Đổi trạng thái tài khoản */}
      <Modal
        open={isStatusModalOpen}
        title="Thay đổi trạng thái tài khoản"
        onClose={() => setIsStatusModalOpen(false)}
      >
        {selectedUser && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateStatusMutation.mutate({
                id: selectedUser.id,
                data: { status: newStatus, reason: statusReason.trim() || undefined },
              });
            }}
            className="space-y-4"
          >
            <div className="rounded-xl bg-gbg/60 p-3.5 border border-gborder text-sm">
              <p className="font-bold text-navy">{selectedUser.full_name || selectedUser.email}</p>
              <p className="text-xs text-gtext">{selectedUser.email}</p>
              <p className="mt-2 text-xs">
                Trạng thái hiện tại: <StatusBadge status={selectedUser.status} />
              </p>
            </div>

            <Select
              label="Trạng thái mới *"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as "active" | "suspended" | "inactive")}
            >
              <option value="active">Đang hoạt động (active)</option>
              <option value="suspended">Tạm khóa đăng nhập (suspended)</option>
              <option value="inactive">Ngừng hoạt động (inactive)</option>
            </Select>

            <Textarea
              label="Lý do thay đổi *"
              required
              placeholder="VD: Nhân viên nghỉ việc, yêu cầu tạm khóa bảo mật..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-gborder">
              <Button type="button" variant="ghost" onClick={() => setIsStatusModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" loading={updateStatusMutation.isPending}>
                Lưu trạng thái
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
