/** Login screen — Light Glassmorphism with Google & Microsoft OAuth redirects. */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";

import { ApiRequestError } from "../../lib/apiClient";
import { useAuth } from "./AuthContext";
import { getOAuthConfig } from "./authApi";

const schema = z.object({
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, homePath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isSSORedirecting, setIsSSORedirecting] = useState<"google" | "microsoft" | null>(null);

  // Surface SSO error from callback redirect
  useEffect(() => {
    const ssoErr = (location.state as { ssoError?: string } | null)?.ssoError;
    if (ssoErr) {
      setServerError(ssoErr);
    }
  }, [location.state]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const performLogin = async (email: string, pass: string) => {
    setServerError("");
    try {
      const user = await login(email.trim().toLowerCase(), pass);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : homePath(user), { replace: true });
    } catch (err) {
      setIsTransitioning(false);
      if (err instanceof ApiRequestError && err.status === 401) {
        setServerError("Email hoặc mật khẩu không đúng. Vui lòng thử lại.");
      } else if (err instanceof ApiRequestError && err.status === 429) {
        setServerError("Bạn đã thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.");
      } else {
        setServerError("Không kết nối được máy chủ. Vui lòng kiểm tra lại mạng hoặc thử lại sau.");
      }
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    await performLogin(values.email, values.password);
  });

  const handleQuickLogin = async (email: string) => {
    setValue("email", email);
    setValue("password", "NsaDemo@123");
    await performLogin(email, "NsaDemo@123");
  };

  const handleOAuthClick = async (provider: "google" | "microsoft") => {
    setServerError("");
    setIsSSORedirecting(provider);
    try {
      const config = await getOAuthConfig().catch(() => null);
      const redirectUri = `${window.location.origin}/auth/callback`;

      if (provider === "google") {
        if (!config?.google_client_id) {
          setIsSSORedirecting(null);
          setServerError(
            "Hệ thống chưa được cấu hình GOOGLE_CLIENT_ID trong file .env. Vui lòng cung cấp Client ID từ Google Cloud Console để đăng nhập tài khoản Google thật.",
          );
          return;
        }
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
          config.google_client_id,
        )}&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&response_type=code&scope=openid%20email%20profile&access_type=online&state=google&prompt=select_account`;
        window.location.href = authUrl;
        return;
      }

      if (provider === "microsoft") {
        if (!config?.microsoft_client_id) {
          setIsSSORedirecting(null);
          setServerError(
            "Hệ thống chưa được cấu hình MICROSOFT_CLIENT_ID trong file .env. Vui lòng cung cấp Application (Client) ID từ Azure Portal để đăng nhập tài khoản Microsoft thật.",
          );
          return;
        }
        const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
          config.microsoft_client_id,
        )}&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&response_type=code&scope=openid%20email%20profile%20User.Read&state=microsoft&prompt=select_account`;
        window.location.href = authUrl;
        return;
      }
    } catch {
      setIsSSORedirecting(null);
      setServerError("Không thể kết nối đến máy chủ xác thực.");
    }
  };

  const isBusy = isSubmitting || isTransitioning || isSSORedirecting !== null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#EEF4FF] via-[#F8FAFC] to-[#FEF9EE] px-4 py-12 select-none">
      {/* Soft ambient lighting halos for light glass refraction */}
      <div
        className={clsx(
          "pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#60A5FA]/25 blur-[140px] transition-all duration-700 ease-out",
          isTransitioning && "scale-75 opacity-40",
        )}
      />
      <div
        className={clsx(
          "pointer-events-none absolute top-1/2 -right-40 h-[480px] w-[480px] rounded-full bg-[#FBBF24]/20 blur-[150px] transition-all duration-700 ease-out",
          isTransitioning && "scale-75 opacity-40",
        )}
      />
      <div
        className={clsx(
          "pointer-events-none absolute -bottom-32 left-1/3 h-[420px] w-[420px] rounded-full bg-[#818CF8]/20 blur-[130px] transition-all duration-700 ease-out",
          isTransitioning && "scale-75 opacity-40",
        )}
      />

      {/* Subtle Dot Matrix Texture */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#0A254012_1px,transparent_1px)] [background-size:24px_24px] opacity-60" />

      {/* Frosted Crystal Glass Card with PowerPoint-style Smooth Zoom-out Transition */}
      <div
        className={clsx(
          "relative w-full max-w-[440px] rounded-3xl border border-white/80 bg-white/70 p-8 shadow-[0_20px_60px_rgba(10,37,64,0.08)] backdrop-blur-2xl sm:p-10 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
          isTransitioning
            ? "scale-[0.72] opacity-0 blur-[2px] pointer-events-none"
            : "scale-100 opacity-100 blur-0",
        )}
      >
        {/* Brand Monogram */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className={clsx(
              "mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/90 bg-white/90 shadow-sm backdrop-blur-md transition-transform duration-500 p-2",
              isBusy && "scale-110",
            )}
          >
            <img
              src="/logo.png"
              alt="NSA App"
              className="h-full w-full object-contain drop-shadow-xs"
            />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0A2540]/60">
            NSA APP
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0A2540] sm:text-3xl">
            Đăng nhập hệ thống
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Nền tảng quản lý đào tạo & tuyển sinh
          </p>
        </div>

        {/* Server / SSO Error Alert */}
        {serverError && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-rose-300 bg-rose-50/90 p-3.5 text-xs font-medium text-rose-700 backdrop-blur-md flex items-start gap-2.5 animate-fadeIn"
          >
            <svg
              className="h-4 w-4 shrink-0 text-rose-500 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="flex-1 leading-relaxed">{serverError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ten.nguoidung@nsa.local"
              {...register("email")}
              className={clsx(
                "w-full rounded-2xl border bg-white/70 px-4 py-3.5 text-sm text-[#0A2540] placeholder:text-slate-400 backdrop-blur-md transition duration-200 hover:border-slate-300 hover:bg-white/90 focus:border-[#0A2540] focus:bg-white focus:outline-none focus:ring-3 focus:ring-[#0A2540]/10",
                errors.email ? "border-rose-400 ring-2 ring-rose-400/20" : "border-slate-200/80",
              )}
            />
            {errors.email?.message && (
              <p className="mt-1.5 text-xs text-rose-600 font-medium">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
              className={clsx(
                "w-full rounded-2xl border bg-white/70 px-4 py-3.5 text-sm text-[#0A2540] placeholder:text-slate-400 backdrop-blur-md transition duration-200 hover:border-slate-300 hover:bg-white/90 focus:border-[#0A2540] focus:bg-white focus:outline-none focus:ring-3 focus:ring-[#0A2540]/10",
                errors.password ? "border-rose-400 ring-2 ring-rose-400/20" : "border-slate-200/80",
              )}
            />
            {errors.password?.message && (
              <p className="mt-1.5 text-xs text-rose-600 font-medium">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-[#0A2540] py-3.5 text-center text-sm font-bold text-white shadow-[0_6px_20px_rgba(10,37,64,0.18)] transition-all duration-300 hover:bg-[#0F3254] hover:shadow-[0_10px_28px_rgba(10,37,64,0.28)] hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-75"
          >
            {isSubmitting || isTransitioning ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>{isTransitioning ? "Đang vào hệ thống..." : "Đang xác thực..."}</span>
              </>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>

        {/* Divider: Hoặc tiếp tục với */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200/80" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white/80 px-3 py-0.5 text-slate-500 font-medium backdrop-blur-md rounded-full border border-slate-200/50 shadow-xs">
              Hoặc tiếp tục với
            </span>
          </div>
        </div>

        {/* SSO Social Buttons (Apple Liquid Glass) */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleOAuthClick("google")}
            className="group flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/70 py-3 px-4 text-xs font-semibold text-[#0A2540] shadow-xs backdrop-blur-md transition-all duration-200 hover:border-[#4285F4]/40 hover:bg-white hover:shadow-md hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-50"
          >
            {isSSORedirecting === "google" ? (
              <svg className="h-4 w-4 animate-spin text-[#4285F4]" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110"
                viewBox="0 0 24 24"
              >
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
            )}
            <span>{isSSORedirecting === "google" ? "Đang chuyển hướng..." : "Google"}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleOAuthClick("microsoft")}
            className="group flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/70 py-3 px-4 text-xs font-semibold text-[#0A2540] shadow-xs backdrop-blur-md transition-all duration-200 hover:border-[#00A4EF]/40 hover:bg-white hover:shadow-md hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-50"
          >
            {isSSORedirecting === "microsoft" ? (
              <svg className="h-4 w-4 animate-spin text-[#00A4EF]" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110"
                viewBox="0 0 24 24"
              >
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
              </svg>
            )}
            <span>{isSSORedirecting === "microsoft" ? "Đang chuyển hướng..." : "Microsoft"}</span>
          </button>
        </div>

        {/* Demo Fast Switch (Glass Pills) */}
        <div className="mt-6 border-t border-slate-200/60 pt-5 text-center">
          <p className="mb-2.5 text-[11px] font-medium text-slate-500">
            Đăng nhập nhanh cho môi trường Demo:
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("admin@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Admin (Tất cả)
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("sale_admin@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Sale Admin
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("sale@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Sale 1
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("sale2@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Sale 2
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("sale3@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Sale 3
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("teacher@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Giảng viên
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleQuickLogin("student@nsa.local")}
                className="cursor-pointer rounded-xl border border-slate-200/80 bg-white/60 py-2 text-xs font-semibold text-[#0A2540] backdrop-blur-md transition-all duration-200 hover:border-[#0A2540]/40 hover:bg-white hover:shadow-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                Học viên
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-slate-400">
          © 2026 NSA App · Bảo mật & Quyền riêng tư
        </p>
      </div>
    </div>
  );
}
