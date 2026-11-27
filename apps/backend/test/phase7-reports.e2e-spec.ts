import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { REPORTS } from '@az/shared';
import { Agent, bootApp, login } from './helpers';

const binary = (res: NodeJS.ReadableStream & { setEncoding: (e: string) => void; on: (e: string, cb: (c?: Buffer) => void) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c as Buffer));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Phase 7: reports & exports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let stock: Agent;
  let cashier: Agent;
  let customerId: string;
  let orderId: string;
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    const roles = (await get('/api/roles').expect(200)).body as { id: string; code: string }[];
    const role = (code: string) => roles.find((r) => r.code === code)!.id;
    await post('/api/users', { fullName: 'Report Stock', email: 'rstock@test.local', username: 'rstock', password: 'Stock123456', roleIds: [role('INVENTORY_MANAGER')] }).expect(201);
    await post('/api/users', { fullName: 'Report Cashier', email: 'rcash@test.local', username: 'rcashier', password: 'Cashier12345', roleIds: [role('CASHIER')] }).expect(201);
    stock = await login(app, 'rstock', 'Stock123456');
    cashier = await login(app, 'rcashier', 'Cashier12345');
    customerId = (await post('/api/customers', { name: 'Report Customer Qadri', mobile: '0345-7770071' }).expect(201)).body.id;
    const o = await post('/api/orders', {
      customerId, items: [{ garmentName: 'Shalwar Kameez', quantity: 3, stitchingPrice: '2500' }, { garmentName: 'Waistcoat', quantity: 1, stitchingPrice: '4000' }],
      advance: { amount: '5000', method: 'CASH' },
    }).expect(201);
    orderId = o.body.id;
    const cats = (await get('/api/expenses/categories').expect(200)).body as { id: string; name: string }[];
    await post('/api/expenses', { categoryId: cats.find((c) => c.name === 'Electricity')!.id, description: 'K-Electric bill report test', amount: '12345', paymentMethod: 'CASH', idempotencyKey: randomUUID() }).expect(201);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lists all 30 reports and runs every one of them for the owner', async () => {
    const list = (await get('/api/reports').expect(200)).body as { key: string; allowed: boolean }[];
    expect(list).toHaveLength(30);
    expect(list.every((r) => r.allowed)).toBe(true);
    for (const r of REPORTS) {
      const res = await get(`/api/reports/${r.key}?preset=this_year`);
      expect({ key: r.key, status: res.status }).toEqual({ key: r.key, status: 200 });
      expect(res.body.columns.length).toBeGreaterThan(0);
      expect(res.body.title).toBe(r.title);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(res.body.rows.length);
    }
  });

  it('order register: filter by customer, totals, search, sort and paging', async () => {
    const r = (await get(`/api/reports/order-register?preset=today&customer=${customerId}`).expect(200)).body;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ customer: 'Report Customer Qadri', pieces: 4, total: '11500.00', paid: '5000.00', balance: '6500.00', payment: 'Partly paid' });
    expect(r.totals).toMatchObject({ total: '11500.00', balance: '6500.00' });
    const s = (await get('/api/reports/order-register?preset=this_year&search=qadri').expect(200)).body;
    expect(s.meta.total).toBe(1);
    const sorted = (await get('/api/reports/order-register?preset=this_year&sort=total&dir=asc&pageSize=1&page=1').expect(200)).body;
    expect(sorted.rows).toHaveLength(1);
    expect(sorted.meta.pageSize).toBe(1);
    expect(sorted.meta.totalPages).toBe(sorted.meta.total);
    const all = (await get('/api/reports/order-register?preset=this_year&pageSize=500').expect(200)).body.rows as { total: string }[];
    expect(Number(sorted.rows[0].total)).toBe(Math.min(...all.map((x) => Number(x.total))));
  });

  it('customer ledger runs a balance that matches the outstanding report', async () => {
    const l = (await get(`/api/reports/customer-ledger?preset=this_year&customer=${customerId}`).expect(200)).body;
    expect(l.rows[0]).toMatchObject({ type: 'Opening balance', balance: '0.00' });
    expect(l.rows[l.rows.length - 1].balance).toBe('6500.00');
    const out = (await get('/api/reports/customer-outstanding?search=qadri').expect(200)).body;
    expect(out.rows[0]).toMatchObject({ balance: '6500.00', openOrders: 1 });
    const pay = (await get(`/api/reports/customer-payments?preset=today&customer=${customerId}`).expect(200)).body;
    expect(pay.rows[0]).toMatchObject({ amount: '5000.00', method: 'Cash', status: 'Received' });
  });

  it('pending orders and stitching revenue include the new order', async () => {
    const p = (await get(`/api/reports/pending-orders?customer=${customerId}`).expect(200)).body;
    expect(p.rows[0]).toMatchObject({ pending: 4, balance: '6500.00' });
    const s = (await get('/api/reports/stitching-revenue?preset=today').expect(200)).body.rows as { garment: string; pieces: number; stitching: string }[];
    const w = s.find((x) => x.garment === 'Waistcoat')!;
    expect(w.pieces).toBeGreaterThanOrEqual(1);
    expect(Number(w.stitching)).toBeGreaterThanOrEqual(4000);
  });

  it('expense reports and the financial statements agree and balance', async () => {
    const reg = (await get('/api/reports/expense-register?preset=today&search=K-Electric').expect(200)).body;
    expect(reg.rows[0]).toMatchObject({ amount: '12345.00', status: 'Approved', category: 'Electricity' });
    const sum = (await get('/api/reports/expense-summary?preset=today').expect(200)).body.rows as { category: string; amount: string }[];
    expect(sum.find((x) => x.category === 'Electricity')!.amount).toBe('12345.00');
    const tb = (await get('/api/reports/trial-balance').expect(200)).body;
    expect(tb.statement).toBe(true);
    const total = tb.rows[tb.rows.length - 1];
    expect(total._kind).toBe('total');
    expect(total.debit).toBe(total.credit);
    const bs = (await get('/api/reports/balance-sheet').expect(200)).body;
    expect(bs.note).toMatch(/^Balanced/);
    const pl = (await get('/api/reports/profit-loss?preset=today').expect(200)).body.rows as { account: string; amount: string }[];
    expect(pl.find((r) => r.account === 'Net profit')).toBeTruthy();
    const gl = (await get('/api/reports/general-ledger?preset=today').expect(200)).body;
    expect(gl.totals.debit).toBe(gl.totals.credit);
  });

  it('rejects bad filters and unknown reports', async () => {
    await get('/api/reports/order-register?customer=not-an-id').expect(400);
    await get('/api/reports/order-register?paymentStatus=MAYBE').expect(400);
    await get('/api/reports/order-register?preset=custom&from=2026-02-10&to=2026-01-01').expect(400);
    await get('/api/reports/order-register?hack=1').expect(400);
    await get('/api/reports/nothing-here').expect(404);
  });

  it('exports Excel, CSV and PDF with the developer footer, and records the export in the audit log', async () => {
    const csv = await get('/api/reports/order-register?preset=this_year'.replace('?', '/export?format=csv&')).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="order-register-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(csv.text).toContain('Report Customer Qadri');
    expect(csv.text).toContain('Software developed by Brandistan | www.brandistan.pk | 0333-2532924');
    const xlsx = await get('/api/reports/order-register/export?format=xlsx&preset=this_year').buffer(true).parse(binary as never).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await get('/api/reports/profit-loss/export?format=pdf&preset=this_year').buffer(true).parse(binary as never).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('/api/reports/order-register/export?format=doc').expect(400);
    expect(await prisma.auditLog.count({ where: { module: 'reports', action: 'EXPORT', recordId: 'order-register' } })).toBeGreaterThanOrEqual(2);
  });

  it('csv export neutralises spreadsheet formulas typed into records', async () => {
    const c = (await post('/api/customers', { name: '=HYPERLINK("x")', mobile: '0345-7770072' }).expect(201)).body.id;
    await post('/api/orders', { customerId: c, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '1500' }] }).expect(201);
    const csv = await get(`/api/reports/order-register/export?format=csv&preset=today&customer=${c}`).expect(200);
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('only shows reports the role may see (needs reports + the data module)', async () => {
    const list = (await get('/api/reports', stock).expect(200)).body as { key: string; allowed: boolean }[];
    const allowed = list.filter((r) => r.allowed).map((r) => r.key);
    expect(allowed).toEqual(expect.arrayContaining(['fabric-stock', 'stock-movements', 'purchase-register', 'supplier-ledger']));
    expect(allowed).not.toContain('employee-salary');
    expect(allowed).not.toContain('profit-loss');
    await get('/api/reports/fabric-stock', stock).expect(200);
    await get('/api/reports/employee-salary', stock).expect(403);
    await get('/api/reports/profit-loss', stock).expect(403);
    await get('/api/reports', cashier).expect(403);
    await get('/api/reports/fabric-stock/export?format=csv', cashier).expect(403);
  });

  it('saves, lists and deletes filters per user', async () => {
    const s = (await post('/api/reports/saved-filters', { reportKey: 'order-register', name: 'Unpaid this month', params: { preset: 'this_month', paymentStatus: 'UNPAID', evil: 'x' } }).expect(201)).body;
    expect(s.params).toEqual({ preset: 'this_month', paymentStatus: 'UNPAID' });
    expect((await get('/api/reports/saved-filters?reportKey=order-register').expect(200)).body).toHaveLength(1);
    expect((await get('/api/reports/saved-filters', stock).expect(200)).body).toHaveLength(0);
    await post('/api/reports/saved-filters', { reportKey: 'employee-salary', name: 'Salaries', params: {} }, stock).expect(403);
    await owner.agent.delete(`/api/reports/saved-filters/${s.id}`).set('X-CSRF-Token', owner.csrf).expect(200);
    expect((await get('/api/reports/saved-filters?reportKey=order-register').expect(200)).body).toHaveLength(0);
  });

  it('cancelled orders stay in the register but out of the totals', async () => {
    const before = (await get(`/api/reports/order-register?preset=today&customer=${customerId}`).expect(200)).body;
    const o2 = (await post('/api/orders', { customerId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '1000' }] }).expect(201)).body.id;
    await post(`/api/orders/${o2}/cancel`, { reason: 'Customer changed mind' }).expect(201);
    const after = (await get(`/api/reports/order-register?preset=today&customer=${customerId}`).expect(200)).body;
    expect(after.rows).toHaveLength(2);
    expect(after.totals.total).toBe(before.totals.total);
    expect(orderId).toBeTruthy();
  });
});
