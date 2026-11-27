/** Employees, attendance, production and payroll constants shared by backend and frontend. */
export const EMPLOYEE_TYPES = [
  { key: 'TAILOR', label: 'Tailor' },
  { key: 'MASTER_TAILOR', label: 'Master tailor' },
  { key: 'CUTTER', label: 'Cutter' },
  { key: 'HELPER', label: 'Helper' },
  { key: 'FINISHING_STAFF', label: 'Finishing staff' },
  { key: 'SALES_STAFF', label: 'Sales staff' },
  { key: 'OTHER', label: 'Other' },
] as const;
export type EmployeeTypeCode = (typeof EMPLOYEE_TYPES)[number]['key'];

export const EMPLOYMENT_TYPES = [
  { key: 'PERMANENT', label: 'Permanent' },
  { key: 'CONTRACT', label: 'Contract' },
  { key: 'TEMPORARY', label: 'Temporary' },
  { key: 'PART_TIME', label: 'Part time' },
] as const;
export type EmploymentTypeCode = (typeof EMPLOYMENT_TYPES)[number]['key'];

export const EMPLOYEE_STATUSES = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'ON_LEAVE', label: 'On leave' },
  { key: 'INACTIVE', label: 'Inactive' },
  { key: 'TERMINATED', label: 'Left the job' },
] as const;
export type EmployeeStatusCode = (typeof EMPLOYEE_STATUSES)[number]['key'];

export const SALARY_TYPES = [
  { key: 'MONTHLY', label: 'Monthly salary', hint: 'Fixed salary every month. Absent days are deducted.' },
  { key: 'DAILY', label: 'Daily wage', hint: 'Paid for each day present (half day = half wage).' },
  { key: 'PER_PIECE', label: 'Per piece', hint: 'Paid for each completed piece recorded in Production.' },
  { key: 'FIXED_PLUS_INCENTIVE', label: 'Fixed + per piece', hint: 'Monthly salary plus per-piece incentive.' },
] as const;
export type SalaryTypeCode = (typeof SALARY_TYPES)[number]['key'];

export const ATTENDANCE_STATUSES = [
  { key: 'PRESENT', label: 'Present', short: 'P' },
  { key: 'ABSENT', label: 'Absent', short: 'A' },
  { key: 'HALF_DAY', label: 'Half day', short: 'H' },
  { key: 'LEAVE', label: 'Leave', short: 'L' },
  { key: 'HOLIDAY', label: 'Holiday', short: 'O' },
] as const;
export type AttendanceStatusCode = (typeof ATTENDANCE_STATUSES)[number]['key'];

export const LEAVE_TYPES = [
  { key: 'CASUAL', label: 'Casual leave', paid: true },
  { key: 'SICK', label: 'Sick leave', paid: true },
  { key: 'ANNUAL', label: 'Annual leave', paid: true },
  { key: 'UNPAID', label: 'Unpaid leave', paid: false },
  { key: 'OTHER', label: 'Other', paid: true },
] as const;
export type LeaveTypeCode = (typeof LEAVE_TYPES)[number]['key'];

export const TASK_TYPES = [
  { key: 'CUTTING', label: 'Cutting' },
  { key: 'STITCHING', label: 'Stitching' },
  { key: 'FINISHING', label: 'Finishing' },
  { key: 'ALTERATION', label: 'Alteration' },
  { key: 'EMBROIDERY', label: 'Embroidery' },
  { key: 'PRESSING', label: 'Pressing' },
  { key: 'OTHER', label: 'Other' },
] as const;
export type TaskTypeCode = (typeof TASK_TYPES)[number]['key'];

export const PAYROLL_STATUSES = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PARTIALLY_PAID', label: 'Partly paid' },
  { key: 'PAID', label: 'Paid' },
  { key: 'CANCELLED', label: 'Cancelled' },
] as const;

/** "2026-11" -> { start: "2026-11-01", end: "2026-11-30", days: 30 } */
export function monthBounds(periodKey: string): { start: string; end: string; days: number } {
  const [y, m] = periodKey.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(days).padStart(2, '0')}`, days };
}

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const CNIC_RE = /^\d{5}-\d{7}-\d$/;

/** "2026-11" -> "November 2026" */
export function monthLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
