/* eslint-disable no-console */
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_FABRIC_CATEGORIES, DEFAULT_GARMENTS, DEFAULT_MEASUREMENT_TEMPLATES, DEFAULT_ROLES, MODULES, expandRoleGrants, permissionCode } from '@az/shared';
import { Tenant, byCompany } from '../../common/tenant';
import { tenantExtension } from '../../common/tenant/tenant.extension';

/** Prisma client with automatic company isolation (the extension keeps the client's types). */
export type Db = PrismaClient;
export const asDb = (prisma: PrismaClient): Db => tenantExtension(prisma) as unknown as PrismaClient;

export const WORKFLOW_STAGES = [
  { code: 'NEW', name: 'New Order', color: 'slate' },
  { code: 'MEASUREMENT_DONE', name: 'Measurement Completed', color: 'sky' },
  { code: 'FABRIC_ALLOCATED', name: 'Fabric Allocated', color: 'indigo' },
  { code: 'CUTTING', name: 'Cutting', color: 'violet' },
  { code: 'STITCHING', name: 'Stitching', color: 'amber' },
  { code: 'QUALITY_CHECK', name: 'Quality Check', color: 'orange' },
  { code: 'TRIAL', name: 'Trial', color: 'cyan' },
  { code: 'ALTERATION', name: 'Alteration', color: 'rose' },
  { code: 'READY', name: 'Ready', color: 'emerald' },
  { code: 'DELIVERED', name: 'Delivered', color: 'green', isTerminal: true },
  { code: 'CANCELLED', name: 'Cancelled', color: 'red', isTerminal: true },
];

/** Default plans. Created once; the Super Admin edits prices, users and modules later. */
export const DEFAULT_PLANS = [
  { code: 'BASIC', name: 'Basic', monthlyPrice: 2000, maxUsers: 3, sortOrder: 10, description: 'Customers, measurements, orders, payments and reports.', modules: [] as string[] },
  { code: 'STANDARD', name: 'Standard', monthlyPrice: 4000, maxUsers: 8, sortOrder: 20, description: 'Basic + fabric inventory, purchases, suppliers, expenses and WhatsApp.', modules: ['inventory', 'purchases', 'suppliers', 'expenses', 'whatsapp'] },
  {
    code: 'PREMIUM', name: 'Premium', monthlyPrice: 7000, maxUsers: 25, sortOrder: 30, description: 'Everything: + employees, attendance, production, payroll and accounting.',
    modules: ['inventory', 'purchases', 'suppliers', 'expenses', 'whatsapp', 'employees', 'attendance', 'production', 'payroll', 'accounting'],
  },
];

export const TRIAL_DAYS = 14;

/** Permission catalogue (global, shared by all companies). */
export async function syncPermissions(prisma: PrismaClient): Promise<void> {
  for (const m of MODULES) {
    for (const action of m.actions) {
      const code = permissionCode(m.key, action);
      await prisma.permission.upsert({
        where: { code },
        create: { code, module: m.key, action, description: `${action.replace('_', ' ').toLowerCase()} - ${m.label}` },
        update: { module: m.key, action },
      });
    }
  }
}

export async function ensurePlans(prisma: PrismaClient): Promise<void> {
  for (const p of DEFAULT_PLANS) {
    const exists = await prisma.plan.findUnique({ where: { code: p.code } });
    if (!exists) await prisma.plan.create({ data: p });
  }
}

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/**
 * Default data of ONE company: roles, workflow stages, measurement templates, garments,
 * fabric categories and document-number prefixes. Idempotent and never overwrites the
 * company's own changes. Must run inside Tenant.run(companyId).
 */
