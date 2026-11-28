/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { seed } from '../src/modules/platform/provisioning';

/** Development entry point (ts-node). Production runs dist/modules/platform/seed-cli.js. */
export { seed };

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
