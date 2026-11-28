import { enabledModules, subscriptionState } from './subscription';

const DAY = 86_400_000;
const now = new Date('2026-11-28T10:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * DAY);

describe('subscriptionState', () => {
  it('trial: full until the end, then grace, then read-only', () => {
    const base = { status: 'TRIAL' as const, paidUntil: null, graceDays: 7 };
    expect(subscriptionState({ ...base, trialEndsAt: at(3) }, now)).toMatchObject({ access: 'FULL', daysLeft: 3 });
    expect(subscriptionState({ ...base, trialEndsAt: at(-2) }, now).access).toBe('GRACE');
    expect(subscriptionState({ ...base, trialEndsAt: at(-8) }, now).access).toBe('READ_ONLY');
  });
  it('active with no end date never expires', () => {
    expect(subscriptionState({ status: 'ACTIVE', trialEndsAt: null, paidUntil: null, graceDays: 7 }, now)).toMatchObject({ access: 'FULL', daysLeft: null });
  });
  it('grace 0 goes read-only right after the end', () => {
    expect(subscriptionState({ status: 'ACTIVE', trialEndsAt: null, paidUntil: at(-0.01), graceDays: 0 }, now).access).toBe('READ_ONLY');
  });
  it('suspended always wins', () => {
    expect(subscriptionState({ status: 'SUSPENDED', trialEndsAt: null, paidUntil: at(100), graceDays: 7 }, now).access).toBe('SUSPENDED');
  });
  it('core modules are always on', () => {
    expect(enabledModules([])).toEqual(expect.arrayContaining(['customers', 'orders', 'settings']));
    expect(enabledModules([])).not.toContain('payroll');
    expect(enabledModules(['payroll'])).toContain('payroll');
  });
});
