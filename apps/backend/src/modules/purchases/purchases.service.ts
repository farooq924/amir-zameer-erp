import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '../../common/tenant';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { StockService, qty, qtyStr } from '../inventory/stock.service';
import { SettingsService } from '../settings/settings.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CreatePurchaseDto, CreatePurchaseReturnDto, PurchaseQueryDto } from './dto/purchase.dto';

const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const fabricSelect = { id: true, code: true, name: true, unit: true, color: true } as const;

const detailInclude = {
  supplier: { select: { id: true, code: true, name: true, contactNumber: true, city: true } },
  items: { include: { fabric: { select: fabricSelect } } },
  returns: { orderBy: { createdAt: 'asc' }, include: { items: { include: { fabric: { select: fabricSelect } } } } },
  payments: { orderBy: { paymentDate: 'asc' } },
} satisfies Prisma.PurchaseInclude;

/**
 * Cost per unit that goes into stock value: the rate with the bill's discount and
 * other charges spread over all lines (so stock value equals what the bill really cost).
 */
export function landedRate(rate: Prisma.Decimal, subtotal: Prisma.Decimal, total: Prisma.Decimal): Prisma.Decimal {
  if (subtotal.lte(0)) return rate;
  return rate.times(total).div(subtotal).toDecimalPlaces(4);
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly stock: StockService,
    private readonly suppliers: SuppliersService,
  ) {}

  async list(q: PurchaseQueryDto) {
    const where: Prisma.PurchaseWhereInput = {};
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.fabricId) where.items = { some: { fabricId: q.fabricId } };
    if (q.payment === 'unpaid') where.balanceAmount = { gt: 0 };
    if (q.payment === 'paid') where.balanceAmount = { lte: 0 };
    if (q.from || q.to) where.purchaseDate = { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) };
    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { purchaseNo: { contains: s, mode: 'insensitive' } },
        { supplierInvoiceNo: { contains: s, mode: 'insensitive' } },
        { supplier: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }
    const [rows, total, sums] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ purchaseDate: q.sortOrder }, { purchaseNo: q.sortOrder }],
        include: { supplier: { select: { id: true, code: true, name: true } }, items: { select: { quantity: true, fabric: { select: { name: true, unit: true } } } } },
      }),
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.aggregate({ where: { ...where, status: 'POSTED' }, _sum: { totalAmount: true, balanceAmount: true } }),
    ]);
    return {
      ...paginate(rows.map((p) => ({
        id: p.id, purchaseNo: p.purchaseNo, supplier: p.supplier, supplierInvoiceNo: p.supplierInvoiceNo, purchaseDate: dateOnly(p.purchaseDate),
        fabrics: p.items.map((i) => i.fabric.name).join(', '), lines: p.items.length,
        totalAmount: moneyString(p.totalAmount), paidAmount: moneyString(p.paidAmount), balanceAmount: moneyString(p.balanceAmount), status: p.status,
      })), total, q),
      totals: { amount: moneyString(sums._sum.totalAmount), balance: moneyString(sums._sum.balanceAmount) },
    };
  }

  async get(id: string) {
    const p = await this.prisma.purchase.findUnique({ where: { id }, include: detailInclude });
    if (!p) throw new NotFoundException('Purchase not found');
    const returned = new Map<string, Prisma.Decimal>();
    for (const r of p.returns) for (const i of r.items) returned.set(i.fabricId, (returned.get(i.fabricId) ?? dec(0)).plus(i.quantity));
    const returnsTotal = p.returns.reduce((a, r) => a.plus(r.totalAmount), dec(0));
    return {
      id: p.id, purchaseNo: p.purchaseNo, supplier: p.supplier, supplierInvoiceNo: p.supplierInvoiceNo, purchaseDate: dateOnly(p.purchaseDate),
      subtotal: moneyString(p.subtotal), discount: moneyString(p.discount), otherCharges: moneyString(p.otherCharges), totalAmount: moneyString(p.totalAmount),
      returnsTotal: moneyString(returnsTotal), paidAmount: moneyString(p.paidAmount), balanceAmount: moneyString(p.balanceAmount),
      status: p.status, notes: p.notes, createdAt: p.createdAt,
      items: p.items.map((i) => ({
        id: i.id, fabric: i.fabric, quantity: qtyStr(i.quantity), rate: moneyString(i.rate), amount: moneyString(i.amount),
        returnedQuantity: qtyStr(returned.get(i.fabricId) ?? 0), returnableQuantity: qtyStr(dec(i.quantity).minus(returned.get(i.fabricId) ?? 0)),
      })),
      returns: p.returns.map((r) => ({
        id: r.id, returnNo: r.returnNo, returnDate: dateOnly(r.returnDate), totalAmount: moneyString(r.totalAmount), reason: r.reason,
        items: r.items.map((i) => ({ fabric: i.fabric, quantity: qtyStr(i.quantity), rate: moneyString(i.rate), amount: moneyString(i.amount) })),
      })),
      payments: p.payments.map((x) => ({ id: x.id, paymentNo: x.paymentNo, paymentDate: dateOnly(x.paymentDate), amount: moneyString(x.amount), method: x.method, reference: x.reference })),
    };
  }

  async create(dto: CreatePurchaseDto, ctx: RequestContext) {
    if (dto.id && (await this.prisma.purchase.findUnique({ where: { id: dto.id } }))) return this.get(dto.id);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, deletedAt: null } });
    if (!supplier) throw new BadRequestException('Select a supplier');
    if (supplier.status !== 'ACTIVE') throw new BadRequestException(`${supplier.name} is inactive. Activate the supplier first.`);
    const date = dto.purchaseDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Purchase date cannot be in the future');
    const invoice = dto.supplierInvoiceNo || null;
    if (invoice && (await this.prisma.purchase.findFirst({ where: { supplierId: supplier.id, supplierInvoiceNo: invoice } }))) {
      throw new ConflictException(`Bill ${invoice} from ${supplier.name} is already entered`);
    }
    const ids = dto.items.map((i) => i.fabricId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('The same fabric is entered twice. Put the full quantity on one line.');
    const fabrics = await this.prisma.fabric.findMany({ where: { id: { in: ids }, deletedAt: null } });
    if (fabrics.length !== ids.length) throw new BadRequestException('One of the selected fabrics was not found');
    const lines = dto.items.map((i) => {
      const q = qty(i.quantity);
      if (q.lte(0)) throw new BadRequestException('Quantity must be more than 0');
      const rate = money(i.rate);
      return { fabricId: i.fabricId, quantity: q, rate, amount: money(q.times(rate)) };
    });
    const subtotal = lines.reduce((a, l) => a.plus(l.amount), dec(0));
    const discount = money(dto.discount);
    const otherCharges = money(dto.otherCharges);
    if (discount.gt(subtotal)) throw new BadRequestException('Discount cannot be more than the bill amount');
    const total = subtotal.minus(discount).plus(otherCharges);
    const paid = dto.payment ? money(dto.payment.amount) : dec(0);
    if (paid.gt(total)) throw new BadRequestException('Paid amount cannot be more than the bill total');

    const numbering = await this.settings.getGroup('numbering');
    const prefix = String(numbering.purchasePrefix ?? 'PUR');
    const id = await this.prisma.$transaction(async (tx) => {
      const purchaseNo = await this.sequences.next({ key: 'PURCHASE', prefix, period: date.slice(0, 4), padding: 5 }, tx);
      const p = await tx.purchase.create({
        data: {
          id: dto.id, purchaseNo, supplierId: supplier.id, supplierInvoiceNo: invoice, purchaseDate: asDate(date), subtotal, discount, otherCharges,
          totalAmount: total, paidAmount: 0, balanceAmount: total, notes: dto.notes || null, createdById: ctx.userId,
          items: { create: lines },
        },
      });
      await this.stock.lockFabrics(tx, ids);
      for (const l of lines) {
        await this.stock.post(tx, {
          fabricId: l.fabricId, type: 'PURCHASE', quantity: l.quantity, unitCost: landedRate(l.rate, subtotal, total),
          referenceType: 'PURCHASE', referenceId: p.id, idempotencyKey: `purchase:${p.id}:${l.fabricId}`, reason: `${purchaseNo} from ${supplier.name}`,
        }, ctx);
        const f = fabrics.find((x) => x.id === l.fabricId)!;
        await tx.fabric.update({ where: { id: l.fabricId }, data: { purchasePrice: l.rate, ...(f.supplierId ? {} : { supplierId: supplier.id }) } });
      }
      if (total.gt(0)) {
        await tx.supplierLedger.create({
          data: {
            supplierId: supplier.id, entryDate: asDate(date), entryType: 'PURCHASE', referenceType: 'PURCHASE', referenceId: p.id,
            description: `Purchase ${purchaseNo}${invoice ? ` (bill ${invoice})` : ''}`, credit: total,
          },
        });
      }
      await this.audit.log({ action: 'CREATE', module: 'purchases', recordId: p.id, newValues: { purchaseNo, supplier: supplier.code, total: moneyString(total), lines: lines.length } }, ctx, tx);
      if (dto.payment && paid.gt(0)) {
        await this.suppliers.postPayment(tx, supplier.id, { ...dto.payment, purchaseId: p.id, paymentDate: date }, `purchase:${p.id}:payment`, ctx);
      }
      return p.id;
    });
    return this.get(id);
  }

  async createReturn(purchaseId: string, dto: CreatePurchaseReturnDto, ctx: RequestContext) {
    if (dto.id) {
      const existing = await this.prisma.purchaseReturn.findUnique({ where: { id: dto.id } });
      if (existing) {
        if (existing.purchaseId !== purchaseId) throw new ConflictException('This return was already saved for another purchase');
        return this.get(purchaseId);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${purchaseId}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
      const p = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { items: { include: { fabric: true } }, returns: { include: { items: true } }, supplier: true } });
      if (!p) throw new NotFoundException('Purchase not found');
      if (p.status !== 'POSTED') throw new BadRequestException('This purchase is cancelled');
      const returned = new Map<string, Prisma.Decimal>();
      for (const r of p.returns) for (const i of r.items) returned.set(i.fabricId, (returned.get(i.fabricId) ?? dec(0)).plus(i.quantity));
      const seen = new Set<string>();
      const lines = dto.items.filter((l) => dec(l.quantity).gt(0)).map((l) => {
        const item = p.items.find((i) => i.fabricId === l.fabricId);
        if (!item) throw new BadRequestException('One of the fabrics is not on this purchase');
        if (seen.has(l.fabricId)) throw new BadRequestException(`${item.fabric.name} entered twice`);
        seen.add(l.fabricId);
        const q = qty(l.quantity);
        const left = dec(item.quantity).minus(returned.get(l.fabricId) ?? 0);
        if (q.gt(left)) throw new BadRequestException(`${item.fabric.name}: only ${qtyStr(left)} can be returned`);
        const rate = money(landedRate(dec(item.rate), dec(p.subtotal), dec(p.totalAmount)));
        return { fabricId: l.fabricId, quantity: q, rate, amount: money(q.times(rate)), name: item.fabric.name };
      });
      if (!lines.length) throw new BadRequestException('Enter the quantity to return');
      const total = lines.reduce((a, l) => a.plus(l.amount), dec(0));
      const today = karachiToday();
      const returnNo = await this.sequences.next({ key: 'PURCHASE_RETURN', prefix: 'PRT', period: today.slice(0, 4), padding: 5 }, tx);
      const r = await tx.purchaseReturn.create({
        data: {
          id: dto.id, returnNo, supplierId: p.supplierId, purchaseId: p.id, returnDate: asDate(today), totalAmount: total, reason: dto.reason, createdById: ctx.userId,
          items: { create: lines.map(({ name: _n, ...l }) => l) },
        },
      });
      await this.stock.lockFabrics(tx, lines.map((l) => l.fabricId));
      for (const l of lines) {
        await this.stock.post(tx, {
          fabricId: l.fabricId, type: 'PURCHASE_RETURN', quantity: l.quantity, referenceType: 'PURCHASE_RETURN', referenceId: r.id,
          idempotencyKey: `purchase-return:${r.id}:${l.fabricId}`, reason: `${returnNo} to ${p.supplier.name}: ${dto.reason}`,
        }, ctx);
      }
      const newBalance = dec(p.balanceAmount).minus(total);
      await tx.purchase.update({ where: { id: p.id }, data: { balanceAmount: newBalance.lt(0) ? 0 : newBalance } });
      await tx.supplierLedger.create({
        data: {
          supplierId: p.supplierId, entryDate: asDate(today), entryType: 'PURCHASE_RETURN', referenceType: 'PURCHASE_RETURN', referenceId: r.id,
          description: `Return ${returnNo} against ${p.purchaseNo}`, debit: total,
        },
      });
      await this.audit.log({ action: 'RETURN', module: 'purchases', recordId: p.id, newValues: { returnNo, total: moneyString(total), reason: dto.reason } }, ctx, tx);
    });
    return this.get(purchaseId);
  }
}
