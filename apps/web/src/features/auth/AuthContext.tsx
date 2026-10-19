/**
 * Centralized authentication state.
 *
 * On app load we silently attempt a refresh (the HttpOnly cookie) so a page
 * reload does not log the user out. The access token itself stays in memory.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { setAuthFailureHandler, tokenStore } from "../../lib/apiClient";
import type { Role, UserInfo } from "../../lib/types";
import * as authApi from "./authApi";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: UserInfo | null;
  login: (email: string, password: string) => Promise<UserInfo>;
  loginSSO: (provider: "google" | "microsoft", email: string) => Promise<UserInfo>;
  exchangeOAuthCode: (
    provider: "google" | "microsoft",
    code: string,
    redirectUri?: string,
  ) => Promise<UserInfo>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  homePath: (u?: UserInfo | null) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function homePathFor(user: UserInfo | null | undefined): string {
  if (!user) return "/login";
  if (user.roles.includes("ADMIN") || user.roles.includes("ACADEMIC_ADMIN")) return "/admin";
  if (user.roles.includes("SALE_ADMIN") || user.roles.includes("SALE")) return "/sale";
  if (user.roles.includes("TEACHER")) return "/teacher";
  return "/student";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserInfo | null>(null);

  const clearSession = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  // If a refresh ever fails hard (cookie revoked/expired), drop to anonymous.
  useEffect(() => {
    setAuthFailureHandler(clearSession);
  }, [clearSession]);

  // Silent re-authentication on first load.
  useEffect(() => {
    let cancelled = false;
    authApi
      .refresh()
      .then((bundle) => {
        if (cancelled) return;
        tokenStore.set(bundle.access_token);
        setUser(bundle.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const bundle = await authApi.login(email, password);
    tokenStore.set(bundle.access_token);
    setUser(bundle.user);
    setStatus("authenticated");
    return bundle.user;
  }, []);

  const loginSSO = useCallback(async (provider: "google" | "microsoft", email: string) => {
    const bundle = await authApi.loginSSO(provider, email);
    tokenStore.set(bundle.access_token);
    setUser(bundle.user);
    setStatus("authenticated");
    return bundle.user;
  }, []);

  const exchangeOAuthCode = useCallback(
    async (provider: "google" | "microsoft", code: string, redirectUri?: string) => {
      const bundle = await authApi.exchangeOAuthCode(provider, code, redirectUri);
      tokenStore.set(bundle.access_token);
      setUser(bundle.user);
      setStatus("authenticated");
      return bundle.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Logout is best-effort; the cookie may already be gone.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const hasRole = useCallback(
    (...roles: Role[]) => !!user && roles.some((r) => user.roles.includes(r)),
    [user],
  );

  const value = useMemo(
    () => ({
      status,
      user,
      login,
      loginSSO,
      exchangeOAuthCode,
      logout,
      hasRole,
      homePath: homePathFor,
    }),
    [status, user, login, loginSSO, exchangeOAuthCode, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
