import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ORDER_ADJUSTMENT_TYPES, STAGE_CANCELLED, STAGE_DELIVERED, STAGE_NEW, normalizePhone } from '@az/shared';
import { randomUUID } from 'crypto';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { presentGarment } from '../garments/garments.service';
import { FabricPickerQueryDto } from '../inventory/dto/inventory.dto';
import { FabricsService } from '../inventory/fabrics.service';
import { StockService } from '../inventory/stock.service';
import { SettingsService } from '../settings/settings.service';
import {
  AdjustmentDto, AssignDto, CancelOrderDto, ChangeStageDto, CreateOrderDto, DeliverDto, OrderItemDto, OrderQueryDto, PaymentInputDto,
  RecordPaymentDto, UpdateOrderDto,
} from './dto/order.dto';
import { LineAmounts, lineAmounts, orderAmounts, paymentState } from './order-math';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const OPEN_LIFECYCLES = ['OPEN', 'PARTIALLY_DELIVERED'] as const;
const stageSelect = { id: true, code: true, name: true, color: true, sortOrder: true } as const;
const userSelect = { id: true, fullName: true } as const;

const detailInclude = {
  customer: { select: { id: true, code: true, name: true, mobile: true, whatsapp: true, city: true, status: true } },
  stage: { select: stageSelect },
  assignedEmployee: { select: { id: true, code: true, name: true } },
  createdBy: { select: userSelect },
  duplicatedFrom: { select: { id: true, orderNumber: true } },
  items: {
    orderBy: { lineNo: 'asc' },
    include: {
      stage: { select: stageSelect },
      assignedEmployee: { select: { id: true, code: true, name: true } },
      garmentType: { select: { id: true, code: true, name: true, measurementTemplateId: true } },
      fabric: { select: { id: true, code: true, name: true, unit: true, color: true } },
      reservations: { select: { quantity: true, consumed: true, status: true } },
      measurement: true,
      _count: { select: { assignments: true, productionRecords: true } },
    },
  },
  statusHistory: {
    orderBy: { changedAt: 'desc' },
    include: { fromStage: { select: stageSelect }, toStage: { select: stageSelect }, changedBy: { select: userSelect }, orderItem: { select: { id: true, lineNo: true, garmentName: true } } },
  },
  deliveries: { orderBy: { deliveryNo: 'asc' }, include: { items: { include: { orderItem: { select: { id: true, lineNo: true, garmentName: true } } } } } },
  adjustments: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { paymentDate: 'asc' }, include: { createdBy: { select: userSelect } } },
} satisfies Prisma.OrderInclude;

type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;
type ItemRow = OrderDetailRow['items'][number];

