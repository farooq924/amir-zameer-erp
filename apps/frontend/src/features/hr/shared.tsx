import { ATTENDANCE_STATUSES, EMPLOYEE_STATUSES, EMPLOYEE_TYPES, EMPLOYMENT_TYPES, LEAVE_TYPES, PAYROLL_STATUSES, SALARY_TYPES, TASK_TYPES } from '@az/shared';
import { Badge } from '@/components/ui/badge';
import { formatPKR } from '@/utils/format';

const map = (list: readonly { key: string; label: string }[]) => Object.fromEntries(list.map((x) => [x.key, x.label])) as Record<string, string>;
export const EMPLOYEE_TYPE_LABEL = map(EMPLOYEE_TYPES);
export const EMPLOYMENT_TYPE_LABEL = map(EMPLOYMENT_TYPES);
export const EMPLOYEE_STATUS_LABEL = map(EMPLOYEE_STATUSES);
export const SALARY_TYPE_LABEL = map(SALARY_TYPES);
export const ATTENDANCE_LABEL = map(ATTENDANCE_STATUSES);
export const LEAVE_LABEL = map(LEAVE_TYPES);
export const TASK_LABEL = map(TASK_TYPES);
export const PAYROLL_STATUS_LABEL = map(PAYROLL_STATUSES);

/** Karachi today as YYYY-MM-DD. */
export function todayPK(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
}
export function thisMonthPK(): string {
  return todayPK().slice(0, 7);
}
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export function EmployeeStatusBadge({ status }: { status: string }) {
  const variant = status === 'ACTIVE' ? 'success' : status === 'ON_LEAVE' ? 'warning' : status === 'TERMINATED' ? 'danger' : 'secondary';
  return <Badge variant={variant}>{EMPLOYEE_STATUS_LABEL[status] ?? status}</Badge>;
}

export const ATTENDANCE_STYLE: Record<string, string> = {
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  ABSENT: 'bg-rose-600 text-white border-rose-600',
  HALF_DAY: 'bg-amber-500 text-white border-amber-500',
  LEAVE: 'bg-blue-600 text-white border-blue-600',
  HOLIDAY: 'bg-slate-500 text-white border-slate-500',
};
/** Register cell colours by short code. */
export const SHORT_STYLE: Record<string, string> = {
  P: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  A: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  H: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  L: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
  O: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
};

export function AttendanceBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline">Not marked</Badge>;
  const variant = status === 'PRESENT' ? 'success' : status === 'ABSENT' ? 'danger' : status === 'HALF_DAY' ? 'warning' : status === 'LEAVE' ? 'info' : 'secondary';
  return <Badge variant={variant}>{ATTENDANCE_LABEL[status] ?? status}</Badge>;
}

export function ApprovalBadge({ status }: { status: string }) {
  if (status === 'APPROVED') return <Badge variant="success">Approved</Badge>;
  if (status === 'REJECTED') return <Badge variant="secondary">Rejected</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

export function PayrollStatusBadge({ status }: { status: string }) {
  const variant = status === 'DRAFT' ? 'warning' : status === 'APPROVED' ? 'info' : status === 'PARTIALLY_PAID' ? 'gold' : status === 'PAID' ? 'success' : 'secondary';
  return <Badge variant={variant}>{PAYROLL_STATUS_LABEL[status] ?? status}</Badge>;
}

export function AdvanceStatusBadge({ status }: { status: string }) {
  if (status === 'OPEN') return <Badge variant="warning">Open</Badge>;
  if (status === 'RECOVERED') return <Badge variant="success">Recovered</Badge>;
  return <Badge variant="secondary">Written off</Badge>;
}

/** "Rs 30,000 / month", "Rs 1,500 / day", "Rs 600 / piece" */
export function salaryText(s: { salaryType: string; monthlySalary: string; dailyWage: string; perPieceRate: string } | null | undefined): string {
  if (!s) return 'No salary set';
  if (s.salaryType === 'MONTHLY') return `${formatPKR(s.monthlySalary)} / month`;
  if (s.salaryType === 'DAILY') return `${formatPKR(s.dailyWage)} / day`;
  if (s.salaryType === 'PER_PIECE') return `${formatPKR(s.perPieceRate)} / piece`;
  return `${formatPKR(s.monthlySalary)} / month + ${formatPKR(s.perPieceRate)} / piece`;
}
