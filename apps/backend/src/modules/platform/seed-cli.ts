/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { seed } from './provisioning';

/** node dist/modules/platform/seed-cli.js  (idempotent default data; run after every update) */
const prisma = new PrismaClient();
seed(prisma)
  .then(() => console.log('Seed completed'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
