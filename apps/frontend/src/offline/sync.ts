import { SYNC_MAX_BATCH, type SyncEntityType, type SyncOperationType, type SyncResultStatus } from '@az/shared';
import { create } from 'zustand';
import { ApiError, api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { newId } from '@/utils/id';
import { type CachedCustomer, type CachedGarment, type CachedOrder, type CachedTemplate, type OutboxOp, clearCachedData, db, getMeta } from './db';
import { deviceId, deviceName } from './device';

export interface SyncResultRow {
  id: string;
  status: SyncResultStatus;
  message?: string;
  conflictId?: string;
  result?: Record<string, unknown> | null;
}

export interface Snapshot {
  serverTime: string;
  full: boolean;
  today: string;
  customers: (CachedCustomer & { deleted: boolean })[];
  templates: CachedTemplate[];
  garments: CachedGarment[];
  orders: (CachedOrder & { closed: boolean })[];
  orderSettings: Record<string, unknown> | null;
  paymentMethods: { key: string; label: string }[];
}

/** Entries that should be sent on the next sync, oldest first. Conflicts and rejected entries wait for a person. */
export function sendable(ops: OutboxOp[], userId: string): OutboxOp[] {
  return ops
    .filter((o) => o.userId === userId && (o.status === 'pending' || o.status === 'waiting' || o.status === 'retry'))
    .sort((a, b) => a.clientTimestamp.localeCompare(b.clientTimestamp))
    .slice(0, SYNC_MAX_BATCH);
}

/** How the outbox changes for one server answer: null = remove (saved on the server). */
export function nextOutboxState(op: OutboxOp, r: SyncResultRow): OutboxOp | null {
  const tried = { ...op, attempts: op.attempts + 1, lastTriedAt: new Date().toISOString() };
  switch (r.status) {
    case 'APPLIED':
    case 'DUPLICATE':
      return null;
    case 'CONFLICT':
      return { ...tried, status: 'conflict', conflictId: r.conflictId, message: r.message };
    case 'REJECTED':
      return { ...tried, status: 'rejected', message: r.message };
    case 'WAITING':
      return { ...tried, status: 'waiting', message: r.message };
    default:
      return { ...tried, status: 'retry', message: r.message };
  }
}

interface Counts { pending: number; conflict: number; rejected: number; total: number }

interface SyncState {
  /** Browser has a network connection AND the ERP server answered. */
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  counts: Counts;
  started: boolean;
  start: () => void;
  refreshCounts: () => Promise<void>;
  checkServer: () => Promise<boolean>;
  syncNow: (opts?: { full?: boolean; quiet?: boolean }) => Promise<{ sent: number; saved: number; problems: number } | null>;
  enqueue: (op: NewOp) => Promise<OutboxOp>;
  discard: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
}

export interface NewOp {
  entityType: SyncEntityType;
  operation: SyncOperationType;
  entityId?: string;
  baseVersion?: number;
  payload: Record<string, unknown>;
  dependsOn?: string[];
  title: string;
  subtitle?: string;
}

const PULL_EVERY_MS = 5 * 60_000;
const TICK_MS = 45_000;

async function pull(full: boolean, userId: string): Promise<void> {
  const cachedFor = await getMeta<string>('userId');
  if (cachedFor && cachedFor !== userId) await clearCachedData();
  const since = full || cachedFor !== userId ? undefined : await getMeta<string>('serverTime');
  const snap = await api.get<Snapshot>('/sync/snapshot', { since });
  await db.transaction('rw', [db.customers, db.templates, db.garments, db.orders, db.meta], async () => {
    if (snap.full) {
      // Keep records created on this device that the server does not have yet.
      await db.customers.filter((c) => !c.local).delete();
      await db.orders.filter((o) => !o.local).delete();
    }
    const gone = snap.customers.filter((c) => c.deleted).map((c) => c.id);
    await db.customers.bulkPut(snap.customers.filter((c) => !c.deleted).map(({ deleted: _d, ...c }) => ({ ...c, local: false })));
    if (gone.length) await db.customers.bulkDelete(gone);
    await db.templates.clear();
    await db.templates.bulkPut(snap.templates);
    await db.garments.clear();
    await db.garments.bulkPut(snap.garments);
    const closed = snap.orders.filter((o) => o.closed).map((o) => o.id);
    await db.orders.bulkPut(snap.orders.filter((o) => !o.closed).map(({ closed: _c, ...o }) => ({ ...o, local: false })));
    if (closed.length) await db.orders.bulkDelete(closed);
    await db.meta.bulkPut([
      { key: 'serverTime', value: snap.serverTime },
      { key: 'userId', value: userId },
      { key: 'today', value: snap.today },
      { key: 'orderSettings', value: snap.orderSettings },
      { key: 'paymentMethods', value: snap.paymentMethods },
      { key: 'pulledAt', value: new Date().toISOString() },
    ]);
  });
}

/** Keeps the local copy in step right after the server accepted an entry (before the next download). */
async function afterSaved(op: OutboxOp, result: Record<string, unknown> | null | undefined): Promise<void> {
  if (!result) return;
  if (op.entityType === 'customer') {
    const target = typeof result.mappedTo === 'string' ? result.mappedTo : op.entityId;
    if (target !== op.entityId) await db.customers.delete(op.entityId);
    await db.customers.update(target, { code: (result.code as string) ?? null, version: Number(result.version ?? 1), local: false });
  } else if (op.entityType === 'order') {
    await db.orders.update(op.entityId, { orderNumber: (result.orderNumber as string) ?? null, balanceAmount: String(result.balanceAmount ?? '0'), local: false });
  } else if (op.entityType === 'payment' && typeof result.orderId === 'string') {
    await db.orders.update(result.orderId, { balanceAmount: String(result.balanceAmount ?? '0') });
  }
}

export const useSync = create<SyncState>((set, get) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSyncAt: null,
  lastPullAt: null,
  lastError: null,
  counts: { pending: 0, conflict: 0, rejected: 0, total: 0 },
  started: false,

  start: () => {
    if (get().started || typeof window === 'undefined') return;
    set({ started: true });
    void getMeta<string>('pulledAt').then((v) => set({ lastPullAt: v ?? null }));
    void get().refreshCounts();
    const tick = async () => {
      if (useAuth.getState().status !== 'authenticated') return;
      const reachable = await get().checkServer();
      if (!reachable) return;
      const pulledAt = get().lastPullAt ? Date.parse(get().lastPullAt!) : 0;
      if (get().counts.pending > 0 || Date.now() - pulledAt > PULL_EVERY_MS) void get().syncNow({ quiet: true });
    };
    window.addEventListener('online', () => { void tick(); });
    window.addEventListener('offline', () => set({ online: false }));
    window.setInterval(() => { void tick(); }, TICK_MS);
    void tick();
  },

  refreshCounts: async () => {
    const userId = useAuth.getState().user?.id;
    const all = userId ? await db.outbox.where('userId').equals(userId).toArray() : [];
    const counts = {
      pending: all.filter((o) => o.status === 'pending' || o.status === 'waiting' || o.status === 'retry').length,
      conflict: all.filter((o) => o.status === 'conflict').length,
      rejected: all.filter((o) => o.status === 'rejected').length,
      total: all.length,
    };
    set({ counts });
  },

  checkServer: async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { set({ online: false }); return false; }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      const ok = res.ok;
      const wasOffline = !get().online;
      set({ online: ok });
      // Back online after an offline start: confirm the session and refresh the CSRF token.
      if (ok && wasOffline && useAuth.getState().offlineSession) void useAuth.getState().bootstrap();
      return ok;
    } catch {
      set({ online: false });
      return false;
    }
  },

  syncNow: async (opts = {}) => {
    const user = useAuth.getState().user;
    if (!user || get().syncing) return null;
    set({ syncing: true, lastError: null });
    let sent = 0;
    let saved = 0;
    let problems = 0;
    try {
      // Push in batches until nothing sendable is left (or nothing changes).
      for (let round = 0; round < 10; round++) {
        const batch = sendable(await db.outbox.toArray(), user.id);
        if (!batch.length) break;
        const res = await api.post<{ results: SyncResultRow[] }>('/sync/push', {
          deviceId: deviceId(), deviceName: deviceName(),
          operations: batch.map((o) => ({
            id: o.id, entityType: o.entityType, entityId: o.entityId, operation: o.operation, baseVersion: o.baseVersion,
            payload: o.payload, dependsOn: o.dependsOn?.length ? o.dependsOn : undefined, clientTimestamp: o.clientTimestamp,
          })),
        });
        sent += batch.length;
        const byId = new Map(batch.map((o) => [o.id, o]));
        let progressed = false;
        for (const r of res.results) {
          const op = byId.get(r.id);
          if (!op) continue;
          const next = nextOutboxState(op, r);
          if (next === null) {
            await afterSaved(op, r.result);
            await db.outbox.delete(op.id);
            saved++;
            progressed = true;
          } else {
            if (next.status === 'conflict' || next.status === 'rejected') { problems++; progressed = true; }
            await db.outbox.put(next);
          }
        }
        if (!progressed) break;
      }
      await pull(!!opts.full, user.id);
      const now = new Date().toISOString();
      set({ online: true, lastSyncAt: now, lastPullAt: now });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) set({ online: false, lastError: 'No connection to the server' });
      else set({ lastError: e instanceof Error ? e.message : 'Sync failed' });
    } finally {
      set({ syncing: false });
      await get().refreshCounts();
    }
    return { sent, saved, problems };
  },

  enqueue: async (input) => {
    const user = useAuth.getState().user;
    if (!user) throw new Error('Sign in first');
    const op: OutboxOp = {
      id: newId(), entityType: input.entityType, entityId: input.entityId ?? newId(), operation: input.operation, baseVersion: input.baseVersion,
      payload: input.payload, dependsOn: input.dependsOn, clientTimestamp: new Date().toISOString(), userId: user.id,
      title: input.title, subtitle: input.subtitle, status: 'pending', attempts: 0,
    };
    await db.outbox.add(op);
    await get().refreshCounts();
    if (get().online) void get().syncNow({ quiet: true });
    return op;
  },

  discard: async (id) => {
    await db.outbox.delete(id);
    await get().refreshCounts();
  },

  retry: async (id) => {
    await db.outbox.update(id, { status: 'pending', message: undefined });
    await get().refreshCounts();
    if (get().online) void get().syncNow({ quiet: true });
  },
}));

/** Outbox entry of a local (not yet synced) record, so new work can depend on it. */
export async function pendingOpFor(entityId: string): Promise<OutboxOp | undefined> {
  return db.outbox.where('entityType').anyOf('customer', 'order').filter((o) => o.entityId === entityId && o.operation === 'CREATE').first();
}
