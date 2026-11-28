/* eslint-disable no-console */
import 'reflect-metadata';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load apps/backend/.env like the server does. Real environment variables always win.
const envFile = resolve(__dirname, '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { Tenant } from '../common/tenant';
import { DEMO_USER } from './demo-dataset';
import { loadDemoData, readManifest } from './demo-loader';
import { removeDemoData } from './demo-remover';

/**
 * Demo data tool.
 *   node dist/demo/cli.js load     adds the demo login and Karachi demo data (safe to run twice)
 *   node dist/demo/cli.js remove   deletes the demo login and all demo data (real records are kept)
 *   node dist/demo/cli.js status   shows whether demo data is loaded
 * Add --company=<code> to choose the company (default: the first company, e.g. zameer-ansari).
 */
async function main(): Promise<void> {
  const command = (process.argv[2] ?? 'status').toLowerCase();
  if (!['load', 'remove', 'status'].includes(command)) {
    console.error('Usage: node dist/demo/cli.js load | remove | status');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const code = process.argv.find((a) => a.startsWith('--company='))?.split('=')[1]?.trim().toLowerCase();
    const company = code
      ? await prisma.company.findUnique({ where: { code } })
      : await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!company) throw new Error(code ? `Company "${code}" was not found` : 'No company exists yet');
    console.log(`Company: ${company.name} (${company.code})`);
    await Tenant.run(company.id, () => run(command, app, prisma));
  } finally {
    await app.close();
  }
}

async function run(command: string, app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>, prisma: PrismaService): Promise<void> {
  {
    if (command === 'status') {
      const m = await readManifest(prisma);
      if (!m) console.log('Demo data is NOT loaded.');
      else {
        console.log(m.complete ? 'Demo data is loaded.' : 'Demo data load did not finish (run remove, then load again).');
        console.log(`  Customers: ${m.customers.length}, Suppliers: ${m.suppliers.length}, Fabrics: ${m.fabrics.length}, Employees: ${m.employees.length}, Payrolls: ${m.payrolls.length}`);
      }
      return;
    }
    if (command === 'load') {
      console.log('Loading demo data (about 1 minute)...');
      const r = await loadDemoData(app);
      if (r.status === 'already-loaded') console.log('Demo data is already loaded. Nothing was changed.');
      else {
        console.log('Demo data loaded:');
        for (const [k, v] of Object.entries(r.counts)) console.log(`  ${k}: ${v}`);
        r.notes.forEach((n) => console.log(`  Note: ${n}`));
      }
      console.log('');
      const m = await readManifest(prisma);
      console.log(`Demo login  ->  Username: ${r.username ?? m?.username ?? DEMO_USER.username}   Password: ${DEMO_USER.password}   (role: Manager)`);
      return;
    }
    console.log('Removing demo data...');
    const r = await removeDemoData(prisma);
    if (r.status === 'nothing-to-remove') console.log('No demo data found. Nothing was changed.');
    else {
      console.log('Demo data removed:');
      for (const [k, v] of Object.entries(r.counts)) if (v) console.log(`  ${k}: ${v}`);
      console.log('Your real records were not touched.');
    }
  }
}

main().catch((err) => {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exitCode = 1;
});
