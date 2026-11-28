import { Prisma, PrismaClient } from '@prisma/client';
import { Tenant, TenantContextError } from './tenant-context';

/**
 * Automatic company (tenant) isolation for every Prisma query.
 *
 * For each model that has a "companyId" column:
 *   - reads / updates / deletes get   where.companyId = <current company>
 *   - creates (also nested creates) get data.companyId = <current company>
 * A query on such a model without a company context throws, so a forgotten
 * filter can never leak another company's data. Platform code (login, super
 * admin, schedulers) runs inside Tenant.system(...) and sees all companies.
 *
 * Raw SQL ($queryRaw / $executeRaw) is NOT covered: those queries filter by
 * "companyId" themselves (search the code for Tenant.require()).
 */

/** Platform tables that have a companyId column but are not tenant data. */
const PLATFORM_MODELS = new Set(['CompanyPayment']);

const models = Prisma.dmmf.datamodel.models;
export const TENANT_MODELS = new Set(
  models.filter((m) => !PLATFORM_MODELS.has(m.name) && m.fields.some((f) => f.name === 'companyId')).map((m) => m.name),
);
const RELATIONS: Record<string, Record<string, string>> = Object.fromEntries(
  models.map((m) => [m.name, Object.fromEntries(m.fields.filter((f) => f.kind === 'object').map((f) => [f.name, f.type]))]),
);

const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'upsert',
]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Prisma.Decimal.isDecimal(v);
const each = <T>(v: T | T[], fn: (x: T) => T): T | T[] => (Array.isArray(v) ? v.map(fn) : fn(v));

/** Adds companyId to a create payload (when `top`) and to all nested creates below it. */
export function injectCompany(model: string, data: unknown, companyId: string, top: boolean): unknown {
  if (Array.isArray(data)) return data.map((d) => injectCompany(model, d, companyId, top));
  if (!isObj(data)) return data;
  const out: Obj = { ...data };
  if (top && TENANT_MODELS.has(model)) out.companyId = companyId;
  const rels = RELATIONS[model] ?? {};
  for (const [field, target] of Object.entries(rels)) {
    const v = out[field];
    if (!isObj(v)) continue;
    const n: Obj = { ...v };
    if (n.create !== undefined) n.create = injectCompany(target, n.create, companyId, true);
    if (isObj(n.createMany) && n.createMany.data !== undefined) {
      n.createMany = { ...n.createMany, data: injectCompany(target, n.createMany.data, companyId, true) };
    }
    if (n.connectOrCreate !== undefined) {
      n.connectOrCreate = each(n.connectOrCreate as Obj | Obj[], (x) => ({ ...x, create: injectCompany(target, x.create, companyId, true) }));
    }
    if (n.upsert !== undefined) {
      n.upsert = each(n.upsert as Obj | Obj[], (x) => ({
        ...x,
        create: injectCompany(target, x.create, companyId, true),
        update: injectCompany(target, x.update, companyId, false),
      }));
    }
    if (n.update !== undefined) {
      n.update = each(n.update as Obj | Obj[], (x) =>
        isObj(x) && 'where' in x && 'data' in x ? { ...x, data: injectCompany(target, x.data, companyId, false) } : (injectCompany(target, x, companyId, false) as Obj),
      );
    }
    out[field] = n;
  }
  return out;
}

export function tenantExtension(client: PrismaClient) {
  return client.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const store = Tenant.store();
          if (store?.system) return query(args);
          const companyId = store?.companyId;
          if (!companyId) throw new TenantContextError(model);

          const a = { ...(args as Obj) };
          if (WHERE_OPS.has(operation)) a.where = { ...((a.where as Obj) ?? {}), companyId };
          switch (operation) {
            case 'create':
              a.data = injectCompany(model, a.data, companyId, true);
              break;
            case 'createMany':
            case 'createManyAndReturn':
              a.data = injectCompany(model, a.data, companyId, true);
              break;
            case 'update':
              a.data = injectCompany(model, a.data, companyId, false);
              if (isObj(a.data)) delete (a.data as Obj).companyId; // a record can never move to another company
              break;
            case 'updateMany':
            case 'updateManyAndReturn':
              if (isObj(a.data)) delete (a.data as Obj).companyId;
              break;
            case 'upsert':
              a.create = injectCompany(model, a.create, companyId, true);
              a.update = injectCompany(model, a.update, companyId, false);
              if (isObj(a.update)) delete (a.update as Obj).companyId;
              break;
          }
          return query(a as typeof args);
        },
      },
    },
  });
}
