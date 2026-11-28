import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {
  CONFLICT_KINDS, type ConflictKind, type PermissionAction, PAYMENT_METHODS, SYNC_CUSTOMER_FIELDS, type SyncResultStatus,
  changedFields, normalizePhone, permissionCode,
} from '@az/shared';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { moneyString } from '../../common/utils/money';
import { CustomersService } from '../customers/customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from '../customers/dto/customer.dto';
import { presentGarment } from '../garments/garments.service';
import { SaveMeasurementDto } from '../measurements/dto/measurement.dto';
import { MeasurementsService } from '../measurements/measurements.service';
import { CreateOrderDto, RecordPaymentDto } from '../orders/dto/order.dto';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { ConflictQueryDto, ResolveConflictDto, SyncLogQueryDto, SyncOperationDto, SyncPushDto } from './dto/sync.dto';

export interface SyncResult {
  id: string;
  status: SyncResultStatus;
  message?: string;
  conflictId?: string;
  result?: Record<string, unknown> | null;
}

/** Stored in SyncConflict.serverData so the review screen knows what kind of conflict it is. */
interface ConflictServerData {
  kind: ConflictKind;
  record: Record<string, unknown>;
}

const CUSTOMER_KEYS = SYNC_CUSTOMER_FIELDS.map((f) => f.key);

/** What each entity/operation needs. Payments are recorded against an order, like POST /orders/:id/payments. */
const RULES: Record<string, { module: string; action: PermissionAction }> = {
  'customer:CREATE': { module: 'customers', action: 'CREATE' },
  'customer:UPDATE': { module: 'customers', action: 'EDIT' },
  'measurement:CREATE': { module: 'measurements', action: 'CREATE' },
  'order:CREATE': { module: 'orders', action: 'CREATE' },
  'payment:CREATE': { module: 'payments', action: 'CREATE' },
};

class Rejected extends Error {}

function flattenErrors(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {});
    return [...own, ...flattenErrors(e.children ?? [], path)];
  });
}

/** Replaces ids everywhere in a payload (used when a device's new customer was matched to an existing one). */
function remapIds<T>(value: T, map: Map<string, string>): T {
  if (!map.size) return value;
  let json = JSON.stringify(value);
  for (const [from, to] of map) json = json.split(from).join(to);
  return JSON.parse(json) as T;
}

function httpMessage(e: HttpException): { message: string; details?: unknown } {
  const r = e.getResponse();
  if (typeof r === 'object' && r !== null) {
    const body = r as { message?: unknown; details?: unknown };
    if (Array.isArray(body.message)) return { message: 'Validation failed', details: body.message };
    if (typeof body.message === 'string') return { message: body.message, details: body.details };
  }
  return { message: e.message };
}

