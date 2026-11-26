import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootApp, login } from './helpers';

describe('Authentication & sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('health check works without login', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('rejects protected routes without a session', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });

  it('rejects wrong password with a generic message', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: 'owner', password: 'wrong-password' }).expect(401);
    expect(res.body.message).toBe('Invalid username or password');
    const unknown = await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: 'nobody', password: 'whatever' }).expect(401);
    expect(unknown.body.message).toBe('Invalid username or password');
  });

  it('logs in with username or email and sets secure cookies', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: 'OWNER@test.local', password: 'OwnerPass123' }).expect(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const sid = cookies.find((c) => c.startsWith('az_sid='))!;
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Strict/i);
    expect(cookies.find((c) => c.startsWith('az_csrf='))).not.toMatch(/HttpOnly/i);
    expect(res.body.user).toMatchObject({ username: 'owner', isOwner: true });
    expect(res.body.user.passwordHash).toBeUndefined();
    // the raw token is never stored
    const token = sid.split(';')[0].split('=')[1];
    expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
  });

  it('/auth/me returns user and permissions', async () => {
    const { agent } = await login(app, 'owner', 'OwnerPass123');
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.roles).toEqual([{ code: 'OWNER', name: 'Owner' }]);
    expect(res.body.user.permissions.length).toBeGreaterThan(50);
  });

  it('requires CSRF token for state-changing requests', async () => {
    const { agent, csrf } = await login(app, 'owner', 'OwnerPass123');
    await agent.put('/api/settings/business').send({ businessName: 'AMIR ZAMEER' }).expect(403);
    await agent.put('/api/settings/business').set('X-CSRF-Token', 'forged').send({ businessName: 'AMIR ZAMEER' }).expect(403);
    await agent.put('/api/settings/business').set('X-CSRF-Token', csrf).send({ businessName: 'AMIR ZAMEER' }).expect(200);
  });

  it('logout revokes the session', async () => {
    const { agent, csrf } = await login(app, 'owner', 'OwnerPass123');
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('locks the account after repeated failures (LOGIN_MAX_ATTEMPTS=3)', async () => {
    const { agent, csrf } = await login(app, 'owner', 'OwnerPass123');
    const roles = await agent.get('/api/roles').expect(200);
    const cashier = roles.body.find((r: { code: string }) => r.code === 'CASHIER');
    await agent.post('/api/users').set('X-CSRF-Token', csrf)
      .send({ fullName: 'Lock Test', email: 'lock@test.local', username: 'locktest', password: 'LockTest1234', roleIds: [cashier.id] })
      .expect(201);

    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).post('/api/auth/login').send({ identifier: 'locktest', password: 'bad-password' }).expect(401);
    }
    const locked = await request(server).post('/api/auth/login').send({ identifier: 'locktest', password: 'LockTest1234' }).expect(429);
    expect(locked.body.message).toMatch(/locked/i);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_LOCKED' } });
    expect(audit).not.toBeNull();
  });

  it('expired sessions are rejected', async () => {
    const { agent } = await login(app, 'owner', 'OwnerPass123');
    const latest = await prisma.session.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    await prisma.session.update({ where: { id: latest.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get('/api/auth/me').expect(401);
  });

  it('records LOGIN and LOGOUT in the audit log', async () => {
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'LOGOUT' } })).toBeGreaterThan(0);
  });
});

describe('Login rate limit (e2e)', () => {
  it('returns 429 after too many login requests from one IP', async () => {
    process.env.LOGIN_RATE_LIMIT_PER_MINUTE = '3';
    const { resetEnvCache } = await import('../src/config/env');
    resetEnvCache();
    const { app, prisma } = await bootApp();
    try {
      const server = app.getHttpServer();
      for (let i = 0; i < 3; i++) await request(server).post('/api/auth/login').send({ identifier: 'nobody', password: 'y' }).expect(401);
      await request(server).post('/api/auth/login').send({ identifier: 'nobody', password: 'y' }).expect(429);
    } finally {
      process.env.LOGIN_RATE_LIMIT_PER_MINUTE = '1000';
      resetEnvCache();
      await app.close();
      await prisma.$disconnect();
    }
  });
});
