import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Icon } from "../../components/icons";
import { Badge, Button, Card, ErrorBanner, Input, SuccessBanner } from "../../components/ui";
import { ApiRequestError } from "../../lib/apiClient";
import { formatDateTime } from "../../lib/format";
import { compressImageToWebP } from "../../lib/image";
import type { Role } from "../../lib/types";
import * as authApi from "../auth/authApi";
import { useAuth } from "../auth/AuthContext";

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

type AccountTab = "profile" | "security" | "sso" | "preferences";

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Họ và tên không được để trống")
    .max(200, "Họ và tên tối đa 200 ký tự"),
  phone: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val) return true;
        const clean = val.replace(/[\s\-().]/g, "");
        return /^0\d{9,10}$/.test(clean);
      },
      {
        message: "Số điện thoại không hợp lệ (gồm 10-11 chữ số, bắt đầu bằng 0)",
      },
    ),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu xác nhận không khớp",
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function PersonalAccountPage() {
  const { user, updateMyProfile, updateMyAvatar, revokeOtherSessions, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");

  // Avatar state
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState("");

  // Profile form state
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  // Password form state
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Session revoke state
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [sessionSuccess, setSessionSuccess] = useState("");
  const [sessionError, setSessionError] = useState("");

  // User Preferences in localStorage
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("nsa_pref_sound") !== "false";
  });
  const [taskReminder, setTaskReminder] = useState(() => {
    return localStorage.getItem("nsa_pref_task_reminder") !== "false";
  });
  const [prefSaved, setPrefSaved] = useState("");

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    reset: resetProfile,
    formState: { errors: profileErrors, isSubmitting: isSubmittingProfile },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName:
        user?.full_name ||
        user?.teacher_profile?.full_name ||
        user?.student_profile?.full_name ||
        "",
      phone: user?.phone || "",
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPassword,
    formState: { errors: passwordErrors, isSubmitting: isSubmittingPassword },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  // Sync profile form when user object loads or updates
  useEffect(() => {
    if (user) {
      resetProfile({
        fullName:
          user.full_name ||
          user.teacher_profile?.full_name ||
          user.student_profile?.full_name ||
          "",
        phone: user.phone || "",
      });
    }
  }, [user, resetProfile]);

  if (!user) return null;

  const displayName =
    user.full_name ||
    user.teacher_profile?.full_name ||
    user.student_profile?.full_name ||
    user.email;

  const currentAvatarUrl =
    user.avatar_url || user.teacher_profile?.avatar_url || user.student_profile?.avatar_url || null;

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !updateMyAvatar) return;

    setAvatarError("");
    setAvatarSuccess("");
    setAvatarLoading(true);

    try {
      const webpDataUrl = await compressImageToWebP(file);
      await updateMyAvatar(webpDataUrl);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setAvatarSuccess("Cập nhật ảnh đại diện thành công!");
      setTimeout(() => setAvatarSuccess(""), 4000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Không thể xử lý ảnh tải lên. Vui lòng thử lại.";
      setAvatarError(msg);
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!updateMyAvatar || !currentAvatarUrl) return;
    setAvatarError("");
    setAvatarSuccess("");
    setAvatarLoading(true);

    try {
      await updateMyAvatar(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setAvatarSuccess("Đã gỡ ảnh đại diện.");
      setTimeout(() => setAvatarSuccess(""), 4000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Không thể gỡ ảnh đại diện. Vui lòng thử lại.";
      setAvatarError(msg);
    } finally {
      setAvatarLoading(false);
    }
  };

  const onSaveProfile = handleSubmitProfile(async (values) => {
    if (!updateMyProfile) return;
    setProfileError("");
    setProfileSuccess("");

    try {
      const cleanPhone = values.phone.replace(/[\s\-().]/g, "");
      await updateMyProfile({
        full_name: values.fullName,
        phone: cleanPhone || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setProfileSuccess("Cập nhật thông tin cá nhân thành công!");
      setTimeout(() => setProfileSuccess(""), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setProfileError(err.message || "Cập nhật thông tin thất bại.");
      } else {
        setProfileError("Có lỗi xảy ra khi cập nhật thông tin cá nhân.");
      }
    }
  });

  const onSavePassword = handleSubmitPassword(async (values) => {
    setPasswordError("");
    setPasswordSuccess("");

    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      setPasswordSuccess("Đổi mật khẩu thành công! Hệ thống đang chuyển về trang đăng nhập…");
      resetPassword();
      setTimeout(() => {
        void logout().then(() => navigate("/login", { replace: true }));
      }, 1800);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.code === "WRONG_CURRENT_PASSWORD") {
        setPasswordError("Mật khẩu hiện tại không chính xác.");
      } else if (err instanceof ApiRequestError && err.code === "WEAK_PASSWORD") {
        setPasswordError("Mật khẩu mới chưa đủ mạnh (tối thiểu 8 ký tự).");
      } else {
        setPasswordError("Không thể đổi mật khẩu. Vui lòng thử lại sau.");
      }
    }
  });

  const handleRevokeOtherSessions = async () => {
    if (!revokeOtherSessions) return;
    setSessionError("");
    setSessionSuccess("");
    setRevokingSessions(true);

    try {
      const res = await revokeOtherSessions();
      setSessionSuccess(res.message || "Đã đăng xuất khỏi tất cả các thiết bị khác thành công.");
      setTimeout(() => setSessionSuccess(""), 5000);
    } catch {
      setSessionError("Không thể thu hồi phiên làm việc. Vui lòng thử lại.");
    } finally {
      setRevokingSessions(false);
    }
  };

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem("nsa_pref_sound", String(enabled));
    setPrefSaved("Đã cập nhật tùy chọn âm thanh.");
    setTimeout(() => setPrefSaved(""), 3000);
  };

  const handleToggleTaskReminder = (enabled: boolean) => {
    setTaskReminder(enabled);
    localStorage.setItem("nsa_pref_task_reminder", String(enabled));
    setPrefSaved("Đã cập nhật tùy chọn nhắc nhở tác vụ.");
    setTimeout(() => setPrefSaved(""), 3000);
  };

  // Browser & OS detection for current session
  const userAgent = navigator.userAgent;
  let browserName = "Trình duyệt Web";
  if (userAgent.includes("Edg/")) browserName = "Microsoft Edge";
  else if (userAgent.includes("Chrome/")) browserName = "Google Chrome";
  else if (userAgent.includes("Firefox/")) browserName = "Mozilla Firefox";
  else if (userAgent.includes("Safari/")) browserName = "Apple Safari";

  let osName = "Thiết bị hiện tại";
  if (userAgent.includes("Windows")) osName = "Windows PC";
  else if (userAgent.includes("Macintosh")) osName = "macOS";
  else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) osName = "iOS Device";
  else if (userAgent.includes("Android")) osName = "Android Device";

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-navy">Tài khoản</h1>
        <p className="mt-1 text-sm text-gtext">
          Quản lý thông tin cá nhân, bảo mật và cài đặt tài khoản.
        </p>
      </div>

      {/* Hero Card: Avatar & Overview */}
      <Card className="p-6 sm:p-7 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar Slot - Click directly to upload */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              title="Nhấn để đổi ảnh đại diện"
              className="group relative h-24 w-24 sm:h-28 sm:w-28 rounded-full overflow-hidden bg-navy text-white flex items-center justify-center font-bold text-2xl shadow-md border-4 border-white/90 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#0532e6] focus:ring-offset-2 transition-transform hover:scale-[1.02]"
            >
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-75"
                />
              ) : (
                <span className="transition-opacity group-hover:opacity-75">{initials}</span>
              )}

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 text-[11px] font-medium">
                <Icon name="camera" className="h-5 w-5" />
                <span>Đổi ảnh</span>
              </div>

              {avatarLoading && (
                <div className="absolute inset-0 bg-navy/70 backdrop-blur-xs flex items-center justify-center">
                  <span className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={avatarLoading}
              onChange={handleAvatarFileSelect}
              className="hidden"
            />

            {currentAvatarUrl && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={avatarLoading}
                className="text-xs text-red-600 hover:text-red-700 hover:underline cursor-pointer disabled:opacity-50"
              >
                Gỡ ảnh
              </button>
            )}
          </div>

          {/* User Details */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{displayName}</h2>
              <div className="self-center sm:self-auto">
                <Badge tone="green">Hoạt động</Badge>
              </div>
            </div>

            <p className="text-sm text-slate-600 font-medium">{user.email}</p>

            {/* Roles badges */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              {user.roles.map((r) => {
                const conf = ROLE_LABELS[r] || { label: r, tone: "blue" };
                return (
                  <Badge key={r} tone={conf.tone}>
                    {conf.label}
                  </Badge>
                );
              })}
              {user.employee_code && <Badge tone="navy">Mã NV: {user.employee_code}</Badge>}
              {user.student_profile?.code && (
                <Badge tone="gray">Mã HV: {user.student_profile.code}</Badge>
              )}
              {user.teacher_profile?.code && (
                <Badge tone="navy">Mã GV: {user.teacher_profile.code}</Badge>
              )}
            </div>

            <p className="text-xs text-slate-400 pt-1">
              Nhấn vào ảnh đại diện để tải ảnh mới lên (tự động tối ưu sang WebP).
            </p>

            {avatarError && (
              <div className="pt-2">
                <ErrorBanner message={avatarError} />
              </div>
            )}
            {avatarSuccess && (
              <div className="pt-2">
                <SuccessBanner message={avatarSuccess} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto select-none">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "profile"
              ? "border-[#0532e6] text-[#0532e6]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Icon name="user" className="h-4 w-4" />
          Thông tin cá nhân
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "security"
              ? "border-[#0532e6] text-[#0532e6]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Icon name="shield" className="h-4 w-4" />
          Mật khẩu & Bảo mật
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sso")}
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "sso"
              ? "border-[#0532e6] text-[#0532e6]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Icon name="globe" className="h-4 w-4" />
          Liên kết đăng nhập
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("preferences")}
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "preferences"
              ? "border-[#0532e6] text-[#0532e6]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Icon name="settings" className="h-4 w-4" />
          Cài đặt
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          {/* Left Column: Personal Information Form */}
          <Card className="lg:col-span-2 p-6 sm:p-7 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Icon name="user" className="h-5 w-5 text-slate-700 shrink-0" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Thông tin cá nhân</h3>
            </div>

            <form onSubmit={onSaveProfile} noValidate className="space-y-4 pt-5">
              {profileError && <ErrorBanner message={profileError} />}
              {profileSuccess && <SuccessBanner message={profileSuccess} />}

              {/* Readonly Email */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email đăng nhập
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={user.email}
                    disabled
                    readOnly
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-sm text-slate-500 font-medium cursor-not-allowed select-all"
                  />
                  <div className="absolute right-3 text-slate-400">
                    <Icon name="lock" className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Email dùng để đăng nhập và nhận thông báo từ hệ thống.
                </p>
              </div>

              {/* Full Name */}
              <Input
                label="Họ và tên"
                type="text"
                required
                placeholder="Ví dụ: Nguyễn Văn A"
                error={profileErrors.fullName?.message}
                {...registerProfile("fullName")}
              />

              {/* Phone */}
              <Input
                label="Số điện thoại"
                type="tel"
                placeholder="Ví dụ: 0912345678"
                error={profileErrors.phone?.message}
                {...registerProfile("phone")}
              />

              <div className="pt-2">
                <Button
                  type="submit"
                  loading={isSubmittingProfile}
                  className="w-full sm:w-auto px-6"
                >
                  <Icon name="check" className="h-4 w-4" />
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </Card>

          {/* Right Column: Shortcuts & Meta */}
          <div className="space-y-6">
            <Card className="p-6 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Icon name="sparkles" className="h-4 w-4 text-slate-700 shrink-0" />
                <h4 className="text-sm font-bold text-slate-900">Lối tắt chức năng</h4>
              </div>

              <div className="pt-3 space-y-2">
                {/* Admin shortcuts */}
                {(user.roles.includes("ADMIN") || user.roles.includes("ACADEMIC_ADMIN")) && (
                  <>
                    <Link
                      to="/admin/users"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="users" className="h-4 w-4 text-slate-500" />
                        Quản lý Người dùng
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/admin/van-hanh"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="academic" className="h-4 w-4 text-slate-500" />
                        Vận hành Đào tạo
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/admin/ai-workflows"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="sparkles" className="h-4 w-4 text-purple-600" />
                        AI Operator Hub
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </>
                )}

                {/* Sale shortcuts */}
                {(user.roles.includes("SALE_ADMIN") || user.roles.includes("SALE")) && (
                  <>
                    <Link
                      to="/sale/leads"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="user-check" className="h-4 w-4 text-blue-600" />
                        Quản lý Leads
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/sale"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="chart" className="h-4 w-4 text-emerald-600" />
                        Dashboard Tuyển sinh
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/sale/phieu-dang-ky"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="shopping-bag" className="h-4 w-4 text-amber-600" />
                        Phiếu đăng ký khóa học
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </>
                )}

                {/* Teacher shortcuts */}
                {user.roles.includes("TEACHER") && (
                  <>
                    <Link
                      to="/teacher/lich-day"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="calendar" className="h-4 w-4 text-green-600" />
                        Lịch dạy tuần này
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/teacher/diem-danh"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="check" className="h-4 w-4 text-blue-600" />
                        Điểm danh lớp học
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </>
                )}

                {/* Student shortcuts */}
                {user.roles.includes("STUDENT") && (
                  <>
                    <Link
                      to="/student/lich-hoc"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="calendar" className="h-4 w-4 text-blue-600" />
                        Lịch học của tôi
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/student/khoa-hoc"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-xs font-semibold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="book" className="h-4 w-4 text-indigo-600" />
                        Khóa học của tôi
                      </span>
                      <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </>
                )}
              </div>
            </Card>

            {/* Account Meta Card */}
            <Card className="p-5 bg-slate-50/70 border border-slate-200/80 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2 font-bold text-navy text-sm">
                <Icon name="info" className="h-4 w-4 text-slate-600 shrink-0" />
                Thông tin tài khoản
              </div>
              {user.employee_code && (
                <p>
                  Mã nhân viên:{" "}
                  <span className="font-semibold text-purple-700 font-mono">
                    {user.employee_code}
                  </span>
                </p>
              )}
              <p>
                Ngày tạo:{" "}
                <span className="font-semibold text-slate-800">
                  {user.created_at ? formatDateTime(user.created_at) : "Hệ thống"}
                </span>
              </p>
              <p>
                Đăng nhập gần nhất:{" "}
                <span className="font-semibold text-slate-800">
                  {user.last_login_at ? formatDateTime(user.last_login_at) : "Vừa xong"}
                </span>
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Security & Password */}
      {activeTab === "security" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          {/* Change Password Card */}
          <Card className="p-6 sm:p-7 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Icon name="key" className="h-5 w-5 text-slate-700 shrink-0" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Đổi mật khẩu</h3>
            </div>

            <form onSubmit={onSavePassword} noValidate className="space-y-4 pt-5">
              {passwordError && <ErrorBanner message={passwordError} />}
              {passwordSuccess && <SuccessBanner message={passwordSuccess} />}

              {/* Current Password */}
              <div className="relative">
                <Input
                  label="Mật khẩu hiện tại"
                  type={showCurrentPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu đang dùng"
                  error={passwordErrors.currentPassword?.message}
                  {...registerPassword("currentPassword")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <Icon name={showCurrentPw ? "eye-off" : "eye"} className="h-4 w-4" />
                </button>
              </div>

              {/* New Password */}
              <div className="relative">
                <Input
                  label="Mật khẩu mới (tối thiểu 8 ký tự)"
                  type={showNewPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Nhập mật khẩu mới"
                  error={passwordErrors.newPassword?.message}
                  {...registerPassword("newPassword")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <Icon name={showNewPw ? "eye-off" : "eye"} className="h-4 w-4" />
                </button>
              </div>

              {/* Confirm Password */}
              <div className="relative">
                <Input
                  label="Xác nhận mật khẩu mới"
                  type={showConfirmPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu mới"
                  error={passwordErrors.confirmPassword?.message}
                  {...registerPassword("confirmPassword")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <Icon name={showConfirmPw ? "eye-off" : "eye"} className="h-4 w-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                Sau khi đổi mật khẩu thành công, bạn sẽ cần đăng nhập lại trên các thiết bị khác.
              </p>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmittingPassword}
                  className="w-full sm:w-auto px-6"
                >
                  <Icon name="key" className="h-4 w-4" />
                  Đổi mật khẩu
                </Button>
              </div>
            </form>
          </Card>

          {/* Security Status & Sessions */}
          <div className="space-y-6">
            <Card className="p-6 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Icon name="shield" className="h-5 w-5 text-slate-700 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">Tình trạng bảo mật</h3>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="flex items-center gap-2 text-slate-700 font-medium">
                    <Icon name="check" className="h-4 w-4 text-emerald-600" />
                    Mật khẩu tài khoản
                  </span>
                  <Badge tone="green">Đã thiết lập</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="flex items-center gap-2 text-slate-700 font-medium">
                    <Icon name="check" className="h-4 w-4 text-emerald-600" />
                    Email đăng nhập
                  </span>
                  <Badge tone="blue">Đã kích hoạt</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="flex items-center gap-2 text-slate-700 font-medium">
                    <Icon name="check" className="h-4 w-4 text-emerald-600" />
                    Phân quyền hệ thống
                  </span>
                  <Badge tone="navy">{user.roles.length} vai trò</Badge>
                </div>
              </div>
            </Card>

            {/* Sessions */}
            <Card className="p-6 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Icon name="clock" className="h-5 w-5 text-slate-700 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">Phiên đăng nhập</h3>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    {browserName} trên {osName}
                  </span>
                  <Badge tone="green">Thiết bị này</Badge>
                </div>
                <p className="text-slate-500 text-[11px] pt-1">
                  Đăng nhập gần nhất:{" "}
                  {user.last_login_at ? formatDateTime(user.last_login_at) : "Vừa xong"}
                </p>
              </div>

              {sessionSuccess && <SuccessBanner message={sessionSuccess} />}
              {sessionError && <ErrorBanner message={sessionError} />}

              <div className="pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRevokeOtherSessions}
                  loading={revokingSessions}
                  className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                >
                  <Icon name="logout" className="h-4 w-4" />
                  Đăng xuất khỏi thiết bị khác
                </Button>
                <p className="mt-1.5 text-[11px] text-slate-500 text-center">
                  Hữu ích khi bạn từng đăng nhập trên máy tính công cộng hoặc thiết bị khác.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 3: SSO Accounts */}
      {activeTab === "sso" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 sm:p-7 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Icon name="globe" className="h-5 w-5 text-slate-700 shrink-0" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Liên kết đăng nhập</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
              {/* Google Workspace */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="h-7 w-7" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Google Workspace</h4>
                      <p className="text-xs text-slate-500">Đăng nhập bằng Gmail / Google</p>
                    </div>
                  </div>
                  <Badge tone="green">Khả dụng</Badge>
                </div>
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  Email đăng nhập của bạn là <strong>{user.email}</strong>. Khi nhấn &quot;Đăng nhập
                  với Google&quot;, hệ thống tự động nhận diện tài khoản này.
                </p>
              </div>

              {/* Microsoft 365 */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="h-7 w-7" viewBox="0 0 23 23">
                      <path fill="#f35325" d="M1 1h10v10H1z" />
                      <path fill="#81bc06" d="M12 1h10v10H12z" />
                      <path fill="#05a6f0" d="M1 12h10v10H1z" />
                      <path fill="#ffba08" d="M12 12h10v10H12z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Microsoft 365 / Azure AD</h4>
                      <p className="text-xs text-slate-500">
                        Đăng nhập tài khoản cơ quan New City / Suleco
                      </p>
                    </div>
                  </div>
                  <Badge tone="blue">Khả dụng</Badge>
                </div>
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  Tài khoản công ty xác thực qua Microsoft Entra ID. Bạn có thể sử dụng nút
                  &quot;Đăng nhập với Microsoft&quot; tại trang đăng nhập.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Preferences */}
      {activeTab === "preferences" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 sm:p-7 bg-white/75 backdrop-blur-xl border border-white/80 shadow-card">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Icon name="settings" className="h-5 w-5 text-slate-700 shrink-0" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Cài đặt</h3>
            </div>

            {prefSaved && (
              <div className="pt-4">
                <SuccessBanner message={prefSaved} />
              </div>
            )}

            <div className="pt-5 space-y-4 divide-y divide-slate-100 text-sm">
              {/* Sound preference */}
              <div className="flex items-center justify-between pt-3">
                <div>
                  <h4 className="font-semibold text-slate-800">Âm thanh thông báo</h4>
                  <p className="text-xs text-slate-500">Phát âm thanh khi có thông báo mới</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSound(!soundEnabled)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    soundEnabled ? "bg-[#0532e6]" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      soundEnabled ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Task reminder preference */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <h4 className="font-semibold text-slate-800">Nhắc việc & Lịch trình</h4>
                  <p className="text-xs text-slate-500">
                    Hiển thị nhắc nhở khi có công việc hoặc lịch sắp tới
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleTaskReminder(!taskReminder)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    taskReminder ? "bg-[#0532e6]" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      taskReminder ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Language display note */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <h4 className="font-semibold text-slate-800">Ngôn ngữ hiển thị</h4>
                  <p className="text-xs text-slate-500">Mặc định hệ thống</p>
                </div>
                <span className="text-xs font-semibold px-3 py-1 bg-slate-100 rounded-lg text-slate-700">
                  Tiếng Việt
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default PersonalAccountPage;
