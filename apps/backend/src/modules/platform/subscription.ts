import { CORE_MODULES } from '@az/shared';

export type CompanyAccess = 'FULL' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED';

export interface SubscriptionInput {
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  graceDays: number;
}

export interface SubscriptionState {
  access: CompanyAccess;
  /** When the trial / paid period ends (null = no expiry). */
  endsAt: Date | null;
  /** Last day of the grace period (null = no expiry). */
  graceEndsAt: Date | null;
  /** Whole days left until endsAt (negative = expired). null = no expiry. */
  daysLeft: number | null;
}

const DAY = 86_400_000;

/**
 * Trial / paid / grace / read-only rules:
 *   TRIAL   -> full access until trialEndsAt
 *   ACTIVE  -> full access until paidUntil (null = never expires)
 *   then    -> graceDays more with full access and a warning ("GRACE")
 *   then    -> READ_ONLY: everything can be seen, nothing can be added or changed
 *   SUSPENDED -> no login at all
 */
export function subscriptionState(c: SubscriptionInput, now: Date = new Date()): SubscriptionState {
  const endsAt = c.status === 'TRIAL' ? c.trialEndsAt : c.paidUntil;
  if (c.status === 'SUSPENDED') return { access: 'SUSPENDED', endsAt, graceEndsAt: null, daysLeft: null };
  if (!endsAt) return { access: 'FULL', endsAt: null, graceEndsAt: null, daysLeft: null };
  const graceEndsAt = new Date(endsAt.getTime() + Math.max(0, c.graceDays) * DAY);
  const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / DAY);
  const access: CompanyAccess = now <= endsAt ? 'FULL' : now <= graceEndsAt ? 'GRACE' : 'READ_ONLY';
  return { access, endsAt, graceEndsAt, daysLeft };
}

/** Module keys a company may use: core modules + its plan's modules. */
export function enabledModules(planModules: string[]): string[] {
  return [...new Set([...CORE_MODULES, ...planModules])];
}
