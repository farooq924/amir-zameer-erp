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
    // 20 company modules (incl. Security; Backup is Super Admin only) + Offline Desk + Sync Center + Documents
    expect(visibleNavItems(owner).length).toBe(23);
    expect(hasPermission(owner, 'backup')).toBe(false);
  });
  it('a cashier only sees permitted modules', () => {
    const cashier = user({ permissions: ['dashboard.view', 'payments.view', 'payments.create'] });
    expect(visibleNavItems(cashier).map((m) => m.key)).toEqual(['dashboard', 'payments', 'offline', 'sync', 'documents']);
    expect(hasPermission(cashier, 'payments', 'CREATE')).toBe(true);
    expect(hasPermission(cashier, 'payments', 'DELETE')).toBe(false);
  });
  it('company owner only sees the modules of the plan', () => {
    const company = {
      id: 'c', code: 'shop', name: 'Shop', status: 'ACTIVE' as const, plan: { code: 'BASIC', name: 'Basic', maxUsers: 3 },
      modules: ['dashboard', 'customers', 'orders', 'settings'], access: 'FULL' as const, endsAt: null, graceEndsAt: null, daysLeft: null,
    };
    const owner = user({ isOwner: true, company, companyId: 'c' });
    expect(hasPermission(owner, 'orders', 'CREATE')).toBe(true);
    expect(hasPermission(owner, 'inventory')).toBe(false);
    expect(visibleNavItems(owner).map((m) => m.key)).not.toContain('accounting');
  });
  it('Super Admin sees the platform menu until a company is opened', () => {
    const sa = user({ isOwner: true, isSuperAdmin: true, company: null, companyId: null });
    expect(visibleNavItems(sa).map((m) => m.path)).toContain('/platform/companies');
    expect(hasPermission(sa, 'customers')).toBe(false);
    expect(hasPermission(sa, 'backup')).toBe(true);
  });
  it('anonymous has nothing', () => {
    expect(hasPermission(null, 'dashboard')).toBe(false);
    expect(visibleNavItems(null)).toEqual([]);
  });
});
