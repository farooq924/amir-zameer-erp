import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { MOVEMENT_TYPES, unitShort } from '@az/shared';
import { PrismaTx } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { DecimalLike, dec, money } from '../../common/utils/money';

export const qty = (v: DecimalLike) => dec(v).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
export const qtyStr = (v: DecimalLike) => qty(v).toFixed(3);

/** Types whose unit cost changes the weighted average cost of the fabric. */
const COSTED_IN: MovementType[] = ['OPENING', 'PURCHASE', 'ADJUSTMENT_IN'];

export interface MovementInput {
  fabricId: string;
  type: MovementType;
  quantity: DecimalLike;
  /** Cost per unit for stock coming in (purchases, opening, adjustments). Stock going out always uses the average cost. */
  unitCost?: DecimalLike;
  referenceType?: string;
  referenceId?: string;
  /** Same key twice = same movement. Makes double clicks and retries harmless. */
  idempotencyKey: string;
  reason?: string | null;
  /** When true (default) stock going out may only use stock that is not reserved for orders. */
  respectReservations?: boolean;
}

interface ReservableItem {
  id: string;
  orderId: string;
  fabricSource: string;
  fabricId: string | null;
  fabricQuantity: Prisma.Decimal;
  quantity: number;
  garmentName: string;
}

/**
 * The only code that changes fabric stock. Every change is one append-only row in
 * inventory_movements (the database refuses edits and deletes), and the fabric row is
 * locked while it is written, so two people can never take the same stock.
 */
@Injectable()
export class StockService {
  constructor(private readonly sequences: SequenceService) {}

  /** Locks fabric rows in a fixed order (prevents deadlocks when one document touches many fabrics). */
  async lockFabrics(tx: PrismaTx, ids: string[]) {
    const unique = [...new Set(ids)].sort();
    for (const id of unique) await tx.$queryRaw`SELECT id FROM fabrics WHERE id = ${id}::uuid FOR UPDATE`;
  }

