import { Prisma } from '@prisma/client';
import { EMPLOYEE_TYPES, PAYMENT_METHODS, PAYROLL_STATUSES, SALARY_TYPES } from '@az/shared';
import { dec } from '../../../common/utils/money';
import { MAX_ROWS, ReportBuilder, col, dateIn, label, m, money, num, pct, summary, sumOf, ymd } from '../report-kit';

const EMP_TYPE = label(EMPLOYEE_TYPES);
const SALARY = label(SALARY_TYPES);
const PAYROLL = label(PAYROLL_STATUSES);
const METHOD = label(PAYMENT_METHODS);
const APPROVAL: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };
const ADVANCE: Record<string, string> = { OPEN: 'Open', RECOVERED: 'Recovered', WRITTEN_OFF: 'Written off' };
const hours = (min: number) => (min / 60).toFixed(1);

export const employeeAttendance: ReportBuilder = async (input) => {
  const where: Prisma.AttendanceWhereInput = { date: dateIn(input) };
  if (input.f.employee) where.employeeId = input.f.employee;
  const grouped = await input.prisma.attendance.groupBy({
    by: ['employeeId', 'status'], where, _count: { _all: true },
  });
  const extra = await input.prisma.attendance.groupBy({
    by: ['employeeId'], where, _sum: { lateMinutes: true, earlyMinutes: true, overtimeMinutes: true }, _count: { _all: true },
  });
  const late = await input.prisma.attendance.groupBy({ by: ['employeeId'], where: { ...where, isLate: true }, _count: { _all: true } });
  const early = await input.prisma.attendance.groupBy({ by: ['employeeId'], where: { ...where, isEarlyDeparture: true }, _count: { _all: true } });
  const empWhere: Prisma.EmployeeWhereInput = input.f.employee
    ? { id: input.f.employee }
    : { OR: [{ id: { in: extra.map((e) => e.employeeId) } }, { deletedAt: null, status: { in: ['ACTIVE', 'ON_LEAVE'] } }] };
  const employees = await input.prisma.employee.findMany({ where: empWhere, orderBy: { code: 'asc' } });
  const out = employees.map((e) => {
    const c = (s: string) => grouped.find((g) => g.employeeId === e.id && g.status === s)?._count._all ?? 0;
    const x = extra.find((g) => g.employeeId === e.id);
    const present = c('PRESENT');
    const half = c('HALF_DAY');
    const holiday = c('HOLIDAY');
    const marked = x?._count._all ?? 0;
    const workDays = marked - holiday;
    return {
      code: e.code, name: e.name, designation: e.designation ?? EMP_TYPE[e.employeeType], marked, present, absent: c('ABSENT'), half, leave: c('LEAVE'), holiday,
      late: late.find((g) => g.employeeId === e.id)?._count._all ?? 0, lateMin: x?._sum.lateMinutes ?? 0, early: early.find((g) => g.employeeId === e.id)?._count._all ?? 0,
      otHours: hours(x?._sum.overtimeMinutes ?? 0), rate: workDays > 0 ? pct(present + half / 2, workDays) : '0.0',
    };
  });
  const marked = out.reduce((t, x) => t + x.marked - x.holiday, 0);
  return {
    columns: [col('code', 'Code'), col('name', 'Employee'), col('designation', 'Designation', 'text', { optional: true }), num('marked', 'Days marked'), num('present', 'Present'),
      num('absent', 'Absent'), num('half', 'Half day'), num('leave', 'Leave'), num('holiday', 'Holiday', { optional: true }), num('late', 'Late'),
      num('lateMin', 'Late minutes', { optional: true }), num('early', 'Left early', { optional: true }), col('otHours', 'Overtime hrs', 'qty', { total: true }), col('rate', 'Attendance', 'percent')],
    rows: out,
    summary: [summary('Employees', out.length, 'number'), summary('Attendance', `${pct(out.reduce((t, x) => t + x.present + x.half / 2, 0), marked || 1)}%`, 'text', 'present days / working days'),
      summary('Absent days', out.reduce((t, x) => t + x.absent, 0), 'number'), summary('Late arrivals', out.reduce((t, x) => t + x.late, 0), 'number')],
  };
};

