import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '../../common/tenant';
import { Fabric, Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { RequestContext } from '../../common/types/auth-user';
import { DecimalLike, dec, moneyString } from '../../common/utils/money';
import { SettingsService } from '../settings/settings.service';
import {
  AdjustStockDto, CategoryDto, CreateFabricDto, FabricPickerQueryDto, FabricQueryDto, MovementQueryDto, UpdateCategoryDto, UpdateFabricDto,
} from './dto/inventory.dto';
import { StockService, qtyStr } from './stock.service';

const include = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, code: true, name: true } },
} satisfies Prisma.FabricInclude;
type Row = Prisma.FabricGetPayload<{ include: typeof include }>;

export type StockLevel = 'OUT' | 'LOW' | 'OK';

export function stockLevel(f: Pick<Fabric, 'currentStock' | 'reservedStock' | 'minimumStock'>): StockLevel {
  const available = dec(f.currentStock).minus(f.reservedStock);
  if (available.lte(0)) return 'OUT';
  if (dec(f.minimumStock).gt(0) && available.lte(f.minimumStock)) return 'LOW';
  return 'OK';
}

export function presentFabric(f: Row) {
  const available = dec(f.currentStock).minus(f.reservedStock);
  return {
    id: f.id, code: f.code, name: f.name, brand: f.brand, category: f.category, color: f.color, design: f.design, quality: f.quality,
    supplier: f.supplier, unit: f.unit, location: f.location, isActive: f.isActive, version: f.version,
    purchasePrice: moneyString(f.purchasePrice), salePrice: moneyString(f.salePrice),
    minimumStock: qtyStr(f.minimumStock), currentStock: qtyStr(f.currentStock), reservedStock: qtyStr(f.reservedStock),
    availableStock: qtyStr(available.lt(0) ? 0 : available), averageCost: dec(f.averageCost).toFixed(2),
    stockValue: moneyString(dec(f.currentStock).times(f.averageCost)), level: stockLevel(f),
    createdAt: f.createdAt, updatedAt: f.updatedAt,
  };
}

const dayStart = (s: string) => new Date(`${s}T00:00:00+05:00`);
const dayEnd = (s: string) => new Date(`${s}T23:59:59.999+05:00`);

