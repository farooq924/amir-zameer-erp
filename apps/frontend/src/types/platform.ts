export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
export type CompanyAccess = 'FULL' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED';

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: string;
  maxUsers: number;
  modules: string[];
  allModules: string[];
  sortOrder: number;
  isActive: boolean;
  companies: number;
}

export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  docPrefix: string;
  status: CompanyStatus;
  access: CompanyAccess;
  endsAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  trialEndsAt: string | null;
  paidUntil: string | null;
  graceDays: number;
  notes: string | null;
  suspendedReason: string | null;
  createdAt: string;
  plan: { id: string; code: string; name: string; monthlyPrice: string; maxUsers: number };
  modules: string[];
  activeUsers?: number;
  lastLoginAt?: string | null;
}

export interface CompanyPaymentRow {
  id: string;
  companyId: string;
  company?: string;
  companyCode?: string;
  amount: string;
  months: number;
  method: string;
  reference: string | null;
  paidAt: string;
  periodFrom: string;
  periodTo: string;
  notes: string | null;
  createdAt: string;
}

export interface CompanyDetail extends CompanyRow {
  users: { id: string; fullName: string; username: string; email: string; isActive: boolean; lastLoginAt: string | null; roles: { code: string; name: string }[] }[];
  payments: CompanyPaymentRow[];
  usage: { customers: number; orders: number; employees: number };
}

export interface PlatformOverview {
  companies: number;
  active: number;
  trial: number;
  suspended: number;
  readOnly: number;
  grace: number;
  expiringSoon: { id: string; name: string; status: CompanyStatus; endsAt: string | null; daysLeft: number | null }[];
  monthlyRecurring: string;
  paidThisMonth: string;
  paymentsThisMonth: number;
  activeUsers: number;
  recentPayments: { id: string; company: string; amount: string; months: number; method: string; paidAt: string }[];
}

export interface PlatformAuditRow {
  id: string;
  action: string;
  module: string;
  recordId: string | null;
  company: string | null;
  newValues: unknown;
  user: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export const PAYMENT_METHODS = [
  { value: 'JAZZCASH', label: 'JazzCash' },
  { value: 'EASYPAISA', label: 'EasyPaisa' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other' },
] as const;
