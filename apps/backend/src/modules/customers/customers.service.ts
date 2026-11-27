import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizePhone } from '@az/shared';
import { Paginated, PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, moneyString } from '../../common/utils/money';
import { SettingsService } from '../settings/settings.service';
import { CreateCustomerDto, CustomerQueryDto, DuplicateQueryDto, UpdateCustomerDto } from './dto/customer.dto';

const customerInclude = {
  addresses: { where: { isDefault: true }, take: 1 },
} satisfies Prisma.CustomerInclude;

type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

export function presentCustomer(c: CustomerRow) {
  const { addresses, openingBalance, ...rest } = c;
  return {
    ...rest,
    openingBalance: moneyString(openingBalance),
    registrationDate: c.registrationDate.toISOString().slice(0, 10),
    address: addresses[0]?.addressLine ?? null,
  };
}

export interface DuplicateMatch {
  id: string;
  code: string;
  name: string;
  mobile: string;
  city: string | null;
  reason: 'MOBILE' | 'WHATSAPP' | 'NAME';
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------- queries

  async list(q: CustomerQueryDto): Promise<Paginated<ReturnType<typeof presentCustomer> & { outstanding: string }>> {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.customerType) where.customerType = q.customerType;
    if (q.city) where.city = { equals: q.city, mode: 'insensitive' };
    if (q.search) {
      const s = q.search.trim();
      const phone = s.replace(/\D/g, '');
      const normalized = normalizePhone(s);
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { code: { contains: s, mode: 'insensitive' } },
        ...(phone.length >= 3 ? [{ mobile: { contains: normalized ?? phone } }, { whatsapp: { contains: normalized ?? phone } }] : []),
        ...(phone.length >= 3 && phone.startsWith('0') ? [{ mobile: { contains: phone.slice(1) } }] : []),
      ];
    }
    const sortBy = q.sortBy ?? 'createdAt';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where, include: customerInclude, orderBy: [{ [sortBy]: q.sortOrder }, { code: 'asc' }],
        skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const balances = await this.outstandingFor(rows.map((r) => r.id));
    return paginate(rows.map((r) => ({ ...presentCustomer(r), outstanding: moneyString(balances.get(r.id)) })), total, q);
  }

  async get(id: string) {
    const c = await this.prisma.customer.findFirst({ where: { id, deletedAt: null }, include: customerInclude });
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  /** Profile with live summary figures. */
  async profile(id: string) {
    const c = await this.get(id);
    const [orders, open, ledger, measurements, lastMeasurement, lastOrder, paid] = await Promise.all([
      this.prisma.order.aggregate({ where: { customerId: id, deletedAt: null, lifecycle: { not: 'CANCELLED' } }, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.order.count({ where: { customerId: id, deletedAt: null, lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] } } }),
      this.prisma.customerLedger.aggregate({ where: { customerId: id }, _sum: { debit: true, credit: true } }),
      this.prisma.customerMeasurement.count({ where: { customerId: id } }),
      this.prisma.customerMeasurement.findFirst({ where: { customerId: id }, orderBy: { takenAt: 'desc' }, select: { takenAt: true } }),
      this.prisma.order.findFirst({ where: { customerId: id, deletedAt: null }, orderBy: { orderDate: 'desc' }, select: { orderDate: true } }),
      this.prisma.payment.aggregate({ where: { customerId: id, status: 'POSTED', type: { not: 'REFUND' } }, _sum: { amount: true } }),
    ]);
    return {
      ...presentCustomer(c),
      stats: {
        totalOrders: orders._count._all,
        openOrders: open,
        totalBilled: moneyString(orders._sum.totalAmount),
        totalPaid: moneyString(paid._sum.amount),
        outstanding: moneyString(dec(ledger._sum.debit).minus(dec(ledger._sum.credit))),
        measurementVersions: measurements,
        lastMeasurementAt: lastMeasurement?.takenAt ?? null,
        lastOrderDate: lastOrder?.orderDate.toISOString().slice(0, 10) ?? null,
      },
    };
  }

  async findDuplicates(q: DuplicateQueryDto): Promise<DuplicateMatch[]> {
    const mobile = normalizePhone(q.mobile);
    const whatsapp = normalizePhone(q.whatsapp);
    const name = q.name?.trim();
    const or: Prisma.CustomerWhereInput[] = [];
    const phones = [...new Set([mobile, whatsapp].filter((p): p is string => !!p))];
    if (phones.length) or.push({ mobile: { in: phones } }, { whatsapp: { in: phones } });
    if (name && name.length >= 3) or.push({ name: { equals: name, mode: 'insensitive' } });
    if (!or.length) return [];
    const rows = await this.prisma.customer.findMany({
      where: { deletedAt: null, OR: or, ...(q.excludeId ? { id: { not: q.excludeId } } : {}) },
      select: { id: true, code: true, name: true, mobile: true, whatsapp: true, city: true },
      take: 10,
    });
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, mobile: r.mobile, city: r.city,
      reason: phones.includes(r.mobile) ? 'MOBILE' : r.whatsapp && phones.includes(r.whatsapp) ? 'WHATSAPP' : 'NAME',
    }));
  }

  // ---------------------------------------------------------------- commands

  async create(dto: CreateCustomerDto, ctx: RequestContext) {
    const mobile = this.requirePhone(dto.mobile, 'mobile');
    const whatsapp = dto.whatsapp ? this.requirePhone(dto.whatsapp, 'whatsapp') : mobile;
    if (dto.id) {
      // Idempotent offline creation: same client id = same customer.
      const existing = await this.prisma.customer.findUnique({ where: { id: dto.id }, include: customerInclude });
      if (existing) return presentCustomer(existing);
    }
    await this.assertNoPhoneDuplicate(mobile, whatsapp, dto.allowDuplicate);

    const opening = dec(dto.openingBalance ?? 0);
    const numbering = await this.settings.getGroup('numbering');
    const prefix = String(numbering.customerPrefix ?? 'AZC');

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await this.sequences.next({ key: 'CUSTOMER', prefix, padding: 5 }, tx);
      const regDate = dto.registrationDate ?? karachiToday();
      const c = await tx.customer.create({
        data: {
          id: dto.id, code, name: dto.name, mobile, whatsapp, email: dto.email ? dto.email.toLowerCase() : null, city: dto.city ?? null,
          customerType: dto.customerType ?? 'REGULAR', registrationDate: new Date(`${regDate}T00:00:00Z`),
          notes: dto.notes || null, status: dto.status ?? 'ACTIVE', openingBalance: opening,
          whatsappOptIn: dto.whatsappOptIn ?? false, whatsappOptInAt: dto.whatsappOptIn ? new Date() : null,
          createdById: ctx.userId,
          addresses: dto.address ? { create: [{ addressLine: dto.address, city: dto.city ?? null, isDefault: true }] } : undefined,
        },
        include: customerInclude,
      });
      if (opening.gt(0)) {
        await tx.customerLedger.create({
          data: {
            customerId: c.id, entryDate: new Date(`${regDate}T00:00:00Z`), entryType: 'OPENING', referenceType: 'CUSTOMER',
            referenceId: c.id, description: 'Opening balance', debit: opening,
          },
        });
      }
      await this.audit.log({ action: 'CREATE', module: 'customers', recordId: c.id, newValues: presentCustomer(c) }, ctx, tx);
      return c;
    });
    return presentCustomer(created);
  }

  async update(id: string, dto: UpdateCustomerDto, ctx: RequestContext) {
    const before = await this.get(id);
    if (before.version !== dto.version) {
      throw new ConflictException({
        message: 'This customer was changed by someone else. Reload to see the latest details, then apply your change again.',
        details: { currentVersion: before.version },
      });
    }
    const mobile = dto.mobile !== undefined ? this.requirePhone(dto.mobile, 'mobile') : undefined;
    const whatsapp = dto.whatsapp !== undefined ? (dto.whatsapp ? this.requirePhone(dto.whatsapp, 'whatsapp') : null) : undefined;
    if ((mobile && mobile !== before.mobile) || (whatsapp && whatsapp !== before.whatsapp)) {
      await this.assertNoPhoneDuplicate(mobile ?? before.mobile, whatsapp ?? before.whatsapp, dto.allowDuplicate, id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: the WHERE on version makes concurrent edits fail instead of overwriting.
      const res = await tx.customer.updateMany({
        where: { id, version: dto.version, deletedAt: null },
        data: {
          name: dto.name, mobile, whatsapp, email: dto.email === undefined ? undefined : dto.email ? dto.email.toLowerCase() : null,
          city: dto.city, customerType: dto.customerType, notes: dto.notes,
          registrationDate: dto.registrationDate ? new Date(`${dto.registrationDate}T00:00:00Z`) : undefined,
          ...(dto.whatsappOptIn !== undefined && dto.whatsappOptIn !== before.whatsappOptIn
            ? { whatsappOptIn: dto.whatsappOptIn, whatsappOptInAt: dto.whatsappOptIn ? new Date() : null } : {}),
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw new ConflictException('This customer was changed by someone else. Reload and try again.');
      if (dto.address !== undefined) await this.setDefaultAddress(tx, id, dto.address ?? undefined, dto.city === undefined ? before.city : dto.city);
      const after = await tx.customer.findUniqueOrThrow({ where: { id }, include: customerInclude });
      await this.audit.log({ action: 'UPDATE', module: 'customers', recordId: id, oldValues: presentCustomer(before), newValues: presentCustomer(after) }, ctx, tx);
      return after;
    });
    return presentCustomer(updated);
  }

  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED', ctx: RequestContext) {
    const before = await this.get(id);
    const c = await this.prisma.customer.update({ where: { id }, data: { status, version: { increment: 1 } }, include: customerInclude });
    await this.audit.log({ action: 'STATUS_CHANGE', module: 'customers', recordId: id, oldValues: { status: before.status }, newValues: { status } }, ctx);
    return presentCustomer(c);
  }

  /** Soft delete, only for customers without business history. */
  async remove(id: string, ctx: RequestContext) {
    const c = await this.get(id);
    const [orders, payments, ledger] = await Promise.all([
      this.prisma.order.count({ where: { customerId: id } }),
      this.prisma.payment.count({ where: { customerId: id } }),
      this.prisma.customerLedger.count({ where: { customerId: id } }),
    ]);
    if (orders || payments || ledger) {
      throw new BadRequestException('This customer has orders, payments or ledger entries and cannot be deleted. Mark the customer Inactive instead.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE', version: { increment: 1 } } });
      await this.audit.log({ action: 'DELETE', module: 'customers', recordId: id, oldValues: presentCustomer(c) }, ctx, tx);
    });
    return { success: true };
  }

  // ---------------------------------------------------------------- notes

  async notes(id: string) {
    await this.get(id);
    return this.prisma.customerNote.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async addNote(id: string, note: string, ctx: RequestContext) {
    await this.get(id);
    const n = await this.prisma.customerNote.create({ data: { customerId: id, note, createdById: ctx.userId } });
    await this.audit.log({ action: 'NOTE_ADDED', module: 'customers', recordId: id, newValues: { note } }, ctx);
    return n;
  }

  // ---------------------------------------------------------------- history tabs

  async orders(id: string, q: PaginationQueryDto) {
    await this.get(id);
    const where: Prisma.OrderWhereInput = { customerId: id, deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where, orderBy: { orderDate: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        select: {
          id: true, orderNumber: true, orderDate: true, expectedDeliveryDate: true, lifecycle: true, paymentStatus: true,
          totalAmount: true, paidAmount: true, balanceAmount: true, stage: { select: { code: true, name: true } }, _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows.map((o) => ({
      ...o, totalAmount: moneyString(o.totalAmount), paidAmount: moneyString(o.paidAmount), balanceAmount: moneyString(o.balanceAmount),
    })), total, q);
  }

  async payments(id: string, q: PaginationQueryDto) {
    await this.get(id);
    const where: Prisma.PaymentWhereInput = { customerId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where, orderBy: { paymentDate: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        select: { id: true, receiptNo: true, paymentDate: true, amount: true, method: true, type: true, status: true, reference: true, order: { select: { orderNumber: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(rows.map((p) => ({ ...p, amount: moneyString(p.amount) })), total, q);
  }

  /** Ledger with running balance (debit increases what the customer owes). */
  async ledger(id: string) {
    const c = await this.get(id);
    const rows = await this.prisma.customerLedger.findMany({ where: { customerId: id }, orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }] });
    let balance = dec(0);
    const entries = rows.map((r) => {
      balance = balance.plus(r.debit).minus(r.credit);
      return {
        id: r.id, date: r.entryDate.toISOString().slice(0, 10), entryType: r.entryType, description: r.description,
        referenceType: r.referenceType, referenceId: r.referenceId,
        debit: moneyString(r.debit), credit: moneyString(r.credit), balance: moneyString(balance),
      };
    });
    const totals = rows.reduce((a, r) => ({ debit: a.debit.plus(r.debit), credit: a.credit.plus(r.credit) }), { debit: dec(0), credit: dec(0) });
    return {
      customer: { id: c.id, code: c.code, name: c.name },
      entries,
      totals: { debit: moneyString(totals.debit), credit: moneyString(totals.credit), balance: moneyString(balance) },
    };
  }

  // ---------------------------------------------------------------- helpers

  private requirePhone(raw: string, field: string): string {
    const n = normalizePhone(raw);
    if (!n) throw new BadRequestException(`Enter a valid ${field} number, e.g. 0300-1234567`);
    return n;
  }

  private async assertNoPhoneDuplicate(mobile: string, whatsapp: string | null | undefined, allow?: boolean, excludeId?: string) {
    if (allow) return;
    const matches = (await this.findDuplicates({ mobile, whatsapp: whatsapp ?? undefined, excludeId })).filter((m) => m.reason !== 'NAME');
    if (matches.length) {
      throw new ConflictException({
        message: `A customer with this phone number already exists: ${matches[0].name} (${matches[0].code}). Open that customer, or confirm to save a separate record.`,
        details: { duplicates: matches },
      });
    }
  }

  private async setDefaultAddress(tx: PrismaTx, customerId: string, address: string | undefined, city: string | null | undefined) {
    const current = await tx.customerAddress.findFirst({ where: { customerId, isDefault: true } });
    if (!address) {
      if (current) await tx.customerAddress.delete({ where: { id: current.id } });
      return;
    }
    if (current) await tx.customerAddress.update({ where: { id: current.id }, data: { addressLine: address, city } });
    else await tx.customerAddress.create({ data: { customerId, addressLine: address, city, isDefault: true } });
  }

  private async outstandingFor(ids: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.customerLedger.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _sum: { debit: true, credit: true } });
    return new Map(rows.map((r) => [r.customerId, dec(r._sum.debit).minus(dec(r._sum.credit))]));
  }
}
