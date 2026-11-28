import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '../../common/tenant';
import { Prisma, Supplier } from '@prisma/client';
import { normalizePhone } from '@az/shared';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { SettingsService } from '../settings/settings.service';
import { CreateSupplierDto, SupplierPaymentDto, SupplierQueryDto, UpdateSupplierDto } from './dto/supplier.dto';

const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export interface SupplierPaymentInput {
  amount: string;
  method: SupplierPaymentDto['method'];
  purchaseId?: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

function presentSupplier(s: Supplier, balance: Prisma.Decimal) {
  return {
    id: s.id, code: s.code, name: s.name, contactNumber: s.contactNumber, whatsapp: s.whatsapp, address: s.address, city: s.city,
    notes: s.notes, status: s.status, openingBalance: moneyString(s.openingBalance), balance: moneyString(balance), version: s.version,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
  ) {}

  /** What we owe each supplier = credits (purchases, opening) - debits (payments, returns). */
  private async balances(ids: string[]) {
    if (!ids.length) return new Map<string, Prisma.Decimal>();
    const rows = await this.prisma.supplierLedger.groupBy({ by: ['supplierId'], where: { supplierId: { in: ids } }, _sum: { debit: true, credit: true } });
    return new Map(rows.map((r) => [r.supplierId, dec(r._sum.credit).minus(dec(r._sum.debit))]));
  }

  async list(q: SupplierQueryDto) {
    const where: Prisma.SupplierWhereInput = { deletedAt: null };
    const status = q.status ?? 'ACTIVE';
    if (status !== 'ALL') where.status = status;
    if (q.search) {
      const s = q.search.trim();
      const digits = s.replace(/\D/g, '');
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }, { city: { contains: s, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ contactNumber: { contains: digits.startsWith('0') ? digits.slice(1) : digits } }] : []),
      ];
    }
    if (q.payable === 'true') {
      const owing = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "supplierId" AS id FROM supplier_ledger WHERE "companyId" = ${Tenant.require()}::uuid GROUP BY "supplierId" HAVING SUM(credit) - SUM(debit) > 0`;
      where.id = { in: owing.map((o) => o.id) };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ name: 'asc' }] }),
      this.prisma.supplier.count({ where }),
    ]);
    const bal = await this.balances(rows.map((r) => r.id));
    const fabricCounts = await this.prisma.fabric.groupBy({ by: ['supplierId'], where: { supplierId: { in: rows.map((r) => r.id) }, deletedAt: null }, _count: { _all: true } });
    const fc = new Map(fabricCounts.map((f) => [f.supplierId, f._count._all]));
    return paginate(rows.map((r) => ({ ...presentSupplier(r, bal.get(r.id) ?? dec(0)), fabrics: fc.get(r.id) ?? 0 })), total, q);
  }

  /** Light list for the purchase form. */
  async options() {
    const rows = await this.prisma.supplier.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, city: true } });
    return rows;
  }

  async totals() {
    const [agg] = await this.prisma.$queryRaw<{ payable: Prisma.Decimal | null; owing: bigint }[]>`
      SELECT COALESCE(SUM(b), 0) AS payable, COUNT(*) FILTER (WHERE b > 0)::bigint AS owing
      FROM (SELECT SUM(credit) - SUM(debit) AS b FROM supplier_ledger WHERE "companyId" = ${Tenant.require()}::uuid GROUP BY "supplierId") t WHERE b > 0`;
    const active = await this.prisma.supplier.count({ where: { deletedAt: null, status: 'ACTIVE' } });
    return { activeSuppliers: active, totalPayable: moneyString(agg?.payable), suppliersOwed: Number(agg?.owing ?? 0) };
  }

  async get(id: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw new NotFoundException('Supplier not found');
    const bal = (await this.balances([id])).get(id) ?? dec(0);
    const [purchases, payments, fabrics, purchaseAgg] = await Promise.all([
      this.prisma.purchase.findMany({ where: { supplierId: id }, orderBy: [{ purchaseDate: 'desc' }, { purchaseNo: 'desc' }], take: 20, include: { _count: { select: { items: true } } } }),
      this.prisma.supplierPayment.findMany({ where: { supplierId: id }, orderBy: [{ paymentDate: 'desc' }, { paymentNo: 'desc' }], take: 20, include: { purchase: { select: { purchaseNo: true } } } }),
      this.prisma.fabric.findMany({ where: { supplierId: id, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, unit: true, currentStock: true } }),
      this.prisma.purchase.aggregate({ where: { supplierId: id, status: 'POSTED' }, _sum: { totalAmount: true }, _count: { _all: true } }),
    ]);
    return {
      ...presentSupplier(s, bal),
      totalPurchased: moneyString(purchaseAgg._sum.totalAmount), purchaseCount: purchaseAgg._count._all,
      purchases: purchases.map((p) => ({
        id: p.id, purchaseNo: p.purchaseNo, purchaseDate: dateOnly(p.purchaseDate), supplierInvoiceNo: p.supplierInvoiceNo, items: p._count.items,
        totalAmount: moneyString(p.totalAmount), paidAmount: moneyString(p.paidAmount), balanceAmount: moneyString(p.balanceAmount), status: p.status,
      })),
      payments: payments.map((p) => ({
        id: p.id, paymentNo: p.paymentNo, paymentDate: dateOnly(p.paymentDate), amount: moneyString(p.amount), method: p.method,
        reference: p.reference, purchaseNo: p.purchase?.purchaseNo ?? null, notes: p.notes,
      })),
      fabrics: fabrics.map((f) => ({ id: f.id, code: f.code, name: f.name, unit: f.unit, currentStock: dec(f.currentStock).toFixed(3) })),
    };
  }

  async create(dto: CreateSupplierDto, ctx: RequestContext) {
    await this.assertUniqueName(dto.name);
    const numbering = await this.settings.getGroup('numbering');
    const prefix = String(numbering.supplierPrefix ?? 'AZS');
    const opening = money(dto.openingBalance);
    const id = await this.prisma.$transaction(async (tx) => {
      const code = await this.sequences.next({ key: 'SUPPLIER', prefix, padding: 4 }, tx);
      const s = await tx.supplier.create({
        data: {
          code, name: dto.name, contactNumber: this.phone(dto.contactNumber), whatsapp: this.phone(dto.whatsapp), address: dto.address ?? null,
          city: dto.city ?? null, notes: dto.notes ?? null, openingBalance: opening,
        },
      });
      if (opening.gt(0)) {
        await tx.supplierLedger.create({
          data: { supplierId: s.id, entryDate: asDate(karachiToday()), entryType: 'OPENING', referenceType: 'SUPPLIER', referenceId: s.id, description: 'Opening balance', credit: opening },
        });
      }
      await this.audit.log({ action: 'CREATE', module: 'suppliers', recordId: s.id, newValues: { code, name: s.name, openingBalance: moneyString(opening) } }, ctx, tx);
      return s.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateSupplierDto, ctx: RequestContext) {
    const before = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Supplier not found');
    if (dto.name && dto.name.toLowerCase() !== before.name.toLowerCase()) await this.assertUniqueName(dto.name, id);
    const after = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name, contactNumber: dto.contactNumber === undefined ? undefined : this.phone(dto.contactNumber),
        whatsapp: dto.whatsapp === undefined ? undefined : this.phone(dto.whatsapp), address: dto.address, city: dto.city, notes: dto.notes,
        status: dto.status, version: { increment: 1 },
      },
    });
    await this.audit.log({ action: 'UPDATE', module: 'suppliers', recordId: id, oldValues: { name: before.name, status: before.status }, newValues: { name: after.name, status: after.status } }, ctx);
    return this.get(id);
  }

  async ledger(id: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw new NotFoundException('Supplier not found');
    const rows = await this.prisma.supplierLedger.findMany({ where: { supplierId: id }, orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }] });
    let balance = dec(0);
    const entries = rows.map((r) => {
      balance = balance.plus(r.credit).minus(r.debit);
      return {
        id: r.id, date: dateOnly(r.entryDate), entryType: r.entryType, description: r.description, referenceType: r.referenceType, referenceId: r.referenceId,
        debit: moneyString(r.debit), credit: moneyString(r.credit), balance: moneyString(balance),
      };
    });
    const totals = rows.reduce((a, r) => ({ debit: a.debit.plus(r.debit), credit: a.credit.plus(r.credit) }), { debit: dec(0), credit: dec(0) });
    return {
      supplier: { id: s.id, code: s.code, name: s.name },
      entries,
      totals: { debit: moneyString(totals.debit), credit: moneyString(totals.credit), balance: moneyString(balance) },
    };
  }

  async recordPayment(id: string, dto: SupplierPaymentDto, ctx: RequestContext) {
    const existing = await this.prisma.supplierPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.supplierId !== id) throw new ConflictException('This payment key was already used for another supplier');
      return this.get(id);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.postPayment(tx, id, dto, dto.idempotencyKey, ctx);
    });
    return this.get(id);
  }

  /**
   * Pays a supplier: payment number, ledger debit, and the amount is applied to one purchase
   * (when given) or to the oldest unpaid purchases first. Call inside a transaction.
   */
  async postPayment(tx: PrismaTx, supplierId: string, input: SupplierPaymentInput, idempotencyKey: string, ctx: RequestContext) {
    await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${supplierId}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
    const s = await tx.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
    if (!s) throw new NotFoundException('Supplier not found');
    const amount = money(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const date = input.paymentDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Payment date cannot be in the future');
    let left = amount;
    const apply: { id: string; amount: Prisma.Decimal }[] = [];
    if (input.purchaseId) {
      const p = await tx.purchase.findFirst({ where: { id: input.purchaseId, supplierId } });
      if (!p) throw new BadRequestException('The purchase does not belong to this supplier');
      if (p.status !== 'POSTED') throw new BadRequestException('This purchase is cancelled');
      if (amount.gt(p.balanceAmount)) throw new BadRequestException(`Amount is more than the purchase balance of ${moneyString(p.balanceAmount)}`);
      apply.push({ id: p.id, amount });
      left = dec(0);
    } else {
      const open = await tx.purchase.findMany({ where: { supplierId, status: 'POSTED', balanceAmount: { gt: 0 } }, orderBy: [{ purchaseDate: 'asc' }, { purchaseNo: 'asc' }] });
      for (const p of open) {
        if (left.lte(0)) break;
        const part = Prisma.Decimal.min(left, p.balanceAmount);
        apply.push({ id: p.id, amount: part });
        left = left.minus(part);
      }
    }
    for (const a of apply) {
      const p = await tx.purchase.findUniqueOrThrow({ where: { id: a.id } });
      await tx.purchase.update({ where: { id: a.id }, data: { paidAmount: dec(p.paidAmount).plus(a.amount), balanceAmount: dec(p.balanceAmount).minus(a.amount) } });
    }
    const paymentNo = await this.sequences.next({ key: 'SUPPLIER_PAYMENT', prefix: 'SPY', period: date.slice(0, 4), padding: 5 }, tx);
    const pay = await tx.supplierPayment.create({
      data: {
        paymentNo, supplierId, purchaseId: input.purchaseId ?? (apply.length === 1 && left.eq(0) ? apply[0].id : null), paymentDate: asDate(date), amount,
        method: input.method, reference: input.reference || null, idempotencyKey, notes: input.notes || null, createdById: ctx.userId,
      },
    });
    await tx.supplierLedger.create({
      data: {
        supplierId, entryDate: asDate(date), entryType: 'SUPPLIER_PAYMENT', referenceType: 'SUPPLIER_PAYMENT', referenceId: pay.id,
        description: `Payment ${paymentNo}${input.reference ? ` (${input.reference})` : ''}`, debit: amount,
      },
    });
    await this.audit.log({ action: 'PAYMENT', module: 'suppliers', recordId: supplierId, newValues: { paymentNo, amount: moneyString(amount), method: input.method, advance: moneyString(left) } }, ctx, tx);
    return pay;
  }

  private phone(v: string | null | undefined): string | null {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) throw new BadRequestException('Enter a valid phone number, e.g. 0300-1234567');
    return n;
  }

  private async assertUniqueName(name: string, excludeId?: string) {
    const dup = await this.prisma.supplier.findFirst({ where: { deletedAt: null, name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`A supplier named "${dup.name}" already exists (${dup.code})`);
  }
}