export const employeeProduction: ReportBuilder = async (input) => {
  const where: Prisma.ProductionRecordWhereInput = { workDate: dateIn(input) };
  if (input.f.employee) where.employeeId = input.f.employee;
  if (input.f.garment) where.orderItem = { garmentTypeId: input.f.garment };
  const g = await input.prisma.productionRecord.groupBy({
    by: ['employeeId'], where, _count: { _all: true }, _sum: { completedQuantity: true, rejectedQuantity: true, alterationQuantity: true, amount: true },
  });
  const unpaid = await input.prisma.productionRecord.groupBy({ by: ['employeeId'], where: { ...where, payrollItemId: null }, _sum: { amount: true } });
  const employees = await input.prisma.employee.findMany({ where: { id: { in: g.map((x) => x.employeeId) } } });
  const out = g.map((x) => {
    const e = employees.find((y) => y.id === x.employeeId)!;
    const done = x._sum.completedQuantity ?? 0;
    const rejected = x._sum.rejectedQuantity ?? 0;
    return {
      code: e.code, name: e.name, type: EMP_TYPE[e.employeeType], records: x._count._all, completed: done, rejected, altered: x._sum.alterationQuantity ?? 0,
      quality: pct(done, done + rejected || 1), amount: m(x._sum.amount), unpaid: m(unpaid.find((u) => u.employeeId === x.employeeId)?._sum.amount),
    };
  });
  const pcs = out.reduce((t, x) => t + x.completed, 0);
  return {
    columns: [col('code', 'Code'), col('name', 'Employee'), col('type', 'Type', 'text', { optional: true }), num('records', 'Entries', { optional: true }), num('completed', 'Pieces done'),
      num('rejected', 'Rejected'), num('altered', 'Altered'), col('quality', 'Passed', 'percent'), money('amount', 'Piece-rate amount'), money('unpaid', 'Not yet in payroll')],
    rows: out,
    summary: [summary('Pieces done', pcs, 'number'), summary('Piece-rate amount', m(sumOf(out, (x) => x.amount))), summary('Rejected', out.reduce((t, x) => t + x.rejected, 0), 'number'),
      summary('Top worker', out.length ? [...out].sort((a, b) => b.completed - a.completed)[0].name : '-', 'text')],
    defaultSort: { key: 'completed', dir: 'desc' },
  };
};

export const employeeSalary: ReportBuilder = async (input) => {
  const r = input.range!;
  const where: Prisma.PayrollItemWhereInput = { periodKey: { gte: r.fromDate.slice(0, 7), lte: r.toDate.slice(0, 7) }, payroll: { status: { not: 'CANCELLED' } } };
  if (input.f.employee) where.employeeId = input.f.employee;
  const items = await input.prisma.payrollItem.findMany({
    where, orderBy: [{ periodKey: 'desc' }, { employee: { code: 'asc' } }], take: MAX_ROWS,
    include: { employee: { select: { code: true, name: true } }, payroll: { select: { status: true, payrollNo: true } } },
  });
  const out = items.map((i) => {
    const ded = dec(i.absenceDeduction).plus(i.advanceDeduction).plus(i.otherDeductions);
    return {
      month: i.periodKey, payrollNo: i.payroll.payrollNo, code: i.employee.code, name: i.employee.name, salaryType: SALARY[i.salaryType], basic: m(i.basicAmount), pieces: m(i.pieceAmount),
      overtime: m(i.overtimeAmount), bonus: m(dec(i.incentives).plus(i.bonus)), gross: m(i.grossAmount), absence: m(i.absenceDeduction), advance: m(i.advanceDeduction),
      other: m(i.otherDeductions), deductions: m(ded), net: m(i.netAmount), paid: m(i.paidAmount), balance: m(dec(i.netAmount).minus(i.paidAmount)), status: PAYROLL[i.payroll.status],
    };
  });
  return {
    columns: [col('month', 'Month', 'month'), col('payrollNo', 'Payroll no', 'text', { optional: true }), col('code', 'Code', 'text', { optional: true }), col('name', 'Employee'),
      col('salaryType', 'Salary type'), money('basic', 'Basic'), money('pieces', 'Piece amount'), money('overtime', 'Overtime'), money('bonus', 'Incentive & bonus'),
      money('gross', 'Gross'), money('absence', 'Absence ded.', { optional: true }), money('advance', 'Advance ded.', { optional: true }), money('other', 'Other ded.', { optional: true }),
      money('deductions', 'Deductions'), money('net', 'Net salary'), money('paid', 'Paid'), money('balance', 'Balance'), col('status', 'Payroll', 'status')],
    rows: out,
    summary: [summary('Net salaries', m(sumOf(out, (x) => x.net))), summary('Paid', m(sumOf(out, (x) => x.paid))), summary('Still to pay', m(sumOf(out, (x) => x.balance))),
      summary('Payslips', out.length, 'number')],
    note: 'Months are taken from the payroll month that falls in the selected period.',
  };
};

