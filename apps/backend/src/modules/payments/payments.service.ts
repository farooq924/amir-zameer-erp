import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiMidnightUtc, karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { PostingService, asDate, dateOnly } from '../accounting/posting.service';
import { paymentState } from '../orders/order-math';
import { OutgoingQueryDto, PaymentQueryDto, RefundDto } from './dto/payment.dto';

function addDays(date: string, days: number) {
  const d = asDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}
/** Timestamp filter for a Karachi calendar date range. */
function instantRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: karachiMidnightUtc(from) } : {}), ...(to ? { lt: karachiMidnightUtc(addDays(to, 1)) } : {}) };
}

const paymentInclude = {
  customer: { select: { id: true, code: true, name: true, mobile: true } },
  order: { select: { id: true, orderNumber: true } },
  createdBy: { select: { id: true, fullName: true } },
  reversalOf: { select: { id: true, receiptNo: true } },
} satisfies Prisma.PaymentInclude;

/**
 * Money received from and returned to customers, plus read-only lists of money paid out
 * (supplier and salary payments) so the cashier sees every movement in one place.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly posting: PostingService,
  ) {}

  async list(q: PaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {};
    const kind = q.kind ?? 'ALL';
    if (kind === 'RECEIPT') where.type = { not: 'REFUND' };
    if (kind === 'REFUND') where.type = 'REFUND';
    if (q.status && q.status !== 'ALL') where.status = q.status as 'POSTED' | 'REVERSED';
    if (q.method) where.method = q.method as Prisma.EnumPaymentMethodFilter['equals'];
    if (q.customerId) where.customerId = q.customerId;
    const range = instantRange(q.from, q.to);
    if (range) where.paymentDate = range;
    if (q.search) {
      const s = q.search.trim();
      const digits = s.replace(/\D/g, '');
      where.OR = [
        { receiptNo: { contains: s, mode: 'insensitive' } }, { reference: { contains: s, mode: 'insensitive' } },
        { customer: { name: { contains: s, mode: 'insensitive' } } }, { customer: { code: { contains: s, mode: 'insensitive' } } },
        { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
        ...(digits.length >= 4 ? [{ customer: { mobile: { contains: digits.startsWith('0') ? digits.slice(1) : digits } } }] : []),
      ];
    }
    const [rows, total, received, refunded] = await Promise.all([
      this.prisma.payment.findMany({ where, include: paymentInclude, orderBy: { paymentDate: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: { AND: [where, { type: { not: 'REFUND' }, status: 'POSTED' }] }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { AND: [where, { type: 'REFUND', status: 'POSTED' }] }, _sum: { amount: true } }),
    ]);
    return {
      ...paginate(rows.map((p) => ({
        id: p.id, receiptNo: p.receiptNo, paymentDate: p.paymentDate, amount: moneyString(p.amount), method: p.method, type: p.type, status: p.status,
        reference: p.reference, notes: p.notes, customer: p.customer, order: p.order, createdBy: p.createdBy,
      })), total, q),
      totals: { received: moneyString(received._sum.amount), refunded: moneyString(refunded._sum.amount) },
    };
  }

  /** Today and this month: money in, money out, by method. */
  async summary() {
    const today = karachiToday();
    const monthStart = `${today.slice(0, 7)}-01`;
    const todayRange = instantRange(today, today)!;
    const monthRange = instantRange(monthStart, today)!;
    const monthDates = { gte: asDate(monthStart), lte: asDate(today) };
    const [todayIn, monthIn, monthRefund, byMethod, supplier, salary, expenses] = await Promise.all([
      this.prisma.payment.aggregate({ where: { status: 'POSTED', type: { not: 'REFUND' }, paymentDate: todayRange }, _sum: { amount: true }, _count: true }),
      this.prisma.payment.aggregate({ where: { status: 'POSTED', type: { not: 'REFUND' }, paymentDate: monthRange }, _sum: { amount: true }, _count: true }),
      this.prisma.payment.aggregate({ where: { status: 'POSTED', type: 'REFUND', paymentDate: monthRange }, _sum: { amount: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { status: 'POSTED', type: { not: 'REFUND' }, paymentDate: monthRange }, _sum: { amount: true } }),
      this.prisma.supplierPayment.aggregate({ where: { status: 'POSTED', paymentDate: monthDates }, _sum: { amount: true } }),
      this.prisma.salaryPayment.aggregate({ where: { status: 'POSTED', paymentDate: monthDates }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { status: 'APPROVED', deletedAt: null, expenseDate: monthDates }, _sum: { amount: true } }),
    ]);
    const moneyIn = dec(monthIn._sum.amount);
    const moneyOut = dec(monthRefund._sum.amount).plus(dec(supplier._sum.amount)).plus(dec(salary._sum.amount)).plus(dec(expenses._sum.amount));
    return {
      today: { received: moneyString(todayIn._sum.amount), receipts: todayIn._count },
      month: {
        received: moneyString(moneyIn), receipts: monthIn._count, refunded: moneyString(monthRefund._sum.amount), supplierPaid: moneyString(supplier._sum.amount),
        salariesPaid: moneyString(salary._sum.amount), expenses: moneyString(expenses._sum.amount), moneyOut: moneyString(moneyOut), net: moneyString(moneyIn.minus(moneyOut)),
      },
      byMethod: byMethod.map((m) => ({ method: m.method, amount: moneyString(m._sum.amount) })).sort((a, b) => Number(b.amount) - Number(a.amount)),
    };
  }

  /** Orders where the customer paid more than the order is now worth (cancelled or reduced) - money that can be refunded. */
  async refundable(search?: string) {
    const where: Prisma.OrderWhereInput = { deletedAt: null, paymentStatus: 'OVERPAID' };
    if (search?.trim()) {
      const s = search.trim();
      where.OR = [{ orderNumber: { contains: s, mode: 'insensitive' } }, { customer: { name: { contains: s, mode: 'insensitive' } } }, { customer: { mobile: { contains: s.replace(/\D/g, '').replace(/^0/, '') || s } } }];
    }
    const rows = await this.prisma.order.findMany({ where, include: { customer: { select: { id: true, code: true, name: true, mobile: true } } }, orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map((o) => {
      const effective = o.lifecycle === 'CANCELLED' ? dec(0) : dec(o.totalAmount).plus(o.adjustmentsTotal);
      return {
        id: o.id, orderNumber: o.orderNumber, lifecycle: o.lifecycle, customer: o.customer, effectiveTotal: moneyString(effective), paidAmount: moneyString(o.paidAmount),
        refundable: moneyString(dec(o.paidAmount).minus(effective)),
      };
    });
  }

  /** Gives money back to a customer from an overpaid or cancelled order. */
  async refund(dto: RefundDto, ctx: RequestContext) {
    const done = await this.prisma.payment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (done) {
      if (done.orderId !== dto.orderId) throw new ConflictException('This refund key was already used for another order');
      return this.present(done.id);
    }
    const amount = money(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const id = await this.prisma.$transaction(async (tx) => {
      const o = await this.lockOrder(tx, dto.orderId);
      const effective = o.lifecycle === 'CANCELLED' ? dec(0) : dec(o.totalAmount).plus(o.adjustmentsTotal);
      const credit = dec(o.paidAmount).minus(effective);
      if (credit.lte(0)) throw new BadRequestException('Nothing to refund: the customer has not paid more than this order is worth');
      if (amount.gt(credit)) throw new BadRequestException(`Only ${moneyString(credit)} can be refunded on this order`);
      const today = karachiToday();
      const receiptNo = await this.sequences.next({ key: 'REFUND', prefix: 'RFD', period: today.slice(0, 4), padding: 5 }, tx);
      const p = await tx.payment.create({
        data: {
          receiptNo, customerId: o.customerId, orderId: o.id, amount, method: dto.method, type: 'REFUND', reference: dto.reference || null,
          idempotencyKey: dto.idempotencyKey, notes: dto.reason, createdById: ctx.userId,
        },
      });
      const paid = dec(o.paidAmount).minus(amount);
      await tx.order.update({ where: { id: o.id }, data: { paidAmount: paid, ...paymentState(effective, paid), version: { increment: 1 } } });
      await tx.customerLedger.create({
        data: {
          customerId: o.customerId, entryDate: asDate(today), entryType: 'REFUND', referenceType: 'PAYMENT', referenceId: p.id,
          description: `Refund ${receiptNo} for ${o.orderNumber}: ${dto.reason}`, debit: amount,
        },
      });
      await this.audit.log({ action: 'REFUND', module: 'payments', recordId: o.id, newValues: { receiptNo, amount: moneyString(amount), method: dto.method, reason: dto.reason } }, ctx, tx);
      return p.id;
    });
    await this.posting.syncQuietly();
    return this.present(id);
  }

  /** Cancels a wrong receipt: the order owes the amount again and the books are reversed. */
  async reverse(id: string, reason: string, ctx: RequestContext) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Receipt not found');
    if (p.type === 'REFUND') throw new BadRequestException('Refunds cannot be reversed. Record a new payment instead.');
    if (p.status === 'REVERSED') throw new BadRequestException('This receipt is already reversed');
    if (!p.orderId) throw new BadRequestException('This receipt is not linked to an order');
    await this.prisma.$transaction(async (tx) => {
      const o = await this.lockOrder(tx, p.orderId!);
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== 'POSTED') throw new BadRequestException('This receipt is already reversed');
      await tx.payment.update({ where: { id }, data: { status: 'REVERSED', notes: [fresh.notes, `Reversed: ${reason}`].filter(Boolean).join('\n') } });
      const effective = o.lifecycle === 'CANCELLED' ? dec(0) : dec(o.totalAmount).plus(o.adjustmentsTotal);
      const paid = dec(o.paidAmount).minus(p.amount);
      if (paid.lt(0)) throw new BadRequestException('Part of this money was already refunded, so the receipt cannot be reversed');
      await tx.order.update({ where: { id: o.id }, data: { paidAmount: paid, ...paymentState(effective, paid), version: { increment: 1 } } });
      await tx.customerLedger.create({
        data: {
          customerId: p.customerId, entryDate: asDate(karachiToday()), entryType: 'REVERSAL', referenceType: 'PAYMENT', referenceId: p.id,
          description: `Receipt ${p.receiptNo} reversed: ${reason}`, debit: p.amount,
        },
      });
      await this.audit.log({ action: 'REVERSE', module: 'payments', recordId: o.id, newValues: { receiptNo: p.receiptNo, amount: moneyString(p.amount), reason } }, ctx, tx);
    });
    await this.posting.syncQuietly();
    return this.present(id);
  }

  async present(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: paymentInclude });
    if (!p) throw new NotFoundException('Receipt not found');
    return {
      id: p.id, receiptNo: p.receiptNo, paymentDate: p.paymentDate, amount: moneyString(p.amount), method: p.method, type: p.type, status: p.status,
      reference: p.reference, notes: p.notes, customer: p.customer, order: p.order, createdBy: p.createdBy,
    };
  }

  async supplierPayments(q: OutgoingQueryDto) {
    const where: Prisma.SupplierPaymentWhereInput = {};
    if (q.from || q.to) where.paymentDate = { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) };
    if (q.search) {
      const s = q.search.trim();
      where.OR = [{ paymentNo: { contains: s, mode: 'insensitive' } }, { reference: { contains: s, mode: 'insensitive' } }, { supplier: { name: { contains: s, mode: 'insensitive' } } }];
    }
    const [rows, total, sum] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where, include: { supplier: { select: { id: true, code: true, name: true } }, purchase: { select: { id: true, purchaseNo: true } } },
        orderBy: [{ paymentDate: q.sortOrder }, { createdAt: q.sortOrder }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.prisma.supplierPayment.count({ where }),
      this.prisma.supplierPayment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      ...paginate(rows.map((p) => ({
        id: p.id, paymentNo: p.paymentNo, paymentDate: dateOnly(p.paymentDate), amount: moneyString(p.amount), method: p.method, reference: p.reference,
        supplier: p.supplier, purchase: p.purchase, status: p.status,
      })), total, q),
      totalAmount: moneyString(sum._sum.amount),
    };
  }

  async salaryPayments(q: OutgoingQueryDto) {
    const where: Prisma.SalaryPaymentWhereInput = {};
    if (q.from || q.to) where.paymentDate = { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) };
    if (q.search) {
      const s = q.search.trim();
      where.OR = [{ paymentNo: { contains: s, mode: 'insensitive' } }, { employee: { name: { contains: s, mode: 'insensitive' } } }, { employee: { code: { contains: s, mode: 'insensitive' } } }];
    }
    const [rows, total, sum] = await Promise.all([
      this.prisma.salaryPayment.findMany({
        where, include: { employee: { select: { id: true, code: true, name: true } }, payrollItem: { select: { periodKey: true, payrollId: true } } },
        orderBy: [{ paymentDate: q.sortOrder }, { createdAt: q.sortOrder }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.prisma.salaryPayment.count({ where }),
      this.prisma.salaryPayment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      ...paginate(rows.map((p) => ({
        id: p.id, paymentNo: p.paymentNo, paymentDate: dateOnly(p.paymentDate), amount: moneyString(p.amount), method: p.method, reference: p.reference,
        employee: p.employee, periodKey: p.payrollItem.periodKey, payrollId: p.payrollItem.payrollId,
      })), total, q),
      totalAmount: moneyString(sum._sum.amount),
    };
  }

  private async lockOrder(tx: PrismaTx, id: string) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    const o = await tx.order.findFirst({ where: { id, deletedAt: null } });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }
}
