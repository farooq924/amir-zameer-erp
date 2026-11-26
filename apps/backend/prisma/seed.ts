/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_ROLES, MODULES, expandRoleGrants, permissionCode } from '@az/shared';

/**
 * Idempotent seed: safe to run on every deployment.
 *  - syncs the permission catalogue and the default role -> permission matrix
 *  - creates the first Owner account ONLY if no owner exists
 *  - creates default workflow stages (never overwrites user edits)
 */
const WORKFLOW_STAGES = [
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

export async function seed(prisma: PrismaClient, opts: { log?: boolean } = {}): Promise<void> {
  const log = (msg: string) => opts.log !== false && console.log(msg);

  // 1. Permissions
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
  log(`Permissions synced: ${await prisma.permission.count()}`);

  // 2. Default roles. Permissions are applied only when the role is first created,
  //    so the owner's later customisations are never overwritten. OWNER is always full.
  const allPerms = await prisma.permission.findMany();
  const permId = new Map(allPerms.map((p) => [p.code, p.id]));
  for (const def of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: def.code } });
    if (existing && def.code !== 'OWNER') continue;
    const codes = expandRoleGrants(def);
    const role = await prisma.role.upsert({
      where: { code: def.code },
      create: { code: def.code, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description, isSystem: true, isActive: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: codes.map((c) => ({ roleId: role.id, permissionId: permId.get(c)! })).filter((r) => r.permissionId),
      skipDuplicates: true,
    });
  }
  log(`Roles synced: ${await prisma.role.count()}`);

  // 3. Owner account (only when none exists)
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
  const ownerCount = await prisma.userRole.count({ where: { roleId: ownerRole.id } });
  if (ownerCount === 0) {
    const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
    const username = process.env.OWNER_USERNAME?.trim().toLowerCase() || 'owner';
    const password = process.env.OWNER_PASSWORD;
    if (!email || !password) throw new Error('OWNER_EMAIL and OWNER_PASSWORD must be set to create the first Owner account');
    if (password.length < 10) throw new Error('OWNER_PASSWORD must be at least 10 characters');
    await prisma.user.create({
      data: {
        fullName: process.env.OWNER_NAME?.trim() || 'Owner',
        email,
        username,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        roles: { create: [{ roleId: ownerRole.id }] },
      },
    });
    log(`Owner account created: ${username}`);
  } else {
    log('Owner account already exists - not changed');
  }

  // 4. Workflow stages
  for (const [i, s] of WORKFLOW_STAGES.entries()) {
    await prisma.workflowStage.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, color: s.color, sortOrder: (i + 1) * 10, isTerminal: s.isTerminal ?? false, isSystem: true },
      update: { isSystem: true },
    });
  }
  log(`Workflow stages: ${await prisma.workflowStage.count()}`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => console.log('Seed completed'))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
