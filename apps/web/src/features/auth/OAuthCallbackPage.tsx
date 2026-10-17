/**
 * OAuth Callback handler page.
 * Receives the code from Google/Microsoft (or dev mock portal),
 * sends it to the API backend to verify the email and enforce account status,
 * and navigates to the role-specific dashboard or back to login with a detailed error.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiRequestError } from "../../lib/apiClient";
import { useAuth } from "./AuthContext";

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exchangeOAuthCode, homePath } = useAuth();

  const provider = (searchParams.get("state") || searchParams.get("provider") || "google") as
    "google" | "microsoft";
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const [statusMessage, setStatusMessage] = useState("Đang xác thực thông tin tài khoản...");
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (oauthError) {
      navigate("/login", {
        replace: true,
        state: {
          ssoError: `Đăng nhập qua ${provider === "google" ? "Google" : "Microsoft"} bị từ chối: ${oauthError}`,
        },
      });
      return;
    }

    if (!code) {
      navigate("/login", {
        replace: true,
        state: {
          ssoError: "Không nhận được mã xác thực hợp lệ từ dịch vụ đăng nhập.",
        },
      });
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;

    setStatusMessage(
      `Đang liên kết tài khoản ${provider === "google" ? "Google" : "Microsoft"} với hệ thống NSA App...`,
    );

    exchangeOAuthCode(provider, code, redirectUri)
      .then((user) => {
        setStatusMessage("Đăng nhập thành công! Đang chuyển hướng vào hệ thống...");
        setTimeout(() => {
          navigate(homePath(user), { replace: true });
        }, 300);
      })
      .catch((err: unknown) => {
        let msg = "Không thể đăng nhập bằng tài khoản liên kết. Vui lòng thử lại.";
        if (err instanceof ApiRequestError) {
          msg = err.message || msg;
        }
        navigate("/login", {
          replace: true,
          state: { ssoError: msg },
        });
      });
  }, [code, exchangeOAuthCode, homePath, navigate, oauthError, provider]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EEF4FF] via-[#F8FAFC] to-[#FEF9EE] px-4 select-none">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/80 bg-white/75 p-8 text-center shadow-[0_20px_60px_rgba(10,37,64,0.08)] backdrop-blur-2xl">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white/90 shadow-sm">
            {provider === "google" ? (
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
            ) : (
              <svg className="h-7 w-7" viewBox="0 0 24 24">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
              </svg>
            )}
          </div>
        </div>

        <h2 className="text-base font-bold text-[#0A2540] mb-1">
          Xác thực qua {provider === "google" ? "Google" : "Microsoft"}
        </h2>
        <p className="text-xs text-slate-500 mb-6">{statusMessage}</p>

        <div className="flex justify-center">
          <svg className="h-6 w-6 animate-spin text-[#0A2540]" viewBox="0 0 24 24" fill="none">
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
        </div>
      </div>
    </div>
  );
}
