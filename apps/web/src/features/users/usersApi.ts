import { api } from "../../lib/apiClient";
import type { Paginated } from "../../lib/domainTypes";
import type { Role } from "../../lib/types";
import { toQuery } from "../../lib/format";

export interface ManagedUser {
  id: string;
  email: string;
  status: "active" | "suspended" | "inactive" | "pending";
  must_change_password: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  phone: string;
  roles: Role[];
  student_code?: string;
  teacher_code?: string;
  created_by_email?: string;
  is_accepting_leads?: boolean;
  lead_assignment_order?: number;
}

export interface UserAuditLog {
  id: number;
  actor_user_id?: string;
  actor_email: string;
  actor_name: string;
  action: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  reason?: string;
  created_at: string;
}

export interface UserListParams {
  role?: string;
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
  full_name?: string;
  phone?: string;
  status?: string;
}

export interface UpdateStatusInput {
  status: "active" | "suspended" | "inactive";
  reason?: string;
}

export interface UpdateProfileInput {
  full_name: string;
  phone: string;
}

export interface ResetPasswordInput {
  new_password: string;
  reason?: string;
}

export interface UpdateLeadRoutingInput {
  is_accepting_leads?: boolean;
  lead_assignment_order?: number;
}

export interface ReorderLeadRoutingInput {
  ordered_user_ids: string[];
}

export const usersApi = {
  list: (params: UserListParams = {}) => api<Paginated<ManagedUser>>(`/users${toQuery(params)}`),

  get: (userID: string) => api<ManagedUser>(`/users/${userID}`),

  create: (data: CreateUserInput) => api<ManagedUser>("/users", { method: "POST", body: data }),

  updateStatus: (userID: string, data: UpdateStatusInput) =>
    api<ManagedUser>(`/users/${userID}/status`, { method: "PATCH", body: data }),

  updateProfile: (userID: string, data: UpdateProfileInput) =>
    api<ManagedUser>(`/users/${userID}/profile`, { method: "PATCH", body: data }),

  updateLeadRouting: (userID: string, data: UpdateLeadRoutingInput) =>
    api<ManagedUser>(`/users/${userID}/lead-routing`, { method: "PATCH", body: data }),

  reorderLeadRouting: (data: ReorderLeadRoutingInput) =>
    api<{ message: string }>("/users/reorder-lead-routing", { method: "PUT", body: data }),

  resetPassword: (userID: string, data: ResetPasswordInput) =>
    api<{ message: string }>(`/users/${userID}/reset-password`, {
      method: "POST",
      body: data,
    }),

  listAuditLogs: (userID: string, page = 1, perPage = 20) =>
    api<Paginated<UserAuditLog>>(`/users/${userID}/audit-logs?page=${page}&per_page=${perPage}`),
};