@Injectable()
export class FabricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly stock: StockService,
  ) {}

  // ================================================================ fabrics

  async list(q: FabricQueryDto) {
    const where: Prisma.FabricWhereInput = { deletedAt: null };
    const status = q.status ?? 'active';
    if (status !== 'all') where.isActive = status === 'active';
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.search) {
      const s = q.search.trim();
      where.OR = ['code', 'name', 'brand', 'color', 'design', 'quality'].map((k) => ({ [k]: { contains: s, mode: 'insensitive' } }));
    }
    if (q.stock && q.stock !== 'all') {
      // Stock levels compare two columns, so the matching ids come from SQL.
      const ids = await this.idsByLevel(q.stock);
      where.id = { in: ids };
    }
    const sortBy = q.sortBy ?? 'name';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.fabric.findMany({
        where, include, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        orderBy: [{ [sortBy]: q.sortBy ? q.sortOrder : 'asc' }, { code: 'asc' }],
      }),
      this.prisma.fabric.count({ where }),
    ]);
    return paginate(rows.map(presentFabric), total, q);
  }

  private async idsByLevel(level: 'low' | 'out' | 'in'): Promise<string[]> {
    const rows = level === 'out'
      ? await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM fabrics WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "currentStock" - "reservedStock" <= 0`
      : level === 'low'
        ? await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM fabrics WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "minimumStock" > 0 AND "currentStock" - "reservedStock" <= "minimumStock"`
        : await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM fabrics WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "currentStock" - "reservedStock" > 0`;
    return rows.map((r) => r.id);
  }

  /** Header numbers for the inventory page. */
  async summary() {
    const [agg] = await this.prisma.$queryRaw<{ fabrics: bigint; value: DecimalLike; low: bigint; out: bigint; reserved: DecimalLike }[]>`
      SELECT COUNT(*)::bigint AS fabrics,
             COALESCE(SUM("currentStock" * "averageCost"), 0) AS value,
             COUNT(*) FILTER (WHERE "minimumStock" > 0 AND "currentStock" - "reservedStock" <= "minimumStock" AND "currentStock" - "reservedStock" > 0)::bigint AS low,
             COUNT(*) FILTER (WHERE "currentStock" - "reservedStock" <= 0)::bigint AS out,
             COALESCE(SUM("reservedStock"), 0) AS reserved
      FROM fabrics WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "isActive"`;
    const lowList = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM fabrics WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "isActive" AND "minimumStock" > 0 AND "currentStock" - "reservedStock" <= "minimumStock"
      ORDER BY ("currentStock" - "reservedStock") ASC LIMIT 8`;
    const low = lowList.length ? await this.prisma.fabric.findMany({ where: { id: { in: lowList.map((r) => r.id) } }, include }) : [];
    const order = new Map(lowList.map((r, i) => [r.id, i]));
    return {
      activeFabrics: Number(agg.fabrics), stockValue: moneyString(agg.value), lowStock: Number(agg.low), outOfStock: Number(agg.out),
      reservedQuantity: qtyStr(agg.reserved),
      lowStockItems: low.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(presentFabric),
    };
  }

  async get(id: string) {
    const f = await this.prisma.fabric.findFirst({ where: { id, deletedAt: null }, include });
    if (!f) throw new NotFoundException('Fabric not found');
    const [reservations, lastPurchase] = await Promise.all([
      this.prisma.stockReservation.findMany({
        where: { fabricId: id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
        include: { order: { select: { id: true, orderNumber: true, expectedDeliveryDate: true, customer: { select: { name: true } } } }, orderItem: { select: { garmentName: true, quantity: true } } },
      }),
      this.prisma.purchaseItem.findFirst({ where: { fabricId: id, purchase: { status: 'POSTED' } }, orderBy: { purchase: { purchaseDate: 'desc' } }, include: { purchase: { select: { id: true, purchaseNo: true, purchaseDate: true, supplier: { select: { name: true } } } } } }),
    ]);
    return {
      ...presentFabric(f),
      reservations: reservations.map((r) => ({
        id: r.id, orderId: r.orderId, orderNumber: r.order.orderNumber, customerName: r.order.customer.name,
        expectedDeliveryDate: r.order.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null, garment: `${r.orderItem.quantity} x ${r.orderItem.garmentName}`,
        quantity: qtyStr(r.quantity), consumed: qtyStr(r.consumed), remaining: qtyStr(dec(r.quantity).minus(r.consumed)),
      })),
      lastPurchase: lastPurchase ? {
        purchaseId: lastPurchase.purchase.id, purchaseNo: lastPurchase.purchase.purchaseNo, date: lastPurchase.purchase.purchaseDate.toISOString().slice(0, 10),
        supplier: lastPurchase.purchase.supplier.name, rate: moneyString(lastPurchase.rate), quantity: qtyStr(lastPurchase.quantity),
      } : null,
    };
  }

  async create(dto: CreateFabricDto, ctx: RequestContext) {
    await this.checkRefs(dto.categoryId, dto.supplierId);
    await this.assertUnique(dto.name, dto.color ?? null, dto.design ?? null);
    const numbering = await this.settings.getGroup('numbering');
    const prefix = String(numbering.fabricPrefix ?? 'AZF');
    const opening = dto.openingStock ? dec(dto.openingStock) : dec(0);
    const id = await this.prisma.$transaction(async (tx) => {
      const code = await this.sequences.next({ key: 'FABRIC', prefix, padding: 4 }, tx);
      const f = await tx.fabric.create({
        data: {
          code, name: dto.name, brand: dto.brand ?? null, categoryId: dto.categoryId ?? null, color: dto.color ?? null, design: dto.design ?? null,
          quality: dto.quality ?? null, supplierId: dto.supplierId ?? null, purchasePrice: dto.purchasePrice ?? '0', salePrice: dto.salePrice ?? '0',
          unit: dto.unit ?? 'METER', minimumStock: dto.minimumStock ?? '0', location: dto.location ?? null, isActive: dto.isActive ?? true,
          averageCost: dto.openingCost ?? dto.purchasePrice ?? '0',
        },
      });
      if (opening.gt(0)) {
        await this.stock.post(tx, {
          fabricId: f.id, type: 'OPENING', quantity: opening, unitCost: dto.openingCost ?? dto.purchasePrice ?? '0',
          referenceType: 'FABRIC', referenceId: f.id, idempotencyKey: `fabric:${f.id}:opening`, reason: 'Opening stock',
        }, ctx);
      }
      await this.audit.log({ action: 'CREATE', module: 'inventory', recordId: f.id, newValues: { code, name: f.name, openingStock: qtyStr(opening) } }, ctx, tx);
      return f.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateFabricDto, ctx: RequestContext) {
    const before = await this.prisma.fabric.findFirst({ where: { id, deletedAt: null }, include });
    if (!before) throw new NotFoundException('Fabric not found');
    await this.checkRefs(dto.categoryId, dto.supplierId);
    const name = dto.name ?? before.name;
    const color = dto.color === undefined ? before.color : dto.color;
    const design = dto.design === undefined ? before.design : dto.design;
    if (name !== before.name || color !== before.color || design !== before.design) await this.assertUnique(name, color, design, id);
    if (dto.unit && dto.unit !== before.unit) {
      const moved = await this.prisma.inventoryMovement.count({ where: { fabricId: id } });
      if (moved > 0) throw new BadRequestException('The unit cannot change after stock was recorded for this fabric');
    }
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.fabric.update({
        where: { id },
        data: {
          name: dto.name, brand: dto.brand, categoryId: dto.categoryId, color: dto.color, design: dto.design, quality: dto.quality,
          supplierId: dto.supplierId, purchasePrice: dto.purchasePrice, salePrice: dto.salePrice, unit: dto.unit, minimumStock: dto.minimumStock,
          location: dto.location, isActive: dto.isActive, version: { increment: 1 },
        },
        include,
      });
      await this.audit.log({ action: 'UPDATE', module: 'inventory', recordId: id, oldValues: presentFabric(before), newValues: presentFabric(after) }, ctx, tx);
    });
    return this.get(id);
  }

  /** Manual stock correction (count difference, damage, waste ...). Always a new ledger row, never an edit. */
  async adjust(id: string, dto: AdjustStockDto, ctx: RequestContext) {
    const existing = await this.prisma.inventoryMovement.findUnique({ where: { idempotencyKey: `adjust:${dto.idempotencyKey}` } });
    if (existing) {
      if (existing.fabricId !== id) throw new ConflictException('This adjustment key was already used for another fabric');
      return this.get(id);
    }
    await this.prisma.$transaction(async (tx) => {
      const m = await this.stock.post(tx, {
        fabricId: id, type: dto.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', quantity: dto.quantity, unitCost: dto.unitCost,
        referenceType: 'ADJUSTMENT', idempotencyKey: `adjust:${dto.idempotencyKey}`, reason: dto.reason,
      }, ctx);
      await this.audit.log({
        action: 'STOCK_ADJUSTMENT', module: 'inventory', recordId: id,
        newValues: { movementNo: m.movementNo, direction: dto.direction, quantity: qtyStr(dto.quantity), reason: dto.reason },
      }, ctx, tx);
    });
    return this.get(id);
  }

  async movements(q: MovementQueryDto) {
    const where: Prisma.InventoryMovementWhereInput = {};
    if (q.fabricId) where.fabricId = q.fabricId;
    if (q.type) where.type = q.type;
    if (q.from || q.to) where.movementDate = { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lte: dayEnd(q.to) } : {}) };
    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { movementNo: { contains: s, mode: 'insensitive' } },
        { reason: { contains: s, mode: 'insensitive' } },
        { fabric: { name: { contains: s, mode: 'insensitive' } } },
        { fabric: { code: { contains: s, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ movementDate: q.sortOrder }, { movementNo: q.sortOrder }],
        include: { fabric: { select: { id: true, code: true, name: true, unit: true } }, createdBy: { select: { id: true, fullName: true } } },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return paginate(rows.map((m) => ({
      id: m.id, movementNo: m.movementNo, fabric: m.fabric, type: m.type, direction: m.direction, quantity: qtyStr(m.quantity),
      unitCost: dec(m.unitCost).toFixed(2), totalCost: moneyString(m.totalCost), balanceAfter: qtyStr(m.balanceAfter),
      referenceType: m.referenceType, referenceId: m.referenceId, reason: m.reason, movementDate: m.movementDate, createdBy: m.createdBy,
    })), total, q);
  }

  /** Light list for pickers (order form, purchase form): active fabrics with what is free to use. */
  async picker(q: FabricPickerQueryDto) {
    const s = q.search?.trim();
    const ids = q.ids ? q.ids.split(',') : null;
    const rows = await this.prisma.fabric.findMany({
      where: ids ? { deletedAt: null, id: { in: ids } } : {
        deletedAt: null,
        OR: [
          { isActive: true, ...(s ? { OR: ['code', 'name', 'brand', 'color', 'design'].map((k) => ({ [k]: { contains: s, mode: 'insensitive' as const } })) } : {}) },
          ...(q.include ? [{ id: q.include }] : []),
        ],
      },
      include, orderBy: [{ name: 'asc' }, { code: 'asc' }], take: 50,
    });
    return rows.map((f) => {
      const p = presentFabric(f);
      return {
        id: p.id, code: p.code, name: p.name, brand: p.brand, color: p.color, design: p.design, unit: p.unit, isActive: p.isActive,
        salePrice: p.salePrice, purchasePrice: p.purchasePrice, currentStock: p.currentStock, availableStock: p.availableStock, level: p.level,
        category: p.category?.name ?? null,
      };
    });
  }

  private async checkRefs(categoryId?: string | null, supplierId?: string | null) {
    if (categoryId && !(await this.prisma.fabricCategory.findUnique({ where: { id: categoryId } }))) throw new BadRequestException('Select a valid category');
    if (supplierId && !(await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } }))) throw new BadRequestException('Select a valid supplier');
  }

  private async assertUnique(name: string, color: string | null, design: string | null, excludeId?: string) {
    const dup = await this.prisma.fabric.findFirst({
      where: {
        deletedAt: null, name: { equals: name, mode: 'insensitive' },
        color: color ? { equals: color, mode: 'insensitive' } : null, design: design ? { equals: design, mode: 'insensitive' } : null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (dup) throw new ConflictException(`This fabric already exists as ${dup.code}`);
  }

  // ================================================================ categories

  async categories(includeInactive = true) {
    const rows = await this.prisma.fabricCategory.findMany({
      where: includeInactive ? {} : { isActive: true }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { fabrics: { where: { deletedAt: null } } } } },
    });
    return rows.map((c) => ({ id: c.id, name: c.name, description: c.description, isActive: c.isActive, fabrics: c._count.fabrics }));
  }

  async createCategory(dto: CategoryDto, ctx: RequestContext) {
    await this.assertCategoryName(dto.name);
    const c = await this.prisma.fabricCategory.create({ data: { name: dto.name, description: dto.description ?? null, isActive: dto.isActive ?? true } });
    await this.audit.log({ action: 'CREATE', module: 'inventory', recordId: c.id, newValues: { category: c.name } }, ctx);
    return c;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, ctx: RequestContext) {
    const before = await this.prisma.fabricCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    if (dto.name && dto.name.toLowerCase() !== before.name.toLowerCase()) await this.assertCategoryName(dto.name, id);
    const c = await this.prisma.fabricCategory.update({ where: { id }, data: { name: dto.name, description: dto.description, isActive: dto.isActive } });
    await this.audit.log({ action: 'UPDATE', module: 'inventory', recordId: id, oldValues: { category: before.name, isActive: before.isActive }, newValues: { category: c.name, isActive: c.isActive } }, ctx);
    return c;
  }

  private async assertCategoryName(name: string, excludeId?: string) {
    const dup = await this.prisma.fabricCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`A category named "${dup.name}" already exists`);
  }
}
