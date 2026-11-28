import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant, byCompany } from '../../common/tenant';
import { Employee, PayrollItem, Prisma, SalaryStructure } from '@prisma/client';
import { monthBounds, monthLabel } from '@az/shared';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { employedBetween } from '../attendance/attendance.service';
import { asDate, dateOnly } from '../employees/hr-utils';
import { CreatePayrollDto, PayAllDto, SalaryPaymentDto, UpdatePayrollItemDto } from './dto/payroll.dto';
import { PayrollFigures, advanceInstalment, calculatePayroll, employedDays } from './payroll-calc';

type Manual = { incentives?: Prisma.Decimal; bonus?: Prisma.Decimal; otherDeductions?: Prisma.Decimal; advanceDeduction?: Prisma.Decimal };
const FIGURE_KEYS = ['basicAmount', 'presentDays', 'absentDays', 'pieceAmount', 'overtimeAmount', 'absenceDeduction', 'advanceDeduction', 'grossAmount', 'netAmount'] as const;

function presentItem(i: PayrollItem & { employee: Pick<Employee, 'id' | 'code' | 'name' | 'designation' | 'employeeType'> }) {
  return {
    id: i.id, employee: i.employee, periodKey: i.periodKey, salaryType: i.salaryType,
    basicAmount: moneyString(i.basicAmount), presentDays: dec(i.presentDays).toString(), absentDays: dec(i.absentDays).toString(),
    completedPieces: i.completedPieces, pieceAmount: moneyString(i.pieceAmount), overtimeAmount: moneyString(i.overtimeAmount),
    incentives: moneyString(i.incentives), bonus: moneyString(i.bonus), absenceDeduction: moneyString(i.absenceDeduction),
    advanceDeduction: moneyString(i.advanceDeduction), otherDeductions: moneyString(i.otherDeductions),
    grossAmount: moneyString(i.grossAmount), netAmount: moneyString(i.netAmount), paidAmount: moneyString(i.paidAmount),
    balance: moneyString(dec(i.netAmount).minus(i.paidAmount)), notes: i.notes,
  };
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
  ) {}

  async list() {
    const rows = await this.prisma.payroll.findMany({ orderBy: { periodKey: 'desc' }, take: 60, include: { _count: { select: { items: true } } } });
    return rows.map((p) => ({
      id: p.id, payrollNo: p.payrollNo, periodKey: p.periodKey, periodStart: dateOnly(p.periodStart), periodEnd: dateOnly(p.periodEnd), status: p.status,
      employees: p._count.items, totalGross: moneyString(p.totalGross), totalDeductions: moneyString(p.totalDeductions), totalNet: moneyString(p.totalNet),
      totalPaid: moneyString(p.totalPaid), approvedAt: p.approvedAt, createdAt: p.createdAt,
    }));
  }

  async get(id: string) {
    const p = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        approvedBy: { select: { fullName: true } },
        items: { include: { employee: { select: { id: true, code: true, name: true, designation: true, employeeType: true } } }, orderBy: { employee: { name: 'asc' } } },
      },
    });
    if (!p) throw new NotFoundException('Payroll not found');
    return {
      id: p.id, payrollNo: p.payrollNo, periodKey: p.periodKey, periodLabel: monthLabel(p.periodKey), periodStart: dateOnly(p.periodStart), periodEnd: dateOnly(p.periodEnd),
      status: p.status, notes: p.notes, approvedBy: p.approvedBy?.fullName ?? null, approvedAt: p.approvedAt, createdAt: p.createdAt,
      totals: { gross: moneyString(p.totalGross), deductions: moneyString(p.totalDeductions), net: moneyString(p.totalNet), paid: moneyString(p.totalPaid), balance: moneyString(dec(p.totalNet).minus(p.totalPaid)) },
      items: p.items.map(presentItem),
    };
  }

  async create(dto: CreatePayrollDto, ctx: RequestContext) {
    const today = karachiToday();
    if (dto.periodKey > today.slice(0, 7)) throw new BadRequestException('Payroll cannot be made for a future month');
    const exists = await this.prisma.payroll.findUnique({ where: { companyId_periodKey: byCompany({ periodKey: dto.periodKey }) } });
    if (exists) throw new ConflictException(`Payroll for ${monthLabel(dto.periodKey)} already exists (${exists.payrollNo})`);
    const draft = await this.prisma.payroll.findFirst({ where: { status: 'DRAFT' } });
    if (draft) throw new BadRequestException(`Approve or delete the draft payroll for ${monthLabel(draft.periodKey)} first`);
    const { start, end } = monthBounds(dto.periodKey);
    const id = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payroll.create({
        data: { payrollNo: `PAY-${dto.periodKey}`, periodKey: dto.periodKey, periodStart: asDate(start), periodEnd: asDate(end), notes: dto.notes || null, createdById: ctx.userId },
      });
      const count = await this.build(tx, p.id, dto.periodKey, new Map());
      if (!count) throw new BadRequestException(`No employees with a salary were working in ${monthLabel(dto.periodKey)}`);
      await this.audit.log({ action: 'CREATE', module: 'payroll', recordId: p.id, newValues: { payrollNo: p.payrollNo, employees: count } }, ctx, tx);
      return p.id;
    }, { timeout: 60_000 });
    return this.get(id);
  }

  /**
   * Re-reads attendance, production, overtime and advances. Bonus, incentives, other deductions and notes are kept;
   * the advance deduction goes back to the monthly instalment.
   */
  async recalculate(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.lockDraft(tx, id);
      const items = await tx.payrollItem.findMany({ where: { payrollId: id } });
      const manual = new Map<string, Manual & { notes: string | null }>(items.map((i) => [i.employeeId, {
        incentives: i.incentives, bonus: i.bonus, otherDeductions: i.otherDeductions, notes: i.notes,
      }]));
      await tx.payrollItem.deleteMany({ where: { payrollId: id } });
      await this.build(tx, id, p.periodKey, manual);
      await this.audit.log({ action: 'RECALCULATE', module: 'payroll', recordId: id, newValues: { payrollNo: p.payrollNo } }, ctx, tx);
    }, { timeout: 60_000 });
    return this.get(id);
  }

  async updateItem(id: string, itemId: string, dto: UpdatePayrollItemDto, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.lockDraft(tx, id);
      const item = await tx.payrollItem.findFirst({ where: { id: itemId, payrollId: id }, include: { employee: true } });
      if (!item) throw new NotFoundException('Payroll line not found');
      const manual: Manual = {
        incentives: dto.incentives !== undefined ? money(dto.incentives) : item.incentives,
        bonus: dto.bonus !== undefined ? money(dto.bonus) : item.bonus,
        otherDeductions: dto.otherDeductions !== undefined ? money(dto.otherDeductions) : item.otherDeductions,
        advanceDeduction: dto.advanceDeduction !== undefined ? money(dto.advanceDeduction) : item.advanceDeduction,
      };
      const calc = await this.compute(tx, item.employee, p.periodKey, manual);
      if (!calc) throw new BadRequestException('This employee has no salary for this month');
      if (calc.figures.netAmount.lt(0)) throw new BadRequestException('Deductions are more than the salary. Lower the deductions.');
      if (dto.advanceDeduction !== undefined && money(dto.advanceDeduction).gt(calc.figures.advanceDeduction)) {
        throw new BadRequestException(`Advance deduction can be at most ${moneyString(calc.figures.advanceDeduction)} (open balance or salary left)`);
      }
      await tx.payrollItem.update({ where: { id: itemId }, data: { ...this.itemData(calc.figures), notes: dto.notes !== undefined ? dto.notes || null : item.notes } });
      await this.refreshTotals(tx, id);
      await this.audit.log({ action: 'UPDATE', module: 'payroll', recordId: id, newValues: { employee: item.employee.code, ...dto } }, ctx, tx);
    });
    return this.get(id);
  }

  async remove(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.lockDraft(tx, id);
      await tx.payroll.delete({ where: { id } });
      await this.audit.log({ action: 'DELETE', module: 'payroll', recordId: id, oldValues: { payrollNo: p.payrollNo } }, ctx, tx);
    });
    return { ok: true };
  }

  /**
   * Locks the month: links the paid production and overtime, recovers advances.
   * Figures must still match the current data; otherwise the user is asked to recalculate.
   */
  async approve(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.lockDraft(tx, id);
      const earlier = await tx.payroll.findFirst({ where: { status: 'DRAFT', periodKey: { lt: p.periodKey } } });
      if (earlier) throw new BadRequestException(`Approve ${monthLabel(earlier.periodKey)} first`);
      const items = await tx.payrollItem.findMany({ where: { payrollId: id }, include: { employee: true } });
      const { end } = monthBounds(p.periodKey);
      for (const item of items) {
        const calc = await this.compute(tx, item.employee, p.periodKey, {
          incentives: item.incentives, bonus: item.bonus, otherDeductions: item.otherDeductions, advanceDeduction: item.advanceDeduction,
        });
        if (!calc || FIGURE_KEYS.some((k) => !dec(calc.figures[k]).eq(dec(item[k])))) {
          throw new ConflictException(`Figures for ${item.employee.name} changed after this payroll was calculated. Press "Recalculate", check, then approve.`);
        }
        if (calc.usesPieces) {
          await tx.productionRecord.updateMany({ where: { employeeId: item.employeeId, payrollItemId: null, workDate: { lte: asDate(end) } }, data: { payrollItemId: item.id } });
        }
        await tx.overtimeRecord.updateMany({ where: { employeeId: item.employeeId, payrollItemId: null, status: 'APPROVED', date: { lte: asDate(end) } }, data: { payrollItemId: item.id } });
        let left = dec(item.advanceDeduction);
        if (left.gt(0)) {
          const open = await tx.employeeAdvance.findMany({ where: { employeeId: item.employeeId, status: 'OPEN', advanceDate: { lte: asDate(end) } }, orderBy: [{ advanceDate: 'asc' }, { advanceNo: 'asc' }] });
          for (const a of open) {
            if (left.lte(0)) break;
            const part = Prisma.Decimal.min(left, a.balanceAmount);
            const balance = dec(a.balanceAmount).minus(part);
            await tx.advanceRecovery.create({ data: { advanceId: a.id, payrollItemId: item.id, amount: part, recoveryDate: asDate(end) } });
            await tx.employeeAdvance.update({ where: { id: a.id }, data: { recoveredAmount: dec(a.recoveredAmount).plus(part), balanceAmount: balance, status: balance.eq(0) ? 'RECOVERED' : 'OPEN' } });
            left = left.minus(part);
          }
        }
      }
      await tx.payroll.update({ where: { id }, data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date() } });
      await this.audit.log({ action: 'APPROVE', module: 'payroll', recordId: id, newValues: { payrollNo: p.payrollNo, employees: items.length } }, ctx, tx);
    }, { timeout: 60_000 });
    return this.get(id);
  }

  /** Back to draft (only before any salary is paid). Undoes everything approval did. */
  async reopen(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payrolls WHERE id = ${id}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
      const p = await tx.payroll.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Payroll not found');
      if (p.status !== 'APPROVED') throw new BadRequestException(p.status === 'DRAFT' ? 'This payroll is already a draft' : 'Salaries are already paid from this payroll, so it cannot be reopened');
      const later = await tx.payroll.findFirst({ where: { periodKey: { gt: p.periodKey }, status: { not: 'DRAFT' } } });
      if (later) throw new BadRequestException(`Reopen ${monthLabel(later.periodKey)} first`);
      const itemIds = (await tx.payrollItem.findMany({ where: { payrollId: id }, select: { id: true } })).map((i) => i.id);
      await tx.productionRecord.updateMany({ where: { payrollItemId: { in: itemIds } }, data: { payrollItemId: null } });
      await tx.overtimeRecord.updateMany({ where: { payrollItemId: { in: itemIds } }, data: { payrollItemId: null } });
      const recoveries = await tx.advanceRecovery.findMany({ where: { payrollItemId: { in: itemIds } }, include: { advance: true } });
      for (const r of recoveries) {
        await tx.employeeAdvance.update({
          where: { id: r.advanceId },
          data: { recoveredAmount: dec(r.advance.recoveredAmount).minus(r.amount), balanceAmount: dec(r.advance.balanceAmount).plus(r.amount), status: r.advance.status === 'RECOVERED' ? 'OPEN' : undefined },
        });
      }
      await tx.advanceRecovery.deleteMany({ where: { payrollItemId: { in: itemIds } } });
      await tx.payroll.update({ where: { id }, data: { status: 'DRAFT', approvedById: null, approvedAt: null } });
      await this.audit.log({ action: 'REOPEN', module: 'payroll', recordId: id, newValues: { payrollNo: p.payrollNo } }, ctx, tx);
    });
    return this.get(id);
  }

  async pay(itemId: string, dto: SalaryPaymentDto, ctx: RequestContext) {
    const existing = await this.prisma.salaryPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    const item = await this.prisma.payrollItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Payroll line not found');
    if (existing) {
      if (existing.payrollItemId !== itemId) throw new ConflictException('This payment key was already used');
      return this.get(item.payrollId);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.postPayment(tx, itemId, money(dto.amount), dto.method, dto.paymentDate, dto.reference, dto.idempotencyKey, ctx);
      await this.refreshTotals(tx, item.payrollId);
    });
    return this.get(item.payrollId);
  }

  /** Pays the remaining salary of everyone in the payroll in one go. */
  async payAll(id: string, dto: PayAllDto, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payrolls WHERE id = ${id}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
      const items = await tx.payrollItem.findMany({ where: { payrollId: id } });
      if (!items.length) throw new NotFoundException('Payroll not found');
      let paid = 0;
      for (const i of items) {
        const key = `${dto.idempotencyKey}:${i.id}`;
        if (await tx.salaryPayment.findUnique({ where: { idempotencyKey: key } })) continue;
        const due = dec(i.netAmount).minus(i.paidAmount);
        if (due.lte(0)) continue;
        await this.postPayment(tx, i.id, due, dto.method, dto.paymentDate, undefined, key, ctx);
        paid += 1;
      }
      await this.refreshTotals(tx, id);
      await this.audit.log({ action: 'PAYMENT', module: 'payroll', recordId: id, newValues: { payAll: true, employees: paid, method: dto.method } }, ctx, tx);
    }, { timeout: 60_000 });
    return this.get(id);
  }

  /** Everything a payslip shows. */
  async payslip(itemId: string) {
    const i = await this.prisma.payrollItem.findUnique({
      where: { id: itemId },
      include: {
        employee: true, payroll: true,
        payments: { orderBy: { paymentDate: 'asc' } },
        overtimeRecords: { orderBy: { date: 'asc' } },
        advanceRecoveries: { include: { advance: { select: { advanceNo: true, balanceAmount: true } } } },
        productionRecords: { include: { orderItem: { select: { garmentName: true, order: { select: { orderNumber: true } } } }, assignment: { select: { taskType: true } } }, orderBy: { workDate: 'asc' } },
      },
    });
    if (!i) throw new NotFoundException('Payslip not found');
    const openAdvance = await this.prisma.employeeAdvance.aggregate({ where: { employeeId: i.employeeId, status: 'OPEN' }, _sum: { balanceAmount: true } });
    const e = i.employee;
    return {
      ...presentItem(i),
      payroll: { id: i.payroll.id, payrollNo: i.payroll.payrollNo, periodKey: i.payroll.periodKey, periodLabel: monthLabel(i.payroll.periodKey), status: i.payroll.status, periodStart: dateOnly(i.payroll.periodStart), periodEnd: dateOnly(i.payroll.periodEnd) },
      employeeDetail: {
        id: e.id, code: e.code, name: e.name, fatherName: e.fatherName, cnic: e.cnic, designation: e.designation, employeeType: e.employeeType,
        joiningDate: dateOnly(e.joiningDate), bankName: e.bankName, bankAccountTitle: e.bankAccountTitle, bankAccountNumber: e.bankAccountNumber, contactNumber: e.contactNumber,
      },
      payments: i.payments.map((p) => ({ id: p.id, paymentNo: p.paymentNo, paymentDate: dateOnly(p.paymentDate), amount: moneyString(p.amount), method: p.method, reference: p.reference })),
      overtime: i.overtimeRecords.map((o) => ({ date: dateOnly(o.date), hours: dec(o.hours).toFixed(2), ratePerHour: moneyString(o.ratePerHour), amount: moneyString(o.amount) })),
      recoveries: i.advanceRecoveries.map((r) => ({ advanceNo: r.advance.advanceNo, amount: moneyString(r.amount) })),
      production: i.productionRecords.map((p) => ({ workDate: dateOnly(p.workDate), orderNumber: p.orderItem.order.orderNumber, garmentName: p.orderItem.garmentName, taskType: p.assignment.taskType, quantity: p.completedQuantity, pieceRate: moneyString(p.pieceRate), amount: moneyString(p.amount) })),
      advanceBalanceAfter: moneyString(openAdvance._sum.balanceAmount),
    };
  }

  /** Salary history of the payroll month for the summary on the Payroll page. */
  async salaryPayments(id: string) {
    const rows = await this.prisma.salaryPayment.findMany({ where: { payrollItem: { payrollId: id } }, orderBy: [{ paymentDate: 'desc' }, { paymentNo: 'desc' }], include: { employee: { select: { code: true, name: true } } } });
    return rows.map((p) => ({ id: p.id, paymentNo: p.paymentNo, paymentDate: dateOnly(p.paymentDate), employee: p.employee, amount: moneyString(p.amount), method: p.method, reference: p.reference, payrollItemId: p.payrollItemId }));
  }

  // ------------------------------------------------------------------ internals

  private async lockDraft(tx: PrismaTx, id: string) {
    await tx.$queryRaw`SELECT id FROM payrolls WHERE id = ${id}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
    const p = await tx.payroll.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Payroll not found');
    if (p.status !== 'DRAFT') throw new BadRequestException('This payroll is approved. Reopen it first to make changes.');
    return p;
  }

  private async build(tx: PrismaTx, payrollId: string, periodKey: string, manual: Map<string, Manual & { notes?: string | null }>) {
    const { start, end } = monthBounds(periodKey);
    const employees = await tx.employee.findMany({ where: employedBetween(start, end), orderBy: { name: 'asc' } });
    let count = 0;
    for (const e of employees) {
      const m = manual.get(e.id);
      const calc = await this.compute(tx, e, periodKey, m ?? {});
      if (!calc) continue;
      await tx.payrollItem.create({ data: { payrollId, employeeId: e.id, periodKey, salaryType: calc.salary.salaryType, ...this.itemData(calc.figures), notes: m?.notes ?? null } });
      count += 1;
    }
    await this.refreshTotals(tx, payrollId);
    return count;
  }

  private async compute(tx: PrismaTx, e: Employee, periodKey: string, manual: Manual): Promise<{ salary: SalaryStructure; figures: PayrollFigures; usesPieces: boolean } | null> {
    const { start, end, days } = monthBounds(periodKey);
    const salary = await tx.salaryStructure.findFirst({ where: { employeeId: e.id, effectiveFrom: { lte: asDate(end) } }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] });
    if (!salary) return null;
    const joining = dateOnly(e.joiningDate)!;
    const leaving = dateOnly(e.leavingDate);
    const from = joining > start ? joining : start;
    const to = leaving && leaving < end ? leaving : end;
    const worked = employedDays(start, end, joining, leaving);
    if (worked <= 0) return null;
    const usesPieces = salary.salaryType === 'PER_PIECE' || salary.salaryType === 'FIXED_PLUS_INCENTIVE';
    const [att, pieces, overtime, advances] = await Promise.all([
      tx.attendance.groupBy({ by: ['status'], where: { employeeId: e.id, date: { gte: asDate(from), lte: asDate(to) } }, _count: { _all: true } }),
      usesPieces
        ? tx.productionRecord.aggregate({ where: { employeeId: e.id, payrollItemId: null, workDate: { lte: asDate(end) } }, _sum: { amount: true, completedQuantity: true } })
        : Promise.resolve(null),
      tx.overtimeRecord.aggregate({ where: { employeeId: e.id, payrollItemId: null, status: 'APPROVED', date: { lte: asDate(end) } }, _sum: { amount: true } }),
      tx.employeeAdvance.findMany({ where: { employeeId: e.id, status: 'OPEN', advanceDate: { lte: asDate(end) } } }),
    ]);
    const c = (s: string) => att.find((a) => a.status === s)?._count._all ?? 0;
    const advanceDue = advances.reduce((acc, a) => acc.plus(advanceInstalment(a.balanceAmount, a.installmentAmount)), dec(0));
    // A manual advance deduction cannot exceed the open balance.
    const openBalance = advances.reduce((acc, a) => acc.plus(a.balanceAmount), dec(0));
    const figures = calculatePayroll({
      salaryType: salary.salaryType, monthlySalary: salary.monthlySalary, dailyWage: salary.dailyWage, daysInMonth: days, employedDays: worked,
      present: c('PRESENT'), halfDays: c('HALF_DAY'), absent: c('ABSENT'), pieces: pieces?._sum.completedQuantity ?? 0, pieceAmount: pieces?._sum.amount ?? 0,
      overtimeAmount: overtime._sum.amount ?? 0, advanceDue: manual.advanceDeduction !== undefined ? openBalance : advanceDue, manual,
    });
    return { salary, figures, usesPieces };
  }

  private itemData(f: PayrollFigures) {
    return {
      basicAmount: f.basicAmount, presentDays: f.presentDays, absentDays: f.absentDays, completedPieces: f.completedPieces, pieceAmount: f.pieceAmount,
      overtimeAmount: f.overtimeAmount, incentives: f.incentives, bonus: f.bonus, absenceDeduction: f.absenceDeduction, advanceDeduction: f.advanceDeduction,
      otherDeductions: f.otherDeductions, grossAmount: f.grossAmount, netAmount: f.netAmount,
    };
  }

  private async refreshTotals(tx: PrismaTx, payrollId: string) {
    const agg = await tx.payrollItem.aggregate({
      where: { payrollId }, _sum: { grossAmount: true, netAmount: true, paidAmount: true, absenceDeduction: true, advanceDeduction: true, otherDeductions: true },
    });
    const s = agg._sum;
    const net = dec(s.netAmount);
    const paid = dec(s.paidAmount);
    const p = await tx.payroll.findUniqueOrThrow({ where: { id: payrollId } });
    let status = p.status;
    if (p.status !== 'DRAFT') status = paid.lte(0) ? 'APPROVED' : paid.gte(net) ? 'PAID' : 'PARTIALLY_PAID';
    await tx.payroll.update({
      where: { id: payrollId },
      data: { totalGross: dec(s.grossAmount), totalDeductions: dec(s.absenceDeduction).plus(dec(s.advanceDeduction)).plus(dec(s.otherDeductions)), totalNet: net, totalPaid: paid, status },
    });
  }

  private async postPayment(tx: PrismaTx, itemId: string, amount: Prisma.Decimal, method: SalaryPaymentDto['method'], paymentDate: string | undefined, reference: string | undefined, key: string, ctx: RequestContext) {
    await tx.$queryRaw`SELECT id FROM payroll_items WHERE id = ${itemId}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
    const item = await tx.payrollItem.findUniqueOrThrow({ where: { id: itemId }, include: { payroll: true, employee: { select: { code: true } } } });
    if (item.payroll.status === 'DRAFT') throw new BadRequestException('Approve the payroll before paying salaries');
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const due = dec(item.netAmount).minus(item.paidAmount);
    if (amount.gt(due)) throw new BadRequestException(`Only ${moneyString(due)} is left to pay`);
    const date = paymentDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Payment date cannot be in the future');
    const paymentNo = await this.sequences.next({ key: 'SALARY_PAYMENT', prefix: 'SAL', period: date.slice(0, 4), padding: 5 }, tx);
    await tx.salaryPayment.create({ data: { paymentNo, payrollItemId: itemId, employeeId: item.employeeId, paymentDate: asDate(date), amount, method, reference: reference || null, idempotencyKey: key, createdById: ctx.userId } });
    await tx.payrollItem.update({ where: { id: itemId }, data: { paidAmount: dec(item.paidAmount).plus(amount) } });
    await this.audit.log({ action: 'PAYMENT', module: 'payroll', recordId: item.payrollId, newValues: { paymentNo, employee: item.employee.code, amount: moneyString(amount), method } }, ctx, tx);
  }
}