  async post(tx: PrismaTx, m: MovementInput, ctx: RequestContext) {
    const existing = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: m.idempotencyKey } });
    if (existing) return existing;
    const def = MOVEMENT_TYPES.find((t) => t.key === m.type)!;
    const quantity = qty(m.quantity);
    if (quantity.lte(0)) throw new BadRequestException('Quantity must be more than 0');
    await this.lockFabrics(tx, [m.fabricId]);
    const f = await tx.fabric.findFirst({ where: { id: m.fabricId, deletedAt: null } });
    if (!f) throw new NotFoundException('Fabric not found');
    const stock = dec(f.currentStock);
    const avg = dec(f.averageCost);
    let unitCost: Prisma.Decimal;
    let balanceAfter: Prisma.Decimal;
    let averageCost = avg;
    if (def.direction === 'IN') {
      unitCost = COSTED_IN.includes(m.type) && m.unitCost !== undefined && m.unitCost !== null && m.unitCost !== '' ? dec(m.unitCost) : avg;
      balanceAfter = stock.plus(quantity);
      averageCost = balanceAfter.gt(0) ? stock.times(avg).plus(quantity.times(unitCost)).div(balanceAfter).toDecimalPlaces(4) : unitCost;
    } else {
      const free = m.respectReservations === false ? stock : stock.minus(f.reservedStock);
      if (quantity.gt(free)) {
        const u = unitShort(f.unit);
        const reservedNote = m.respectReservations === false || dec(f.reservedStock).eq(0) ? '' : ` (${qtyStr(f.reservedStock)} ${u} is reserved for orders)`;
        throw new BadRequestException(`${f.name} (${f.code}): only ${qtyStr(free.lt(0) ? 0 : free)} ${u} available${reservedNote}`);
      }
      unitCost = avg;
      balanceAfter = stock.minus(quantity);
    }
    const movementNo = await this.sequences.next({ key: 'STOCK', prefix: 'STK', period: karachiToday().slice(0, 4), padding: 6 }, tx);
    const row = await tx.inventoryMovement.create({
      data: {
        movementNo, fabricId: f.id, type: m.type, direction: def.direction, quantity, unitCost: unitCost.toDecimalPlaces(4),
        totalCost: money(quantity.times(unitCost)), balanceAfter, location: f.location, referenceType: m.referenceType ?? null,
        referenceId: m.referenceId ?? null, idempotencyKey: m.idempotencyKey, reason: m.reason ?? null, createdById: ctx.userId,
      },
    });
    await tx.fabric.update({ where: { id: f.id }, data: { currentStock: balanceAfter, averageCost, version: { increment: 1 } } });
    return row;
  }

  // ------------------------------------------------------------ order reservations

  /**
   * Keeps the reservation of one order item in line with the item: shop fabric chosen from stock is
   * reserved (so nobody else can sell it) until the garment is delivered. Call inside the order transaction.
   */
  async syncItemReservation(tx: PrismaTx, item: ReservableItem) {
    const wanted = item.fabricSource === 'SHOP' && item.fabricId ? qty(item.fabricQuantity) : dec(0);
    const rows = await tx.stockReservation.findMany({ where: { orderItemId: item.id } });
    await this.lockFabrics(tx, [...rows.map((r) => r.fabricId), ...(item.fabricId ? [item.fabricId] : [])]);
    for (const r of rows) {
      if (r.fabricId === item.fabricId && wanted.gt(0)) continue;
      if (dec(r.consumed).gt(0)) throw new BadRequestException(`${item.garmentName}: fabric already issued from stock, it cannot be changed`);
      if (r.status === 'ACTIVE') await this.changeReserved(tx, r.fabricId, dec(r.quantity).minus(r.consumed).negated());
      await tx.stockReservation.update({ where: { id: r.id }, data: { status: 'RELEASED', closedAt: new Date() } });
    }
    if (wanted.lte(0) || !item.fabricId) return;
    const fabric = await tx.fabric.findFirst({ where: { id: item.fabricId, deletedAt: null } });
    if (!fabric) throw new BadRequestException(`${item.garmentName}: the selected fabric was not found`);
    const r = rows.find((x) => x.fabricId === item.fabricId);
    const consumed = r ? dec(r.consumed) : dec(0);
    if (wanted.lt(consumed)) throw new BadRequestException(`${item.garmentName}: ${qtyStr(consumed)} ${unitShort(fabric.unit)} was already issued, fabric cannot be lower`);
    const oldRemaining = r && r.status !== 'RELEASED' ? dec(r.quantity).minus(r.consumed) : dec(0);
    const newRemaining = wanted.minus(consumed);
    const delta = newRemaining.minus(oldRemaining);
    if (delta.gt(0)) {
      if (!fabric.isActive) throw new BadRequestException(`${fabric.name} (${fabric.code}) is inactive and cannot be used on new orders`);
      const free = dec(fabric.currentStock).minus(fabric.reservedStock);
      if (delta.gt(free)) {
        throw new BadRequestException(`${item.garmentName}: only ${qtyStr(free.lt(0) ? 0 : free)} ${unitShort(fabric.unit)} of ${fabric.name} (${fabric.code}) is available`);
      }
    }
    if (!delta.eq(0)) await this.changeReserved(tx, fabric.id, delta);
    const status = newRemaining.gt(0) ? 'ACTIVE' : 'CONSUMED';
    if (r) {
      await tx.stockReservation.update({ where: { id: r.id }, data: { quantity: wanted, status, closedAt: status === 'ACTIVE' ? null : new Date() } });
    } else {
      await tx.stockReservation.create({ data: { fabricId: fabric.id, orderId: item.orderId, orderItemId: item.id, quantity: wanted, status } });
    }
  }

  /** Removes reservations of items that are deleted from an order (nothing was issued for them). */
  async dropItemReservations(tx: PrismaTx, orderItemId: string) {
    const rows = await tx.stockReservation.findMany({ where: { orderItemId } });
    await this.lockFabrics(tx, rows.map((r) => r.fabricId));
    for (const r of rows) {
      if (dec(r.consumed).gt(0)) throw new BadRequestException('Fabric was already issued for this garment, it cannot be removed');
      if (r.status === 'ACTIVE') await this.changeReserved(tx, r.fabricId, dec(r.quantity).negated());
      await tx.stockReservation.delete({ where: { id: r.id } });
    }
  }

  /**
   * Issues fabric for delivered pieces: stock goes down by the share of the reserved fabric
   * for the pieces delivered so far (all of it when the item is complete).
   */
  async consumeForDelivery(tx: PrismaTx, item: ReservableItem, deliveredTotal: number, deliveryId: string, orderNumber: string, ctx: RequestContext) {
    const r = await tx.stockReservation.findFirst({ where: { orderItemId: item.id, status: 'ACTIVE' } });
    if (!r) return;
    const total = dec(r.quantity);
    const target = deliveredTotal >= item.quantity ? total : qty(total.times(deliveredTotal).div(item.quantity));
    const delta = target.minus(r.consumed);
    if (delta.lte(0)) return;
    await this.changeReserved(tx, r.fabricId, delta.negated());
    await this.post(tx, {
      fabricId: r.fabricId, type: 'ORDER_CONSUMPTION', quantity: delta, referenceType: 'ORDER', referenceId: item.orderId,
      idempotencyKey: `delivery:${deliveryId}:${item.id}`, reason: `${orderNumber} - ${item.garmentName}`,
    }, ctx);
    const full = target.gte(total);
    await tx.stockReservation.update({ where: { id: r.id }, data: { consumed: target, status: full ? 'CONSUMED' : 'ACTIVE', closedAt: full ? new Date() : null } });
  }

  /** Frees everything an order still has reserved (order cancelled). */
  async releaseOrder(tx: PrismaTx, orderId: string) {
    const rows = await tx.stockReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
    await this.lockFabrics(tx, rows.map((r) => r.fabricId));
    for (const r of rows) {
      await this.changeReserved(tx, r.fabricId, dec(r.quantity).minus(r.consumed).negated());
      await tx.stockReservation.update({ where: { id: r.id }, data: { status: 'RELEASED', closedAt: new Date() } });
    }
  }

  private async changeReserved(tx: PrismaTx, fabricId: string, delta: Prisma.Decimal) {
    if (delta.eq(0)) return;
    const f = await tx.fabric.findUniqueOrThrow({ where: { id: fabricId } });
    const next = dec(f.reservedStock).plus(delta);
    await tx.fabric.update({ where: { id: fabricId }, data: { reservedStock: next.lt(0) ? 0 : next } });
  }
}
