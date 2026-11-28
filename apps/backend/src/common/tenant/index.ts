import { Tenant } from './tenant-context';

export { Tenant, TenantContextError } from './tenant-context';
export type { TenantStore } from './tenant-context';

/**
 * Adds the current company to a compound unique key, e.g.
 *   prisma.role.findUnique({ where: { companyId_code: byCompany({ code: 'OWNER' }) } })
 */
export function byCompany<T extends object>(key: T): T & { companyId: string } {
  return { companyId: Tenant.require(), ...key };
}

/** Minimal client shape needed to list companies. */
interface CompanyLister {
  company: { findMany(args: { where?: object; select: { id: true } }): Promise<{ id: string }[]> };
}

/**
 * Runs a background job once per company (inside that company's context).
 * Suspended companies are skipped unless includeSuspended is set.
 * Errors of one company never stop the others; they are passed to onError.
 */
export async function forEachCompany(
  prisma: CompanyLister,
  fn: (companyId: string) => Promise<unknown>,
  opts: { includeSuspended?: boolean; onError?: (companyId: string, e: Error) => void } = {},
): Promise<void> {
  const companies = await prisma.company.findMany({ where: opts.includeSuspended ? {} : { status: { not: 'SUSPENDED' } }, select: { id: true } });
  for (const c of companies) {
    try {
      await Tenant.run(c.id, () => fn(c.id));
    } catch (e) {
      opts.onError?.(c.id, e as Error);
    }
  }
}
