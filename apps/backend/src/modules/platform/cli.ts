/* eslint-disable no-console */
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load apps/backend/.env like the server does. Real environment variables always win.
const envFile = resolve(__dirname, '..', '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

import { PrismaClient } from '@prisma/client';
import { passwordPolicyError } from '../auth/password.service';
import { hashPassword } from './provisioning';

/**
 * TailoringERP platform tool.
 *   node dist/modules/platform/cli.js create-super-admin   (reads SA_NAME, SA_EMAIL, SA_USERNAME, SA_PASSWORD)
 *   node dist/modules/platform/cli.js list-super-admins
 * Used by scripts\\create-super-admin.ps1, which asks for the values.
 */
async function main(): Promise<void> {
  const command = process.argv[2] ?? '';
  const prisma = new PrismaClient();
  try {
    if (command === 'list-super-admins') {
      const rows = await prisma.user.findMany({ where: { isSuperAdmin: true, deletedAt: null }, select: { username: true, email: true, isActive: true } });
      if (!rows.length) console.log('No Super Admin exists yet.');
      rows.forEach((r) => console.log(`  ${r.username}  <${r.email}>  ${r.isActive ? 'active' : 'inactive'}`));
      return;
    }
    if (command !== 'create-super-admin') {
      console.error('Usage: node dist/modules/platform/cli.js create-super-admin | list-super-admins');
      process.exitCode = 1;
      return;
    }
    const username = (process.env.SA_USERNAME ?? '').trim().toLowerCase();
    const email = (process.env.SA_EMAIL ?? '').trim().toLowerCase() || `${username}@tailoringerp.local`;
    const fullName = (process.env.SA_NAME ?? '').trim() || 'Super Admin';
    const password = process.env.SA_PASSWORD ?? '';
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) throw new Error('Username: 3-60 letters, numbers, dot, dash or underscore');
    const policy = passwordPolicyError(password);
    if (policy) throw new Error(policy);
    const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (existing && !existing.isSuperAdmin) throw new Error(`"${username}" (or ${email}) is already used by a company user. Choose another username.`);
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(password), isActive: true, lockedUntil: null, failedLoginAttempts: 0, passwordChangedAt: new Date() } });
      console.log(`Super Admin "${username}" already existed: password changed.`);
      return;
    }
    await prisma.user.create({ data: { fullName, email, username, passwordHash: await hashPassword(password), isSuperAdmin: true, companyId: null } });
    console.log(`Super Admin "${username}" created. Log in to the ERP with this username to open the Super Admin panel.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exitCode = 1;
});