const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
function addDays(date: string, days: number): string {
  const d = asDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface SnapshotValue { key: string; label: string; value: string | null; text: string | null }

/** Stock status of shop fabric on one item: reserved (waiting), issued (used on delivery) or released (cancelled). */
function stockState(rows: { quantity: Prisma.Decimal; consumed: Prisma.Decimal; status: string }[]) {
  const r = rows.find((x) => x.status !== 'RELEASED') ?? rows[0];
  if (!r) return null;
  return { status: r.status, reserved: dec(r.quantity).toFixed(3), issued: dec(r.consumed).toFixed(3) };
}

function presentItem(i: ItemRow) {
  return {
    id: i.id, lineNo: i.lineNo, garmentTypeId: i.garmentTypeId, garmentType: i.garmentType, garmentName: i.garmentName, quantity: i.quantity,
    deliveredQuantity: i.deliveredQuantity, fabricSource: i.fabricSource, fabricDescription: i.fabricDescription,
    fabricId: i.fabricId, fabric: i.fabric, stock: stockState(i.reservations),
    fabricQuantity: i.fabricQuantity.toFixed(3), fabricPerPiece: i.fabricPerPiece.toFixed(3), fabricRate: moneyString(i.fabricRate),
    fabricAmount: moneyString(i.fabricAmount), stitchingPrice: moneyString(i.stitchingPrice), stitchingAmount: moneyString(i.stitchingAmount),
    additionalCharges: moneyString(i.additionalCharges), lineTotal: moneyString(i.lineTotal), notes: i.notes,
    stage: i.stage, assignedEmployee: i.assignedEmployee, canRemove: i.deliveredQuantity === 0 && i._count.assignments === 0 && i._count.productionRecords === 0,
    measurement: i.measurement ? {
      id: i.measurement.id, sourceMeasurementId: i.measurement.sourceMeasurementId, templateName: i.measurement.templateName,
      unit: i.measurement.unit, notes: i.measurement.notes, takenAt: i.measurement.createdAt, values: i.measurement.values as unknown as SnapshotValue[],
    } : null,
  };
}

export function presentOrder(o: OrderDetailRow, today = karachiToday()) {
  const effectiveTotal = dec(o.totalAmount).plus(o.adjustmentsTotal);
  return {
    id: o.id, orderNumber: o.orderNumber, orderType: o.orderType, customer: o.customer,
    orderDate: dateOnly(o.orderDate), expectedDeliveryDate: dateOnly(o.expectedDeliveryDate), actualDeliveryDate: dateOnly(o.actualDeliveryDate),
    stage: o.stage, lifecycle: o.lifecycle, paymentStatus: o.paymentStatus,
    stitchingTotal: moneyString(o.stitchingTotal), fabricTotal: moneyString(o.fabricTotal), additionalCharges: moneyString(o.additionalCharges),
    discount: moneyString(o.discount), subtotal: moneyString(o.subtotal), totalAmount: moneyString(o.totalAmount),
    adjustmentsTotal: moneyString(o.adjustmentsTotal), effectiveTotal: moneyString(o.lifecycle === 'CANCELLED' ? 0 : effectiveTotal),
    paidAmount: moneyString(o.paidAmount), balanceAmount: moneyString(o.balanceAmount),
    isOverdue: OPEN_LIFECYCLES.includes(o.lifecycle as (typeof OPEN_LIFECYCLES)[number]) && !!o.expectedDeliveryDate && dateOnly(o.expectedDeliveryDate)! < today,
    assignedEmployee: o.assignedEmployee, specialInstructions: o.specialInstructions, revisionNo: o.revisionNo,
    duplicatedFrom: o.duplicatedFrom, cancelledAt: o.cancelledAt, cancelReason: o.cancelReason, version: o.version,
    createdBy: o.createdBy, createdAt: o.createdAt, updatedAt: o.updatedAt,
    items: o.items.map(presentItem),
    totalPieces: o.items.reduce((a, i) => a + i.quantity, 0),
    deliveredPieces: o.items.reduce((a, i) => a + i.deliveredQuantity, 0),
    statusHistory: o.statusHistory.map((h) => ({
      id: h.id, fromStage: h.fromStage, toStage: h.toStage, notes: h.notes, changedBy: h.changedBy, changedAt: h.changedAt, item: h.orderItem,
    })),
    deliveries: o.deliveries.map((d) => ({
      id: d.id, deliveryNo: d.deliveryNo, deliveredAt: d.deliveredAt, receivedBy: d.receivedBy, notes: d.notes,
      items: d.items.map((di) => ({ orderItemId: di.orderItemId, garmentName: di.orderItem.garmentName, lineNo: di.orderItem.lineNo, quantity: di.quantity })),
    })),
    adjustments: o.adjustments.map((a) => ({ id: a.id, type: a.type, amount: moneyString(a.amount), reason: a.reason, createdAt: a.createdAt })),
    payments: o.payments.map((p) => ({
      id: p.id, receiptNo: p.receiptNo, paymentDate: p.paymentDate, amount: moneyString(p.amount), method: p.method, type: p.type,
      status: p.status, reference: p.reference, notes: p.notes, createdBy: p.createdBy,
    })),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly stock: StockService,
    private readonly fabrics: FabricsService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** Fabrics in stock for the order form (works for roles without Inventory access). */
  fabricOptions(q: FabricPickerQueryDto) {
    return this.fabrics.picker(q);
  }

  // ================================================================ queries

  async list(q: OrderQueryDto) {
    const today = karachiToday();
    const where: Prisma.OrderWhereInput = { deletedAt: null };
    if (q.stageId) where.stageId = q.stageId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
    if (q.orderType) where.orderType = q.orderType;
    if (q.lifecycle === 'ACTIVE') where.lifecycle = { in: [...OPEN_LIFECYCLES] };
    else if (q.lifecycle) where.lifecycle = q.lifecycle;
    if (q.from || q.to) where.orderDate = { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) };
    if (q.due) {
      where.lifecycle = { in: [...OPEN_LIFECYCLES] };
      if (q.due === 'overdue') where.expectedDeliveryDate = { lt: asDate(today) };
      if (q.due === 'today') where.expectedDeliveryDate = asDate(today);
      if (q.due === 'tomorrow') where.expectedDeliveryDate = asDate(addDays(today, 1));
      if (q.due === 'week') where.expectedDeliveryDate = { gte: asDate(today), lte: asDate(addDays(today, 6)) };
    }
    if (q.search) {
      const s = q.search.trim();
      const digits = s.replace(/\D/g, '');
      const phone = normalizePhone(s);
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        { customer: { name: { contains: s, mode: 'insensitive' } } },
        { customer: { code: { contains: s, mode: 'insensitive' } } },
        ...(digits.length >= 4 ? [{ customer: { mobile: { contains: phone ?? (digits.startsWith('0') ? digits.slice(1) : digits) } } }] : []),
      ];
    }
    const sortBy = q.sortBy ?? 'createdAt';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        orderBy: [{ [sortBy]: q.sortOrder }, { orderNumber: 'desc' }],
        include: {
          customer: { select: { id: true, code: true, name: true, mobile: true } },
          stage: { select: stageSelect },
          items: { select: { garmentName: true, quantity: true, deliveredQuantity: true }, orderBy: { lineNo: 'asc' } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows.map((o) => ({
      id: o.id, orderNumber: o.orderNumber, orderType: o.orderType, customer: o.customer, orderDate: dateOnly(o.orderDate),
      expectedDeliveryDate: dateOnly(o.expectedDeliveryDate), stage: o.stage, lifecycle: o.lifecycle, paymentStatus: o.paymentStatus,
      totalAmount: moneyString(dec(o.totalAmount).plus(o.adjustmentsTotal)), paidAmount: moneyString(o.paidAmount), balanceAmount: moneyString(o.balanceAmount),
      garments: o.items.map((i) => `${i.quantity} x ${i.garmentName}`).join(', '),
      totalPieces: o.items.reduce((a, i) => a + i.quantity, 0),
      deliveredPieces: o.items.reduce((a, i) => a + i.deliveredQuantity, 0),
      isOverdue: OPEN_LIFECYCLES.includes(o.lifecycle as (typeof OPEN_LIFECYCLES)[number]) && !!o.expectedDeliveryDate && dateOnly(o.expectedDeliveryDate)! < today,
    })), total, q);
  }

  /** Counts for the Orders page header: open orders per stage and delivery deadlines. */
  async summary() {
    const today = asDate(karachiToday());
    const open = { deletedAt: null, lifecycle: { in: [...OPEN_LIFECYCLES] } } satisfies Prisma.OrderWhereInput;
    const [stages, perStage, overdue, dueToday, dueTomorrow, receivable, openCount] = await Promise.all([
      this.prisma.workflowStage.findMany({ where: { isActive: true, isTerminal: false }, orderBy: { sortOrder: 'asc' }, select: stageSelect }),
      this.prisma.order.groupBy({ by: ['stageId'], where: open, _count: { _all: true } }),
      this.prisma.order.count({ where: { ...open, expectedDeliveryDate: { lt: today } } }),
      this.prisma.order.count({ where: { ...open, expectedDeliveryDate: today } }),
      this.prisma.order.count({ where: { ...open, expectedDeliveryDate: asDate(addDays(karachiToday(), 1)) } }),
      this.prisma.order.aggregate({ where: { deletedAt: null, lifecycle: { not: 'CANCELLED' }, balanceAmount: { gt: 0 } }, _sum: { balanceAmount: true } }),
      this.prisma.order.count({ where: open }),
    ]);
    const counts = new Map(perStage.map((p) => [p.stageId, p._count._all]));
    return {
      openOrders: openCount, overdue, dueToday, dueTomorrow, outstanding: moneyString(receivable._sum.balanceAmount),
      stages: stages.map((s) => ({ ...s, count: counts.get(s.id) ?? 0 })),
    };
  }

  async get(id: string) {
    const o = await this.prisma.order.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    if (!o) throw new NotFoundException('Order not found');
    const activity = await this.prisma.auditLog.findMany({
      where: { module: 'orders', recordId: id }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, action: true, createdAt: true, newValues: true, user: { select: userSelect } },
    });
    return {
      ...presentOrder(o),
      activity: activity.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt, user: a.user, note: (a.newValues as { note?: string } | null)?.note ?? null })),
    };
  }

  /** Everything the order form needs in one call (works for roles without Garments access). */
  async formOptions() {
    const [garments, stages, employees, orderSettings] = await Promise.all([
      this.prisma.garmentType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, include: { measurementTemplate: { select: { id: true, code: true, name: true } } } }),
      this.prisma.workflowStage.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { ...stageSelect, isTerminal: true } }),
      this.prisma.employee.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, designation: true } }),
      this.settings.getGroup('orders'),
    ]);
    return { garments: garments.map(presentGarment), stages, employees, settings: orderSettings, today: karachiToday() };
  }

  /** Measurement versions of a customer, newest first (for choosing what to copy into the order). */
  async customerMeasurements(customerId: string) {
    const rows = await this.prisma.customerMeasurement.findMany({
      where: { customerId }, orderBy: [{ isLatest: 'desc' }, { takenAt: 'desc' }],
      select: { id: true, templateId: true, versionNo: true, isLatest: true, takenAt: true, unit: true, template: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, templateId: r.templateId, templateName: r.template.name, versionNo: r.versionNo, isLatest: r.isLatest, takenAt: r.takenAt, unit: r.unit }));
  }

  // ================================================================ create / revise

  async create(dto: CreateOrderDto, ctx: RequestContext) {
    if (dto.id) {
      const existing = await this.prisma.order.findUnique({ where: { id: dto.id } });
      if (existing) return this.get(existing.id); // idempotent re-submit
    }
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, deletedAt: null } });
    if (!customer) throw new BadRequestException('Select a customer');
    if (customer.status === 'BLOCKED') throw new BadRequestException(`${customer.name} is blocked. Unblock the customer before booking a new order.`);
    if (dto.duplicatedFromId && !(await this.prisma.order.findUnique({ where: { id: dto.duplicatedFromId } }))) {
      throw new BadRequestException('The order you copied from was not found');
    }

    const orderType = dto.orderType ?? 'STITCHING';
    const orderSettings = await this.settings.getGroup('orders');
    const orderDate = dto.orderDate ?? karachiToday();
    const expected = dto.expectedDeliveryDate === undefined ? addDays(orderDate, Number(orderSettings.defaultDeliveryDays ?? 7)) : dto.expectedDeliveryDate;
    if (expected && expected < orderDate) throw new BadRequestException('Delivery date cannot be before the order date');

    const garments = await this.loadGarments(dto.items);
    const fabrics = await this.loadFabrics(dto.items, orderType);
    const lines = dto.items.map((i) => this.lineFor(i, orderType));
    const totals = orderAmounts(lines, dto.additionalCharges, dto.discount);
    if (totals.discount.gt(totals.subtotal)) throw new BadRequestException('Discount cannot be more than the order amount');
    const advance = dto.advance ? money(dto.advance.amount) : dec(0);
    if (advance.gt(totals.totalAmount)) throw new BadRequestException('Advance cannot be more than the order total');
    if (orderSettings.requireAdvancePayment && totals.totalAmount.gt(0)) {
      const min = money(totals.totalAmount.times(Number(orderSettings.minimumAdvancePercent ?? 0)).div(100));
      if (advance.lt(min)) throw new BadRequestException(`An advance of at least ${moneyString(min)} is required (${String(orderSettings.minimumAdvancePercent)}% of the total)`);
    }

    const numbering = await this.settings.getGroup('numbering');
    const prefix = String(numbering.orderPrefix ?? 'AZ');
    const newStage = await this.initialStage();

    const orderId = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.sequences.next({ key: 'ORDER', prefix, period: orderDate.slice(0, 4), padding: 5 }, tx);
      const order = await tx.order.create({
        data: {
          id: dto.id, orderNumber, customerId: customer.id, orderType, orderDate: asDate(orderDate),
          expectedDeliveryDate: expected ? asDate(expected) : null, stageId: newStage.id,
          stitchingTotal: totals.stitchingTotal, fabricTotal: totals.fabricTotal, additionalCharges: totals.additionalCharges,
          discount: totals.discount, subtotal: totals.subtotal, totalAmount: totals.totalAmount,
          balanceAmount: totals.totalAmount, paymentStatus: totals.totalAmount.gt(0) ? 'UNPAID' : 'PAID',
          specialInstructions: dto.specialInstructions || null, duplicatedFromId: dto.duplicatedFromId ?? null, createdById: ctx.userId,
        },
      });
      for (const [idx, item] of dto.items.entries()) {
        await this.createItem(tx, order.id, customer.id, idx + 1, item, lines[idx], garments, fabrics, orderType, newStage.id, item.measurementId);
      }
      await tx.orderStatusHistory.create({ data: { orderId: order.id, toStageId: newStage.id, notes: dto.duplicatedFromId ? 'Order booked (copied from another order)' : 'Order booked', changedById: ctx.userId } });
      if (totals.totalAmount.gt(0)) {
        await tx.customerLedger.create({
          data: {
            customerId: customer.id, entryDate: asDate(orderDate), entryType: 'ORDER', referenceType: 'ORDER', referenceId: order.id,
            description: `Order ${orderNumber}`, debit: totals.totalAmount,
          },
        });
      }
      await this.audit.log({ action: 'CREATE', module: 'orders', recordId: order.id, newValues: { orderNumber, customer: customer.code, total: moneyString(totals.totalAmount), items: dto.items.length } }, ctx, tx);
      if (dto.advance && advance.gt(0)) await this.postPayment(tx, order.id, dto.advance, `order:${order.id}:advance`, ctx);
      return order.id;
    });
    void this.whatsapp.notify('ORDER_CONFIRMATION', { orderId });
    return this.get(orderId);
  }

  async update(id: string, dto: UpdateOrderDto, ctx: RequestContext) {
    const before = await this.get(id);
    if (!OPEN_LIFECYCLES.includes(before.lifecycle as (typeof OPEN_LIFECYCLES)[number])) {
      throw new BadRequestException(before.lifecycle === 'CANCELLED' ? 'Cancelled orders cannot be changed' : 'Delivered orders cannot be revised. Use an adjustment to change the amount.');
    }
    if (before.version !== dto.version) throw new ConflictException('This order was changed by someone else. Reload to see the latest version, then apply your change again.');
    const orderType = dto.orderType ?? before.orderType;
    const orderDate = dto.orderDate ?? before.orderDate!;
    const expected = dto.expectedDeliveryDate === undefined ? before.expectedDeliveryDate : dto.expectedDeliveryDate;
    if (expected && expected < orderDate) throw new BadRequestException('Delivery date cannot be before the order date');
    const existing = new Map(before.items.map((i) => [i.id, i]));
    for (const i of dto.items) {
      if (i.id && !existing.has(i.id)) throw new BadRequestException('One of the garments does not belong to this order');
      const old = i.id ? existing.get(i.id) : undefined;
      if (old && i.quantity < old.deliveredQuantity) throw new BadRequestException(`${old.garmentName}: ${old.deliveredQuantity} already delivered, quantity cannot be lower`);
    }
    const keep = new Set(dto.items.filter((i) => i.id).map((i) => i.id!));
    const removed = before.items.filter((i) => !keep.has(i.id));
    const blocked = removed.find((i) => !i.canRemove);
    if (blocked) throw new BadRequestException(`${blocked.garmentName} is already delivered or in production and cannot be removed`);

    const garments = await this.loadGarments(dto.items);
    const fabrics = await this.loadFabrics(dto.items, orderType, before.items.map((i) => i.fabricId));
    const lines = dto.items.map((i) => this.lineFor(i, orderType));
    const totals = orderAmounts(lines, dto.additionalCharges ?? before.additionalCharges, dto.discount ?? before.discount);
    if (totals.discount.gt(totals.subtotal)) throw new BadRequestException('Discount cannot be more than the order amount');
    const effective = totals.totalAmount.plus(before.adjustmentsTotal);
    if (effective.lt(0)) throw new BadRequestException('The new total is lower than the adjustments already applied');

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const res = await tx.order.updateMany({
        where: { id, version: dto.version },
        data: {
          orderType, orderDate: asDate(orderDate), expectedDeliveryDate: expected ? asDate(expected) : null,
          specialInstructions: dto.specialInstructions === undefined ? undefined : dto.specialInstructions || null,
          stitchingTotal: totals.stitchingTotal, fabricTotal: totals.fabricTotal, additionalCharges: totals.additionalCharges,
          discount: totals.discount, subtotal: totals.subtotal, totalAmount: totals.totalAmount,
          ...paymentState(effective, dec(before.paidAmount)),
          revisionNo: { increment: 1 }, version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw new ConflictException('This order was changed by someone else. Reload and try again.');
      for (const r of removed) {
        await this.stock.dropItemReservations(tx, r.id);
        await tx.orderItem.delete({ where: { id: r.id } });
      }
      let nextLine = Math.max(0, ...before.items.map((i) => i.lineNo)) + 1;
      for (const [idx, item] of dto.items.entries()) {
        const l = lines[idx];
        if (!item.id) {
          await this.createItem(tx, id, before.customer.id, nextLine++, item, l, garments, fabrics, orderType, before.stage.id, item.measurementId);
          continue;
        }
        const old = existing.get(item.id)!;
        const updated = await tx.orderItem.update({
          where: { id: item.id },
          data: { ...this.itemData(item, l, garments, fabrics, orderType), version: { increment: 1 } },
        });
        await this.stock.syncItemReservation(tx, updated);
        const garmentChanged = (item.garmentTypeId ?? null) !== (old.garmentTypeId ?? null);
        const pickChanged = !!item.measurementId && item.measurementId !== old.measurement?.sourceMeasurementId;
        if (item.refreshMeasurement || garmentChanged || pickChanged) {
          await this.snapshot(tx, item.id, before.customer.id, garments.get(item.garmentTypeId ?? '')?.measurementTemplateId ?? null, orderType, item.measurementId);
        }
      }
      const delta = totals.totalAmount.minus(before.totalAmount);
      if (!delta.eq(0)) {
        await tx.customerLedger.create({
          data: {
            customerId: before.customer.id, entryDate: asDate(karachiToday()), entryType: 'ORDER_ADJUSTMENT', referenceType: 'ORDER_REVISION',
            referenceId: randomUUID(), description: `Order ${before.orderNumber} revised (revision ${before.revisionNo + 1})`,
            ...(delta.gt(0) ? { debit: delta } : { credit: delta.abs() }),
          },
        });
      }
      await this.refreshOrderStage(tx, id, ctx);
      await this.audit.log({
        action: 'REVISE', module: 'orders', recordId: id,
        oldValues: { total: before.totalAmount, items: before.items.map((i) => `${i.quantity} x ${i.garmentName}`), expectedDeliveryDate: before.expectedDeliveryDate },
        newValues: { note: dto.revisionNote || `Revision ${before.revisionNo + 1}`, total: moneyString(totals.totalAmount), items: dto.items.map((i) => `${i.quantity} x ${i.garmentName}`), expectedDeliveryDate: expected },
      }, ctx, tx);
    });
    return this.get(id);
  }

  // ================================================================ workflow

  async changeStage(id: string, dto: ChangeStageDto, ctx: RequestContext) {
    const stage = await this.prisma.workflowStage.findUnique({ where: { id: dto.stageId } });
    if (!stage || !stage.isActive) throw new BadRequestException('Select an active stage');
    if (stage.code === STAGE_DELIVERED) throw new BadRequestException('Use "Deliver" to hand garments to the customer');
    if (stage.code === STAGE_CANCELLED) throw new BadRequestException('Use "Cancel order" to cancel');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await this.openOrder(tx, id);
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      const pending = items.filter((i) => i.deliveredQuantity < i.quantity);
      const target = dto.itemIds?.length ? pending.filter((i) => dto.itemIds!.includes(i.id)) : pending;
      if (dto.itemIds?.length && target.length !== new Set(dto.itemIds).size) throw new BadRequestException('Some garments are already delivered or not part of this order');
      for (const i of target.filter((t) => t.stageId !== stage.id)) {
        await tx.orderItem.update({ where: { id: i.id }, data: { stageId: stage.id, version: { increment: 1 } } });
        if (dto.itemIds?.length) await tx.orderStatusHistory.create({ data: { orderId: id, orderItemId: i.id, fromStageId: i.stageId, toStageId: stage.id, notes: dto.notes || null, changedById: ctx.userId } });
      }
      if (!dto.itemIds?.length) {
        if (o.stageId !== stage.id) {
          await tx.order.update({ where: { id }, data: { stageId: stage.id, version: { increment: 1 } } });
          await tx.orderStatusHistory.create({ data: { orderId: id, fromStageId: o.stageId, toStageId: stage.id, notes: dto.notes || null, changedById: ctx.userId } });
        }
      } else {
        await this.refreshOrderStage(tx, id, ctx, dto.notes);
      }
      await this.audit.log({ action: 'STATUS_CHANGE', module: 'orders', recordId: id, newValues: { stage: stage.name, items: target.length, note: dto.notes ? `${stage.name}: ${dto.notes}` : stage.name } }, ctx, tx);
    });
    if (stage.code === 'READY') {
      const o = await this.prisma.order.findUnique({ where: { id }, select: { stageId: true } });
      if (o?.stageId === stage.id) void this.whatsapp.notify('ORDER_READY', { orderId: id });
    }
    return this.get(id);
  }

  async assign(id: string, dto: AssignDto, ctx: RequestContext) {
    const employeeId = dto.employeeId ?? null;
    let employeeName = 'nobody';
    if (employeeId) {
      const e = await this.prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null, status: 'ACTIVE' } });
      if (!e) throw new BadRequestException('Select an active employee');
      employeeName = e.name;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await this.openOrder(tx, id);
      const where: Prisma.OrderItemWhereInput = { orderId: id, ...(dto.itemIds?.length ? { id: { in: dto.itemIds } } : {}) };
      const res = await tx.orderItem.updateMany({ where, data: { assignedEmployeeId: employeeId } });
      if (dto.itemIds?.length && res.count !== new Set(dto.itemIds).size) throw new BadRequestException('Some garments are not part of this order');
      if (!dto.itemIds?.length) await tx.order.update({ where: { id }, data: { assignedEmployeeId: employeeId, version: { increment: 1 } } });
      await this.audit.log({ action: 'ASSIGN', module: 'orders', recordId: id, newValues: { employeeId, note: `Assigned to ${employeeName}` } }, ctx, tx);
    });
    return this.get(id);
  }

  /** Copies the latest (or a chosen) measurement into an order item again, e.g. when the customer was measured after booking. */
  async refreshMeasurement(id: string, itemId: string, measurementId: string | undefined, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await this.openOrder(tx, id);
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: id }, include: { garmentType: true } });
      if (!item) throw new NotFoundException('Garment not found on this order');
      if (item.deliveredQuantity > 0) throw new BadRequestException('This garment is already delivered; its measurement cannot change');
      const ok = await this.snapshot(tx, item.id, o.customerId, item.garmentType?.measurementTemplateId ?? null, o.orderType, measurementId);
      if (!ok) throw new BadRequestException('This customer has no saved measurement for this garment yet. Take the measurement first.');
      await this.audit.log({ action: 'MEASUREMENT_UPDATED', module: 'orders', recordId: id, newValues: { item: item.garmentName, note: `Measurement updated for ${item.garmentName}` } }, ctx, tx);
    });
    return this.get(id);
  }

  // ================================================================ delivery & money

  async deliver(id: string, dto: DeliverDto, ctx: RequestContext) {
    const deliveredStage = await this.prisma.workflowStage.findUniqueOrThrow({ where: { code: STAGE_DELIVERED } });
    let paymentId: string | null = null;
    let fullyDelivered = false;
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await this.openOrder(tx, id);
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      const byId = new Map(items.map((i) => [i.id, i]));
      const seen = new Set<string>();
      for (const d of dto.items) {
        const item = byId.get(d.orderItemId);
        if (!item) throw new BadRequestException('One of the garments is not part of this order');
        if (seen.has(d.orderItemId)) throw new BadRequestException(`${item.garmentName} entered twice`);
        seen.add(d.orderItemId);
        const remaining = item.quantity - item.deliveredQuantity;
        if (d.quantity > remaining) throw new BadRequestException(`${item.garmentName}: only ${remaining} piece(s) left to deliver`);
      }
      const deliveryNo = (await tx.orderDelivery.count({ where: { orderId: id } })) + 1;
      const delivery = await tx.orderDelivery.create({
        data: {
          orderId: id, deliveryNo, receivedBy: dto.receivedBy || null, notes: dto.notes || null, createdById: ctx.userId,
          items: { create: dto.items.map((d) => ({ orderItemId: d.orderItemId, quantity: d.quantity })) },
        },
      });
      let allDone = true;
      for (const item of items) {
        const add = dto.items.find((d) => d.orderItemId === item.id)?.quantity ?? 0;
        const delivered = item.deliveredQuantity + add;
        if (delivered < item.quantity) allDone = false;
        if (!add) continue;
        const full = delivered === item.quantity;
        await tx.orderItem.update({ where: { id: item.id }, data: { deliveredQuantity: delivered, ...(full ? { stageId: deliveredStage.id } : {}), version: { increment: 1 } } });
        await this.stock.consumeForDelivery(tx, item, delivered, delivery.id, o.orderNumber, ctx);
        if (full && item.stageId !== deliveredStage.id) {
          await tx.orderStatusHistory.create({ data: { orderId: id, orderItemId: item.id, fromStageId: item.stageId, toStageId: deliveredStage.id, notes: `Delivery ${deliveryNo}`, changedById: ctx.userId } });
        }
      }
      if (allDone) {
        await tx.order.update({ where: { id }, data: { lifecycle: 'DELIVERED', stageId: deliveredStage.id, actualDeliveryDate: asDate(karachiToday()), version: { increment: 1 } } });
        await tx.orderStatusHistory.create({ data: { orderId: id, fromStageId: o.stageId, toStageId: deliveredStage.id, notes: `Fully delivered (delivery ${deliveryNo})`, changedById: ctx.userId } });
      } else {
        await tx.order.update({ where: { id }, data: { lifecycle: 'PARTIALLY_DELIVERED', version: { increment: 1 } } });
      }
      const pieces = dto.items.reduce((a, d) => a + d.quantity, 0);
      await this.audit.log({ action: 'DELIVER', module: 'orders', recordId: id, newValues: { deliveryNo, pieces, note: `Delivery ${deliveryNo}: ${pieces} piece(s)${allDone ? ', order complete' : ''}` } }, ctx, tx);
      if (dto.payment && money(dto.payment.amount).gt(0)) {
        const p = await this.postPayment(tx, id, dto.payment, `delivery:${delivery.id}`, ctx);
        paymentId = p.id;
      }
      fullyDelivered = allDone;
    });
    if (fullyDelivered) void this.whatsapp.notify('ORDER_DELIVERED', { orderId: id });
    if (paymentId) void this.whatsapp.notify('PAYMENT_RECEIVED', { paymentId });
    return this.get(id);
  }

  async recordPayment(id: string, dto: RecordPaymentDto, ctx: RequestContext) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.orderId !== id) throw new ConflictException('This payment key was already used for another order');
      return this.get(id); // same request sent twice (double click, retry, offline sync)
    }
    const paymentId = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      return (await this.postPayment(tx, id, dto, dto.idempotencyKey, ctx)).id;
    });
    void this.whatsapp.notify('PAYMENT_RECEIVED', { paymentId });
    return this.get(id);
  }

  async cancel(id: string, dto: CancelOrderDto, ctx: RequestContext) {
    const cancelled = await this.prisma.workflowStage.findUniqueOrThrow({ where: { code: STAGE_CANCELLED } });
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await tx.order.findFirst({ where: { id, deletedAt: null } });
      if (!o) throw new NotFoundException('Order not found');
      if (o.lifecycle === 'CANCELLED') throw new BadRequestException('This order is already cancelled');
      if (o.lifecycle !== 'OPEN') throw new BadRequestException('Garments from this order were already delivered, so it cannot be cancelled. Use an adjustment instead.');
      const effective = dec(o.totalAmount).plus(o.adjustmentsTotal);
      await tx.order.update({
        where: { id },
        data: {
          lifecycle: 'CANCELLED', stageId: cancelled.id, cancelledAt: new Date(), cancelReason: dto.reason,
          ...paymentState(dec(0), dec(o.paidAmount)), version: { increment: 1 },
        },
      });
      await tx.orderItem.updateMany({ where: { orderId: id }, data: { stageId: cancelled.id } });
      await this.stock.releaseOrder(tx, id);
      await tx.orderStatusHistory.create({ data: { orderId: id, fromStageId: o.stageId, toStageId: cancelled.id, notes: dto.reason, changedById: ctx.userId } });
      if (effective.gt(0)) {
        await tx.customerLedger.create({
          data: {
            customerId: o.customerId, entryDate: asDate(karachiToday()), entryType: 'REVERSAL', referenceType: 'ORDER', referenceId: id,
            description: `Order ${o.orderNumber} cancelled`, credit: effective,
          },
        });
      }
      await this.audit.log({ action: 'CANCEL', module: 'orders', recordId: id, oldValues: { lifecycle: o.lifecycle }, newValues: { note: `Cancelled: ${dto.reason}`, paidKeptAsCredit: moneyString(o.paidAmount) } }, ctx, tx);
    });
    return this.get(id);
  }

  /** Authorised change of what the customer owes (the only way to change a delivered order's value). */
  async addAdjustment(id: string, dto: AdjustmentDto, ctx: RequestContext) {
    const def = ORDER_ADJUSTMENT_TYPES.find((a) => a.key === dto.type)!;
    const amount = money(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const signed = def.sign > 0 ? amount : amount.negated();
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const o = await tx.order.findFirst({ where: { id, deletedAt: null } });
      if (!o) throw new NotFoundException('Order not found');
      if (o.lifecycle === 'CANCELLED') throw new BadRequestException('Cancelled orders cannot be adjusted');
      const adjustmentsTotal = dec(o.adjustmentsTotal).plus(signed);
      const effective = dec(o.totalAmount).plus(adjustmentsTotal);
      if (effective.lt(0)) throw new BadRequestException(`The order is worth ${moneyString(dec(o.totalAmount).plus(o.adjustmentsTotal))}; the reduction cannot be more than that`);
      const adj = await tx.orderAdjustment.create({ data: { orderId: id, type: dto.type, amount: signed, reason: dto.reason, approvedById: ctx.userId, createdById: ctx.userId } });
      await tx.order.update({ where: { id }, data: { adjustmentsTotal, ...paymentState(effective, dec(o.paidAmount)), version: { increment: 1 } } });
      await tx.customerLedger.create({
        data: {
          customerId: o.customerId, entryDate: asDate(karachiToday()), entryType: 'ORDER_ADJUSTMENT', referenceType: 'ORDER_ADJUSTMENT', referenceId: adj.id,
          description: `${def.label} on ${o.orderNumber}: ${dto.reason}`, ...(signed.gt(0) ? { debit: amount } : { credit: amount }),
        },
      });
      await this.audit.log({ action: 'ADJUSTMENT', module: 'orders', recordId: id, newValues: { type: dto.type, amount: moneyString(signed), note: `${def.label} ${moneyString(amount)}: ${dto.reason}` } }, ctx, tx);
    });
    return this.get(id);
  }

  // ================================================================ helpers

  /** Row lock: serialises payments, deliveries and edits on the same order. */
  private async lock(tx: PrismaTx, id: string) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private async openOrder(tx: PrismaTx, id: string) {
    const o = await tx.order.findFirst({ where: { id, deletedAt: null } });
    if (!o) throw new NotFoundException('Order not found');
    if (o.lifecycle === 'CANCELLED') throw new BadRequestException('This order is cancelled');
    if (o.lifecycle === 'DELIVERED') throw new BadRequestException('This order is already fully delivered');
    return o;
  }

  private async initialStage() {
    const s = (await this.prisma.workflowStage.findUnique({ where: { code: STAGE_NEW } }))
      ?? (await this.prisma.workflowStage.findFirst({ where: { isActive: true, isTerminal: false }, orderBy: { sortOrder: 'asc' } }));
    if (!s) throw new BadRequestException('No workflow stages are set up. Run the database seed.');
    return s;
  }

  private async loadGarments(items: OrderItemDto[]) {
    const ids = [...new Set(items.map((i) => i.garmentTypeId).filter((v): v is string => !!v))];
    const rows = ids.length ? await this.prisma.garmentType.findMany({ where: { id: { in: ids } } }) : [];
    if (rows.length !== ids.length) throw new BadRequestException('One of the selected garments was not found');
    return new Map(rows.map((g) => [g.id, g]));
  }

  /**
   * Shop fabric chosen from stock: checks the fabric, and fills the rate (sale price) and
   * description when the form left them empty.
   */
  private async loadFabrics(items: OrderItemDto[], orderType: string, alreadyOnOrder: (string | null)[] = []) {
    for (const i of items) if (this.fabricSource(i, orderType) !== 'SHOP') i.fabricId = null;
    const ids = [...new Set(items.map((i) => i.fabricId).filter((v): v is string => !!v))];
    const rows = ids.length ? await this.prisma.fabric.findMany({ where: { id: { in: ids }, deletedAt: null } }) : [];
    if (rows.length !== ids.length) throw new BadRequestException('One of the selected fabrics was not found');
    const map = new Map(rows.map((f) => [f.id, f]));
    for (const i of items) {
      if (!i.fabricId) continue;
      const f = map.get(i.fabricId)!;
      if (!f.isActive && !alreadyOnOrder.includes(f.id)) throw new BadRequestException(`${f.name} (${f.code}) is inactive and cannot be used on new orders`);
      if (!i.fabricQuantity || dec(i.fabricQuantity).lte(0)) throw new BadRequestException(`${i.garmentName}: enter how much fabric is needed`);
      if (i.fabricRate === undefined || i.fabricRate === '') i.fabricRate = moneyString(f.salePrice);
      if (!i.fabricDescription) i.fabricDescription = [f.name, f.color].filter(Boolean).join(' - ') + ` (${f.code})`;
    }
    return map;
  }

  private lineFor(i: OrderItemDto, orderType: string): LineAmounts {
    const source = this.fabricSource(i, orderType);
    return lineAmounts({ quantity: i.quantity, stitchingPrice: i.stitchingPrice, fabricQuantity: i.fabricQuantity, fabricRate: i.fabricRate, additionalCharges: i.additionalCharges, chargeFabric: source === 'SHOP' });
  }

  private fabricSource(i: OrderItemDto, orderType: string): 'SHOP' | 'CUSTOMER' {
    if (orderType === 'FABRIC_SALE') return 'SHOP';
    return i.fabricSource ?? (orderType === 'STITCHING_WITH_FABRIC' ? 'SHOP' : 'CUSTOMER');
  }

  private itemData(i: OrderItemDto, l: LineAmounts, garments: Map<string, { id: string; name: string }>, fabrics: Map<string, unknown>, orderType: string) {
    const source = this.fabricSource(i, orderType);
    return {
      fabricId: source === 'SHOP' && i.fabricId && fabrics.has(i.fabricId) ? i.fabricId : null,
      garmentTypeId: i.garmentTypeId ?? null, garmentName: i.garmentName || garments.get(i.garmentTypeId ?? '')?.name || 'Garment',
      quantity: i.quantity, fabricSource: this.fabricSource(i, orderType), fabricDescription: i.fabricDescription || null,
      fabricPerPiece: l.fabricPerPiece, fabricQuantity: l.fabricQuantity, fabricRate: l.fabricRate, fabricAmount: l.fabricAmount,
      stitchingPrice: l.stitchingPrice, stitchingAmount: l.stitchingAmount, additionalCharges: l.additionalCharges, lineTotal: l.lineTotal,
      notes: i.notes || null,
    };
  }

  private async createItem(
    tx: PrismaTx, orderId: string, customerId: string, lineNo: number, item: OrderItemDto, l: LineAmounts,
    garments: Map<string, { id: string; name: string; measurementTemplateId: string | null }>, fabrics: Map<string, unknown>, orderType: string, stageId: string, measurementId?: string,
  ) {
    const created = await tx.orderItem.create({ data: { orderId, lineNo, stageId, ...this.itemData(item, l, garments, fabrics, orderType) } });
    await this.stock.syncItemReservation(tx, created);
    await this.snapshot(tx, created.id, customerId, garments.get(item.garmentTypeId ?? '')?.measurementTemplateId ?? null, orderType, measurementId);
    return created;
  }

  /**
   * Freezes a copy of the measurement into the order item, so later measurement changes never alter this order.
   * Returns false when the customer has no measurement for the garment yet.
   */
  private async snapshot(tx: PrismaTx, orderItemId: string, customerId: string, templateId: string | null, orderType: string, measurementId?: string): Promise<boolean> {
    if (orderType === 'FABRIC_SALE') return false;
    let m;
    if (measurementId) {
      m = await tx.customerMeasurement.findFirst({ where: { id: measurementId, customerId }, include: { template: true, values: { include: { field: true } } } });
      if (!m) throw new BadRequestException('The selected measurement does not belong to this customer');
    } else if (templateId) {
      m = await tx.customerMeasurement.findFirst({ where: { customerId, templateId, isLatest: true }, include: { template: true, values: { include: { field: true } } } });
    }
    if (!m) return false;
    const values: SnapshotValue[] = [...m.values]
      .sort((a, b) => (a.field?.sortOrder ?? 10_000) - (b.field?.sortOrder ?? 10_000) || a.fieldLabel.localeCompare(b.fieldLabel))
      .map((v) => ({ key: v.fieldKey, label: v.fieldLabel, value: v.value === null ? null : v.value.toFixed(2), text: v.textValue }));
    await tx.garmentMeasurement.deleteMany({ where: { orderItemId } });
    await tx.garmentMeasurement.create({
      data: {
        orderItemId, sourceMeasurementId: m.id, templateName: `${m.template.name} (version ${m.versionNo})`, unit: m.unit,
        values: values as unknown as Prisma.InputJsonValue, notes: m.notes,
      },
    });
    return true;
  }

  /** Order stage follows its slowest undelivered garment when garments move separately. */
  private async refreshOrderStage(tx: PrismaTx, id: string, ctx: RequestContext, notes?: string) {
    const o = await tx.order.findUniqueOrThrow({ where: { id } });
    const items = await tx.orderItem.findMany({ where: { orderId: id }, include: { stage: true } });
    const pending = items.filter((i) => i.deliveredQuantity < i.quantity);
    if (!pending.length) return;
    const slowest = pending.reduce((a, b) => (b.stage.sortOrder < a.stage.sortOrder ? b : a));
    if (slowest.stageId !== o.stageId) {
      await tx.order.update({ where: { id }, data: { stageId: slowest.stageId } });
      await tx.orderStatusHistory.create({ data: { orderId: id, fromStageId: o.stageId, toStageId: slowest.stageId, notes: notes || null, changedById: ctx.userId } });
    }
  }

  /** Records a customer payment against the order: receipt number, ledger credit and new balance. Call inside a transaction holding the order lock. */
  private async postPayment(tx: PrismaTx, orderId: string, input: PaymentInputDto, idempotencyKey: string, ctx: RequestContext) {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.lifecycle === 'CANCELLED') throw new BadRequestException('Payments cannot be added to a cancelled order');
    const amount = money(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const effective = dec(o.totalAmount).plus(o.adjustmentsTotal);
    const balance = effective.minus(o.paidAmount);
    if (balance.lte(0)) throw new BadRequestException('This order is already fully paid');
    if (amount.gt(balance)) throw new BadRequestException(`Amount is more than the balance of ${moneyString(balance)}`);
    const numbering = await this.settings.getGroup('numbering');
    const today = karachiToday();
    const receiptNo = await this.sequences.next({ key: 'RECEIPT', prefix: String(numbering.receiptPrefix ?? 'RCP'), period: today.slice(0, 4), padding: 5 }, tx);
    const type = amount.eq(balance) ? 'FULL' : o.lifecycle === 'OPEN' ? 'ADVANCE' : 'PARTIAL';
    const p = await tx.payment.create({
      data: {
        receiptNo, customerId: o.customerId, orderId, amount, method: input.method, type, reference: input.reference || null,
        idempotencyKey, notes: input.notes || null, createdById: ctx.userId,
      },
    });
    const paid = dec(o.paidAmount).plus(amount);
    await tx.order.update({ where: { id: orderId }, data: { paidAmount: paid, ...paymentState(effective, paid), version: { increment: 1 } } });
    await tx.customerLedger.create({
      data: {
        customerId: o.customerId, entryDate: asDate(today), entryType: 'PAYMENT', referenceType: 'PAYMENT', referenceId: p.id,
        description: `Receipt ${receiptNo} for ${o.orderNumber}`, credit: amount,
      },
    });
    await this.audit.log({ action: 'PAYMENT', module: 'orders', recordId: orderId, newValues: { receiptNo, amount: moneyString(amount), method: input.method, note: `Payment ${moneyString(amount)} received (${receiptNo})` } }, ctx, tx);
    return p;
  }
}
