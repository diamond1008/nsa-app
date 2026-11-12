/** API contract types — mirrors docs/openapi.yaml. */

export interface ApiSuccess<T> {
  data: T;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type Role = "ADMIN" | "ACADEMIC_ADMIN" | "TEACHER" | "STUDENT" | "SALE" | "SALE_ADMIN";

export interface ProfileRef {
  id: string;
  code: string;
  full_name: string;
  avatar_url?: string | null;
}

export interface UserInfo {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string | null;
  employee_code?: string;
  roles: Role[];
  must_change_password: boolean;
  student_profile?: ProfileRef;
  teacher_profile?: ProfileRef;
  last_login_at?: string | null;
  created_at?: string;
}

export interface TokenBundle {
  access_token: string;
  token_type: string;
  access_expires_at: string;
  must_change_password: boolean;
  user: UserInfo;
}
