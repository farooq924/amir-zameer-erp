export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  isOwner: boolean;
  roles: { code: string; name: string }[];
  permissions: string[];
  sessionId: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionGroup {
  module: string;
  label: string;
  phase: number;
  permissions: { code: string; action: string; description: string | null }[];
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  roles: { id: string; code: string; name: string }[];
}

export interface AuditLogRow {
  id: string;
  action: string;
  module: string;
  recordId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; fullName: string; username: string } | null;
}

export interface DashboardSummary {
  range: { preset: string; from: string; to: string };
  cards: {
    totalSales: string; stitchingRevenue: string; fabricSales: string; totalOrders: number; cancelledOrders: number;
    pendingOrders: number; completedOrders: number; deliveredOrders: number; customerOutstanding: string;
    totalExpenses: string; cashReceived: string; netProfit: string; fabricStockValue: string; lowStockItems: number;
  };
}

export interface DashboardCharts {
  range: { preset: string; from: string; to: string };
  dailySales: { date: string; total: string; stitching: string; fabric: string }[];
  monthlyRevenue: { month: string; total: string; stitching: string; fabric: string }[];
  monthlyExpenses: { month: string; total: string }[];
  profitTrend: { month: string; income: string; expense: string; profit: string }[];
  orderStatus: { code: string; name: string; color: string; count: number }[];
  employeeProduction: { employeeId: string; name: string; completed: number; rejected: number }[];
}

export type SettingsMap = Record<string, Record<string, unknown>>;
