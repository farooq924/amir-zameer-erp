import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Agent, bootApp, login } from './helpers';

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  const post = (path: string, body: unknown) => owner.agent.post(path).set('X-CSRF-Token', owner.csrf).send(body as object);
  const patch = (path: string, body: unknown) => owner.agent.patch(path).set('X-CSRF-Token', owner.csrf).send(body as object);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let ahmedId: string;

  it('creates a customer with an automatic code and normalised phone', async () => {
    const res = await post('/api/customers', {
      name: 'Ahmed Raza', mobile: '0300-1234567', email: 'Ahmed@Example.com', city: 'Lahore', address: '12 Mall Road', customerType: 'VIP',
    }).expect(201);
    ahmedId = res.body.id;
    expect(res.body.code).toMatch(/^AZC-\d{5}$/);
    expect(res.body).toMatchObject({ mobile: '923001234567', whatsapp: '923001234567', email: 'ahmed@example.com', address: '12 Mall Road', version: 1 });
    const second = await post('/api/customers', { name: 'Bilal Khan', mobile: '+92 321 7654321' }).expect(201);
    expect(Number(second.body.code.slice(4))).toBe(Number(res.body.code.slice(4)) + 1);
  });

  it('validates input', async () => {
    await post('/api/customers', { name: 'X', mobile: '0300-1234567' }).expect(400);
    await post('/api/customers', { name: 'No Phone', mobile: 'abcdefgh' }).expect(400);
    await post('/api/customers', { name: 'Bad Email', mobile: '03111111111', email: 'nope' }).expect(400);
    await post('/api/customers', { name: 'Bad Balance', mobile: '03111111112', openingBalance: '-5' }).expect(400);
  });

  it('detects duplicate mobile numbers in any format', async () => {
    const dup = await post('/api/customers', { name: 'Someone Else', mobile: '+923001234567' }).expect(409);
    expect(dup.body.details.duplicates[0]).toMatchObject({ id: ahmedId, reason: 'MOBILE' });
    const check = await owner.agent.get('/api/customers/check-duplicates?mobile=3001234567&name=ahmed raza').expect(200);
    expect(check.body[0].id).toBe(ahmedId);
    // explicit confirmation saves a separate record (e.g. father and son share a phone)
    await post('/api/customers', { name: 'Ahmed Raza Jr', mobile: '0300-1234567', allowDuplicate: true }).expect(201);
  });

  it('searches by name, code and mobile', async () => {
    const byName = await owner.agent.get('/api/customers?search=raza').expect(200);
    expect(byName.body.data.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['Ahmed Raza', 'Ahmed Raza Jr']));
    const byMobile = await owner.agent.get('/api/customers?search=0321-7654321').expect(200);
    expect(byMobile.body.data).toHaveLength(1);
    expect(byMobile.body.data[0].name).toBe('Bilal Khan');
    const code = byMobile.body.data[0].code;
    expect((await owner.agent.get(`/api/customers?search=${code}`).expect(200)).body.data[0].name).toBe('Bilal Khan');
    const vip = await owner.agent.get('/api/customers?customerType=VIP').expect(200);
    expect(vip.body.data.every((c: { customerType: string }) => c.customerType === 'VIP')).toBe(true);
  });

  it('updates with optimistic locking and never silently overwrites', async () => {
    const ok = await patch(`/api/customers/${ahmedId}`, { version: 1, city: 'Karachi', address: '5 Clifton' }).expect(200);
    expect(ok.body).toMatchObject({ city: 'Karachi', address: '5 Clifton', version: 2 });
    const stale = await patch(`/api/customers/${ahmedId}`, { version: 1, name: 'Overwrite Attempt' }).expect(409);
    expect(stale.body.message).toMatch(/changed by someone else/);
    const cleared = await patch(`/api/customers/${ahmedId}`, { version: 2, email: '', address: '' }).expect(200);
    expect(cleared.body).toMatchObject({ email: null, address: null, version: 3 });
    const audit = await prisma.auditLog.findMany({ where: { module: 'customers', recordId: ahmedId, action: 'UPDATE' } });
    expect(audit).toHaveLength(2);
  });

  it('records an opening balance in the customer ledger', async () => {
    const res = await post('/api/customers', { name: 'Old Customer', mobile: '0333-5550001', openingBalance: '2500.50' }).expect(201);
    const ledger = await owner.agent.get(`/api/customers/${res.body.id}/ledger`).expect(200);
    expect(ledger.body.entries).toEqual([expect.objectContaining({ entryType: 'OPENING', debit: '2500.50', credit: '0.00', balance: '2500.50' })]);
    const profile = await owner.agent.get(`/api/customers/${res.body.id}`).expect(200);
    expect(profile.body.stats).toMatchObject({ outstanding: '2500.50', totalOrders: 0, measurementVersions: 0 });
    const list = await owner.agent.get('/api/customers?search=Old Customer').expect(200);
    expect(list.body.data[0].outstanding).toBe('2500.50');
    // has ledger history -> cannot be deleted
    await owner.agent.delete(`/api/customers/${res.body.id}`).set('X-CSRF-Token', owner.csrf).expect(400);
  });

  it('profile tabs return real (empty) order and payment history', async () => {
    const orders = await owner.agent.get(`/api/customers/${ahmedId}/orders`).expect(200);
    expect(orders.body).toMatchObject({ data: [], meta: { total: 0 } });
    const payments = await owner.agent.get(`/api/customers/${ahmedId}/payments`).expect(200);
    expect(payments.body.data).toEqual([]);
  });

  it('notes are stored and listed newest first', async () => {
    await post(`/api/customers/${ahmedId}/notes`, { note: 'Prefers loose fitting' }).expect(201);
    await post(`/api/customers/${ahmedId}/notes`, { note: 'Collar size changed' }).expect(201);
    const notes = await owner.agent.get(`/api/customers/${ahmedId}/notes`).expect(200);
    expect(notes.body.map((n: { note: string }) => n.note)).toEqual(['Collar size changed', 'Prefers loose fitting']);
  });

  it('status change and soft delete', async () => {
    const c = await post('/api/customers', { name: 'Temp Customer', mobile: '0345-9990001' }).expect(201);
    await patch(`/api/customers/${c.body.id}/status`, { status: 'BLOCKED' }).expect(200);
    expect((await owner.agent.get('/api/customers?status=BLOCKED').expect(200)).body.data.map((x: { id: string }) => x.id)).toContain(c.body.id);
    await owner.agent.delete(`/api/customers/${c.body.id}`).set('X-CSRF-Token', owner.csrf).expect(200);
    await owner.agent.get(`/api/customers/${c.body.id}`).expect(404);
    expect(await prisma.customer.findUnique({ where: { id: c.body.id } })).not.toBeNull(); // kept for history
  });

  it('offline-created customers are idempotent by client id', async () => {
    const id = '0d4f7f3e-8a51-4c1e-9a77-1e2b3c4d5e6f';
    const a = await post('/api/customers', { id, name: 'Offline Customer', mobile: '0300-7778889' }).expect(201);
    const b = await post('/api/customers', { id, name: 'Offline Customer', mobile: '0300-7778889' }).expect(201);
    expect(b.body.code).toBe(a.body.code);
    expect(await prisma.customer.count({ where: { id } })).toBe(1);
  });

  it('enforces permissions', async () => {
    const roles = (await owner.agent.get('/api/roles').expect(200)).body;
    const tailor = roles.find((r: { code: string }) => r.code === 'TAILOR');
    await post('/api/users', { fullName: 'Tailor One', email: 'tailor1@test.local', username: 'tailor1', password: 'TailorPass123', roleIds: [tailor.id] }).expect(201);
    const t = await login(app, 'tailor1', 'TailorPass123');
    await t.agent.get('/api/customers').expect(403);
    await t.agent.post('/api/customers').set('X-CSRF-Token', t.csrf).send({ name: 'X Y', mobile: '03001112223' }).expect(403);
  });
});