export async function provisionCompany(db: Db, opts: { docPrefix?: string } = {}): Promise<void> {
  Tenant.require();
  // 1. Roles. Permissions are applied only when a role is first created; OWNER is always full.
  const allPerms = await db.permission.findMany();
  const permId = new Map(allPerms.map((p) => [p.code, p.id]));
  for (const def of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { companyId_code: byCompany({ code: def.code }) } });
    if (existing && def.code !== 'OWNER') continue;
    const codes = expandRoleGrants(def);
    const role = await db.role.upsert({
      where: { companyId_code: byCompany({ code: def.code }) },
      create: { code: def.code, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description, isSystem: true, isActive: true },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: codes.map((c) => ({ roleId: role.id, permissionId: permId.get(c)! })).filter((r) => r.permissionId),
      skipDuplicates: true,
    });
  }

  // 2. Workflow stages
  for (const [i, s] of WORKFLOW_STAGES.entries()) {
    await db.workflowStage.upsert({
      where: { companyId_code: byCompany({ code: s.code }) },
      create: { code: s.code, name: s.name, color: s.color, sortOrder: (i + 1) * 10, isTerminal: s.isTerminal ?? false, isSystem: true },
      update: { isSystem: true },
    });
  }

  // 3. Measurement templates (created once)
  for (const t of DEFAULT_MEASUREMENT_TEMPLATES) {
    const exists = await db.measurementTemplate.findUnique({ where: { companyId_code: byCompany({ code: t.code }) } });
    if (exists) continue;
    await db.measurementTemplate.create({
      data: {
        code: t.code, name: t.name, garmentCategory: t.garmentCategory, isSystem: true,
        fields: { create: t.fields.map((f, i) => ({ key: f.key, label: f.label, isRequired: f.required ?? false, sortOrder: (i + 1) * 10 })) },
      },
    });
  }

  // 4. Garments (created once, prices start at 0)
  for (const g of DEFAULT_GARMENTS) {
    const exists = await db.garmentType.findUnique({ where: { companyId_code: byCompany({ code: g.code }) } });
    if (exists) continue;
    const template = await db.measurementTemplate.findUnique({ where: { companyId_code: byCompany({ code: g.template }) } });
    await db.garmentType.create({
      data: { code: g.code, name: g.name, category: g.category, measurementTemplateId: template?.id ?? null, defaultFabricConsumption: g.fabric },
    });
  }

  // 5. Fabric categories (only when there are none yet)
  if ((await db.fabricCategory.count()) === 0) {
    await db.fabricCategory.createMany({ data: DEFAULT_FABRIC_CATEGORIES.map((name) => ({ name })), skipDuplicates: true });
  }

  // 6. A new company gets its own document prefixes (e.g. "ZA-2026-00001"); existing settings are kept.
  if (opts.docPrefix) {
    const p = opts.docPrefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'TE';
    const key = 'group.numbering';
    const exists = await db.systemSetting.findUnique({ where: { companyId_key: byCompany({ key }) } });
    if (!exists) {
      const value = {
        orderPrefix: p, customerPrefix: `${p}C`, receiptPrefix: 'RCP', expensePrefix: 'EXP',
        fabricPrefix: `${p}F`, supplierPrefix: `${p}S`, purchasePrefix: 'PUR',
      } as Prisma.InputJsonValue;
      await db.systemSetting.create({ data: { key, group: 'numbering', value } });
    }
  }
}

/** Gives a company its first Owner login. Usernames and emails are unique across all companies. */
export async function createOwner(db: Db, input: { fullName: string; email: string; username: string; password: string }) {
  Tenant.require();
  const ownerRole = await db.role.findUniqueOrThrow({ where: { companyId_code: byCompany({ code: 'OWNER' }) } });
  return db.user.create({
    data: {
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      username: input.username.trim().toLowerCase(),
      passwordHash: await hashPassword(input.password),
      roles: { create: [{ roleId: ownerRole.id }] },
    },
  });
}

/**
 * Idempotent seed, safe to run on every deployment:
 *  - permission catalogue + default plans
 *  - fresh install only: the first company + its Owner (OWNER_* and COMPANY_NAME env values)
 *  - every company: missing default data
 *  - Super Admin from SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD when none exists
 */
export async function seed(prisma: PrismaClient, opts: { log?: boolean } = {}): Promise<void> {
  const log = (msg: string) => opts.log !== false && console.log(msg);
  const db = asDb(prisma);
  await Tenant.system(async () => {
    await syncPermissions(db);
    log(`Permissions synced: ${await db.permission.count()}`);
    await ensurePlans(db);
    log(`Plans: ${await db.plan.count()}`);

    // Fresh installation: create the first company from the environment.
    if ((await db.company.count()) === 0) {
      const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
      const username = process.env.OWNER_USERNAME?.trim().toLowerCase() || 'owner';
      const password = process.env.OWNER_PASSWORD;
      if (!email || !password) throw new Error('OWNER_EMAIL and OWNER_PASSWORD must be set to create the first company Owner');
      if (password.length < 10) throw new Error('OWNER_PASSWORD must be at least 10 characters');
      const name = process.env.COMPANY_NAME?.trim() || 'My Tailoring Shop';
      const premium = await db.plan.findUniqueOrThrow({ where: { code: 'PREMIUM' } });
      const company = await db.company.create({
        data: { code: slugify(process.env.COMPANY_CODE || name), name, docPrefix: 'AZ', status: 'ACTIVE', planId: premium.id, paidUntil: null },
      });
      await Tenant.run(company.id, async () => {
        await provisionCompany(db);
        await createOwner(db, { fullName: process.env.OWNER_NAME?.trim() || 'Owner', email, username, password });
      });
      log(`First company created: ${company.name} (Owner: ${username})`);
    }

    const companies = await db.company.findMany({ orderBy: { createdAt: 'asc' } });
    for (const c of companies) await Tenant.run(c.id, () => provisionCompany(db));
    log(`Companies checked: ${companies.length}`);

    // Super Admin (TailoringERP platform). Also possible later with scripts\create-super-admin.ps1
    const saUser = process.env.SUPER_ADMIN_USERNAME?.trim().toLowerCase();
    const saPass = process.env.SUPER_ADMIN_PASSWORD;
    if (saUser && saPass && (await db.user.count({ where: { isSuperAdmin: true } })) === 0) {
      await db.user.create({
        data: {
          fullName: process.env.SUPER_ADMIN_NAME?.trim() || 'Super Admin',
          email: process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || `${saUser}@tailoringerp.local`,
          username: saUser, passwordHash: await hashPassword(saPass), isSuperAdmin: true, companyId: null,
        },
      });
      log(`Super Admin created: ${saUser}`);
    }
  });
}

/** "Zameer Ansari & Sons" -> "zameer-ansari-sons" */
export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'company';
}
