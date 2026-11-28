import { hasPermission } from '@/hooks/use-permission';
import { visibleNavItems } from '@/layouts/navigation';
import type { AuthUser } from '@/types';

const user = (over: Partial<AuthUser>): AuthUser => ({
  id: '1', fullName: 'T', email: 't@x', username: 't', isOwner: false, roles: [], permissions: [], sessionId: 's', ...over,
});

describe('permissions', () => {
  it('owner sees everything', () => {
    const owner = user({ isOwner: true });
    expect(hasPermission(owner, 'accounting', 'APPROVE')).toBe(true);
    expect(visibleNavItems(owner).length).toBe(24); // 21 modules (incl. Security) + Offline Desk + Sync Center + Documents
  });
  it('a cashier only sees permitted modules', () => {
    const cashier = user({ permissions: ['dashboard.view', 'payments.view', 'payments.create'] });
    expect(visibleNavItems(cashier).map((m) => m.key)).toEqual(['dashboard', 'payments', 'offline', 'sync', 'documents']);
    expect(hasPermission(cashier, 'payments', 'CREATE')).toBe(true);
    expect(hasPermission(cashier, 'payments', 'DELETE')).toBe(false);
  });
  it('anonymous has nothing', () => {
    expect(hasPermission(null, 'dashboard')).toBe(false);
    expect(visibleNavItems(null)).toEqual([]);
  });
});
