/**
 * Phase 7: catalogue of the 30 business reports, shared by backend (permissions, validation)
 * and frontend (Reports page, filters). Report keys are stable: saved filters refer to them.
 */
import type { DateRangePreset } from './date-range';

export const REPORT_CATEGORIES = [
  { key: 'sales', label: 'Sales & Orders', icon: 'ClipboardList' },
  { key: 'customers', label: 'Customers', icon: 'Users' },
  { key: 'inventory', label: 'Fabric & Purchases', icon: 'Layers' },
  { key: 'staff', label: 'Employees & Payroll', icon: 'IdCard' },
  { key: 'expenses', label: 'Expenses', icon: 'Receipt' },
  { key: 'accounts', label: 'Accounting', icon: 'BookOpen' },
  { key: 'system', label: 'System', icon: 'ShieldCheck' },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]['key'];

/** Extra filters a report can offer, next to the date range. */
export const REPORT_FILTERS = {
  customer: 'Customer',
  employee: 'Employee',
  supplier: 'Supplier',
  garment: 'Garment',
  stage: 'Order status',
  paymentStatus: 'Payment status',
  paymentMethod: 'Payment method',
  expenseCategory: 'Expense category',
  expenseStatus: 'Expense status',
  fabricCategory: 'Fabric category',
  fabric: 'Fabric',
  movementType: 'Movement type',
  stockStatus: 'Stock status',
  account: 'Account',
  auditModule: 'Module',
  user: 'User',
} as const;
export type ReportFilterKey = keyof typeof REPORT_FILTERS;

/**
 * range = from / to period (presets Today ... This Year, Custom)
 * asOf  = a single "as on" date (balance sheet, trial balance)
 * none  = current position (stock, pending orders, outstanding)
 */
export type ReportDateMode = 'range' | 'asOf' | 'none';

export interface ReportDefinition {
  key: string;
  no: number;
  title: string;
  category: ReportCategory;
  description: string;
  /** The user also needs VIEW on this module to open the report (e.g. salaries need payroll). */
  module: string;
  dateMode: ReportDateMode;
  defaultPreset?: DateRangePreset;
  filters: readonly ReportFilterKey[];
  /** Financial statements: fixed layout, no paging / sorting. */
  statement?: boolean;
}

