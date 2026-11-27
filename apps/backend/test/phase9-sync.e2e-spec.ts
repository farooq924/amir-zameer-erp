import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Agent, bootApp, login } from './helpers';

describe('Phase 9: offline sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let tailor: Agent;
  const DEVICE = 'web-test-device-01';
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const patch = (path: string, body: unknown, a: Agent = owner) => a.agent.patch(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);
  const op = (entityType: string, operation: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    id: randomUUID(), entityType, entityId: randomUUID(), operation, payload, clientTimestamp: new Date().toISOString(), ...extra,
  });
  const push = (operations: unknown[], a: Agent = owner) => post('/api/sync/push', { deviceId: DEVICE, operations }, a).expect(200);

  let template: { id: string; fields: { key: string; isRequired: boolean }[] };

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    const roles = (await get('/api/roles').expect(200)).body as { id: string; code: string }[];
    await post('/api/users', { fullName: 'Sync Tailor', email: 'synctailor@test.local', username: 'synctailor', password: 'Tailor12345', roleIds: [roles.find((r) => r.code === 'TAILOR')!.id] }).expect(201);
    tailor = await login(app, 'synctailor', 'Tailor12345');
    const templates = (await get('/api/measurement-templates').expect(200)).body as typeof template[];
    template = templates[0];
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('applies an offline customer, measurement, order and payment in one batch, using dependencies', async () => {
    const customer = op('customer', 'CREATE', { name: 'Faraz Siddiqui', mobile: '0333-7001122', city: 'Karachi', address: 'Block 13-D, Gulshan-e-Iqbal' });
    const values = template.fields.map((f, i) => ({ fieldKey: f.key, value: String(10 + i) }));
    const measurement = op('measurement', 'CREATE', { customerId: customer.entityId, templateId: template.id, unit: 'INCH', values }, { dependsOn: [customer.id] });
    const order = op('order', 'CREATE', {
      customerId: customer.entityId, items: [{ garmentName: 'Shalwar Kameez', quantity: 1, stitchingPrice: '3000' }],
      advance: { amount: '1000', method: 'CASH' },
    }, { dependsOn: [customer.id, measurement.id] });
    const payment = op('payment', 'CREATE', { orderId: order.entityId, amount: '500', method: 'MOBILE_WALLET', reference: 'JC-55120' }, { dependsOn: [order.id] });

    const res = await push([customer, measurement, order, payment]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED']);
    expect(res.body.results[0].result.code).toMatch(/^AZC-/);
    expect(res.body.results[2].result.orderNumber).toMatch(/^AZ-\d{4}-/);

    const saved = (await get(`/api/orders/${order.entityId}`).expect(200)).body;
    expect(saved.customer.id).toBe(customer.entityId);
    expect(saved.paidAmount).toBe('1500.00');
    expect(saved.balanceAmount).toBe('1500.00');

    // Sending the same batch again changes nothing (idempotent).
    const again = await push([customer, measurement, order, payment]);
    expect(again.body.results.every((r: { status: string }) => r.status === 'DUPLICATE')).toBe(true);
    expect(await prisma.payment.count({ where: { orderId: order.entityId } })).toBe(2);
    expect(await prisma.customer.count({ where: { mobile: '923337001122' } })).toBe(1);
  });

  it('waits for a dependency that was not sent yet', async () => {
    const missing = randomUUID();
    const order = op('order', 'CREATE', { customerId: randomUUID(), items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '1800' }] }, { dependsOn: [missing] });
    const res = await push([order]);
    expect(res.body.results[0].status).toBe('WAITING');
    expect(await prisma.syncOperation.findUnique({ where: { id: order.id } })).toBeNull();
  });

  it('rejects invalid entries and entries the user may not make, and stores the reason', async () => {
    const bad = op('customer', 'CREATE', { name: 'X', mobile: '12' });
    const res = await push([bad]);
    expect(res.body.results[0].status).toBe('REJECTED');
    expect(res.body.results[0].message).toMatch(/correct the entry/);

    const notAllowed = op('customer', 'CREATE', { name: 'Tailor Made', mobile: '0300-9998877' });
    const r2 = await push([notAllowed], tailor);
    expect(r2.body.results[0].status).toBe('REJECTED');
    expect(r2.body.results[0].message).toMatch(/permission/);
    expect((await prisma.syncOperation.findUnique({ where: { id: notAllowed.id } }))?.status).toBe('REJECTED');

    // Another user cannot replay someone else's operation id.
    const r3 = await push([bad], tailor);
    expect(r3.body.results[0].status).toBe('REJECTED');
  });

  it('turns an offline edit of a customer changed on the server into a conflict, then merges it', async () => {
    const c = (await post('/api/customers', { name: 'Hina Baloch', mobile: '0345-2223344', city: 'Karachi' }).expect(201)).body;
    // Server edit (version 1 -> 2)
    await patch(`/api/customers/${c.id}`, { version: 1, city: 'Hyderabad' }).expect(200);
    // Device edited version 1 offline
    const edit = op('customer', 'UPDATE', { name: 'Hina Baloch Khan', city: 'Karachi' }, { entityId: c.id, baseVersion: 1 });
    const res = await push([edit]);
    expect(res.body.results[0].status).toBe('CONFLICT');
    const conflictId = res.body.results[0].conflictId as string;

    const list = (await get('/api/sync/conflicts').expect(200)).body as { id: string; kind: string; server: { city: string }; device: { name: string } }[];
    const conflict = list.find((x) => x.id === conflictId)!;
    expect(conflict.kind).toBe('VERSION');
    expect(conflict.server.city).toBe('Hyderabad');
    expect(conflict.device.name).toBe('Hina Baloch Khan');

    // Replaying while unresolved keeps it a conflict.
    expect((await push([edit])).body.results[0].status).toBe('CONFLICT');

    // Keep device name, keep server city.
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'MERGED', fields: { name: 'device', city: 'server' } }).expect(200);
    const after = (await get(`/api/customers/${c.id}`).expect(200)).body;
    expect(after.name).toBe('Hina Baloch Khan');
    expect(after.city).toBe('Hyderabad');
    expect((await push([edit])).body.results[0].status).toBe('DUPLICATE');
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'KEEP_SERVER' }).expect(400);
  });

  it('applies an offline edit when the server already has the same values', async () => {
    const c = (await post('/api/customers', { name: 'Imran Qureshi', mobile: '0312-4445566' }).expect(201)).body;
    await patch(`/api/customers/${c.id}`, { version: 1, city: 'Karachi' }).expect(200);
    const edit = op('customer', 'UPDATE', { city: 'Karachi' }, { entityId: c.id, baseVersion: 1 });
    expect((await push([edit])).body.results[0].status).toBe('APPLIED');
  });

  it('asks before saving a duplicate phone, and maps dependent entries to the existing customer', async () => {
    const existing = (await post('/api/customers', { name: 'Sana Mirza', mobile: '0300-8881234' }).expect(201)).body;
    const offline = op('customer', 'CREATE', { name: 'Sana Mirza (Tablet)', mobile: '0300-8881234' });
    const order = op('order', 'CREATE', { customerId: offline.entityId, items: [{ garmentName: 'Waistcoat', quantity: 1, stitchingPrice: '4500' }] }, { dependsOn: [offline.id] });
    const res = await push([offline, order]);
    expect(res.body.results[0].status).toBe('CONFLICT');
    expect(res.body.results[1].status).toBe('WAITING');

    const conflictId = res.body.results[0].conflictId as string;
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'MERGED' }).expect(400); // not allowed for duplicates
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'KEEP_SERVER', notes: 'Same person' }).expect(200);

    const again = await push([offline, order]);
    expect(again.body.results.map((r: { status: string }) => r.status)).toEqual(['DUPLICATE', 'APPLIED']);
    const saved = (await get(`/api/orders/${order.entityId}`).expect(200)).body;
    expect(saved.customer.id).toBe(existing.id);
    expect(await prisma.customer.findUnique({ where: { id: offline.entityId } })).toBeNull();
  });

  it('keeps both customers when chosen', async () => {
    await post('/api/customers', { name: 'Ali Raza', mobile: '0301-5550099' }).expect(201);
    const offline = op('customer', 'CREATE', { name: 'Ali Raza Jr', mobile: '0301-5550099' });
    const conflictId = (await push([offline])).body.results[0].conflictId as string;
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'KEEP_BOTH' }).expect(200);
    expect((await prisma.customer.findUnique({ where: { id: offline.entityId } }))?.name).toBe('Ali Raza Jr');
  });

  it('lets only the owner of a conflict or a sync approver resolve it', async () => {
    const c = (await post('/api/customers', { name: 'Kamran Shah', mobile: '0322-1110000' }).expect(201)).body;
    await patch(`/api/customers/${c.id}`, { version: 1, city: 'Lahore' }).expect(200);
    const conflictId = (await push([op('customer', 'UPDATE', { city: 'Karachi' }, { entityId: c.id, baseVersion: 1 })])).body.results[0].conflictId as string;
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'KEEP_CLIENT' }, tailor).expect(403);
    expect(((await get('/api/sync/conflicts', tailor).expect(200)).body as unknown[]).length).toBe(0);
    await post(`/api/sync/conflicts/${conflictId}/resolve`, { resolution: 'KEEP_CLIENT' }).expect(200);
    expect((await get(`/api/customers/${c.id}`).expect(200)).body.city).toBe('Karachi');
  });

  it('downloads a snapshot for offline use, and only changes when since= is given', async () => {
    const full = (await get('/api/sync/snapshot').expect(200)).body;
    expect(full.full).toBe(true);
    expect(full.customers.length).toBeGreaterThan(3);
    expect(full.templates.length).toBeGreaterThan(0);
    expect(full.garments.length).toBeGreaterThan(0);
    expect(full.orders.some((o: { lifecycle: string }) => o.lifecycle === 'OPEN')).toBe(true);
    expect(full.paymentMethods.length).toBeGreaterThan(2);

    const since = full.serverTime as string;
    const delta1 = (await get(`/api/sync/snapshot?since=${encodeURIComponent(since)}`).expect(200)).body;
    expect(delta1.customers.length).toBe(0);
    await post('/api/customers', { name: 'Zubair Ahmed', mobile: '0331-2340000' }).expect(201);
    const delta2 = (await get(`/api/sync/snapshot?since=${encodeURIComponent(since)}`).expect(200)).body;
    expect(delta2.customers.map((c: { name: string }) => c.name)).toEqual(['Zubair Ahmed']);

    // A tailor only gets what their role allows.
    const t = (await get('/api/sync/snapshot', tailor).expect(200)).body;
    expect(t.customers.length).toBe(0);
    expect(t.garments.length).toBe(0);
  });

  it('shows the sync log and summary', async () => {
    const log = (await get('/api/sync/operations?scope=all&pageSize=50').expect(200)).body;
    expect(log.meta.total).toBeGreaterThan(5);
    expect(log.data[0].deviceId).toBe(DEVICE);
    const rejected = (await get('/api/sync/operations?status=REJECTED').expect(200)).body;
    expect(rejected.data.every((r: { status: string }) => r.status === 'REJECTED')).toBe(true);
    const summary = (await get('/api/sync/summary').expect(200)).body;
    expect(summary.scope).toBe('all');
    expect(summary.devices[0].deviceId).toBe(DEVICE);
    expect(summary.last24h.APPLIED).toBeGreaterThan(3);
  });

  it('validates the push body', async () => {
    await post('/api/sync/push', { deviceId: 'x', operations: [] }).expect(400);
    await post('/api/sync/push', { deviceId: DEVICE, operations: [{ id: 'nope' }] }).expect(400);
  });
});
