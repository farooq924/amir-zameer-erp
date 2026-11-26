import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { seed } from '../prisma/seed';

export interface Agent {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

export async function bootApp(): Promise<{ app: INestApplication; prisma: PrismaClient }> {
  const prisma = new PrismaClient();
  await seed(prisma, { log: false });
  const app = await createApp();
  await app.init();
  return { app, prisma };
}

export async function login(app: INestApplication, identifier: string, password: string): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
  return { agent, csrf: res.body.csrfToken as string };
}
