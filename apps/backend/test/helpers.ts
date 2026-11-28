import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { seed } from '../prisma/seed';
import { TENANT_MODELS, injectCompany } from '../src/common/tenant/tenant.extension';

export interface Agent {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

/**
 * Test database client: sees ALL companies (no filter on reads), and records the
 * tests create directly get the first company, like before the SaaS change.
 */
export async function testClient(): Promise<PrismaClient> {
  const base = new PrismaClient();
  const first = await base.company.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const companyId = first?.id;
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!companyId || !TENANT_MODELS.has(model)) return query(args);
          const a = { ...(args as Record<string, unknown>) };
          if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
            a.data = withCompany(model, a.data, companyId);
          } else if (operation === 'upsert') a.create = withCompany(model, a.create, companyId);
          return query(a as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

function withCompany(model: string, data: unknown, companyId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => withCompany(model, d, companyId));
  const d = data as Record<string, unknown>;
  return injectCompany(model, { ...d, companyId: d.companyId ?? companyId }, companyId, false);
}

export async function bootApp(): Promise<{ app: INestApplication; prisma: PrismaClient }> {
  const seeder = new PrismaClient();
  await seed(seeder, { log: false });
  await seeder.$disconnect();
  const prisma = await testClient();
  const app = await createApp();
  await app.init();
  return { app, prisma };
}

export async function login(app: INestApplication, identifier: string, password: string): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
  return { agent, csrf: res.body.csrfToken as string };
}
