import { api, apiCSV, apiDownload, apiUpload } from "../../lib/apiClient";
import type {
  ConvertResult,
  Course,
  DashboardOverview,
  Lead,
  LeadInteraction,
  LeadPipelineHistory,
  LeadTask,
  Order,
  Paginated,
  RevenueReport,
  SaleDashboardStats,
  SaleStaff,
  TrainingClass,
} from "../../lib/domainTypes";
import { toQuery } from "../../lib/format";

export interface LeadListParams {
  search?: string;
  pipeline_status?: string;
  source?: string;
  assigned_to?: string;
  created_from?: string;
  created_to?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface CreateLeadInput {
  full_name: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  source?: string;
  source_detail?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  interested_course_id?: string;
  notes?: string;
  assigned_to?: string;
}

export interface ConvertLeadInput {
  class_id: string;
  amount: number;
  discount_amount: number;
  discount_note?: string;
  payment_method?: string;
  notes?: string;
}

export interface LeadImportResult {
  imported: number;
  failed: number;
  errors: Array<{ row: number; name?: string; message: string }>;
}

export interface DuplicateCheckResponse {
  is_duplicate: boolean;
  duplicate_field?: "phone" | "email";
  existing_lead?: {
    id: string;
    full_name: string;
    phone?: string;
    email?: string;
    pipeline_status: string;
    assigned_to_email?: string;
    created_at: string;
  };
}

export interface OrderListParams {
  search?: string;
  status?: string;
  student_id?: string;
  lead_id?: string;
  created_from?: string;
  created_to?: string;
  page?: number;
  per_page?: number;
}

export interface CreateOrderInput {
  lead_id?: string;
  student_id?: string;
  course_id?: string;
  class_id?: string;
  amount: number;
  discount_amount: number;
  discount_note?: string;
  payment_method?: string;
  notes?: string;
}

const get = <T>(path: string) => api<T>(path);
const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
const put = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body });
const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });

export const saleApi = {
  // Leads
  listLeads: (params: LeadListParams = {}) => get<Paginated<Lead>>(`/sale/leads${toQuery(params)}`),

  getLead: (id: string) => get<Lead>(`/sale/leads/${id}`),

  createLead: (data: CreateLeadInput) => post<Lead>("/sale/leads", data),

  updateLead: (id: string, data: CreateLeadInput) => put<Lead>(`/sale/leads/${id}`, data),

  updateLeadStatus: (id: string, pipeline_status: string, reason?: string) =>
    patch<Lead>(`/sale/leads/${id}/status`, { pipeline_status, reason }),

  assignLead: (id: string, assigned_to: string) =>
    patch<Lead>(`/sale/leads/${id}/assign`, { assigned_to }),

  convertLead: (id: string, data: ConvertLeadInput) =>
    post<ConvertResult>(`/sale/leads/${id}/convert`, data),

  checkDuplicate: (params: { phone?: string; email?: string; exclude_id?: string }) =>
    get<DuplicateCheckResponse>(`/sale/leads/check-duplicate${toQuery(params)}`),

  exportLeads: (params: LeadListParams = {}) =>
    apiDownload(`/sale/leads/export${toQuery(params)}`),

  downloadLeadTemplate: (format: "xlsx" | "csv" = "xlsx") =>
    apiDownload(`/sale/leads/template${format === "csv" ? "?format=csv" : ""}`),

  importLeads: (fileOrCsv: File | string) => {
    if (typeof fileOrCsv === "string") {
      return apiCSV<LeadImportResult>("/sale/leads/import", fileOrCsv);
    }
    const formData = new FormData();
    formData.append("file", fileOrCsv);
    return apiUpload<LeadImportResult>("/sale/leads/import", formData);
  },

  // Staff
  listStaff: () => get<SaleStaff[]>("/sale/staff"),

  // Interactions
  listInteractions: (leadId: string) =>
    get<LeadInteraction[]>(`/sale/leads/${leadId}/interactions`),

  createInteraction: (
    leadId: string,
    data: { channel: string; summary: string; outcome?: string },
  ) => post<LeadInteraction>(`/sale/leads/${leadId}/interactions`, data),

  listPipelineHistory: (leadId: string) =>
    get<LeadPipelineHistory[]>(`/sale/leads/${leadId}/pipeline-history`),

  // Tasks
  listTasks: (params: { assigned_to?: string; lead_id?: string; status?: string } = {}) =>
    get<LeadTask[]>(`/sale/tasks${toQuery(params)}`),

  listTasksByLead: (leadId: string) => get<LeadTask[]>(`/sale/leads/${leadId}/tasks`),

  createTask: (
    leadId: string,
    data: { assigned_to?: string; title: string; description?: string; due_at: string },
  ) => post<LeadTask>(`/sale/leads/${leadId}/tasks`, data),

  updateTask: (taskId: string, data: { title: string; description?: string; due_at: string }) =>
    put<LeadTask>(`/sale/tasks/${taskId}`, data),

  completeTask: (taskId: string) => patch<LeadTask>(`/sale/tasks/${taskId}/complete`, {}),

  // Orders
  listOrders: (params: OrderListParams = {}) =>
    get<Paginated<Order>>(`/sale/orders${toQuery(params)}`),

  exportOrders: (params: OrderListParams = {}) =>
    apiDownload(`/sale/orders/export${toQuery(params)}`),

  getOrder: (id: string) => get<Order>(`/sale/orders/${id}`),

  createOrder: (data: CreateOrderInput) => post<Order>("/sale/orders", data),

  updateOrderStatus: (
    id: string,
    status: string,
    extra: { payment_method?: string; notes?: string } = {},
  ) => patch<Order>(`/sale/orders/${id}/status`, { status, ...extra }),

  // Courses & Classes (for lead interested course & convert dropdowns)
  listCourses: () =>
    get<Paginated<Course>>(`/sale/courses${toQuery({ status: "active", per_page: 100 })}`),

  listClasses: (params: { course_id?: string; capacity?: string; status?: string } = {}) =>
    get<Paginated<TrainingClass>>(
      `/sale/classes${toQuery({ capacity: "available", per_page: 100, ...params })}`,
    ),

  // Dashboard
  getMyStats: () => get<SaleDashboardStats>("/sale/dashboard/my-stats"),

  getOverview: () => get<DashboardOverview>("/sale/dashboard/overview"),

  getRevenueReport: () => get<RevenueReport>("/sale/dashboard/revenue"),
};
