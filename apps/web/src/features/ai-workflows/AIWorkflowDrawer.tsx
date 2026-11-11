import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";

import { Icon } from "../../components/icons";
import { Button, Spinner } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import { formatDateTime } from "../../lib/format";
import { aiWorkflowApi, type AgentChatMessage } from "./aiWorkflowApi";
import { AIMarkdownContent } from "./AIMarkdownContent";
import type { AIWorkflowProposal } from "../../lib/domainTypes";
import { loadChatSession, saveChatSession, clearChatSession } from "./aiChatStorage";

interface AIWorkflowDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  modelUsed?: string;
  toolsUsed?: string[];
  proposals?: AIWorkflowProposal[];
}

interface ISpeechRecognitionEvent {
  results?: Array<Array<{ transcript?: string }>>;
}

interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function GeminiSparkleStar({
  className = "w-9 h-9",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="gemini-star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="30%" stopColor="#9B72CB" />
          <stop offset="65%" stopColor="#D96570" />
          <stop offset="100%" stopColor="#FFBA00" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"
        fill="url(#gemini-star-grad)"
      />
    </svg>
  );
}

const DEFAULT_SUGGESTIONS = [
  { icon: "⚡", label: "Quét khách mới chưa chia cho Sale", prompt: "Quét khách mới chưa chia" },
  {
    icon: "📊",
    label: "Hệ thống có tổng số bao nhiêu lead tuyển sinh?",
    prompt: "Hệ thống có tổng số bao nhiêu lead tuyển sinh?",
  },
  {
    icon: "⏰",
    label: "Khách hàng nào bị bỏ quên chưa chăm sóc > 24h?",
    prompt: "Khách nào bị bỏ quên > 24h?",
  },
  {
    icon: "💳",
    label: "Có đơn học phí nào đang quá hạn cần nhắc không?",
    prompt: "Đơn học phí nào quá hạn?",
  },
];

