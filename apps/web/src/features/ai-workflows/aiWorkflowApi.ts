import { api } from "../../lib/apiClient";
import type {
  AILeadCopilotInsight,
  AIScanResult,
  AIWorkflowProposal,
  AIWorkflowSummary,
  Paginated,
} from "../../lib/domainTypes";
import { toQuery } from "../../lib/format";

export interface AIWorkflowListParams {
  domain?: string;
  status?: string;
  priority?: string;
  assigned_user_id?: string;
  target_lead_id?: string;
  page?: number;
  per_page?: number;
}

export interface ApproveProposalPayload {
  suggested_script?: string;
  decision_note?: string;
  assigned_to?: string;
  due_at?: string;
}

export interface RejectProposalPayload {
  decision_note?: string;
}

export interface AgentChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
}

export interface AgentChatRequest {
  message: string;
  history?: AgentChatMessage[];
}

export interface AgentChatResponse {
  reply: string;
  reasoning?: string;
  model_used: string;
  tools_used?: string[];
  proposals_generated?: AIWorkflowProposal[];
}

const get = <T>(path: string) => api<T>(path);
const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });

export const aiWorkflowApi = {
  getSummary: () => get<AIWorkflowSummary>("/ai-workflows/summary"),

  listProposals: (params: AIWorkflowListParams = {}) =>
    get<Paginated<AIWorkflowProposal>>(`/ai-workflows/proposals${toQuery(params)}`),

  getProposal: (id: string) => get<AIWorkflowProposal>(`/ai-workflows/proposals/${id}`),

  scanWorkflows: () => post<AIScanResult>("/ai-workflows/scan"),

  chatWithAgent: (payload: AgentChatRequest) =>
    post<AgentChatResponse>("/ai-workflows/chat", payload),

  approveProposal: (id: string, payload: ApproveProposalPayload = {}) =>
    post<AIWorkflowProposal>(`/ai-workflows/proposals/${id}/approve`, payload),

  rejectProposal: (id: string, payload: RejectProposalPayload = {}) =>
    post<AIWorkflowProposal>(`/ai-workflows/proposals/${id}/reject`, payload),

  getLeadCopilot: (leadId: string) =>
    get<AILeadCopilotInsight>(`/ai-workflows/leads/${leadId}/copilot`),
};