export const dailyWages: ReportBuilder = async (input) => {
  const r = input.range!;
  const structures = await input.prisma.salaryStructure.findMany({
    where: { salaryType: 'DAILY', effectiveFrom: { lte: new Date(`${r.toDate}T00:00:00Z`) }, ...(input.f.employee ? { employeeId: input.f.employee } : {}) },
    orderBy: { effectiveFrom: 'desc' }, include: { employee: true },
  });
  // The wage in force at the end of the period, one per employee.
  const latest = new Map<string, (typeof structures)[number]>();
  for (const s of structures) if (!latest.has(s.employeeId)) latest.set(s.employeeId, s);
  const ids = [...latest.keys()];
  const att = ids.length ? await input.prisma.attendance.groupBy({ by: ['employeeId', 'status'], where: { employeeId: { in: ids }, date: dateIn(input) }, _count: { _all: true } }) : [];
  const ot = ids.length ? await input.prisma.overtimeRecord.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, date: dateIn(input), status: 'APPROVED' }, _sum: { amount: true, hours: true } }) : [];
  const out = [...latest.values()].map((s) => {
    const c = (st: string) => att.find((a) => a.employeeId === s.employeeId && a.status === st)?._count._all ?? 0;
    const present = c('PRESENT');
    const half = c('HALF_DAY');
    const days = present + half / 2;
    const wages = dec(s.dailyWage).times(days);
    const o = ot.find((x) => x.employeeId === s.employeeId);
    return {
      code: s.employee.code, name: s.employee.name, wage: m(s.dailyWage), present, half, absent: c('ABSENT'), days: days.toFixed(1), wages: m(wages),
      otHours: dec(o?._sum.hours).toFixed(2), overtime: m(o?._sum.amount), total: m(wages.plus(dec(o?._sum.amount))),
    };
  });
  return {
    columns: [col('code', 'Code'), col('name', 'Employee'), money('wage', 'Daily wage', { total: false }), num('present', 'Present'), num('half', 'Half days'), num('absent', 'Absent'),
      col('days', 'Days worked', 'qty', { total: true }), money('wages', 'Wages earned'), col('otHours', 'Overtime hrs', 'qty', { total: true, optional: true }), money('overtime', 'Overtime'), money('total', 'Total payable')],
    rows: out,
    summary: [summary('Daily wage staff', out.length, 'number'), summary('Wages earned', m(sumOf(out, (x) => x.wages))), summary('Overtime', m(sumOf(out, (x) => x.overtime))),
      summary('Total payable', m(sumOf(out, (x) => x.total)))],
    note: 'Half day = half wage. Only approved overtime is counted. This is a working estimate; the payroll run is final.',
  };
};

export const advanceRegister: ReportBuilder = async (input) => {
  const where: Prisma.EmployeeAdvanceWhereInput = { advanceDate: dateIn(input) };
  if (input.f.employee) where.employeeId = input.f.employee;
  const rows = await input.prisma.employeeAdvance.findMany({ where, orderBy: { advanceDate: 'desc' }, take: MAX_ROWS, include: { employee: { select: { code: true, name: true } } } });
  const out = rows.map((a) => ({
    advanceNo: a.advanceNo, date: ymd(a.advanceDate), name: a.employee.name, code: a.employee.code, amount: m(a.amount), instalment: m(a.installmentAmount),
    recovered: m(a.recoveredAmount), balance: m(a.balanceAmount), method: METHOD[a.paymentMethod], status: ADVANCE[a.status], reason: a.reason ?? '',
  }));
  return {
    columns: [col('advanceNo', 'Advance no'), col('date', 'Date', 'date'), col('code', 'Code', 'text', { optional: true }), col('name', 'Employee'), money('amount', 'Amount'),
      money('instalment', 'Monthly instalment', { total: false }), money('recovered', 'Recovered'), money('balance', 'Balance due'), col('method', 'Paid by', 'text', { optional: true }),
      col('status', 'Status', 'status'), col('reason', 'Reason', 'text', { optional: true })],
    rows: out,
    summary: [summary('Advances given', m(sumOf(out, (x) => x.amount)), 'money', `${out.length} advances`), summary('Recovered', m(sumOf(out, (x) => x.recovered))),
      summary('Balance due', m(sumOf(out, (x) => x.balance))), summary('Open', out.filter((x) => x.status === 'Open').length, 'number')],
  };
};

export const overtime: ReportBuilder = async (input) => {
  const where: Prisma.OvertimeRecordWhereInput = { date: dateIn(input) };
  if (input.f.employee) where.employeeId = input.f.employee;
  const rows = await input.prisma.overtimeRecord.findMany({ where, orderBy: { date: 'desc' }, take: MAX_ROWS, include: { employee: { select: { code: true, name: true } } } });
  const out = rows.map((o) => ({
    date: ymd(o.date), code: o.employee.code, name: o.employee.name, hours: dec(o.hours).toFixed(2), rate: m(o.ratePerHour), amount: m(o.amount), status: APPROVAL[o.status],
    payroll: o.payrollItemId ? 'In payroll' : 'Not in payroll', notes: o.notes ?? '', _exclude: o.status === 'REJECTED' ? 1 : undefined,
  }));
  const ok = rows.filter((o) => o.status === 'APPROVED');
  return {
    columns: [col('date', 'Date', 'date'), col('code', 'Code', 'text', { optional: true }), col('name', 'Employee'), col('hours', 'Hours', 'qty', { total: true }),
      money('rate', 'Rate / hour', { total: false }), money('amount', 'Amount'), col('status', 'Status', 'status'), col('payroll', 'Payroll', 'status'), col('notes', 'Notes', 'text', { optional: true })],
    rows: out,
    summary: [summary('Approved hours', sumOf(ok, (o) => o.hours).toFixed(1), 'text'), summary('Approved amount', m(sumOf(ok, (o) => o.amount))),
      summary('Waiting approval', rows.filter((o) => o.status === 'PENDING').length, 'number'), summary('Employees', new Set(rows.map((o) => o.employeeId)).size, 'number')],
    note: 'Rejected overtime is listed but not added to the totals.',
  };
};
