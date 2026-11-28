import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant, byCompany } from '../../common/tenant';
import { Employee, Prisma, SalaryStructure } from '@prisma/client';
import { monthBounds, normalizePhone } from '@az/shared';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { AdvanceDto, ChangeSalaryDto, ChangeStatusDto, CreateEmployeeDto, EmployeeQueryDto, SalaryDto, UpdateEmployeeDto } from './dto/employee.dto';
import { asDate, dateOnly, nextDay } from './hr-utils';

export function presentSalary(s: SalaryStructure | null | undefined) {
  if (!s) return null;
  return {
    id: s.id, salaryType: s.salaryType, monthlySalary: moneyString(s.monthlySalary), dailyWage: moneyString(s.dailyWage),
    perPieceRate: moneyString(s.perPieceRate), overtimeRatePerHour: moneyString(s.overtimeRatePerHour),
    effectiveFrom: dateOnly(s.effectiveFrom), effectiveTo: dateOnly(s.effectiveTo), isCurrent: s.isCurrent, reason: s.reason, createdAt: s.createdAt,
  };
}

function presentEmployee(e: Employee, salary?: SalaryStructure | null) {
  return {
    id: e.id, code: e.code, name: e.name, fatherName: e.fatherName, contactNumber: e.contactNumber, address: e.address, cnic: e.cnic,
    joiningDate: dateOnly(e.joiningDate), leavingDate: dateOnly(e.leavingDate), designation: e.designation, employeeType: e.employeeType,
    employmentType: e.employmentType, bankName: e.bankName, bankAccountTitle: e.bankAccountTitle, bankAccountNumber: e.bankAccountNumber,
    status: e.status, notes: e.notes, version: e.version, createdAt: e.createdAt, updatedAt: e.updatedAt, salary: presentSalary(salary),
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
  ) {}

  async list(q: EmployeeQueryDto) {
    const where: Prisma.EmployeeWhereInput = { deletedAt: null };
    const status = q.status ?? 'CURRENT';
    if (status === 'CURRENT') where.status = { in: ['ACTIVE', 'ON_LEAVE'] };
    else if (status !== 'ALL') where.status = status as Employee['status'];
    if (q.type) where.employeeType = q.type as Employee['employeeType'];
    if (q.search) {
      const s = q.search.trim();
      const digits = s.replace(/\D/g, '');
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }, { designation: { contains: s, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ contactNumber: { contains: digits.startsWith('0') ? digits.slice(1) : digits } }, { cnic: { contains: s } }] : []),
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ name: 'asc' }],
        include: { salaryStructures: { where: { isCurrent: true }, take: 1 } },
      }),
      this.prisma.employee.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const today = karachiToday();
    const [att, adv] = await Promise.all([
      this.prisma.attendance.findMany({ where: { employeeId: { in: ids }, date: asDate(today) }, select: { employeeId: true, status: true } }),
      this.prisma.employeeAdvance.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, status: 'OPEN' }, _sum: { balanceAmount: true } }),
    ]);
    const attMap = new Map(att.map((a) => [a.employeeId, a.status]));
    const advMap = new Map(adv.map((a) => [a.employeeId, a._sum.balanceAmount]));
    return paginate(rows.map((r) => ({
      ...presentEmployee(r, r.salaryStructures[0]), todayAttendance: attMap.get(r.id) ?? null, advanceBalance: moneyString(advMap.get(r.id)),
    })), total, q);
  }

  /** Light list for pickers (attendance, production, order assignment). */
  async options() {
    const rows = await this.prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'ON_LEAVE'] } }, orderBy: { name: 'asc' },
      include: { salaryStructures: { where: { isCurrent: true }, take: 1 } },
    });
    return rows.map((e) => ({
      id: e.id, code: e.code, name: e.name, designation: e.designation, employeeType: e.employeeType, status: e.status,
      salaryType: e.salaryStructures[0]?.salaryType ?? null, perPieceRate: moneyString(e.salaryStructures[0]?.perPieceRate),
      overtimeRatePerHour: moneyString(e.salaryStructures[0]?.overtimeRatePerHour),
    }));
  }

  async summary() {
    const today = karachiToday();
    const period = today.slice(0, 7);
    const [byStatus, todayAtt, advances, payroll, pendingLeaves, pendingOvertime, monthlyBill] = await Promise.all([
      this.prisma.employee.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { date: asDate(today), employee: { deletedAt: null } }, _count: { _all: true } }),
      this.prisma.employeeAdvance.aggregate({ where: { status: 'OPEN' }, _sum: { balanceAmount: true }, _count: { _all: true } }),
      this.prisma.payroll.findUnique({ where: { companyId_periodKey: byCompany({ periodKey: period }) }, select: { id: true, status: true, totalNet: true, totalPaid: true } }),
      this.prisma.leaveRecord.count({ where: { status: 'PENDING' } }),
      this.prisma.overtimeRecord.count({ where: { status: 'PENDING' } }),
      this.prisma.salaryStructure.aggregate({ where: { isCurrent: true, salaryType: { in: ['MONTHLY', 'FIXED_PLUS_INCENTIVE'] }, employee: { deletedAt: null, status: { in: ['ACTIVE', 'ON_LEAVE'] } } }, _sum: { monthlySalary: true } }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const att = (s: string) => todayAtt.find((b) => b.status === s)?._count._all ?? 0;
    return {
      active: count('ACTIVE'), onLeave: count('ON_LEAVE'), inactive: count('INACTIVE') + count('TERMINATED'),
      today: { date: today, present: att('PRESENT') + att('HALF_DAY'), absent: att('ABSENT'), leave: att('LEAVE'), marked: todayAtt.reduce((a, b) => a + b._count._all, 0) },
      openAdvances: { count: advances._count._all, balance: moneyString(advances._sum.balanceAmount) },
      monthlySalaries: moneyString(monthlyBill._sum.monthlySalary),
      currentPayroll: payroll ? { id: payroll.id, periodKey: period, status: payroll.status, totalNet: moneyString(payroll.totalNet), totalPaid: moneyString(payroll.totalPaid) } : null,
      pendingLeaves, pendingOvertime,
    };
  }

  async get(id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, deletedAt: null }, include: { salaryStructures: { orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] } } });
    if (!e) throw new NotFoundException('Employee not found');
    const today = karachiToday();
    const period = today.slice(0, 7);
    const { start, end } = monthBounds(period);
    const [att, advances, production, payslips, history, overtime, leaves, unpaidProduction] = await Promise.all([
      this.prisma.attendance.groupBy({ by: ['status'], where: { employeeId: id, date: { gte: asDate(start), lte: asDate(end) } }, _count: { _all: true } }),
      this.prisma.employeeAdvance.findMany({ where: { employeeId: id }, orderBy: [{ advanceDate: 'desc' }, { advanceNo: 'desc' }], take: 50, include: { recoveries: { orderBy: { recoveryDate: 'asc' } } } }),
      this.prisma.productionRecord.findMany({
        where: { employeeId: id }, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }], take: 30,
        include: { orderItem: { select: { garmentName: true, order: { select: { id: true, orderNumber: true } } } }, assignment: { select: { taskType: true } } },
      }),
      this.prisma.payrollItem.findMany({ where: { employeeId: id }, orderBy: { periodKey: 'desc' }, take: 24, include: { payroll: { select: { id: true, payrollNo: true, status: true } } } }),
      this.prisma.employmentHistory.findMany({ where: { employeeId: id }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 50 }),
      this.prisma.overtimeRecord.findMany({ where: { employeeId: id }, orderBy: [{ date: 'desc' }], take: 30 }),
      this.prisma.leaveRecord.findMany({ where: { employeeId: id }, orderBy: [{ fromDate: 'desc' }], take: 30 }),
      this.prisma.productionRecord.aggregate({ where: { employeeId: id, payrollItemId: null }, _sum: { amount: true, completedQuantity: true } }),
    ]);
    const a = (s: string) => att.find((x) => x.status === s)?._count._all ?? 0;
    const current = e.salaryStructures.find((s) => s.isCurrent) ?? null;
    return {
      ...presentEmployee(e, current),
      salaryHistory: e.salaryStructures.map(presentSalary),
      thisMonth: { periodKey: period, present: a('PRESENT'), halfDay: a('HALF_DAY'), absent: a('ABSENT'), leave: a('LEAVE'), holiday: a('HOLIDAY') },
      unpaidProduction: { pieces: unpaidProduction._sum.completedQuantity ?? 0, amount: moneyString(unpaidProduction._sum.amount) },
      advanceBalance: moneyString(advances.filter((x) => x.status === 'OPEN').reduce((acc, x) => acc.plus(x.balanceAmount), dec(0))),
      advances: advances.map((x) => ({
        id: x.id, advanceNo: x.advanceNo, advanceDate: dateOnly(x.advanceDate), amount: moneyString(x.amount), recoveredAmount: moneyString(x.recoveredAmount),
        balanceAmount: moneyString(x.balanceAmount), installmentAmount: moneyString(x.installmentAmount), paymentMethod: x.paymentMethod, status: x.status, reason: x.reason,
        recoveries: x.recoveries.map((r) => ({ id: r.id, amount: moneyString(r.amount), recoveryDate: dateOnly(r.recoveryDate), payrollItemId: r.payrollItemId })),
      })),
      production: production.map((p) => ({
        id: p.id, workDate: dateOnly(p.workDate), orderId: p.orderItem.order.id, orderNumber: p.orderItem.order.orderNumber, garmentName: p.orderItem.garmentName,
        taskType: p.assignment.taskType, quantity: p.completedQuantity, pieceRate: moneyString(p.pieceRate), amount: moneyString(p.amount), paid: !!p.payrollItemId,
      })),
      overtime: overtime.map((o) => ({ id: o.id, date: dateOnly(o.date), hours: dec(o.hours).toFixed(2), ratePerHour: moneyString(o.ratePerHour), amount: moneyString(o.amount), status: o.status, paid: !!o.payrollItemId, notes: o.notes })),
      leaves: leaves.map((l) => ({ id: l.id, leaveType: l.leaveType, fromDate: dateOnly(l.fromDate), toDate: dateOnly(l.toDate), days: dec(l.days).toString(), reason: l.reason, status: l.status })),
      payslips: payslips.map((p) => ({
        id: p.id, periodKey: p.periodKey, payrollId: p.payroll.id, payrollNo: p.payroll.payrollNo, payrollStatus: p.payroll.status,
        grossAmount: moneyString(p.grossAmount), netAmount: moneyString(p.netAmount), paidAmount: moneyString(p.paidAmount),
      })),
      history: history.map((h) => ({ id: h.id, changeType: h.changeType, fromValue: h.fromValue, toValue: h.toValue, effectiveDate: dateOnly(h.effectiveDate), notes: h.notes, createdAt: h.createdAt })),
    };
  }

  async create(dto: CreateEmployeeDto, ctx: RequestContext) {
    if (dto.joiningDate > karachiToday()) throw new BadRequestException('Joining date cannot be in the future');
    await this.assertUnique(dto.cnic ?? null, null);
    const salary = this.salaryData(dto.salary);
    const id = await this.prisma.$transaction(async (tx) => {
      const code = await this.sequences.next({ key: 'EMPLOYEE', prefix: 'AZE', padding: 4 }, tx);
      const e = await tx.employee.create({
        data: {
          code, name: dto.name, fatherName: dto.fatherName ?? null, contactNumber: this.phone(dto.contactNumber), address: dto.address ?? null, cnic: dto.cnic ?? null,
          joiningDate: asDate(dto.joiningDate), designation: dto.designation ?? null, employeeType: dto.employeeType, employmentType: dto.employmentType ?? 'PERMANENT',
          bankName: dto.bankName ?? null, bankAccountTitle: dto.bankAccountTitle ?? null, bankAccountNumber: dto.bankAccountNumber ?? null, notes: dto.notes ?? null,
        },
      });
      await tx.salaryStructure.create({ data: { ...salary, employeeId: e.id, effectiveFrom: asDate(dto.joiningDate), isCurrent: true, reason: 'Joining salary', createdById: ctx.userId } });
      await tx.employmentHistory.create({ data: { employeeId: e.id, changeType: 'JOINED', toValue: dto.designation ?? dto.employeeType, effectiveDate: asDate(dto.joiningDate), createdById: ctx.userId } });
      await this.audit.log({ action: 'CREATE', module: 'employees', recordId: e.id, newValues: { code, name: e.name, salaryType: salary.salaryType } }, ctx, tx);
      return e.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateEmployeeDto, ctx: RequestContext) {
    const before = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Employee not found');
    if (dto.version !== undefined && dto.version !== before.version) throw new ConflictException('Someone else changed this employee. Reload and try again.');
    if (dto.cnic) await this.assertUnique(dto.cnic, id);
    if (dto.joiningDate && dto.joiningDate > karachiToday()) throw new BadRequestException('Joining date cannot be in the future');
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.employee.updateMany({
        where: { id, version: before.version },
        data: {
          name: dto.name, fatherName: dto.fatherName, contactNumber: dto.contactNumber === undefined ? undefined : this.phone(dto.contactNumber), address: dto.address,
          cnic: dto.cnic, joiningDate: dto.joiningDate ? asDate(dto.joiningDate) : undefined, designation: dto.designation, employeeType: dto.employeeType,
          employmentType: dto.employmentType, bankName: dto.bankName, bankAccountTitle: dto.bankAccountTitle, bankAccountNumber: dto.bankAccountNumber, notes: dto.notes,
          version: { increment: 1 },
        },
      });
      if (!res.count) throw new ConflictException('Someone else changed this employee. Reload and try again.');
      const today = asDate(karachiToday());
      const track = [
        ['DESIGNATION', before.designation, dto.designation],
        ['EMPLOYEE_TYPE', before.employeeType, dto.employeeType],
        ['EMPLOYMENT_TYPE', before.employmentType, dto.employmentType],
      ] as const;
      for (const [changeType, from, to] of track) {
        if (to !== undefined && to !== from) await tx.employmentHistory.create({ data: { employeeId: id, changeType, fromValue: from ?? null, toValue: to ?? null, effectiveDate: today, createdById: ctx.userId } });
      }
      await this.audit.log({ action: 'UPDATE', module: 'employees', recordId: id, oldValues: { name: before.name, designation: before.designation }, newValues: { name: dto.name, designation: dto.designation } }, ctx, tx);
    });
    return this.get(id);
  }

  async changeStatus(id: string, dto: ChangeStatusDto, ctx: RequestContext) {
    const before = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Employee not found');
    if (before.status === dto.status) return this.get(id);
    const date = dto.date ?? karachiToday();
    if (dto.status === 'TERMINATED' && date < dateOnly(before.joiningDate)!) throw new BadRequestException('Leaving date cannot be before the joining date');
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          status: dto.status, version: { increment: 1 },
          leavingDate: dto.status === 'TERMINATED' ? asDate(date) : before.status === 'TERMINATED' ? null : undefined,
        },
      });
      await tx.employmentHistory.create({ data: { employeeId: id, changeType: 'STATUS', fromValue: before.status, toValue: dto.status, effectiveDate: asDate(date), notes: dto.notes ?? null, createdById: ctx.userId } });
      await this.audit.log({ action: 'STATUS_CHANGE', module: 'employees', recordId: id, oldValues: { status: before.status }, newValues: { status: dto.status, date } }, ctx, tx);
    });
    return this.get(id);
  }

  /** New salary row from a date; the old one is closed the day before. History is never edited. */
  async changeSalary(id: string, dto: ChangeSalaryDto, ctx: RequestContext) {
    const e = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw new NotFoundException('Employee not found');
    const data = this.salaryData(dto);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
      const current = await tx.salaryStructure.findFirst({ where: { employeeId: id, isCurrent: true } });
      if (current && dto.effectiveFrom <= dateOnly(current.effectiveFrom)!) {
        throw new BadRequestException(`The new salary must start after ${dateOnly(current.effectiveFrom)} (when the current salary started)`);
      }
      if (current) await tx.salaryStructure.update({ where: { id: current.id }, data: { isCurrent: false, effectiveTo: asDate(nextDay(dto.effectiveFrom, -1)) } });
      await tx.salaryStructure.create({ data: { ...data, employeeId: id, effectiveFrom: asDate(dto.effectiveFrom), isCurrent: true, reason: dto.reason || null, createdById: ctx.userId } });
      await this.audit.log({
        action: 'SALARY_CHANGE', module: 'employees', recordId: id,
        oldValues: current ? { salaryType: current.salaryType, monthlySalary: moneyString(current.monthlySalary), dailyWage: moneyString(current.dailyWage), perPieceRate: moneyString(current.perPieceRate) } : undefined,
        newValues: { salaryType: data.salaryType, monthlySalary: moneyString(data.monthlySalary), dailyWage: moneyString(data.dailyWage), perPieceRate: moneyString(data.perPieceRate), effectiveFrom: dto.effectiveFrom },
      }, ctx, tx);
    });
    return this.get(id);
  }

  /** Only employees with no work history can be removed; others are marked as left / inactive. */
  async remove(id: string, ctx: RequestContext) {
    const e = await this.prisma.employee.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { attendance: true, advances: true, payrollItems: true, productionRecords: true, ordersAssigned: true, orderItemsAssigned: true } } } });
    if (!e) throw new NotFoundException('Employee not found');
    const used = Object.values(e._count).some((n) => n > 0);
    if (used) throw new BadRequestException('This employee has attendance, advances, payroll or work records. Mark them as "Left the job" or "Inactive" instead.');
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE', cnic: null, version: { increment: 1 } } });
      await this.audit.log({ action: 'DELETE', module: 'employees', recordId: id, oldValues: { code: e.code, name: e.name } }, ctx, tx);
    });
    return { ok: true };
  }

  async giveAdvance(id: string, dto: AdvanceDto, ctx: RequestContext) {
    const existing = await this.prisma.employeeAdvance.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.employeeId !== id) throw new ConflictException('This advance key was already used for another employee');
      return this.get(id);
    }
    const e = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw new NotFoundException('Employee not found');
    if (e.status === 'TERMINATED' || e.status === 'INACTIVE') throw new BadRequestException('Advances can only be given to current employees');
    const amount = money(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const installment = money(dto.installmentAmount ?? 0);
    if (installment.gt(amount)) throw new BadRequestException('Monthly instalment cannot be more than the advance');
    const date = dto.advanceDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Advance date cannot be in the future');
    await this.prisma.$transaction(async (tx) => {
      const advanceNo = await this.sequences.next({ key: 'ADVANCE', prefix: 'ADV', period: date.slice(0, 4), padding: 5 }, tx);
      const a = await tx.employeeAdvance.create({
        data: {
          advanceNo, employeeId: id, advanceDate: asDate(date), amount, balanceAmount: amount, installmentAmount: installment,
          paymentMethod: dto.paymentMethod ?? 'CASH', reason: dto.reason || null, idempotencyKey: dto.idempotencyKey, createdById: ctx.userId,
        },
      });
      await this.audit.log({ action: 'ADVANCE', module: 'payroll', recordId: a.id, newValues: { advanceNo, employee: e.code, amount: moneyString(amount), installment: moneyString(installment) } }, ctx, tx);
    });
    return this.get(id);
  }

  async writeOffAdvance(advanceId: string, ctx: RequestContext) {
    const a = await this.prisma.employeeAdvance.findUnique({ where: { id: advanceId } });
    if (!a) throw new NotFoundException('Advance not found');
    if (a.status !== 'OPEN') throw new BadRequestException('Only open advances can be written off');
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeAdvance.update({ where: { id: advanceId }, data: { status: 'WRITTEN_OFF' } });
      await this.audit.log({ action: 'WRITE_OFF', module: 'payroll', recordId: advanceId, newValues: { advanceNo: a.advanceNo, balance: moneyString(a.balanceAmount) } }, ctx, tx);
    });
    return this.get(a.employeeId);
  }

  async advances(status?: string) {
    const rows = await this.prisma.employeeAdvance.findMany({
      where: status && status !== 'ALL' ? { status: status as 'OPEN' } : {}, orderBy: [{ advanceDate: 'desc' }, { advanceNo: 'desc' }], take: 200,
      include: { employee: { select: { id: true, code: true, name: true } } },
    });
    return rows.map((x) => ({
      id: x.id, advanceNo: x.advanceNo, advanceDate: dateOnly(x.advanceDate), employee: x.employee, amount: moneyString(x.amount),
      recoveredAmount: moneyString(x.recoveredAmount), balanceAmount: moneyString(x.balanceAmount), installmentAmount: moneyString(x.installmentAmount),
      paymentMethod: x.paymentMethod, status: x.status, reason: x.reason,
    }));
  }

  private salaryData(s: SalaryDto) {
    const d = {
      salaryType: s.salaryType, monthlySalary: money(s.monthlySalary ?? 0), dailyWage: money(s.dailyWage ?? 0),
      perPieceRate: money(s.perPieceRate ?? 0), overtimeRatePerHour: money(s.overtimeRatePerHour ?? 0),
    };
    if ((d.salaryType === 'MONTHLY' || d.salaryType === 'FIXED_PLUS_INCENTIVE') && d.monthlySalary.lte(0)) throw new BadRequestException('Enter the monthly salary');
    if (d.salaryType === 'DAILY' && d.dailyWage.lte(0)) throw new BadRequestException('Enter the daily wage');
    return d;
  }

  private phone(v: string | null | undefined): string | null {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) throw new BadRequestException('Enter a valid phone number, e.g. 0300-1234567');
    return n;
  }

  private async assertUnique(cnic: string | null, excludeId: string | null) {
    if (!cnic) return;
    const dup = await this.prisma.employee.findFirst({ where: { cnic, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`CNIC ${cnic} is already used by ${dup.name} (${dup.code})`);
  }
}
