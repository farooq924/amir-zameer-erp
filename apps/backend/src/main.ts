import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const config = env();
  const app = await createApp();
  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`AMIR ZAMEER ERP API listening on port ${config.PORT}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
