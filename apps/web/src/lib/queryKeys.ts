/**
 * Enterprise Query Key Factory
 * Centralizes all TanStack Query keys across the application.
 * Eliminates typo bugs in query invalidation and provides full autocomplete.
 */

export const saleKeys = {
  all: ["sale"] as const,
  dashboard: () => [...saleKeys.all, "dashboard"] as const,
  stats: () => [...saleKeys.all, "stats"] as const,

  leads: {
    all: () => [...saleKeys.all, "leads"] as const,
    lists: () => [...saleKeys.leads.all(), "list"] as const,
    list: (filters?: Record<string, unknown>) => [...saleKeys.leads.lists(), filters ?? {}] as const,
    details: () => [...saleKeys.leads.all(), "detail"] as const,
    detail: (id: string) => [...saleKeys.leads.details(), id] as const,
    timeline: (id: string) => [...saleKeys.leads.detail(id), "timeline"] as const,
  },

  orders: {
    all: () => [...saleKeys.all, "orders"] as const,
    lists: () => [...saleKeys.orders.all(), "list"] as const,
    list: (filters?: Record<string, unknown>) => [...saleKeys.orders.lists(), filters ?? {}] as const,
    details: () => [...saleKeys.orders.all(), "detail"] as const,
    detail: (id: string) => [...saleKeys.orders.details(), id] as const,
  },

  receipts: {
    all: () => [...saleKeys.all, "receipts"] as const,
    lists: () => [...saleKeys.receipts.all(), "list"] as const,
    list: (filters?: Record<string, unknown>) => [...saleKeys.receipts.lists(), filters ?? {}] as const,
  },

  students: {
    all: () => [...saleKeys.all, "students"] as const,
    lists: () => [...saleKeys.students.all(), "list"] as const,
    list: (filters?: Record<string, unknown>) => [...saleKeys.students.lists(), filters ?? {}] as const,
  },

  classes: {
    all: () => [...saleKeys.all, "classes"] as const,
    list: () => [...saleKeys.classes.all(), "list"] as const,
  },

  courses: {
    all: () => [...saleKeys.all, "courses"] as const,
    list: () => [...saleKeys.courses.all(), "list"] as const,
  },

  staff: {
    all: () => [...saleKeys.all, "staff"] as const,
    list: () => [...saleKeys.staff.all(), "list"] as const,
  },
} as const;
