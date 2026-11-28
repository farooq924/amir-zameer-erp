import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { byCompany } from '../../common/tenant';
import { Prisma } from '@prisma/client';
import { LEAVE_TYPES, monthBounds } from '@az/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { asDate, assertMonthOpen, dateList, dateOnly } from '../employees/hr-utils';
import { LeaveDto, ListQueryDto, OvertimeDto, SaveAttendanceDto } from './dto/attendance.dto';

const LEAVE_LABEL: Record<string, string> = Object.fromEntries(LEAVE_TYPES.map((l) => [l.key, l.label]));
const SHORT: Record<string, string> = { PRESENT: 'P', ABSENT: 'A', HALF_DAY: 'H', LEAVE: 'L', HOLIDAY: 'O' };

/** Employees who were on the job at some point between two dates. */
export function employedBetween(from: string, to: string): Prisma.EmployeeWhereInput {
  return {
    deletedAt: null,
    joiningDate: { lte: asDate(to) },
    OR: [{ leavingDate: null }, { leavingDate: { gte: asDate(from) } }],
    NOT: { status: 'INACTIVE', leavingDate: null },
  };
}

const timeOf = (d: Date | null) => (d ? new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(11, 16) : null);
const atTime = (date: string, time?: string) => (time ? new Date(`${date}T${time}:00+05:00`) : null);

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async daily(date = karachiToday()) {
    const [employees, marks, lock] = await Promise.all([
      this.prisma.employee.findMany({ where: employedBetween(date, date), orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, designation: true, employeeType: true, status: true } }),
      this.prisma.attendance.findMany({ where: { date: asDate(date) } }),
      this.lockedPeriod(date.slice(0, 7)),
    ]);
    const map = new Map(marks.map((m) => [m.employeeId, m]));
    const rows = employees.map((e) => {
      const m = map.get(e.id);
      return {
        employee: e,
        attendance: m ? { id: m.id, status: m.status, checkIn: timeOf(m.checkIn), checkOut: timeOf(m.checkOut), lateMinutes: m.lateMinutes, notes: m.notes } : null,
      };
    });
    const count = (s: string) => marks.filter((m) => m.status === s).length;
    return {
      date, locked: lock, isFuture: date > karachiToday(), rows,
      totals: { employees: employees.length, marked: marks.length, present: count('PRESENT'), halfDay: count('HALF_DAY'), absent: count('ABSENT'), leave: count('LEAVE'), holiday: count('HOLIDAY') },
    };
  }

  async save(dto: SaveAttendanceDto, ctx: RequestContext) {
    if (dto.date > karachiToday()) throw new BadRequestException('Attendance cannot be marked for a future date');
    await assertMonthOpen(this.prisma, [dto.date]);
    const ids = [...new Set(dto.entries.map((e) => e.employeeId))];
    if (ids.length !== dto.entries.length) throw new BadRequestException('Each employee can appear only once');
    const employees = await this.prisma.employee.findMany({ where: { id: { in: ids }, ...employedBetween(dto.date, dto.date) }, select: { id: true } });
    if (employees.length !== ids.length) throw new BadRequestException('Some employees were not working on this date (check joining / leaving dates)');
    for (const e of dto.entries) {
      if (e.checkIn && e.checkOut && e.checkOut < e.checkIn) throw new BadRequestException('Check-out time must be after check-in time');
    }
    let saved = 0;
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const e of dto.entries) {
        const where = { employeeId_date: { employeeId: e.employeeId, date: asDate(dto.date) } };
        if (e.status === 'NONE') {
          const del = await tx.attendance.deleteMany({ where: { employeeId: e.employeeId, date: asDate(dto.date) } });
          cleared += del.count;
          continue;
        }
        const data = {
          status: e.status, checkIn: atTime(dto.date, e.checkIn), checkOut: atTime(dto.date, e.checkOut),
          lateMinutes: e.lateMinutes ?? 0, isLate: (e.lateMinutes ?? 0) > 0, notes: e.notes || null,
        };
        await tx.attendance.upsert({ where, create: { ...data, employeeId: e.employeeId, date: asDate(dto.date), createdById: ctx.userId }, update: { ...data, version: { increment: 1 } } });
        saved += 1;
      }
      await this.audit.log({ action: 'UPDATE', module: 'attendance', recordId: null, newValues: { date: dto.date, saved, cleared } }, ctx, tx);
    });
    return this.daily(dto.date);
  }

  async monthly(month = karachiToday().slice(0, 7)) {
    const { start, end, days } = monthBounds(month);
    const [employees, marks, lock] = await Promise.all([
      this.prisma.employee.findMany({ where: employedBetween(start, end), orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, designation: true, joiningDate: true, leavingDate: true } }),
      this.prisma.attendance.findMany({ where: { date: { gte: asDate(start), lte: asDate(end) } }, select: { employeeId: true, date: true, status: true } }),
      this.lockedPeriod(month),
    ]);
    const byEmp = new Map<string, Record<string, string>>();
    for (const m of marks) {
      const rec = byEmp.get(m.employeeId) ?? {};
      rec[dateOnly(m.date)!.slice(8, 10)] = SHORT[m.status];
      byEmp.set(m.employeeId, rec);
    }
    return {
      month, start, end, days, locked: lock,
      rows: employees.map((e) => {
        const marksFor = byEmp.get(e.id) ?? {};
        const vals = Object.values(marksFor);
        const c = (s: string) => vals.filter((v) => v === s).length;
        return {
          employee: { id: e.id, code: e.code, name: e.name, designation: e.designation },
          joiningDate: dateOnly(e.joiningDate), leavingDate: dateOnly(e.leavingDate), marks: marksFor,
          totals: { present: c('P'), halfDay: c('H'), absent: c('A'), leave: c('L'), holiday: c('O') },
        };
      }),
    };
  }

  // ---------------------------------------------------------------- leave

  async leaves(q: ListQueryDto) {
    const where: Prisma.LeaveRecordWhereInput = {};
    if (q.status && q.status !== 'ALL') where.status = q.status as 'PENDING';
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.month) {
      const { start, end } = monthBounds(q.month);
      where.fromDate = { lte: asDate(end) };
      where.toDate = { gte: asDate(start) };
    }
    const rows = await this.prisma.leaveRecord.findMany({ where, orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }], take: 300, include: { employee: { select: { id: true, code: true, name: true } } } });
    return rows.map((l) => ({
      id: l.id, employee: l.employee, leaveType: l.leaveType, fromDate: dateOnly(l.fromDate), toDate: dateOnly(l.toDate), days: dec(l.days).toString(),
      reason: l.reason, status: l.status, approvedAt: l.approvedAt, createdAt: l.createdAt,
    }));
  }

  async createLeave(dto: LeaveDto, ctx: RequestContext) {
    if (dto.toDate < dto.fromDate) throw new BadRequestException('"To" date must be on or after the "from" date');
    const days = dateList(dto.fromDate, dto.toDate).length;
    if (days > 90) throw new BadRequestException('One leave can be at most 90 days');
    const e = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, ...employedBetween(dto.fromDate, dto.toDate) } });
    if (!e) throw new BadRequestException('Select an employee who works in these dates');
    const overlap = await this.prisma.leaveRecord.findFirst({
      where: { employeeId: dto.employeeId, status: { not: 'REJECTED' }, fromDate: { lte: asDate(dto.toDate) }, toDate: { gte: asDate(dto.fromDate) } },
    });
    if (overlap) throw new BadRequestException(`${e.name} already has leave from ${dateOnly(overlap.fromDate)} to ${dateOnly(overlap.toDate)}`);
    const l = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.leaveRecord.create({ data: { employeeId: dto.employeeId, leaveType: dto.leaveType, fromDate: asDate(dto.fromDate), toDate: asDate(dto.toDate), days, reason: dto.reason || null } });
      await this.audit.log({ action: 'CREATE', module: 'attendance', recordId: rec.id, newValues: { leave: dto.leaveType, employee: e.code, fromDate: dto.fromDate, toDate: dto.toDate } }, ctx, tx);
      return rec;
    });
    return { id: l.id };
  }

  /** Approving marks each leave day in attendance (unpaid leave is marked absent so salary is deducted). */
  async decideLeave(id: string, approve: boolean, ctx: RequestContext) {
    const l = await this.prisma.leaveRecord.findUnique({ where: { id }, include: { employee: true } });
    if (!l) throw new NotFoundException('Leave not found');
    if (l.status !== 'PENDING') throw new BadRequestException(`This leave is already ${l.status.toLowerCase()}`);
    const from = dateOnly(l.fromDate)!;
    const to = dateOnly(l.toDate)!;
    const joining = dateOnly(l.employee.joiningDate)!;
    const leaving = dateOnly(l.employee.leavingDate);
    const days = dateList(from, to).filter((d) => d >= joining && (!leaving || d <= leaving));
    if (approve) await assertMonthOpen(this.prisma, days, 'attendance');
    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRecord.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: ctx.userId, approvedAt: new Date() } });
      if (approve) {
        const status = l.leaveType === 'UNPAID' ? 'ABSENT' : 'LEAVE';
        const notes = LEAVE_LABEL[l.leaveType];
        for (const d of days) {
          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: l.employeeId, date: asDate(d) } },
            create: { employeeId: l.employeeId, date: asDate(d), status, notes, createdById: ctx.userId },
            update: { status, notes, checkIn: null, checkOut: null, lateMinutes: 0, isLate: false, version: { increment: 1 } },
          });
        }
      }
      await this.audit.log({ action: approve ? 'APPROVE' : 'REJECT', module: 'attendance', recordId: id, newValues: { leave: l.leaveType, employee: l.employee.code, from, to } }, ctx, tx);
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------- overtime

  async overtime(q: ListQueryDto) {
    const where: Prisma.OvertimeRecordWhereInput = {};
    if (q.status && q.status !== 'ALL') where.status = q.status as 'PENDING';
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.month) {
      const { start, end } = monthBounds(q.month);
      where.date = { gte: asDate(start), lte: asDate(end) };
    }
    const rows = await this.prisma.overtimeRecord.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 300, include: { employee: { select: { id: true, code: true, name: true } } } });
    return rows.map((o) => ({
      id: o.id, employee: o.employee, date: dateOnly(o.date), hours: dec(o.hours).toFixed(2), ratePerHour: moneyString(o.ratePerHour), amount: moneyString(o.amount),
      status: o.status, paid: !!o.payrollItemId, notes: o.notes,
    }));
  }

  async createOvertime(dto: OvertimeDto, ctx: RequestContext) {
    if (dto.date > karachiToday()) throw new BadRequestException('Overtime cannot be for a future date');
    const hours = dec(dto.hours);
    if (hours.lte(0) || hours.gt(16)) throw new BadRequestException('Hours must be between 0.25 and 16');
    await assertMonthOpen(this.prisma, [dto.date], 'overtime');
    const e = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, ...employedBetween(dto.date, dto.date) }, include: { salaryStructures: { where: { isCurrent: true }, take: 1 } } });
    if (!e) throw new BadRequestException('Select an employee who worked on this date');
    const rate = money(dto.ratePerHour ?? e.salaryStructures[0]?.overtimeRatePerHour ?? 0);
    if (rate.lte(0)) throw new BadRequestException(`Enter the overtime rate (no rate is set in ${e.name}'s salary)`);
    const o = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.overtimeRecord.create({
        data: { employeeId: e.id, date: asDate(dto.date), hours, ratePerHour: rate, amount: money(hours.times(rate)), notes: dto.notes || null, createdById: ctx.userId },
      });
      await this.audit.log({ action: 'CREATE', module: 'attendance', recordId: rec.id, newValues: { overtime: hours.toString(), employee: e.code, date: dto.date, amount: moneyString(rec.amount) } }, ctx, tx);
      return rec;
    });
    return { id: o.id, amount: moneyString(o.amount) };
  }

  async decideOvertime(id: string, approve: boolean, ctx: RequestContext) {
    const o = await this.prisma.overtimeRecord.findUnique({ where: { id }, include: { employee: { select: { code: true } } } });
    if (!o) throw new NotFoundException('Overtime not found');
    if (o.status !== 'PENDING') throw new BadRequestException(`This overtime is already ${o.status.toLowerCase()}`);
    await assertMonthOpen(this.prisma, [dateOnly(o.date)!], 'overtime');
    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeRecord.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED' } });
      await this.audit.log({ action: approve ? 'APPROVE' : 'REJECT', module: 'attendance', recordId: id, newValues: { overtime: dec(o.hours).toString(), employee: o.employee.code } }, ctx, tx);
    });
    return { ok: true };
  }

  private async lockedPeriod(periodKey: string) {
    const p = await this.prisma.payroll.findUnique({ where: { companyId_periodKey: byCompany({ periodKey }) }, select: { status: true } });
    return !!p && p.status !== 'DRAFT' && p.status !== 'CANCELLED';
  }
}
