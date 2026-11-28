import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '../../common/tenant';
import { Prisma } from '@prisma/client';
import { monthBounds } from '@az/shared';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { employedBetween } from '../attendance/attendance.service';
import { asDate, assertMonthOpen, dateOnly } from '../employees/hr-utils';
import { ProductionDto, ProductionQueryDto } from './dto/production.dto';

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: ProductionQueryDto) {
    const where: Prisma.ProductionRecordWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.month) {
      const { start, end } = monthBounds(q.month);
      where.workDate = { gte: asDate(start), lte: asDate(end) };
    }
    if (q.paid === 'PAID') where.payrollItemId = { not: null };
    if (q.paid === 'UNPAID') where.payrollItemId = null;
    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { orderItem: { order: { orderNumber: { contains: s, mode: 'insensitive' } } } },
        { orderItem: { garmentName: { contains: s, mode: 'insensitive' } } },
        { employee: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }
    const [rows, total, agg] = await this.prisma.$transaction([
      this.prisma.productionRecord.findMany({
        where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          employee: { select: { id: true, code: true, name: true } }, assignment: { select: { taskType: true } },
          orderItem: { select: { garmentName: true, quantity: true, order: { select: { id: true, orderNumber: true, customer: { select: { name: true } } } } } },
        },
      }),
      this.prisma.productionRecord.count({ where }),
      this.prisma.productionRecord.aggregate({ where, _sum: { completedQuantity: true, amount: true } }),
    ]);
    const page = paginate(rows.map((p) => ({
      id: p.id, workDate: dateOnly(p.workDate), employee: p.employee, taskType: p.assignment.taskType,
      orderId: p.orderItem.order.id, orderNumber: p.orderItem.order.orderNumber, customerName: p.orderItem.order.customer.name, garmentName: p.orderItem.garmentName,
      quantity: p.completedQuantity, pieceRate: moneyString(p.pieceRate), amount: moneyString(p.amount), paid: !!p.payrollItemId, notes: p.notes, createdAt: p.createdAt,
    })), total, q);
    return { ...page, totals: { pieces: agg._sum.completedQuantity ?? 0, amount: moneyString(agg._sum.amount) } };
  }

  /** Order items for the "record work" picker, by order number or customer. */
  async lookup(search: string) {
    const s = search.trim();
    const digits = s.replace(/\D/g, '');
    const orders = await this.prisma.order.findMany({
      where: {
        lifecycle: { not: 'CANCELLED' },
        OR: [
          { orderNumber: { contains: s, mode: 'insensitive' } }, { customer: { name: { contains: s, mode: 'insensitive' } } },
          ...(digits.length >= 4 ? [{ customer: { mobile: { contains: digits.startsWith('0') ? digits.slice(1) : digits } } }] : []),
        ],
      },
      orderBy: { orderDate: 'desc' }, take: 10,
      include: {
        customer: { select: { name: true } },
        items: { orderBy: { lineNo: 'asc' }, include: { garmentType: { select: { defaultPieceRate: true } }, productionRecords: { select: { completedQuantity: true, assignment: { select: { taskType: true } } } } } },
      },
    });
    return orders.map((o) => ({
      id: o.id, orderNumber: o.orderNumber, customerName: o.customer.name, lifecycle: o.lifecycle,
      items: o.items.map((i) => {
        const done: Record<string, number> = {};
        for (const p of i.productionRecords) done[p.assignment.taskType] = (done[p.assignment.taskType] ?? 0) + p.completedQuantity;
        return { id: i.id, lineNo: i.lineNo, garmentName: i.garmentName, quantity: i.quantity, pieceRate: moneyString(i.garmentType?.defaultPieceRate), done };
      }),
    }));
  }

  async create(dto: ProductionDto, ctx: RequestContext) {
    const date = dto.workDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Work date cannot be in the future');
    await assertMonthOpen(this.prisma, [date], 'production');
    const e = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, ...employedBetween(date, date) }, include: { salaryStructures: { where: { isCurrent: true }, take: 1 } } });
    if (!e) throw new BadRequestException('Select an employee who worked on this date');
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM order_items WHERE id = ${dto.orderItemId}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
      const item = await tx.orderItem.findUnique({ where: { id: dto.orderItemId }, include: { order: { select: { orderNumber: true, lifecycle: true } }, garmentType: { select: { defaultPieceRate: true } } } });
      if (!item) throw new NotFoundException('Order item not found');
      if (item.order.lifecycle === 'CANCELLED') throw new BadRequestException('This order is cancelled');
      const already = await tx.productionRecord.aggregate({ where: { orderItemId: item.id, assignment: { taskType: dto.taskType } }, _sum: { completedQuantity: true } });
      const done = already._sum.completedQuantity ?? 0;
      if (done + dto.quantity > item.quantity) {
        throw new BadRequestException(`${item.garmentName} on ${item.order.orderNumber} has ${item.quantity} piece(s); ${done} already recorded for ${dto.taskType.toLowerCase()}`);
      }
      const garmentRate = dec(item.garmentType?.defaultPieceRate);
      const rate = money(dto.pieceRate ?? (garmentRate.gt(0) ? garmentRate : e.salaryStructures[0]?.perPieceRate ?? 0));
      let assignment = await tx.employeeAssignment.findFirst({ where: { orderItemId: item.id, employeeId: e.id, taskType: dto.taskType } });
      if (!assignment) {
        assignment = await tx.employeeAssignment.create({ data: { orderItemId: item.id, employeeId: e.id, taskType: dto.taskType, assignedQuantity: dto.quantity, pieceRate: rate, assignedById: ctx.userId } });
      } else {
        await tx.employeeAssignment.update({ where: { id: assignment.id }, data: { assignedQuantity: { increment: dto.quantity } } });
      }
      const mine = await tx.productionRecord.aggregate({ where: { assignmentId: assignment.id }, _sum: { completedQuantity: true } });
      const rec = await tx.productionRecord.create({
        data: {
          assignmentId: assignment.id, employeeId: e.id, orderItemId: item.id, workDate: asDate(date), completedAt: new Date(), completedQuantity: dto.quantity,
          pieceRate: rate, amount: money(rate.times(dto.quantity)), notes: dto.notes || null, createdById: ctx.userId,
        },
      });
      const total = (mine._sum.completedQuantity ?? 0) + dto.quantity;
      await tx.employeeAssignment.update({ where: { id: assignment.id }, data: { status: total >= assignment.assignedQuantity ? 'COMPLETED' : 'IN_PROGRESS' } });
      await this.audit.log({ action: 'CREATE', module: 'production', recordId: rec.id, newValues: { employee: e.code, order: item.order.orderNumber, garment: item.garmentName, task: dto.taskType, quantity: dto.quantity, amount: moneyString(rec.amount) } }, ctx, tx);
      return rec.id;
    });
    return { id };
  }

  /** Mistakes can be removed until the work is paid in a payroll. */
  async remove(id: string, ctx: RequestContext) {
    const p = await this.prisma.productionRecord.findUnique({ where: { id }, include: { employee: { select: { code: true } } } });
    if (!p) throw new NotFoundException('Work record not found');
    if (p.payrollItemId) throw new BadRequestException('This work is already in an approved payroll and cannot be removed');
    await assertMonthOpen(this.prisma, [dateOnly(p.workDate)!], 'production');
    await this.prisma.$transaction(async (tx) => {
      await tx.productionRecord.delete({ where: { id } });
      const a = await tx.employeeAssignment.findUniqueOrThrow({ where: { id: p.assignmentId } });
      const left = Math.max(a.assignedQuantity - p.completedQuantity, 0);
      if (left === 0) await tx.employeeAssignment.delete({ where: { id: a.id } });
      else await tx.employeeAssignment.update({ where: { id: a.id }, data: { assignedQuantity: left, status: 'IN_PROGRESS' } });
      await this.audit.log({ action: 'DELETE', module: 'production', recordId: id, oldValues: { employee: p.employee.code, quantity: p.completedQuantity, amount: moneyString(p.amount) } }, ctx, tx);
    });
    return { ok: true };
  }
}
