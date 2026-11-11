import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Icon } from "../../components/icons";
import { Button, ErrorBanner, Input, Modal } from "../../components/ui";
import type { ConvertResult, Lead } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleApi } from "./saleApi";
import { generateStudentPassword } from "./saleShared";

export interface ConfirmChotLeadModalProps {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSuccess: (result: ConvertResult) => void;
}

export function ConfirmChotLeadModal({
  open,
  lead,
  onClose,
  onSuccess,
}: ConfirmChotLeadModalProps) {
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [successResult, setSuccessResult] = useState<ConvertResult | null>(null);
  const [countdown, setCountdown] = useState(4);
  const copyTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);

  // Clean up copy and countdown timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  // Initialize form state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (open && !wasOpenRef.current && lead) {
      setFullName(lead.full_name || "");
      setEmail(lead.email || "");
      setPhone(lead.phone || "");
      setPassword(generateStudentPassword());
      setShowPassword(false);
      setFormError("");
      setCopied(false);
      setSuccessResult(null);
      setCountdown(4);
    }
    wasOpenRef.current = open;
  }, [open, lead]);

  const handleDismissSuccess = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (successResult) {
      onSuccess(successResult);
    }
    onClose();
  };

  // Auto-close countdown when conversion succeeds
  useEffect(() => {
    if (!successResult) return;

    setCountdown(4);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current !== null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          onSuccess(successResult);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [successResult, onSuccess, onClose]);

  const convertMutation = useMutation({
    mutationFn: (data: { password?: string; email?: string; full_name?: string; phone?: string }) =>
      saleApi.convertLead(lead!.id, data),
    onSuccess: (result) => {
      setSuccessResult(result);
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      if (lead?.id) {
        queryClient.invalidateQueries({ queryKey: ["sale", "lead", lead.id] });
      }
    },
    onError: (err: unknown) => {
      setFormError(mutationMessage(err));
    },
  });

  const handleGeneratePassword = () => {
    setPassword(generateStudentPassword());
  };

  const handleCopyAccountInfo = async () => {
    const actualPassword = successResult?.initial_password || password;
    const infoText = `Thông tin tài khoản Học viện NSA:
- Họ và tên: ${fullName}
- Tên đăng nhập (Email): ${email || "Chưa có email"}
- Mật khẩu: ${actualPassword}
- Link đăng nhập: ${window.location.origin}/login`;

    try {
      await navigator.clipboard.writeText(infoText);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 3000);
    } catch (err) {
      console.error("Failed to copy account info:", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!fullName.trim()) {
      setFormError("Vui lòng nhập họ và tên học viên.");
      return;
    }

    if (!email.trim()) {
      setFormError(
        "Vui lòng nhập địa chỉ Email. Email là tên đăng nhập bắt buộc để học viên sử dụng hệ thống.",
      );
      return;
    }

    // Basic email format check
    if (!email.includes("@") || !email.includes(".")) {
      setFormError("Địa chỉ Email không đúng định dạng. Vui lòng kiểm tra lại.");
      return;
    }

    if (!password.trim()) {
      setFormError("Vui lòng nhập hoặc bấm Tạo ngẫu nhiên mật khẩu cho học viên.");
      return;
    }

    convertMutation.mutate({
      password: password.trim(),
      email: email.trim(),
      full_name: fullName.trim(),
      phone: phone.trim() || undefined,
    });
  };

  if (!open || !lead) return null;

  // View: Success Screen after conversion with celebration animation & auto-close
  if (successResult) {
    return (
      <Modal
        open={open}
        title="Đăng ký & Chốt học viên thành công!"
        onClose={handleDismissSuccess}
        className="max-w-lg"
      >
        <div className="space-y-4 py-1 animate-in fade-in zoom-in-95 duration-200">
          {/* Animated Celebration Icon Header */}
          <div className="text-center pt-2">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping duration-1000" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xl shadow-emerald-600/30">
                <Icon name="check" className="h-9 w-9 stroke-[3]" />
              </div>
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-slate-900">
              🎉 Đăng ký học viên thành công!
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Hồ sơ học viên và tài khoản đăng nhập đã được khởi tạo thành công trên hệ thống.
            </p>
          </div>

          {/* Student Code Badge */}
          <div className="rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-4 text-center shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">
              Mã học viên chính thức
            </span>
            <p className="font-mono text-2xl font-black text-emerald-700 tracking-wide mt-0.5">
              {successResult.student_code}
            </p>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">{fullName}</p>
          </div>

          {/* Account Credentials Box */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-200/70">
              <span className="text-xs font-bold text-navy flex items-center gap-1.5">
                <Icon name="lock" className="h-4 w-4 text-[#0532e6]" />
                Tài khoản đăng nhập của Học viên
              </span>
              <button
                type="button"
                onClick={handleCopyAccountInfo}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer active:scale-95"
              >
                <Icon name="check" className="h-3.5 w-3.5" />
                {copied ? "✓ Đã copy!" : "Sao chép"}
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-blue-100 shadow-2xs">
                <span className="text-slate-500 font-medium">Tên đăng nhập (Email):</span>
                <strong className="text-[#0532e6] font-mono">{email}</strong>
              </div>
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-blue-100 shadow-2xs">
                <span className="text-slate-500 font-medium">Mật khẩu khởi tạo:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {successResult.initial_password || password}
                </span>
              </div>
            </div>
          </div>

          {/* Auto-closing Countdown & Quick Dismiss */}
          <div className="p-3 rounded-2xl bg-slate-100/90 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span>
                Tự động đóng popup sau <b>{countdown}s</b>...
              </span>
            </div>

            <Button
              type="button"
              variant="primary"
              className="h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              onClick={handleDismissSuccess}
            >
              Đóng popup ngay
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Xác nhận Chốt học viên & Cấp tài khoản"
      onClose={onClose}
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <ErrorBanner message={formError} />}

        {/* Verification Warning Alert */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-xs text-amber-900 flex items-center gap-2">
          <Icon name="lock" className="h-4 w-4 text-amber-700 shrink-0" />
          <span>
            Email sẽ là tài khoản đăng nhập và được khóa thông tin định danh sau khi chốt.
          </span>
        </div>

        {/* Form Fields: Clean 3-Row Layout */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
          {/* HÀNG 1: Họ và tên & Số điện thoại (2 cột) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Họ và tên học viên *"
              required
              placeholder="VD: Nguyễn Văn A"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />

            <Input
              label="Số điện thoại"
              placeholder="0912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* HÀNG 2: Email đăng nhập (Tài khoản) - 1 hàng riêng biệt full-width */}
          <div>
            <Input
              label="Email đăng nhập (Tài khoản) *"
              type="email"
              required
              placeholder="VD: hocvien@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* HÀNG 3: Mật khẩu khởi tạo - 1 hàng riêng biệt full-width */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-navy-heading">
                Mật khẩu khởi tạo *
              </label>
              <button
                type="button"
                onClick={handleCopyAccountInfo}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer active:scale-95"
              >
                <Icon name="check" className="h-3 w-3" />
                {copied ? "Đã copy thông tin!" : "Sao chép tài khoản"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-navy focus:border-[#0532e6] focus:outline-none"
                  placeholder="Nhập hoặc tạo mật khẩu"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  <Icon name={showPassword ? "close" : "edit"} className="h-4 w-4" />
                </button>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="h-9.5 px-3 text-xs text-[#0532e6] border border-blue-200 bg-white hover:bg-blue-50 shrink-0 font-medium"
                onClick={handleGeneratePassword}
                title="Sinh mật khẩu ngẫu nhiên"
              >
                <Icon name="rotate-ccw" className="h-3.5 w-3.5 mr-1.5" />
                Tạo ngẫu nhiên
              </Button>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-5 flex justify-end gap-3 pt-3 border-t border-gborder">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={convertMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5"
          >
            <Icon name="check" className="h-4 w-4 mr-1.5" />
            Xác nhận Chốt học viên
          </Button>
        </div>
      </form>
    </Modal>
  );
}
