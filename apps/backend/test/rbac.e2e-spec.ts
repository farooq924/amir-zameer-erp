import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Agent, bootApp, login } from './helpers';

describe('RBAC, users & roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let roles: { id: string; code: string; permissions: string[] }[];
  let cashierUserId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    roles = (await owner.agent.get('/api/roles').expect(200)).body;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const role = (code: string) => roles.find((r) => r.code === code)!;

  it('seeds all 8 default roles', () => {
    expect(roles.map((r) => r.code).sort()).toEqual(
      ['ACCOUNTANT', 'ADMINISTRATOR', 'CASHIER', 'INVENTORY_MANAGER', 'MANAGER', 'OWNER', 'RECEPTIONIST', 'TAILOR'],
    );
    expect(role('OWNER').permissions).toEqual(['*']);
  });

  it('owner creates a cashier user', async () => {
    const res = await owner.agent.post('/api/users').set('X-CSRF-Token', owner.csrf)
      .send({ fullName: 'Cash Desk', email: 'cash@test.local', username: 'cashier1', password: 'Cashier12345', roleIds: [role('CASHIER').id] })
      .expect(201);
    cashierUserId = res.body.id;
    expect(res.body.roles[0].code).toBe('CASHIER');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('rejects duplicate username and weak passwords', async () => {
    await owner.agent.post('/api/users').set('X-CSRF-Token', owner.csrf)
      .send({ fullName: 'Dup', email: 'dup@test.local', username: 'CASHIER1', password: 'Cashier12345', roleIds: [role('CASHIER').id] })
      .expect(409);
    await owner.agent.post('/api/users').set('X-CSRF-Token', owner.csrf)
      .send({ fullName: 'Weak', email: 'weak@test.local', username: 'weakpw', password: 'alllowercase', roleIds: [role('CASHIER').id] })
      .expect(400);
  });

  it('backend blocks a cashier from modules they lack permission for', async () => {
    const cashier = await login(app, 'cashier1', 'Cashier12345');
    await cashier.agent.get('/api/dashboard/summary').expect(200); // dashboard.view granted
    const denied = await cashier.agent.get('/api/users').expect(403);
    expect(denied.body.details.missing).toContain('users.view');
    await cashier.agent.get('/api/audit-logs').expect(403);
    await cashier.agent.put('/api/settings/business').set('X-CSRF-Token', cashier.csrf).send({ businessName: 'Hacked' }).expect(403);
  });

  it('permission changes apply immediately', async () => {
    const cashierRole = role('CASHIER');
    await owner.agent.patch(`/api/roles/${cashierRole.id}`).set('X-CSRF-Token', owner.csrf)
      .send({ permissions: [...cashierRole.permissions, 'audit_logs.view'] })
      .expect(200);
    const cashier = await login(app, 'cashier1', 'Cashier12345');
    await cashier.agent.get('/api/audit-logs').expect(200);
    const changed = await prisma.auditLog.findFirst({ where: { action: 'PERMISSIONS_CHANGED', recordId: cashierRole.id } });
    expect(changed).not.toBeNull();
  });

  it('owner role cannot be edited', async () => {
    await owner.agent.patch(`/api/roles/${role('OWNER').id}`).set('X-CSRF-Token', owner.csrf).send({ permissions: [] }).expect(400);
  });

  it('unknown permission codes are rejected', async () => {
    await owner.agent.post('/api/roles').set('X-CSRF-Token', owner.csrf)
      .send({ code: 'BAD_ROLE', name: 'Bad', permissions: ['nope.view'] }).expect(400);
  });

  it('custom role lifecycle: create, assign, cannot delete while in use', async () => {
    const created = await owner.agent.post('/api/roles').set('X-CSRF-Token', owner.csrf)
      .send({ code: 'SENIOR_TAILOR', name: 'Senior Tailor', permissions: ['orders.view', 'production.view', 'production.edit'] })
      .expect(201);
    expect(created.body.permissions).toEqual(['orders.view', 'production.edit', 'production.view']);
    await owner.agent.patch(`/api/users/${cashierUserId}`).set('X-CSRF-Token', owner.csrf).send({ roleIds: [created.body.id] }).expect(200);
    await owner.agent.delete(`/api/roles/${created.body.id}`).set('X-CSRF-Token', owner.csrf).expect(400);
    await owner.agent.patch(`/api/users/${cashierUserId}`).set('X-CSRF-Token', owner.csrf).send({ roleIds: [role('CASHIER').id] }).expect(200);
    await owner.agent.delete(`/api/roles/${created.body.id}`).set('X-CSRF-Token', owner.csrf).expect(200);
  });

  it('deactivating a user ends their sessions and blocks login', async () => {
    const cashier = await login(app, 'cashier1', 'Cashier12345');
    await owner.agent.patch(`/api/users/${cashierUserId}/status`).set('X-CSRF-Token', owner.csrf).send({ isActive: false }).expect(200);
    await cashier.agent.get('/api/auth/me').expect(401);
    const res = await cashier.agent.post('/api/auth/login').send({ identifier: 'cashier1', password: 'Cashier12345' }).expect(401);
    expect(res.body.message).toMatch(/deactivated/);
    await owner.agent.patch(`/api/users/${cashierUserId}/status`).set('X-CSRF-Token', owner.csrf).send({ isActive: true }).expect(200);
  });

  it('the last owner cannot be deactivated or demoted', async () => {
    const me = (await owner.agent.get('/api/auth/me').expect(200)).body.user;
    await owner.agent.patch(`/api/users/${me.id}/status`).set('X-CSRF-Token', owner.csrf).send({ isActive: false }).expect(400);
    await owner.agent.patch(`/api/users/${me.id}`).set('X-CSRF-Token', owner.csrf).send({ roleIds: [role('MANAGER').id] }).expect(400);
  });

  it('only an owner can grant the owner role', async () => {
    // give the cashier user users.* via a custom admin-like role without OWNER
    const adminRole = role('ADMINISTRATOR');
    await owner.agent.patch(`/api/users/${cashierUserId}`).set('X-CSRF-Token', owner.csrf).send({ roleIds: [adminRole.id] }).expect(200);
    const admin = await login(app, 'cashier1', 'Cashier12345');
    await admin.agent.patch(`/api/users/${cashierUserId}`).set('X-CSRF-Token', admin.csrf).send({ roleIds: [role('OWNER').id] }).expect(400);
  });

  it('password reset revokes sessions', async () => {
    const before = await login(app, 'cashier1', 'Cashier12345');
    await owner.agent.post(`/api/users/${cashierUserId}/reset-password`).set('X-CSRF-Token', owner.csrf).send({ newPassword: 'NewCashier123' }).expect(201);
    await before.agent.get('/api/auth/me').expect(401);
    await login(app, 'cashier1', 'NewCashier123');
  });
});
