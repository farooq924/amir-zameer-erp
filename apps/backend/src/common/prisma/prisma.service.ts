import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantExtension } from '../tenant/tenant.extension';

/**
 * The app's database client. It is the Prisma client WITH the tenant extension
 * (see common/tenant): every query is limited to the current company.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Query logging is off on purpose: queries can contain confidential business data.
    super({ log: ['warn', 'error'] });
    // Nest receives the extended client; class methods below still work through it.
    return tenantExtension(this) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