export function AIWorkflowDrawer({ isOpen, onClose }: AIWorkflowDrawerProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "pending" | "executed">("chat");

  // Dynamic resizable width state (clamped between 30% and 80%)
  const [drawerWidthPct, setDrawerWidthPct] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nsa_chat_drawer_width_pct");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 30 && parsed <= 80) {
          return parsed;
        }
      }
      // Default: ~38% on desktop (around 560px on a 1440px screen)
      const initial = (560 / window.innerWidth) * 100;
      return Math.min(Math.max(initial, 30), 80);
    }
    return 38;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Load saved session if valid (< 24h since last message)
  const initialSession = useMemo(() => loadChatSession<ChatItem>(user?.id), [user?.id]);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>(() => initialSession?.messages ?? []);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>(
    () => initialSession?.expandedReasoning ?? {},
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reactionMap, setReactionMap] = useState<Record<string, "up" | "down">>(
    () => initialSession?.reactionMap ?? {},
  );
  const lastActivityAtRef = useRef<number>(initialSession?.lastActivityAt ?? Date.now());

  // Check 24-hour expiration when user changes or drawer opens
  useEffect(() => {
    if (isOpen) {
      const session = loadChatSession<ChatItem>(user?.id);
      if (session) {
        setMessages(session.messages);
        setReactionMap(session.reactionMap || {});
        setExpandedReasoning(session.expandedReasoning || {});
        lastActivityAtRef.current = session.lastActivityAt;
      } else {
        // Expired (> 24h) or clean state
        setMessages([]);
        setReactionMap({});
        setExpandedReasoning({});
      }
    }
  }, [isOpen, user?.id]);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const isInitialWelcome = messages.length === 0;

  // Extract display name for the greeting
  const displayName = useMemo(() => {
    const rawFullName =
      user?.full_name || user?.student_profile?.full_name || user?.teacher_profile?.full_name;
    if (rawFullName?.trim()) {
      const parts = rawFullName.trim().split(" ");
      return parts[parts.length - 1];
    }
    if (user?.email) {
      const raw = user.email.split("@")[0].split(".")[0];
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return "bạn";
  }, [user]);

  // Handle Drag Resizing between 30% and 80% (without displaying the percentage number)
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleTouchStartResize = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowWidth = window.innerWidth;
      const clientX = e.clientX;
      const newWidthPx = windowWidth - clientX;
      let newPct = (newWidthPx / windowWidth) * 100;

      // Bound between 30% and 80%
      if (newPct < 30) newPct = 30;
      if (newPct > 80) newPct = 80;

      setDrawerWidthPct(Math.round(newPct * 10) / 10);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const windowWidth = window.innerWidth;
      const clientX = e.touches[0].clientX;
      const newWidthPx = windowWidth - clientX;
      let newPct = (newWidthPx / windowWidth) * 100;

      if (newPct < 30) newPct = 30;
      if (newPct > 80) newPct = 80;

      setDrawerWidthPct(Math.round(newPct * 10) / 10);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setDrawerWidthPct((latest) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("nsa_chat_drawer_width_pct", latest.toString());
        }
        return latest;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleMouseUp);

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  // Toggle maximize between normal (~38%) and max (80%)
  const toggleMaximize = () => {
    if (drawerWidthPct >= 75) {
      setDrawerWidthPct(38);
      if (typeof window !== "undefined") {
        localStorage.setItem("nsa_chat_drawer_width_pct", "38");
      }
    } else {
      setDrawerWidthPct(80);
      if (typeof window !== "undefined") {
        localStorage.setItem("nsa_chat_drawer_width_pct", "80");
      }
    }
  };

  useEffect(() => {
    if (activeTab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  // Adjust composer height dynamically
  const adjustHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    if (!el.value) {
      el.style.height = "24px";
      el.style.overflowY = "hidden";
      setIsMultiLine(false);
      return;
    }
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const maxH = 140;
    const newH = Math.min(scrollH, maxH);
    el.style.height = `${Math.max(newH, 24)}px`;
    el.style.overflowY = scrollH > maxH ? "auto" : "hidden";
    setIsMultiLine(scrollH > 34);
  }, []);

  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    adjustHeight(e.target);
  };

  const handleCopyMessage = (id: string, text: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const win = window as unknown as {
      SpeechRecognition?: new () => ISpeechRecognition;
      webkitSpeechRecognition?: new () => ISpeechRecognition;
    };
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      composerRef.current?.focus();
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    try {
      const rec = new SpeechRecognition();
      rec.lang = "vi-VN";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setIsListening(true);
      rec.onresult = (e: ISpeechRecognitionEvent) => {
        const transcript = e.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setChatInput((prev) => (prev ? prev + " " + transcript : transcript));
          if (composerRef.current) {
            adjustHeight(composerRef.current);
          }
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const proposalsQuery = useQuery({
    queryKey: ["ai-workflows", "drawer", activeTab === "chat" ? "pending" : activeTab],
    queryFn: () =>
      aiWorkflowApi.listProposals({
        status: activeTab === "chat" ? "pending" : activeTab,
        per_page: 20,
      }),
    enabled: isOpen,
  });

  const scanMutation = useMutation({
    mutationFn: aiWorkflowApi.scanWorkflows,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-workflows"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => aiWorkflowApi.approveProposal(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-workflows"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: (userMsg: string) => {
      const historyPayload: AgentChatMessage[] = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      return aiWorkflowApi.chatWithAgent({
        message: userMsg,
        history: historyPayload,
      });
    },
    onSuccess: (data) => {
      lastActivityAtRef.current = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          reasoning: data.reasoning,
          modelUsed: data.model_used,
          toolsUsed: data.tools_used,
          proposals: data.proposals_generated,
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ["ai-workflows"] });
    },
    onError: (err: unknown) => {
      lastActivityAtRef.current = Date.now();
      const message = err instanceof Error ? err.message : "Không thể phản hồi";
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: "assistant",
          content: `Đã có lỗi khi kết nối AI: ${message}. Vui lòng thử lại.`,
        },
      ]);
    },
  });

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text || chatMutation.isPending) return;

    lastActivityAtRef.current = Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      },
    ]);
    setChatInput("");
    setIsMultiLine(false);
    if (composerRef.current) {
      composerRef.current.style.height = "24px";
      composerRef.current.style.overflowY = "hidden";
    }
    chatMutation.mutate(text);
  };

  const handleRestart = () => {
    setMessages([]);
    setChatInput("");
    setIsMultiLine(false);
    setReactionMap({});
    setExpandedReasoning({});
    lastActivityAtRef.current = Date.now();
    clearChatSession(user?.id);
    if (composerRef.current) {
      composerRef.current.style.height = "24px";
      composerRef.current.style.overflowY = "hidden";
    }
  };

  // Sync session changes to localStorage whenever messages, reactionMap, or reasoning toggles change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatSession(
        user?.id,
        messages,
        lastActivityAtRef.current,
        reactionMap,
        expandedReasoning,
      );
    }
  }, [messages, reactionMap, expandedReasoning, user?.id]);

  if (!isOpen) return null;

  const items = proposalsQuery.data?.items ?? [];
  const pendingCount = proposalsQuery.data?.meta?.total ?? 0;
  const isMaximized = drawerWidthPct >= 75;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-text">
      {/* Subtle Backdrop (Keeps page visible like in Chrome Gemini panel) */}
      <div
        className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container (Smooth Slide-In from Right & Resizable Width 30% - 80%) */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-3 pointer-events-none">
        <div
          style={{
            width:
              typeof window !== "undefined" && window.innerWidth < 640
                ? "100vw"
                : `${drawerWidthPct}vw`,
            maxWidth: "100vw",
            minWidth: typeof window !== "undefined" && window.innerWidth < 640 ? "100vw" : "320px",
          }}
          className={clsx(
            "pointer-events-auto h-full shadow-2xl flex flex-col relative select-text border-l border-slate-200/90 animate-gemini-slide-in",
            isInitialWelcome
              ? "bg-gradient-to-b from-[#ffffff] via-[#ffffff] to-[#e8f1fc]"
              : "bg-white",
            isResizing ? "transition-none select-none" : "transition-all duration-200 ease-out",
          )}
        >
          {/* DRAGGABLE RESIZE HANDLE (Left Edge, 30% to 80% range - No percentage number shown) */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="Kéo sang trái/phải để thay đổi độ rộng cửa sổ chat"
            onMouseDown={handleMouseDownResize}
            onTouchStart={handleTouchStartResize}
            className="hidden sm:flex group absolute -left-2 top-0 bottom-0 w-4 cursor-ew-resize z-50 items-center justify-center select-none"
          >
            <div
              className={clsx(
                "w-1.5 rounded-full transition-all duration-150",
                isResizing
                  ? "h-28 bg-[#0532e6] shadow-[0_0_14px_rgba(5,50,230,0.6)] scale-110"
                  : "h-14 bg-slate-300/80 group-hover:h-20 group-hover:bg-[#0532e6] group-hover:shadow-sm",
              )}
            />
          </div>

          {/* TẦNG 1: HEADER (Minimalist & Clean Gemini Header) */}
          <div className="shrink-0 relative z-20">
            <header className="flex items-center justify-between px-5 sm:px-6 pt-3 pb-2 bg-transparent border-b border-slate-100 select-none">
              <div className="flex items-center gap-2">
                <GeminiSparkleStar className="h-5 w-5 shrink-0" />
                <span className="text-[16px] font-bold text-slate-900 tracking-tight">NSA AI</span>
                <span className="text-xs text-slate-400 font-normal">Side Panel</span>
              </div>

              <div className="flex items-center gap-1">
                {/* 1. New Chat (Làm mới) */}
                <button
                  type="button"
                  onClick={handleRestart}
                  title="Tạo cuộc trò chuyện mới (Xoá lịch sử chat)"
                  aria-label="Tạo cuộc trò chuyện mới"
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 cursor-pointer",
                    messages.length > 0
                      ? "text-slate-600 hover:bg-blue-50 hover:text-[#0532e6]"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-800",
                  )}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>

                {/* 2. Scan Trigger */}
                <button
                  type="button"
                  onClick={() => scanMutation.mutate()}
                  disabled={scanMutation.isPending}
                  title="Quét điểm nghẽn hệ thống"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#0532e6] active:scale-95 cursor-pointer"
                >
                  <Icon
                    name="sparkles"
                    className={clsx(
                      "h-4 w-4",
                      scanMutation.isPending && "animate-spin text-[#0532e6]",
                    )}
                  />
                </button>

                {/* 3. Maximize / Minimize Button for In-Page Zoom */}
                <button
                  type="button"
                  onClick={toggleMaximize}
                  title={isMaximized ? "Thu nhỏ cửa sổ" : "Phóng to tối đa"}
                  aria-label={isMaximized ? "Thu nhỏ cửa sổ" : "Phóng to tối đa"}
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95 cursor-pointer"
                >
                  {isMaximized ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M14 4h6m0 0v6m0-6L13 11M4 10h6m0 0V4m0 6L3 3"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7M21 9v6m0 0v6m0-6L14 14M3 9V3m0 0h6m-6 0l7 7"
                      />
                    </svg>
                  )}
                </button>

                {/* 4. Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  title="Đóng trợ lý"
                  aria-label="Đóng trợ lý"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95 cursor-pointer"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Quick Segmented Tabs */}
            <div className="flex items-center border-b border-slate-100 px-5 sm:px-6 py-1.5 gap-2 bg-transparent select-none">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "chat"
                    ? "bg-[#0532e6] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/60",
                )}
              >
                <Icon name="sparkles" className="h-3 w-3" />
                Trò chuyện
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "pending"
                    ? "bg-[#0532e6] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/60",
                )}
              >
                Chờ duyệt
                {pendingCount > 0 && (
                  <span
                    className={clsx(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      activeTab === "pending"
                        ? "bg-white text-[#0532e6]"
                        : "bg-[#0532e6]/10 text-[#0532e6]",
                    )}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("executed")}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "executed"
                    ? "bg-[#0532e6] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/60",
                )}
              >
                Lịch sử
              </button>
            </div>
          </div>

          {/* TẦNG 2: NỘI DUNG CHÍNH */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden select-text cursor-auto">
              {/* Message List Area */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 app-custom-scroll overscroll-contain select-text flex flex-col">
                <div
                  className={clsx(
                    "w-full flex-1 flex flex-col",
                    drawerWidthPct >= 65 && "max-w-3xl mx-auto",
                  )}
                >
                  {/* Hero Greeting Center (when chat is new/empty - Exact Gemini Side Panel match) */}
                  {isInitialWelcome && (
                    <div className="flex-1 flex flex-col justify-between py-6 select-none min-h-[50vh]">
                      {/* Top Centered Hero Star & Greeting */}
                      <div className="my-auto flex flex-col items-center justify-center px-2 py-8 text-center">
                        <div className="mb-4 flex items-center justify-center">
                          <GeminiSparkleStar className="h-10 w-10 sm:h-12 sm:w-12 animate-pulse" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-normal text-slate-800 tracking-tight text-center leading-snug">
                          The mic is yours, {displayName}
                        </h2>
                        <p className="mt-2 text-xs text-slate-500 font-normal max-w-xs leading-relaxed">
                          NSA AI sẵn sàng hỗ trợ điều phối lead, tra cứu số liệu CRM và giải quyết
                          đơn học phí.
                        </p>
                      </div>

                      {/* Bottom Suggestion Chips (Stacked nicely at bottom above composer - like Chrome Gemini panel) */}
                      <div className="pt-4 pb-2 space-y-2">
                        {DEFAULT_SUGGESTIONS.map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendMessage(chip.prompt)}
                            className="w-fit max-w-full rounded-full bg-white/95 hover:bg-white border border-slate-200/80 px-4 py-2 text-xs font-medium text-slate-800 shadow-2xs hover:shadow-xs hover:border-[#0532e6]/50 transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer flex items-center gap-2 select-none"
                          >
                            <span className="text-sm shrink-0">{chip.icon}</span>
                            <span className="truncate">{chip.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages Flow */}
                  {!isInitialWelcome && (
                    <div className="space-y-5">
                      {messages.map((msg) => {
                        const isUser = msg.role === "user";
                        return isUser ? (
                          /* User Message: Generous Padding Capsule Bubble on the right */
                          <div key={msg.id} className="flex justify-end select-text my-1">
                            <div className="max-w-[85%] rounded-[24px] bg-[#f0f4f9] px-5 py-3 sm:px-6 text-[14px] sm:text-[14.5px] font-normal leading-relaxed text-slate-900 shadow-2xs border border-slate-200/40 select-text break-words whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          /* Assistant Message: Clean Text Flow Full Width */
                          <div key={msg.id} className="py-1 select-text">
                            {/* Role Header */}
                            <div className="flex items-center justify-between w-full gap-2 mb-1.5 px-0.5 text-[11px] select-none">
                              <div className="flex items-center gap-1.5">
                                <GeminiSparkleStar className="h-4 w-4 shrink-0" />
                                <span className="font-bold text-[#0532e6]">NSA AI</span>
                              </div>
                            </div>

                            {/* Markdown Rendered Content */}
                            <div className="text-slate-900 select-text overflow-hidden">
                              <AIMarkdownContent content={msg.content} />
                            </div>

                            {/* Optional Reasoning Collapsible */}
                            {msg.reasoning && (
                              <div className="mt-3 pt-2 border-t border-slate-100 select-text">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedReasoning((prev) => ({
                                      ...prev,
                                      [msg.id]: !prev[msg.id],
                                    }))
                                  }
                                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer select-none"
                                >
                                  <span>🧠 Suy luận logic của AI</span>
                                  <Icon
                                    name={expandedReasoning[msg.id] ? "chevron-up" : "chevron-down"}
                                    className="h-3 w-3"
                                  />
                                </button>
                                {expandedReasoning[msg.id] && (
                                  <div className="mt-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600 font-mono whitespace-pre-wrap select-text cursor-text">
                                    {msg.reasoning}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Actionable Proposals created */}
                            {msg.proposals && msg.proposals.length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-slate-100 pt-2.5 select-text">
                                <p className="text-[10px] font-bold text-slate-500 uppercase select-none tracking-wider">
                                  Đề xuất cần duyệt ({msg.proposals.length})
                                </p>
                                {msg.proposals.map((p) => (
                                  <div
                                    key={p.id}
                                    className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/60 flex items-center justify-between gap-3 shadow-2xs"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-navy-heading truncate">
                                        {p.title}
                                      </p>
                                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                        {p.bottleneck_summary}
                                      </p>
                                    </div>
                                    <Button
                                      variant="primary"
                                      className="h-7 text-xs px-3 rounded-lg shrink-0 cursor-pointer"
                                      onClick={() => approveMutation.mutate(p.id)}
                                      loading={
                                        approveMutation.isPending &&
                                        approveMutation.variables === p.id
                                      }
                                    >
                                      Duyệt ngay
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Gemini-Style Bottom Action Bar (Thumbs Up, Thumbs Down, Copy) */}
                            <div className="flex items-center justify-between pt-2 mt-2 text-slate-400 border-t border-slate-100 select-none">
                              <div className="flex items-center gap-1">
                                {/* 1. Thumbs Up */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReactionMap((prev) => ({
                                      ...prev,
                                      [msg.id]: prev[msg.id] === "up" ? undefined! : "up",
                                    }))
                                  }
                                  title="Câu trả lời tốt"
                                  aria-label="Câu trả lời tốt"
                                  className={clsx(
                                    "flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer",
                                    reactionMap[msg.id] === "up"
                                      ? "text-[#0532e6] bg-blue-50"
                                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95",
                                  )}
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2"
                                    />
                                  </svg>
                                </button>

                                {/* 2. Thumbs Down */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReactionMap((prev) => ({
                                      ...prev,
                                      [msg.id]: prev[msg.id] === "down" ? undefined! : "down",
                                    }))
                                  }
                                  title="Chưa hài lòng"
                                  aria-label="Chưa hài lòng"
                                  className={clsx(
                                    "flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer",
                                    reactionMap[msg.id] === "down"
                                      ? "text-red-500 bg-red-50"
                                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95",
                                  )}
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714-.211-1.412-.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2"
                                    />
                                  </svg>
                                </button>

                                {/* 3. Copy (Overlapping rounded rectangles matching Gemini) */}
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                                  title={copiedId === msg.id ? "Đã sao chép" : "Sao chép"}
                                  aria-label={copiedId === msg.id ? "Đã sao chép" : "Sao chép"}
                                  className={clsx(
                                    "flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer",
                                    copiedId === msg.id
                                      ? "text-emerald-600 bg-emerald-50"
                                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95",
                                  )}
                                >
                                  {copiedId === msg.id ? (
                                    <svg
                                      className="w-4 h-4 text-emerald-600"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2.2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="w-4 h-4"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                    >
                                      <rect
                                        x="9"
                                        y="4"
                                        width="10"
                                        height="13"
                                        rx="2.5"
                                        strokeWidth="1.8"
                                      />
                                      <path
                                        d="M6 8.5H5.5A2.5 2.5 0 003 11v6.5A2.5 2.5 0 005.5 20h6.5a2.5 2.5 0 002.5-2.5V17"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </div>

                              <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                {msg.modelUsed && (
                                  <span className="font-mono">
                                    {msg.modelUsed.replace(":free", "")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Thinking Indicator (Gemini 3-Dot Bouncing Animation) */}
                  {chatMutation.isPending && (
                    <div className="flex items-center gap-2.5 pl-1 py-3 select-none">
                      <GeminiSparkleStar className="h-5 w-5 shrink-0 animate-pulse" />
                      <div className="flex items-center gap-1.5 py-1 px-1">
                        <span className="h-2 w-2 rounded-full bg-slate-600 animate-[gemini-bounce_1.4s_infinite_ease-in-out] [animation-delay:-0.32s]" />
                        <span className="h-2 w-2 rounded-full bg-slate-600 animate-[gemini-bounce_1.4s_infinite_ease-in-out] [animation-delay:-0.16s]" />
                        <span className="h-2 w-2 rounded-full bg-slate-600 animate-[gemini-bounce_1.4s_infinite_ease-in-out]" />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        NSA AI đang xử lý...
                      </span>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>
              </div>

              {/* TẦNG 3: GEMINI COMPOSER (Pill 1-line ↔ Card >=2 lines Auto-expanding) */}
              <div className="shrink-0 relative z-20">
                <div className="p-3 sm:p-4 pt-1 bg-transparent">
                  <div className={clsx("w-full", drawerWidthPct >= 65 && "max-w-3xl mx-auto")}>
                    {/* Unified Auto-Expanding Composer Container */}
                    <div
                      className={clsx(
                        "relative flex w-full border border-slate-200/90 hover:border-slate-300 focus-within:border-slate-400 bg-white shadow-[0_2px_14px_rgba(0,18,88,0.06)] px-3 min-h-[52px] transition-all duration-200 ease-out",
                        isMultiLine
                          ? "items-end py-2 pb-2.5 rounded-[26px]"
                          : "items-center py-1.5 sm:py-2 rounded-full",
                      )}
                    >
                      {/* Leading Action (Plus Trigger for Quick Prompts) */}
                      <div
                        className={clsx(
                          "flex items-center shrink-0",
                          isMultiLine && "mb-0.5 sm:mb-1",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => scanMutation.mutate()}
                          disabled={scanMutation.isPending}
                          title="Quét nhanh điểm nghẽn hệ thống"
                          aria-label="Quét nhanh điểm nghẽn hệ thống"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-[#0532e6] transition active:scale-95 cursor-pointer"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Textarea Area */}
                      <div
                        className={clsx(
                          "flex-1 min-w-0 px-2 flex items-center",
                          isMultiLine && "py-1",
                        )}
                      >
                        <textarea
                          ref={composerRef}
                          value={chatInput}
                          onChange={handleComposerChange}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          rows={1}
                          disabled={chatMutation.isPending}
                          aria-label="Nhập câu hỏi cho NSA AI"
                          placeholder="Hỏi NSA AI... (hoặc gõ lệnh điều phối)"
                          className="w-full resize-none bg-transparent p-0 text-[14px] sm:text-[15px] text-slate-900 placeholder:text-slate-400 outline-none border-none focus:outline-none focus:ring-0 leading-6 min-h-[24px] max-h-[140px] overflow-y-auto block select-text cursor-text"
                        />
                      </div>

                      {/* Trailing Actions (Stop / Send / Mic Button) */}
                      <div
                        className={clsx(
                          "flex items-center gap-1.5 shrink-0 pr-0.5",
                          isMultiLine && "mb-0.5 sm:mb-1",
                        )}
                      >
                        {chatMutation.isPending ? (
                          <button
                            type="button"
                            disabled
                            title="Đang phản hồi..."
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-900 shadow-xs cursor-wait"
                          >
                            <span className="h-3 w-3 bg-black rounded-[2px]" />
                          </button>
                        ) : chatInput.trim().length > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleSendMessage()}
                            aria-label="Gửi câu hỏi"
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0532e6] hover:bg-[#001258] text-white transition-all shadow-sm active:scale-95 cursor-pointer"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 10l7-7m0 0l7 7m-7-7v18"
                              />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={toggleVoiceInput}
                            title={isListening ? "Dừng ghi âm" : "Nhập bằng giọng nói (tiếng Việt)"}
                            aria-label="Nhập bằng giọng nói"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition active:scale-95 cursor-pointer"
                          >
                            {isListening ? (
                              <svg
                                className="w-4 h-4 text-red-500 animate-pulse"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* AI Disclaimer */}
                    <p className="mt-2 text-center text-[11px] text-slate-400 select-none">
                      NSA AI có thể mắc sai sót. Hãy kiểm tra thông tin quan trọng.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2 & 3: PROPOSALS LIST */}
          {activeTab !== "chat" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 app-custom-scroll select-text">
              {proposalsQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center select-none">
                  <Spinner size="md" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center p-4 select-none">
                  <Icon name="check" className="h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">Không có đề xuất tồn đọng</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Hệ thống đang hoạt động tối ưu, không phát hiện điểm nghẽn.
                  </p>
                </div>
              ) : (
                items.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5 transition-all hover:shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                            proposal.priority === "critical"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : proposal.priority === "high"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200",
                          )}
                        >
                          {proposal.priority}
                        </span>
                        <h4 className="text-xs font-bold text-navy-heading mt-1">
                          {proposal.title}
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {formatDateTime(proposal.created_at)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {proposal.bottleneck_summary}
                    </p>

                    <div className="text-[11px] bg-slate-50 rounded-xl p-2.5 text-slate-700 border border-slate-100">
                      <span className="font-semibold text-slate-900">Lý giải AI: </span>
                      {proposal.ai_rationale}
                    </div>

                    {proposal.suggested_script && (
                      <div className="text-[11px] bg-amber-50/50 rounded-xl p-2.5 text-amber-900 border border-amber-100">
                        <span className="font-semibold">Kịch bản gợi ý: </span>
                        {proposal.suggested_script}
                      </div>
                    )}

                    {proposal.status === "pending" && (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <Button
                          variant="soft"
                          className="h-7 text-xs px-3 rounded-lg"
                          onClick={() => aiWorkflowApi.rejectProposal(proposal.id, {})}
                        >
                          Từ chối
                        </Button>
                        <Button
                          variant="primary"
                          className="h-7 text-xs px-3 rounded-lg"
                          onClick={() => approveMutation.mutate(proposal.id)}
                          loading={
                            approveMutation.isPending && approveMutation.variables === proposal.id
                          }
                        >
                          Duyệt thực thi
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