export const REPORTS: readonly ReportDefinition[] = [
  { no: 1, key: 'daily-sales', title: 'Daily Sales Report', category: 'sales', module: 'orders', dateMode: 'range', defaultPreset: 'this_month', filters: [], description: 'Day by day bookings: stitching, fabric, discounts, sales and money received.' },
  { no: 2, key: 'monthly-sales', title: 'Monthly Sales Report', category: 'sales', module: 'orders', dateMode: 'range', defaultPreset: 'this_year', filters: [], description: 'Month by month sales, orders and money received.' },
  { no: 3, key: 'stitching-revenue', title: 'Stitching Revenue Report', category: 'sales', module: 'orders', dateMode: 'range', defaultPreset: 'this_month', filters: ['garment', 'employee'], description: 'Stitching income by garment type with pieces and average rate.' },
  { no: 4, key: 'fabric-sales', title: 'Fabric Sales Report', category: 'sales', module: 'orders', dateMode: 'range', defaultPreset: 'this_month', filters: ['fabricCategory', 'customer'], description: 'Shop fabric sold on orders: quantity, sale value, cost and margin.' },
  { no: 5, key: 'order-register', title: 'Order Register', category: 'sales', module: 'orders', dateMode: 'range', defaultPreset: 'this_month', filters: ['customer', 'stage', 'paymentStatus', 'employee', 'garment'], description: 'Every order booked in the period with status, totals and balance.' },
  { no: 6, key: 'pending-orders', title: 'Pending Orders', category: 'sales', module: 'orders', dateMode: 'none', filters: ['customer', 'stage', 'employee', 'garment'], description: 'Open orders not yet delivered, with days left to the delivery date.' },
  { no: 7, key: 'delivered-orders', title: 'Delivered Orders', category: 'sales', module: 'orders', dateMode: 'range', defaultPreset: 'this_month', filters: ['customer', 'employee', 'paymentStatus'], description: 'Orders delivered in the period, on time or late.' },
  { no: 8, key: 'delayed-orders', title: 'Delayed Orders', category: 'sales', module: 'orders', dateMode: 'none', filters: ['customer', 'stage', 'employee'], description: 'Open orders past their promised delivery date.' },
  { no: 9, key: 'customer-ledger', title: 'Customer Ledger', category: 'customers', module: 'customers', dateMode: 'range', defaultPreset: 'this_year', filters: ['customer'], description: 'One customer: opening, every charge and payment, running balance. Without a customer: summary of all.' },
  { no: 10, key: 'customer-outstanding', title: 'Customer Outstanding', category: 'customers', module: 'customers', dateMode: 'none', filters: ['customer'], description: 'Customers who owe money, oldest due first.' },
  { no: 11, key: 'customer-payments', title: 'Customer Payment Report', category: 'customers', module: 'payments', dateMode: 'range', defaultPreset: 'this_month', filters: ['customer', 'paymentMethod'], description: 'Receipts and refunds by customer and payment method.' },
  { no: 12, key: 'fabric-stock', title: 'Fabric Stock Report', category: 'inventory', module: 'inventory', dateMode: 'none', filters: ['fabricCategory', 'supplier', 'stockStatus'], description: 'Stock in hand, reserved, available and stock value per fabric.' },
  { no: 13, key: 'stock-movements', title: 'Stock Movement Report', category: 'inventory', module: 'inventory', dateMode: 'range', defaultPreset: 'this_month', filters: ['fabric', 'fabricCategory', 'movementType'], description: 'Every stock in and out with the balance after each movement.' },
  { no: 14, key: 'fabric-consumption', title: 'Fabric Consumption Report', category: 'inventory', module: 'inventory', dateMode: 'range', defaultPreset: 'this_month', filters: ['fabricCategory'], description: 'Shop fabric used on orders, less returns, at cost.' },
  { no: 15, key: 'supplier-ledger', title: 'Supplier Ledger', category: 'inventory', module: 'suppliers', dateMode: 'range', defaultPreset: 'this_year', filters: ['supplier'], description: 'One supplier: bills, returns, payments and running balance. Without a supplier: summary of all.' },
  { no: 16, key: 'purchase-register', title: 'Purchase Register', category: 'inventory', module: 'purchases', dateMode: 'range', defaultPreset: 'this_month', filters: ['supplier'], description: 'Supplier bills with totals, amount paid and balance.' },
  { no: 17, key: 'employee-attendance', title: 'Employee Attendance', category: 'staff', module: 'attendance', dateMode: 'range', defaultPreset: 'this_month', filters: ['employee'], description: 'Present, absent, half days, leave, late arrivals and overtime per employee.' },
  { no: 18, key: 'employee-production', title: 'Employee Production', category: 'staff', module: 'production', dateMode: 'range', defaultPreset: 'this_month', filters: ['employee', 'garment'], description: 'Pieces finished, rejected and altered per employee with piece-rate amount.' },
  { no: 19, key: 'employee-salary', title: 'Employee Salary', category: 'staff', module: 'payroll', dateMode: 'range', defaultPreset: 'this_year', filters: ['employee'], description: 'Payroll per month and employee: earnings, deductions, net, paid and balance.' },
  { no: 20, key: 'daily-wages', title: 'Daily Wages', category: 'staff', module: 'payroll', dateMode: 'range', defaultPreset: 'this_month', filters: ['employee'], description: 'Daily wage staff: days worked x wage, plus approved overtime.' },
  { no: 21, key: 'advance-register', title: 'Advance Register', category: 'staff', module: 'payroll', dateMode: 'range', defaultPreset: 'this_year', filters: ['employee'], description: 'Salary advances given, recovered and still due.' },
  { no: 22, key: 'overtime', title: 'Overtime Report', category: 'staff', module: 'attendance', dateMode: 'range', defaultPreset: 'this_month', filters: ['employee'], description: 'Overtime hours and amount, approved or waiting.' },
  { no: 23, key: 'expense-register', title: 'Expense Register', category: 'expenses', module: 'expenses', dateMode: 'range', defaultPreset: 'this_month', filters: ['expenseCategory', 'paymentMethod', 'expenseStatus'], description: 'Every expense voucher with category, payment method and status.' },
  { no: 24, key: 'expense-summary', title: 'Expense Summary', category: 'expenses', module: 'expenses', dateMode: 'range', defaultPreset: 'this_month', filters: ['paymentMethod'], description: 'Approved expenses by category with share of total.' },
  { no: 25, key: 'profit-loss', title: 'Profit & Loss', category: 'accounts', module: 'accounting', dateMode: 'range', defaultPreset: 'this_month', filters: [], statement: true, description: 'Revenue, cost of sales, direct labour, operating expenses and net profit.' },
  { no: 26, key: 'cash-flow', title: 'Cash Flow', category: 'accounts', module: 'accounting', dateMode: 'range', defaultPreset: 'this_month', filters: [], statement: true, description: 'Money in and out of cash, bank and wallets by source.' },
  { no: 27, key: 'balance-sheet', title: 'Balance Sheet', category: 'accounts', module: 'accounting', dateMode: 'asOf', filters: [], statement: true, description: 'Assets, liabilities and owner equity on a date.' },
  { no: 28, key: 'trial-balance', title: 'Trial Balance', category: 'accounts', module: 'accounting', dateMode: 'asOf', filters: [], statement: true, description: 'Debit and credit balance of every account on a date.' },
  { no: 29, key: 'general-ledger', title: 'General Ledger', category: 'accounts', module: 'accounting', dateMode: 'range', defaultPreset: 'this_month', filters: ['account'], description: 'Every posted journal line; pick an account for its running balance.' },
  { no: 30, key: 'audit-log', title: 'Audit Log Report', category: 'system', module: 'audit_logs', dateMode: 'range', defaultPreset: 'this_month', filters: ['auditModule', 'user'], description: 'Who did what and when: logins, changes, payments and settings.' },
] as const;

