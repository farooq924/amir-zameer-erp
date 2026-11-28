import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { Agent, bootApp, login } from './helpers';

/** TailoringERP SaaS: companies are fully separated; plans, trial, read-only, suspension and support access. */
describe('SaaS platform: companies, plans and isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sa: Agent; // Super Admin
  let first: Agent; // Owner of the first company (all other suites' data)
  let rehman: Agent; // Owner of a new company
  let companyId: string;
  let basicId: string;
  let firstCustomerId: string;

  const post = (a: Agent, url: string, body: object = {}) => a.agent.post(url).set('X-CSRF-Token', a.csrf).send(body);
  const patch = (a: Agent, url: string, body: object) => a.agent.patch(url).set('X-CSRF-Token', a.csrf).send(body);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    sa = await login(app, 'superadmin', 'SuperAdmin12345');
    first = await login(app, 'owner', 'OwnerPass123');
    const c = await post(first, '/api/customers', { name: 'First Company Customer', mobile: '03005550001' }).expect(201);
    firstCustomerId = c.body.id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('the Super Admin is outside every company until one is opened', async () => {
    const me = (await sa.agent.get('/api/auth/me').expect(200)).body.user;
    expect(me).toMatchObject({ isSuperAdmin: true, companyId: null, company: null, supportMode: false });
    const r = await sa.agent.get('/api/customers').expect(403);
    expect(r.body.error?.details?.code ?? r.body.details?.code ?? JSON.stringify(r.body)).toContain('NO_COMPANY');
    await first.agent.get('/api/platform/overview').expect(403);
    const o = await sa.agent.get('/api/platform/overview').expect(200);
    expect(o.body.companies).toBe(1);
  });

  it('creates a company with its Owner and default data (trial, Basic plan)', async () => {
    const plans = (await sa.agent.get('/api/platform/plans').expect(200)).body as { id: string; code: string; maxUsers: number }[];
    expect(plans.map((p) => p.code)).toEqual(['BASIC', 'STANDARD', 'PREMIUM']);
    basicId = plans.find((p) => p.code === 'BASIC')!.id;
    // Usernames are unique across all companies.
    await post(sa, '/api/platform/companies', {
      name: 'Rehman Tailors', planId: basicId, owner: { fullName: 'Abdul Rehman', email: 'x@test.local', username: 'owner', password: 'RehmanPass123' },
    }).expect(409);
    const res = await post(sa, '/api/platform/companies', {
      name: 'Rehman Tailors', phone: '0300-1112223', city: 'Lahore', planId: basicId,
      owner: { fullName: 'Abdul Rehman', email: 'rehman@test.local', username: 'rehman', password: 'RehmanPass123' },
    }).expect(201);
    companyId = res.body.id;
    expect(res.body).toMatchObject({ code: 'rehman-tailors', status: 'TRIAL', access: 'FULL', docPrefix: 'RE' });
    expect(res.body.daysLeft).toBe(14);
    expect(res.body.users).toHaveLength(1);

    rehman = await login(app, 'rehman', 'RehmanPass123');
    const me = (await rehman.agent.get('/api/auth/me').expect(200)).body.user;
    expect(me).toMatchObject({ isOwner: true, isSuperAdmin: false, companyId, company: { name: 'Rehman Tailors', plan: { code: 'BASIC' } } });
    expect(me.company.modules).not.toContain('payroll');
    expect(me.permissions.some((p: string) => p.startsWith('payroll.'))).toBe(false);
    // Default data of its own
    const roles = (await rehman.agent.get('/api/roles').expect(200)).body as { code: string }[];
    expect(roles.map((r) => r.code)).toContain('OWNER');
    const settings = (await rehman.agent.get('/api/settings').expect(200)).body;
    expect(settings.business).toMatchObject({ businessName: 'Rehman Tailors', city: 'Lahore' });
    expect(settings.numbering.orderPrefix).toBe('RE');
  });

  it("a company never sees another company's data", async () => {
    const list = (await rehman.agent.get('/api/customers').expect(200)).body;
    expect(list.meta.total).toBe(0);
    await rehman.agent.get(`/api/customers/${firstCustomerId}`).expect(404);
    await patch(rehman, `/api/customers/${firstCustomerId}`, { name: 'Hacked' }).expect((r) => expect([400, 404]).toContain(r.status));
    const mine = await post(rehman, '/api/customers', { name: 'Rehman Customer', mobile: '03005550002' }).expect(201);
    expect(mine.body.code).toMatch(/^REC-0000/);
    const firstList = (await first.agent.get('/api/customers').query({ search: 'Rehman Customer' }).expect(200)).body;
    expect(firstList.meta.total).toBe(0);
    await first.agent.get(`/api/customers/${mine.body.id}`).expect(404);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: firstCustomerId } })).name).toBe('First Company Customer');
    // Dashboard numbers are per company too.
    const dash = (await rehman.agent.get('/api/dashboard/summary').expect(200)).body;
    expect(dash.cards.totalOrders).toBe(0);
  });

  it('the plan decides the modules and the number of users', async () => {
    const r = await rehman.agent.get('/api/payroll').expect(403);
    expect(JSON.stringify(r.body)).toContain('PLAN_MODULE');
    const roles = (await rehman.agent.get('/api/roles').expect(200)).body as { id: string; code: string }[];
    const cashier = roles.find((x) => x.code === 'CASHIER')!.id;
    await post(rehman, '/api/users', { fullName: 'R Two', email: 'r2@test.local', username: 'rehman2', password: 'RehmanPass123', roleIds: [cashier] }).expect(201);
    await post(rehman, '/api/users', { fullName: 'R Three', email: 'r3@test.local', username: 'rehman3', password: 'RehmanPass123', roleIds: [cashier] }).expect(201);
    const over = await post(rehman, '/api/users', { fullName: 'R Four', email: 'r4@test.local', username: 'rehman4', password: 'RehmanPass123', roleIds: [cashier] }).expect(400);
    expect(JSON.stringify(over.body)).toContain('allows 3 active users');
    // Super Admin adds payroll to the Basic plan: available at once.
    await patch(sa, `/api/platform/plans/${basicId}`, { modules: ['payroll', 'employees', 'attendance', 'production'] }).expect(200);
    await rehman.agent.get('/api/payroll').expect(200);
    await patch(sa, `/api/platform/plans/${basicId}`, { modules: [] }).expect(200);
    await rehman.agent.get('/api/payroll').expect(403);
  });

  it('after the trial (and grace) the ERP is read-only until a payment is recorded', async () => {
    const yesterday = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
    await patch(sa, `/api/platform/companies/${companyId}`, { trialEndsAt: yesterday, graceDays: 0 }).expect(200);
    const me = (await rehman.agent.get('/api/auth/me').expect(200)).body.user;
    expect(me.company.access).toBe('READ_ONLY');
    await rehman.agent.get('/api/customers').expect(200);
    const blocked = await post(rehman, '/api/customers', { name: 'Blocked', mobile: '03005550003' }).expect(403);
    expect(JSON.stringify(blocked.body)).toContain('SUBSCRIPTION_EXPIRED');
    // Change own password still works (and logout).
    const pay = await post(sa, `/api/platform/companies/${companyId}/payments`, { amount: 2000, months: 1, method: 'JAZZCASH', reference: 'TXN123' }).expect(201);
    expect(pay.body.company).toMatchObject({ status: 'ACTIVE', access: 'FULL' });
    expect(pay.body.company.daysLeft).toBeGreaterThanOrEqual(27);
    await post(rehman, '/api/customers', { name: 'After Payment', mobile: '03005550004' }).expect(201);
    const list = (await sa.agent.get('/api/platform/payments').expect(200)).body;
    expect(list.totalAmount).toBe('2000.00');
    // A second payment continues from the current end date.
    const again = await post(sa, `/api/platform/companies/${companyId}/payments`, { amount: 2000, months: 1, method: 'BANK' }).expect(201);
    expect(again.body.payment.periodFrom > pay.body.payment.periodTo).toBe(true);
  });

  it('a suspended company cannot log in; activation brings it back', async () => {
    await post(sa, `/api/platform/companies/${companyId}/suspend`, { reason: 'Payment pending' }).expect(200);
    await rehman.agent.get('/api/auth/me').expect(401); // logged out at once
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: 'rehman', password: 'RehmanPass123' }).expect(403);
    expect(JSON.stringify(r.body)).toContain('suspended');
    await first.agent.get('/api/customers').expect(200); // other companies are not affected
    await post(sa, `/api/platform/companies/${companyId}/activate`).expect(200);
    rehman = await login(app, 'rehman', 'RehmanPass123');
  });

  it('support access: the Super Admin opens a company (audited) and leaves it', async () => {
    await post(sa, `/api/platform/companies/${companyId}/enter`).expect(200);
    const me = (await sa.agent.get('/api/auth/me').expect(200)).body.user;
    expect(me).toMatchObject({ supportMode: true, companyId, company: { name: 'Rehman Tailors' } });
    const list = (await sa.agent.get('/api/customers').expect(200)).body;
    expect(list.data.map((c: { name: string }) => c.name)).toContain('Rehman Customer');
    expect(list.data.map((c: { name: string }) => c.name)).not.toContain('First Company Customer');
    const audit = await prisma.auditLog.findFirst({ where: { companyId, action: 'SUPPORT_ACCESS_STARTED' } });
    expect(audit).not.toBeNull();
    await post(sa, '/api/platform/exit-company').expect(200);
    expect((await sa.agent.get('/api/auth/me').expect(200)).body.user.companyId).toBeNull();
  });

  it('the Super Admin resets an Owner password and sees platform activity', async () => {
    await post(sa, `/api/platform/companies/${companyId}/reset-owner-password`, { password: 'weak' }).expect(400);
    await post(sa, `/api/platform/companies/${companyId}/reset-owner-password`, { password: 'NewRehman12345' }).expect(200);
    await rehman.agent.get('/api/auth/me').expect(401);
    rehman = await login(app, 'rehman', 'NewRehman12345');
    const logs = (await sa.agent.get('/api/platform/audit-logs').expect(200)).body;
    expect(logs.data.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(['COMPANY_CREATED', 'COMPANY_SUSPENDED', 'COMPANY_PAYMENT']));
    const detail = (await sa.agent.get(`/api/platform/companies/${companyId}`).expect(200)).body;
    expect(detail.usage.customers).toBe(2);
    expect(detail.payments).toHaveLength(2);
  });
});
