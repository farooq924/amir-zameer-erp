import { AsyncLocalStorage } from 'async_hooks';

/**
 * Which company (tenant) the current request / job works for.
 *  - companyId : every Prisma query on a business table is limited to this company.
 *  - system    : platform code (login, super admin, migrations, schedulers) that may
 *                read across companies. Never set this for normal company requests.
 */
export interface TenantStore {
  companyId?: string | null;
  system?: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class TenantContextError extends Error {
  constructor(model: string) {
    super(`No company selected for a query on "${model}". Wrap the code in Tenant.run(companyId, ...) or Tenant.system(...).`);
  }
}

export const Tenant = {
  /** Runs fn for one company. */
  run<T>(companyId: string, fn: () => T): T {
    return storage.run({ companyId }, fn);
  },
  /** Runs fn with cross-company (platform) access. */
  system<T>(fn: () => T): T {
    return storage.run({ system: true }, fn);
  },
  /** Starts an empty context for an HTTP request; the auth guard fills it in. */
  runRequest<T>(fn: () => T): T {
    return storage.run({}, fn);
  },
  store(): TenantStore | undefined {
    return storage.getStore();
  },
  /** Current company id, or undefined (platform / no context). */
  id(): string | undefined {
    return storage.getStore()?.companyId ?? undefined;
  },
  /** Current company id; throws when there is none. */
  require(): string {
    const id = storage.getStore()?.companyId;
    if (!id) throw new Error('This action needs a company. Please log in to a company account.');
    return id;
  },
  /** Sets the company on the current request context (used by the session guard). */
  enter(companyId: string | null, system = false): void {
    const s = storage.getStore();
    if (!s) throw new Error('Tenant.enter() called outside a request context');
    s.companyId = companyId;
    s.system = system;
  },
};
