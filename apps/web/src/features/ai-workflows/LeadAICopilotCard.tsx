import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { Icon } from "../../components/icons";
import { Button, Card, Spinner } from "../../components/ui";
import { aiWorkflowApi } from "./aiWorkflowApi";

interface LeadAICopilotCardProps {
  leadId: string;
  onCreateTask?: (suggestedTitle: string, suggestedScript: string) => void;
}

export function LeadAICopilotCard({ leadId, onCreateTask }: LeadAICopilotCardProps) {
  const [copied, setCopied] = useState(false);

  const copilotQuery = useQuery({
    queryKey: ["ai-workflows", "lead-copilot", leadId],
    queryFn: () => aiWorkflowApi.getLeadCopilot(leadId),
    staleTime: 60 * 1000,
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (copilotQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center p-6 border-white/80 bg-white/70">
        <Spinner size="sm" />
        <span className="ml-2 text-xs text-gtext">AI đang phân tích hồ sơ khách hàng...</span>
      </Card>
    );
  }

  if (copilotQuery.isError || !copilotQuery.data) {
    return null;
  }

  const data = copilotQuery.data;

  return (
    <Card className="border border-[#0532e6]/20 bg-gradient-to-br from-white/90 to-[#0532e6]/5 p-5 shadow-card space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0532e6]/10 text-[#0532e6]">
            <Icon name="sparkles" className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-heading">AI Lead Insights & Next Action</h3>
            <p className="text-[11px] text-gtext">Trợ lý phân tích & kịch bản chốt đơn</p>
          </div>
        </div>

        {/* Lead Score & Temperature */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-navy-heading">Điểm tiềm năng:</span>
            <span
              className={clsx(
                "text-xs font-black",
                data.lead_score >= 75
                  ? "text-emerald-600"
                  : data.lead_score >= 45
                    ? "text-[#0532e6]"
                    : "text-slate-500",
              )}
            >
              {data.lead_score}/100
            </span>
          </div>

          <span
            className={clsx(
              "rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide uppercase",
              data.temperature === "hot"
                ? "bg-red-100 text-red-700 border border-red-200"
                : data.temperature === "warm"
                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                  : "bg-blue-100 text-blue-700 border border-blue-200",
            )}
          >
            {data.temperature === "hot"
              ? "🔥 Nóng"
              : data.temperature === "warm"
                ? "☀️ Ấm"
                : "❄️ Lạnh"}
          </span>
        </div>
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200/80"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 2 Blocks: Summary & Next Action */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
        <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Tóm tắt hồ sơ & Điểm nghẽn
          </span>
          <p className="text-slate-700 leading-relaxed">{data.summary}</p>
          {data.bottleneck && (
            <p className="mt-2 text-amber-800 font-medium bg-amber-50/80 p-2 rounded-lg border border-amber-200/50">
              ⚠️ {data.bottleneck}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[#0532e6]/20 bg-[#0532e6]/5 p-3 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#0532e6] uppercase tracking-wider block mb-1">
              Hành động đề xuất tiếp theo
            </span>
            <p className="text-slate-800 font-semibold leading-relaxed">{data.next_best_action}</p>
          </div>
          {onCreateTask && (
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={() =>
                  onCreateTask(
                    data.next_best_action || "Chăm sóc theo đề xuất AI",
                    data.suggested_script || "",
                  )
                }
                className="h-7 text-xs px-2.5 rounded-lg bg-[#0532e6] hover:bg-[#0426b3] text-white"
              >
                <Icon name="calendar" className="h-3.5 w-3.5 mr-1" />
                <span>Tạo lịch hẹn từ gợi ý này</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Suggested Script */}
      {data.suggested_script && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-navy-heading">
              Kịch bản thoại / tin nhắn gợi ý:
            </span>
            <Button
              variant="ghost"
              onClick={() => handleCopy(data.suggested_script)}
              className="h-7 text-xs px-2.5 rounded-lg text-[#0532e6]"
            >
              <Icon name={copied ? "check" : "edit"} className="h-3.5 w-3.5 mr-1" />
              <span>{copied ? "Đã chép!" : "Sao chép"}</span>
            </Button>
          </div>
          <p className="text-xs text-slate-700 italic bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
            "{data.suggested_script}"
          </p>
        </div>
      )}
    </Card>
  );
}
