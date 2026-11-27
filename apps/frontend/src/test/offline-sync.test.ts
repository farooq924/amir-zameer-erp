import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/offline/db';
import { nextOutboxState, sendable, useSync } from '@/offline/sync';
import { useAuth } from '@/store/auth';
import type { AuthUser } from '@/types';

const user = { id: 'u1', fullName: 'Cashier', email: 'c@x', username: 'c', isOwner: false, roles: [], permissions: [] } as unknown as AuthUser;

function op(id: string, status: 'pending' | 'retry' | 'waiting' | 'conflict' | 'rejected', ts: string, userId = 'u1') {
  return {
    id, entityType: 'customer' as const, entityId: `e-${id}`, operation: 'CREATE' as const, payload: {}, clientTimestamp: ts,
    userId, title: id, status, attempts: 0,
  };
}

describe('offline outbox rules', () => {
  it('sends only this user\'s open entries, oldest first', () => {
    const list = [op('b', 'pending', '2026-11-27T10:02:00Z'), op('a', 'retry', '2026-11-27T10:01:00Z'), op('c', 'conflict', '2026-11-27T10:00:00Z'),
      op('d', 'rejected', '2026-11-27T10:00:00Z'), op('e', 'pending', '2026-11-27T09:00:00Z', 'u2'), op('f', 'waiting', '2026-11-27T10:03:00Z')];
    expect(sendable(list, 'u1').map((o) => o.id)).toEqual(['a', 'b', 'f']);
  });

  it('removes saved entries and keeps the reason for problems', () => {
    const base = op('x', 'pending', '2026-11-27T10:00:00Z');
    expect(nextOutboxState(base, { id: 'x', status: 'APPLIED' })).toBeNull();
    expect(nextOutboxState(base, { id: 'x', status: 'DUPLICATE' })).toBeNull();
    expect(nextOutboxState(base, { id: 'x', status: 'CONFLICT', conflictId: 'c1', message: 'm' })).toMatchObject({ status: 'conflict', conflictId: 'c1', attempts: 1 });
    expect(nextOutboxState(base, { id: 'x', status: 'REJECTED', message: 'bad' })).toMatchObject({ status: 'rejected', message: 'bad' });
    expect(nextOutboxState(base, { id: 'x', status: 'WAITING' })?.status).toBe('waiting');
    expect(nextOutboxState(base, { id: 'x', status: 'RETRY' })?.status).toBe('retry');
  });
});

describe('sync engine', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.customers.clear();
    useAuth.setState({ status: 'authenticated', user, offlineSession: false });
    useSync.setState({ online: false, syncing: false, lastError: null });
  });

  it('keeps entries on the device while offline', async () => {
    const saved = await useSync.getState().enqueue({ entityType: 'customer', operation: 'CREATE', payload: { name: 'Faraz', mobile: '0333-7001122' }, title: 'New customer: Faraz' });
    expect(saved.status).toBe('pending');
    expect(await db.outbox.count()).toBe(1);
    expect(useSync.getState().counts.pending).toBe(1);
  });

  it('pushes the outbox, removes saved entries and marks conflicts', async () => {
    const a = await useSync.getState().enqueue({ entityType: 'customer', operation: 'CREATE', payload: { name: 'A' }, title: 'A' });
    const b = await useSync.getState().enqueue({ entityType: 'customer', operation: 'UPDATE', entityId: 'c2', baseVersion: 1, payload: { city: 'Karachi' }, title: 'B' });
    await db.customers.put({ id: a.entityId, code: null, name: 'A', mobile: '923000000000', whatsapp: null, email: null, city: null, address: null, customerType: 'REGULAR', status: 'ACTIVE', notes: null, version: 1, updatedAt: '', local: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/sync/push')) {
        return new Response(JSON.stringify({ results: [
          { id: a.id, status: 'APPLIED', result: { entityId: a.entityId, code: 'AZC-00099', version: 1 } },
          { id: b.id, status: 'CONFLICT', conflictId: 'cf-1', message: 'Changed on the server' },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ serverTime: '2026-11-27T10:00:00Z', full: false, today: '2026-11-27', customers: [], templates: [], garments: [], orders: [], orderSettings: null, paymentMethods: [] }), { status: 200 });
    });
    await useSync.getState().syncNow();
    fetchMock.mockRestore();
    const left = await db.outbox.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: b.id, status: 'conflict', conflictId: 'cf-1' });
    expect((await db.customers.get(a.entityId))?.code).toBe('AZC-00099');
    expect(useSync.getState().counts).toMatchObject({ pending: 0, conflict: 1 });
  });
});
