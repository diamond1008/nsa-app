/** Forced/voluntary password change — Figma frame "Đổi mật khẩu bắt buộc". */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import { Button, Card, ErrorBanner, Input, SuccessBanner } from "../../components/ui";
import { ApiRequestError } from "../../lib/apiClient";
import * as authApi from "./authApi";
import { useAuth } from "./AuthContext";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu xác nhận không khớp",
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const { user, logout, homePath } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      setDone(true);
      // The API revokes every session on password change — re-login is required.
      setTimeout(() => {
        void logout().then(() => navigate("/login", { replace: true }));
      }, 1800);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "WRONG_CURRENT_PASSWORD") {
        setServerError("Mật khẩu hiện tại không đúng.");
      } else if (err instanceof ApiRequestError && err.code === "WEAK_PASSWORD") {
        setServerError("Mật khẩu mới chưa đủ mạnh (tối thiểu 8 ký tự).");
      } else {
        setServerError("Không đổi được mật khẩu. Vui lòng thử lại.");
      }
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,rgba(239,192,75,.16),transparent_35%),#F5F7FB] px-4">
      <div className="w-full max-w-[480px]">
        <Card className="border-0 p-6 shadow-elevated sm:p-8">
          <div className="mb-8 text-center">
            <h1 className="text-[28px] font-bold text-navy-dark">Đổi mật khẩu</h1>
            <p className="mt-2 text-sm text-gtext">
              Cập nhật mật khẩu để bảo vệ tài khoản của bạn.
            </p>
          </div>

          {done ? (
            <SuccessBanner message="Đổi mật khẩu thành công! Đang chuyển về trang đăng nhập…" />
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {serverError && <ErrorBanner message={serverError} />}

              <Input
                label="Mật khẩu hiện tại"
                type="password"
                autoComplete="current-password"
                error={errors.currentPassword?.message}
                {...register("currentPassword")}
              />
              <Input
                label="Mật khẩu mới"
                type="password"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                {...register("newPassword")}
              />
              <Input
                label="Xác nhận mật khẩu mới"
                type="password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />

              <Button type="submit" className="w-full" loading={isSubmitting}>
                Cập nhật mật khẩu
              </Button>
            </form>
          )}

          {!done && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm font-medium text-navy-dark hover:text-navy hover:underline"
              onClick={() => navigate(homePath(user))}
            >
              ← Bỏ qua & Quay lại trang tổng quan
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