export const REPORT_KEYS = REPORTS.map((r) => r.key);

export function findReport(key: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.key === key);
}

export const STOCK_STATUSES = [
  { key: 'LOW', label: 'Low stock' },
  { key: 'OUT', label: 'Out of stock' },
  { key: 'OK', label: 'In stock' },
] as const;

/** Column data types: the backend sends raw values, the frontend and exports format them. */
export type ReportColumnType = 'text' | 'date' | 'datetime' | 'month' | 'money' | 'number' | 'qty' | 'percent' | 'status';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  /** Shown in the totals row (money / number / qty columns). */
  total?: boolean;
  /** Hidden until the user turns it on in "Columns". */
  optional?: boolean;
}

/** Row styles used by financial statements. */
export type ReportRowKind = 'section' | 'row' | 'subtotal' | 'total';

export type ReportCell = string | number | null;
/**
 * A row: column key -> raw value (money as "1250.00", qty as "2.500", dates as YYYY-MM-DD).
 * `_kind` styles statement rows; `_exclude = 1` keeps a row (e.g. a cancelled order) out of the totals.
 */
export type ReportRow = Record<string, ReportCell | undefined> & { _kind?: ReportRowKind; _exclude?: number };

export type ReportTone = 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'gold';

const TONES: Record<string, ReportTone> = {
  // orders
  'new order': 'danger', 'measurement completed': 'danger', ready: 'info', delivered: 'success', cancelled: 'secondary', alteration: 'gold',
  unpaid: 'danger', 'partly paid': 'warning', paid: 'success', credit: 'info', 'on time': 'success', late: 'danger',
  // money & documents
  received: 'success', refund: 'info', reversed: 'secondary', posted: 'success', approved: 'success', 'waiting for approval': 'warning', 'pending approval': 'warning', balanced: 'success', 'not balanced': 'danger',
  pending: 'warning', rejected: 'danger', open: 'warning', recovered: 'success', 'written off': 'secondary', draft: 'secondary',
  'partly paid out': 'warning', 'in payroll': 'success', 'not in payroll': 'warning',
  // stock
  'in stock': 'success', 'low stock': 'warning', 'out of stock': 'danger',
  // staff
  present: 'success', absent: 'danger', 'half day': 'warning', leave: 'info', holiday: 'secondary',
};

/** Badge colour for a status label (same mapping on screen and in printouts). Unknown labels = in production (amber). */
export function reportStatusTone(label: string | null | undefined): ReportTone {
  return TONES[String(label ?? '').toLowerCase()] ?? 'warning';
}

export interface ReportSummaryItem {
  label: string;
  value: string;
  type: ReportColumnType;
  hint?: string;
}

export interface ReportResult {
  key: string;
  title: string;
  /** Human readable period, e.g. "01 Nov 2026 - 30 Nov 2026". */
  period: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, string> | null;
  summary: ReportSummaryItem[];
  /** Extra line under the title (e.g. "Balanced" on the trial balance). */
  note?: string | null;
  statement: boolean;
  meta: { page: number; pageSize: number; total: number; totalPages: number; truncated: boolean };
  generatedAt: string;
}

export interface SavedReportFilter {
  id: string;
  reportKey: string;
  name: string;
  params: Record<string, string>;
  createdAt: string;
}

export const REPORT_EXPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];
