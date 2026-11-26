import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Rebuilds the dedicated *_test database from migrations before e2e tests.
 * Guarded so it can never run against a database whose name does not end in "_test".
 */
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://az_erp:az_erp_dev@localhost:5432/amir_zameer_erp_test?schema=public&connection_limit=5';
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset "${dbName}": test database name must end with _test`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
