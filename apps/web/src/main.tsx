import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./features/auth/AuthContext";
import { router } from "./routes/router";
import "./index.css";

// Auto-show scrollbar only when actively scrolling (wheel/touch), fade out when idle
if (typeof window !== "undefined") {
  const scrollTimeouts = new WeakMap<HTMLElement, number>();

  window.addEventListener(
    "scroll",
    (event) => {
      const target = event.target as HTMLElement | Document;
      const el = target === document ? document.documentElement : (target as HTMLElement);
      if (!el || !el.classList) return;

      el.classList.add("is-scrolling");

      const existing = scrollTimeouts.get(el);
      if (existing) {
        window.clearTimeout(existing);
      }

      const timer = window.setTimeout(() => {
        el.classList.remove("is-scrolling");
        scrollTimeouts.delete(el);
      }, 850);

      scrollTimeouts.set(el, timer);
    },
    { capture: true, passive: true },
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