function detailText(details: unknown): string {
  return Array.isArray(details) && details.length ? `: ${details.map(String).join('; ')}` : '';
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger('Sync');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
    private readonly measurements: MeasurementsService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  private can(user: AuthUser, module: string, action: PermissionAction): boolean {
    return user.isOwner || user.permissions.includes(permissionCode(module, action));
  }

  // ================================================================ push

  async push(dto: SyncPushDto, user: AuthUser, ctx: RequestContext) {
    const results: SyncResult[] = [];
    // Sequential on purpose: later operations may depend on earlier ones in the same batch.
    for (const op of dto.operations) results.push(await this.applyOne(op, dto.deviceId, user, ctx));
    const counts = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
    return { serverTime: new Date().toISOString(), results, counts };
  }

  private async applyOne(op: SyncOperationDto, deviceId: string, user: AuthUser, ctx: RequestContext): Promise<SyncResult> {
    const existing = await this.prisma.syncOperation.findUnique({ where: { id: op.id }, include: { conflicts: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (existing) return this.replay(existing, user);

    const rule = RULES[`${op.entityType}:${op.operation}`];
    if (!rule) return this.store(op, deviceId, user, 'REJECTED', { message: `${op.operation} is not supported for ${op.entityType} while offline` });

    // Dependencies (e.g. the order of a new customer created on the same device).
    const remap = new Map<string, string>();
    for (const depId of op.dependsOn ?? []) {
      const dep = await this.prisma.syncOperation.findUnique({ where: { id: depId } });
      if (!dep) return { id: op.id, status: 'WAITING', message: 'Waiting for an earlier entry from this device' };
      if (dep.status === 'CONFLICT' || dep.status === 'PENDING') return { id: op.id, status: 'WAITING', message: 'Waiting for a sync conflict to be resolved' };
      if (dep.status === 'REJECTED') {
        return this.store(op, deviceId, user, 'REJECTED', { message: `An earlier entry it depends on was rejected: ${dep.errorMessage ?? 'unknown reason'}` });
      }
      const mappedTo = (dep.result as { mappedTo?: string } | null)?.mappedTo;
      if (mappedTo && mappedTo !== dep.entityId) remap.set(dep.entityId, mappedTo);
    }

    if (!this.can(user, rule.module, rule.action)) {
      return this.store(op, deviceId, user, 'REJECTED', { message: `You do not have permission (${rule.module} ${rule.action.toLowerCase()})` });
    }

    const payload = remapIds(op.payload, remap);
    try {
      const outcome = await this.execute(op, payload, user, ctx);
      if ('conflict' in outcome) return this.storeConflict(op, payload, deviceId, user, outcome.conflict);
      return this.store(op, deviceId, user, 'APPLIED', { result: outcome.result, payload });
    } catch (e) {
      if (e instanceof Rejected) return this.store(op, deviceId, user, 'REJECTED', { message: e.message, payload });
      if (e instanceof HttpException && e.getStatus() < 500) {
        const { message, details } = httpMessage(e);
        // A new customer whose phone number is already on the server: let a person decide.
        if (e instanceof ConflictException && op.entityType === 'customer' && op.operation === 'CREATE') {
          const dup = (details as { duplicates?: { id: string }[] } | undefined)?.duplicates?.[0];
          if (dup) {
            const record = await this.customers.get(dup.id).then((c) => this.customerFields(c)).catch(() => null);
            if (record) return this.storeConflict(op, payload, deviceId, user, { kind: 'DUPLICATE', record, serverVersion: Number(record.version ?? 1) });
          }
        }
        return this.store(op, deviceId, user, 'REJECTED', { message: message + detailText(details), payload });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.store(op, deviceId, user, 'REJECTED', { message: 'A record with the same unique value already exists', payload });
      }
      // Unexpected / temporary problem: not stored, the device retries later.
      this.logger.error(`Sync operation ${op.id} (${op.entityType} ${op.operation}) failed: ${(e as Error)?.message}`, (e as Error)?.stack);
      return { id: op.id, status: 'RETRY', message: 'The server could not save this entry right now. It will be sent again.' };
    }
  }

  private replay(existing: Prisma.SyncOperationGetPayload<{ include: { conflicts: true } }>, user: AuthUser): SyncResult {
    if (existing.userId && existing.userId !== user.id && !user.isOwner) {
      return { id: existing.id, status: 'REJECTED', message: 'This entry was already sent by another user' };
    }
    const result = (existing.result as Record<string, unknown> | null) ?? null;
    switch (existing.status) {
      case 'APPLIED':
      case 'DUPLICATE':
        return { id: existing.id, status: 'DUPLICATE', result, message: 'Already saved on the server' };
      case 'CONFLICT':
        return { id: existing.id, status: 'CONFLICT', conflictId: existing.conflicts[0]?.id, message: existing.errorMessage ?? 'Needs review' };
      default:
        return { id: existing.id, status: 'REJECTED', message: existing.errorMessage ?? 'Rejected' };
    }
  }

  private async validated<T extends object>(cls: new () => T, payload: Record<string, unknown>): Promise<T> {
    const obj = plainToInstance(cls, payload);
    const errors = await validate(obj, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new Rejected(`Please correct the entry: ${flattenErrors(errors).join('; ')}`);
    return obj;
  }

  private async execute(op: SyncOperationDto, payload: Record<string, unknown>, user: AuthUser, ctx: RequestContext):
    Promise<{ result: Record<string, unknown> } | { conflict: { kind: ConflictKind; record: Record<string, unknown>; serverVersion: number } }> {
    switch (`${op.entityType}:${op.operation}`) {
      case 'customer:CREATE': {
        const dto = await this.validated(CreateCustomerDto, { ...payload, id: op.entityId });
        const c = await this.customers.create(dto, ctx);
        return { result: { entityId: c.id, code: c.code, name: c.name, version: c.version } };
      }
      case 'customer:UPDATE': {
        if (!op.baseVersion) throw new Rejected('baseVersion is required for an update');
        const { version: _v, ...fields } = payload;
        const dto = await this.validated(UpdateCustomerDto, { ...fields, version: op.baseVersion });
        const current = await this.customers.get(op.entityId).catch(() => null);
        if (!current) throw new Rejected('This customer was deleted on the server');
        if (current.version !== op.baseVersion) {
          const server = this.customerFields(current);
          const device = this.normalizeCustomer(fields);
          const differs = changedFields(server, device, Object.keys(fields).filter((k) => CUSTOMER_KEYS.includes(k as never)));
          if (!differs.length) return { result: { entityId: current.id, code: current.code, version: current.version, note: 'Server already had the same values' } };
          return { conflict: { kind: 'VERSION', record: server, serverVersion: current.version } };
        }
        const c = await this.customers.update(op.entityId, dto, ctx);
        return { result: { entityId: c.id, code: c.code, name: c.name, version: c.version } };
      }
      case 'measurement:CREATE': {
        const customerId = String(payload.customerId ?? '');
        const { customerId: _c, ...rest } = payload;
        const dto = await this.validated(SaveMeasurementDto, { ...rest, id: op.entityId });
        if (!/^[0-9a-f-]{36}$/i.test(customerId)) throw new Rejected('customerId is required');
        const m = await this.measurements.saveVersion(customerId, dto, ctx);
        return { result: { entityId: m.id, customerId, template: m.template?.name ?? null, versionNo: m.versionNo } };
      }
      case 'order:CREATE': {
        const dto = await this.validated(CreateOrderDto, { ...payload, id: op.entityId });
        const o = await this.orders.create(dto, ctx);
        return { result: { entityId: o.id, orderNumber: o.orderNumber, totalAmount: o.totalAmount, balanceAmount: o.balanceAmount } };
      }
      case 'payment:CREATE': {
        const orderId = String(payload.orderId ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Rejected('orderId is required');
        const { orderId: _o, ...rest } = payload;
        const dto = await this.validated(RecordPaymentDto, { ...rest, idempotencyKey: `sync:${op.id}` });
        const o = await this.orders.recordPayment(orderId, dto, ctx);
        const p = await this.prisma.payment.findUnique({ where: { idempotencyKey: `sync:${op.id}` }, select: { id: true, receiptNo: true } });
        return { result: { entityId: p?.id ?? op.entityId, receiptNo: p?.receiptNo ?? null, orderId, orderNumber: o.orderNumber, balanceAmount: o.balanceAmount } };
      }
    }
    void user;
    throw new Rejected('Unsupported entry');
  }

  private async store(
    op: SyncOperationDto, deviceId: string, user: AuthUser, status: 'APPLIED' | 'REJECTED',
    extra: { message?: string; result?: Record<string, unknown>; payload?: Record<string, unknown> },
  ): Promise<SyncResult> {
    try {
      await this.prisma.syncOperation.create({
        data: {
          id: op.id, deviceId, userId: user.id, entityType: op.entityType, entityId: op.entityId, operation: op.operation,
          baseVersion: op.baseVersion ?? null, payload: (extra.payload ?? op.payload) as Prisma.InputJsonValue, status,
          result: (extra.result ?? undefined) as Prisma.InputJsonValue | undefined, errorMessage: extra.message?.slice(0, 2000) ?? null,
          clientTimestamp: new Date(op.clientTimestamp),
        },
      });
    } catch (e) {
      // Same operation sent twice at the same moment (two tabs): the first one wins.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.syncOperation.findUnique({ where: { id: op.id }, include: { conflicts: true } });
        if (again) return this.replay(again, user);
      }
      throw e;
    }
    return { id: op.id, status, message: extra.message, result: extra.result ?? null };
  }

  private async storeConflict(
    op: SyncOperationDto, payload: Record<string, unknown>, deviceId: string, user: AuthUser,
    conflict: { kind: ConflictKind; record: Record<string, unknown>; serverVersion: number },
  ): Promise<SyncResult> {
    const message = conflict.kind === 'VERSION'
      ? 'This customer was also changed on the server. Review which details to keep.'
      : `A customer with this phone number already exists: ${String(conflict.record.name)} (${String(conflict.record.code)}). Review before saving.`;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.syncOperation.create({
        data: {
          id: op.id, deviceId, userId: user.id, entityType: op.entityType, entityId: op.entityId, operation: op.operation,
          baseVersion: op.baseVersion ?? null, payload: payload as Prisma.InputJsonValue, status: 'CONFLICT', errorMessage: message,
          clientTimestamp: new Date(op.clientTimestamp),
        },
      });
      return tx.syncConflict.create({
        data: {
          syncOperationId: op.id, entityType: op.entityType, entityId: conflict.kind === 'DUPLICATE' ? String(conflict.record.id) : op.entityId,
          serverVersion: conflict.serverVersion, clientVersion: op.baseVersion ?? null,
          serverData: { kind: conflict.kind, record: conflict.record } as unknown as Prisma.InputJsonValue,
          clientData: this.normalizeCustomer(payload) as Prisma.InputJsonValue,
        },
      });
    });
    return { id: op.id, status: 'CONFLICT', conflictId: created.id, message };
  }

  private customerFields(c: Awaited<ReturnType<CustomersService['get']>> | Record<string, unknown>): Record<string, unknown> {
    const r = c as Record<string, unknown> & { addresses?: { addressLine: string }[] };
    const out: Record<string, unknown> = { id: r.id, code: r.code, version: r.version };
    for (const k of CUSTOMER_KEYS) out[k] = k === 'address' ? (r.address ?? r.addresses?.[0]?.addressLine ?? null) : (r[k] ?? null);
    return out;
  }

  /** Device values in the same shape the server stores (phones normalised) so equal values do not look different. */
  private normalizeCustomer(fields: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if ((k === 'mobile' || k === 'whatsapp') && typeof v === 'string' && v.trim()) out[k] = normalizePhone(v) ?? v;
      else if (k === 'email' && typeof v === 'string') out[k] = v.trim().toLowerCase() || null;
      else out[k] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
  }

  // ================================================================ conflicts

  async conflicts(q: ConflictQueryDto, user: AuthUser) {
    const all = q.scope === 'all' && this.can(user, 'sync', 'APPROVE');
    const rows = await this.prisma.syncConflict.findMany({
      where: {
        resolution: q.status === 'RESOLVED' ? { not: 'PENDING' } : 'PENDING',
        ...(all ? {} : { syncOperation: { userId: user.id } }),
      },
      include: { syncOperation: { include: { user: { select: { id: true, fullName: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const resolverIds = [...new Set(rows.map((r) => r.resolvedById).filter(Boolean))] as string[];
    const resolvers = resolverIds.length ? await this.prisma.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(resolvers.map((u) => [u.id, u.fullName]));
    return rows.map((r) => {
      const server = r.serverData as unknown as ConflictServerData;
      return {
        id: r.id, kind: server.kind, kindLabel: CONFLICT_KINDS[server.kind]?.label ?? server.kind,
        allowed: CONFLICT_KINDS[server.kind]?.resolutions ?? [],
        entityType: r.entityType, entityId: r.entityId, serverVersion: r.serverVersion, clientVersion: r.clientVersion,
        server: server.record, device: r.clientData as Record<string, unknown>,
        resolution: r.resolution, resolvedAt: r.resolvedAt, resolvedBy: r.resolvedById ? names.get(r.resolvedById) ?? null : null, notes: r.notes,
        createdAt: r.createdAt,
        operation: {
          id: r.syncOperation.id, operation: r.syncOperation.operation, deviceId: r.syncOperation.deviceId,
          clientTimestamp: r.syncOperation.clientTimestamp, user: r.syncOperation.user, message: r.syncOperation.errorMessage,
        },
      };
    });
  }

  async resolve(id: string, dto: ResolveConflictDto, user: AuthUser, ctx: RequestContext) {
    const conflict = await this.prisma.syncConflict.findUnique({ where: { id }, include: { syncOperation: true } });
    if (!conflict) throw new NotFoundException('Conflict not found');
    if (conflict.resolution !== 'PENDING') throw new BadRequestException('This conflict was already resolved');
    const op = conflict.syncOperation;
    if (op.userId !== user.id && !this.can(user, 'sync', 'APPROVE')) throw new ForbiddenException('Only the person who made the change or a manager with Synchronization approve permission can resolve it');
    const server = conflict.serverData as unknown as ConflictServerData;
    const allowed: readonly string[] = CONFLICT_KINDS[server.kind]?.resolutions ?? [];
    if (!allowed.includes(dto.resolution)) throw new BadRequestException(`Choose one of: ${allowed.join(', ')}`);
    const device = conflict.clientData as Record<string, unknown>;
    const payload = op.payload as Record<string, unknown>;
    let result: Record<string, unknown>;

    if (server.kind === 'VERSION') {
      if (dto.resolution === 'KEEP_SERVER') {
        result = { entityId: op.entityId, resolution: 'KEEP_SERVER' };
      } else {
        if (!this.can(user, 'customers', 'EDIT')) throw new ForbiddenException('You need permission to edit customers');
        const current = await this.customers.get(op.entityId);
        const { version: _v, ...fields } = payload;
        let changes: Record<string, unknown> = fields;
        if (dto.resolution === 'MERGED') {
          const picks = dto.fields ?? {};
          changes = Object.fromEntries(Object.entries(fields).filter(([k]) => picks[k] === 'device'));
        }
        if (Object.keys(changes).length) {
          const upd = await this.validated(UpdateCustomerDto, { ...changes, version: current.version });
          const c = await this.customers.update(op.entityId, upd, ctx);
          result = { entityId: c.id, code: c.code, version: c.version, resolution: dto.resolution, fields: Object.keys(changes) };
        } else {
          result = { entityId: op.entityId, resolution: dto.resolution, fields: [] };
        }
      }
    } else {
      // DUPLICATE customer
      if (dto.resolution === 'KEEP_SERVER') {
        result = { entityId: String(server.record.id), mappedTo: String(server.record.id), code: server.record.code, resolution: 'KEEP_SERVER' };
      } else {
        if (!this.can(user, 'customers', 'CREATE')) throw new ForbiddenException('You need permission to add customers');
        const create = await this.validated(CreateCustomerDto, { ...payload, id: op.entityId, allowDuplicate: true });
        const c = await this.customers.create(create, ctx);
        result = { entityId: c.id, code: c.code, name: c.name, resolution: 'KEEP_BOTH' };
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.syncConflict.update({ where: { id }, data: { resolution: dto.resolution, resolvedById: user.id, resolvedAt: new Date(), notes: dto.notes ?? null } });
      await tx.syncOperation.update({ where: { id: op.id }, data: { status: 'APPLIED', result: result as Prisma.InputJsonValue, errorMessage: null } });
      await this.audit.log({
        action: 'SYNC_CONFLICT_RESOLVED', module: 'sync', recordId: op.entityId,
        newValues: { kind: server.kind, resolution: dto.resolution, device: op.deviceId, note: dto.notes ?? null, fields: result.fields ?? null },
      }, ctx, tx);
    });
    void device;
    return { id, resolution: dto.resolution, result };
  }

  // ================================================================ log & summary

  async log(q: SyncLogQueryDto, user: AuthUser) {
    const all = q.scope === 'all' && this.can(user, 'sync', 'APPROVE');
    const where: Prisma.SyncOperationWhereInput = {
      ...(all ? {} : { userId: user.id }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.deviceId ? { deviceId: q.deviceId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.syncOperation.findMany({
        where, orderBy: { serverTimestamp: q.sortOrder ?? 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { user: { select: { id: true, fullName: true } } },
      }),
      this.prisma.syncOperation.count({ where }),
    ]);
    return paginate(rows.map((r) => ({
      id: r.id, deviceId: r.deviceId, user: r.user, entityType: r.entityType, entityId: r.entityId, operation: r.operation,
      status: r.status, message: r.errorMessage, result: r.result, clientTimestamp: r.clientTimestamp, serverTimestamp: r.serverTimestamp,
    })), total, q);
  }

  async summary(user: AuthUser) {
    const all = this.can(user, 'sync', 'APPROVE');
    const mine: Prisma.SyncOperationWhereInput = all ? {} : { userId: user.id };
    const since = new Date(Date.now() - 24 * 3600_000);
    const [byStatus, pendingConflicts, devices, last] = await Promise.all([
      this.prisma.syncOperation.groupBy({ by: ['status'], where: { ...mine, serverTimestamp: { gte: since } }, _count: { _all: true } }),
      this.prisma.syncConflict.count({ where: { resolution: 'PENDING', ...(all ? {} : { syncOperation: { userId: user.id } }) } }),
      this.prisma.syncOperation.groupBy({ by: ['deviceId'], where: { ...mine, serverTimestamp: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } }, _count: { _all: true }, _max: { serverTimestamp: true } }),
      this.prisma.syncOperation.findFirst({ where: mine, orderBy: { serverTimestamp: 'desc' }, select: { serverTimestamp: true } }),
    ]);
    return {
      scope: all ? 'all' : 'mine',
      last24h: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      pendingConflicts,
      devices: devices.map((d) => ({ deviceId: d.deviceId, operations: d._count._all, lastSeen: d._max.serverTimestamp }))
        .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))),
      lastOperationAt: last?.serverTimestamp ?? null,
    };
  }

  // ================================================================ snapshot (download for offline use)

  async snapshot(user: AuthUser, since?: string) {
    const serverTime = new Date();
    const sinceDate = since ? new Date(since) : null;
    const canCustomers = this.can(user, 'customers', 'VIEW') || this.can(user, 'customers', 'CREATE');
    const canTemplates = this.can(user, 'measurements', 'VIEW') || this.can(user, 'measurements', 'CREATE');
    const canBook = this.can(user, 'orders', 'CREATE');
    const canOrders = this.can(user, 'orders', 'VIEW') || this.can(user, 'payments', 'CREATE');

    const [customers, templates, garments, orders, orderSettings] = await Promise.all([
      canCustomers ? this.prisma.customer.findMany({
        where: sinceDate ? { updatedAt: { gt: sinceDate } } : { deletedAt: null },
        select: {
          id: true, code: true, name: true, mobile: true, whatsapp: true, email: true, city: true, customerType: true, status: true,
          notes: true, version: true, updatedAt: true, deletedAt: true, addresses: { where: { isDefault: true }, take: 1, select: { addressLine: true } },
        },
        orderBy: { updatedAt: 'desc' }, take: 20_000,
      }) : [],
      canTemplates ? this.prisma.measurementTemplate.findMany({
        where: { isActive: true }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, garmentCategory: true, defaultUnit: true, fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { key: true, label: true, isRequired: true, sortOrder: true } } },
      }) : [],
      canBook ? this.prisma.garmentType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, include: { measurementTemplate: { select: { id: true, code: true, name: true } } } }) : [],
      canOrders ? this.prisma.order.findMany({
        where: sinceDate ? { updatedAt: { gt: sinceDate } } : { lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] } },
        select: {
          id: true, orderNumber: true, customerId: true, orderDate: true, expectedDeliveryDate: true, totalAmount: true, adjustmentsTotal: true,
          paidAmount: true, balanceAmount: true, paymentStatus: true, lifecycle: true, version: true, updatedAt: true,
          customer: { select: { code: true, name: true, mobile: true } }, stage: { select: { name: true, color: true } }, _count: { select: { items: true } },
        },
        orderBy: { updatedAt: 'desc' }, take: 5_000,
      }) : [],
      canBook ? this.settings.getGroup('orders') : Promise.resolve(null),
    ]);

    return {
      serverTime: serverTime.toISOString(),
      full: !sinceDate,
      today: karachiToday(),
      customers: customers.map(({ addresses, deletedAt, ...c }) => ({ ...c, address: addresses[0]?.addressLine ?? null, deleted: !!deletedAt })),
      templates,
      garments: garments.map(presentGarment),
      orders: orders.map((o) => ({
        id: o.id, orderNumber: o.orderNumber, customerId: o.customerId, customerName: o.customer.name, customerCode: o.customer.code,
        customerMobile: o.customer.mobile, orderDate: o.orderDate.toISOString().slice(0, 10),
        expectedDeliveryDate: o.expectedDeliveryDate ? o.expectedDeliveryDate.toISOString().slice(0, 10) : null,
        totalAmount: moneyString(o.totalAmount), adjustmentsTotal: moneyString(o.adjustmentsTotal), paidAmount: moneyString(o.paidAmount),
        balanceAmount: moneyString(o.balanceAmount), paymentStatus: o.paymentStatus, lifecycle: o.lifecycle, stage: o.stage,
        items: o._count.items, version: o.version, updatedAt: o.updatedAt,
        closed: o.lifecycle === 'DELIVERED' || o.lifecycle === 'CANCELLED',
      })),
      orderSettings,
      paymentMethods: PAYMENT_METHODS,
      permissions: { customers: canCustomers, measurements: canTemplates, orders: canBook, payments: this.can(user, 'payments', 'CREATE') },
    };
  }
}
