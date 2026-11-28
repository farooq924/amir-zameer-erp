import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Agent, bootApp, login } from './helpers';

describe('Fabric inventory, suppliers & purchases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const put = (path: string, body: unknown, a: Agent = owner) => a.agent.put(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const patch = (path: string, body: unknown, a: Agent = owner) => a.agent.patch(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);
  const fabric = async (id: string) => (await get(`/api/inventory/fabrics/${id}`).expect(200)).body;

  let categoryId: string;
  let supplierId: string;
  let fabricA: string; // wash & wear, opening 10 m @ 800
  let fabricB: string; // no opening stock
  let customerId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    customerId = (await post('/api/customers', { name: 'Fabric Customer', mobile: '0345-8880001' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('seeds fabric categories and manages them', async () => {
    const list = await get('/api/inventory/categories').expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toContain('Wash & Wear');
    categoryId = list.body.find((c: { name: string }) => c.name === 'Wash & Wear').id;
    const c = await post('/api/inventory/categories', { name: 'Jamawar' }).expect(201);
    await post('/api/inventory/categories', { name: 'jamawar' }).expect(409);
    await patch(`/api/inventory/categories/${c.body.id}`, { isActive: false }).expect(200);
  });

  it('creates suppliers with codes and an opening balance in the ledger', async () => {
    const s = await post('/api/suppliers', { name: 'Gul Textiles', contactNumber: '0300-1112223', city: 'Faisalabad', openingBalance: '5000' }).expect(201);
    supplierId = s.body.id;
    expect(s.body.code).toMatch(/^AZS-\d{4}$/);
    expect(s.body.balance).toBe('5000.00');
    expect(s.body.contactNumber).toBe('923001112223');
    await post('/api/suppliers', { name: 'gul textiles' }).expect(409);
    const ledger = await get(`/api/suppliers/${supplierId}/ledger`).expect(200);
    expect(ledger.body.entries).toHaveLength(1);
    expect(ledger.body.totals.balance).toBe('5000.00');
  });

  it('creates fabrics with opening stock through the stock ledger', async () => {
    const a = await post('/api/inventory/fabrics', {
      name: 'Premium Wash & Wear', color: 'White', categoryId, supplierId, purchasePrice: '800', salePrice: '1200', minimumStock: '5', openingStock: '10',
    }).expect(201);
    fabricA = a.body.id;
    expect(a.body.code).toMatch(/^AZF-\d{4}$/);
    expect(a.body).toMatchObject({ currentStock: '10.000', availableStock: '10.000', averageCost: '800.00', stockValue: '8000.00', level: 'OK' });
    await post('/api/inventory/fabrics', { name: 'premium wash & wear', color: 'white' }).expect(409);
    fabricB = (await post('/api/inventory/fabrics', { name: 'Boski Silk', salePrice: '3000', unit: 'METER' }).expect(201)).body.id;
    expect((await fabric(fabricB)).level).toBe('OUT');
    const moves = await get(`/api/inventory/movements?fabricId=${fabricA}`).expect(200);
    expect(moves.body.data).toHaveLength(1);
    expect(moves.body.data[0]).toMatchObject({ type: 'OPENING', direction: 'IN', quantity: '10.000', balanceAfter: '10.000' });
  });

  it('a purchase adds stock at landed cost, updates average cost and the supplier balance', async () => {
    const id = randomUUID();
    const body = {
      id, supplierId, supplierInvoiceNo: 'GT-101',
      items: [{ fabricId: fabricA, quantity: '20', rate: '900' }, { fabricId: fabricB, quantity: '10', rate: '2000' }],
      discount: '1000', otherCharges: '1000', payment: { amount: '10000', method: 'CASH' },
    };
    const p = await post('/api/purchases', body).expect(201);
    expect(p.body.purchaseNo).toMatch(/^PUR-\d{4}-\d{5}$/);
    expect(p.body).toMatchObject({ subtotal: '38000.00', totalAmount: '38000.00', paidAmount: '10000.00', balanceAmount: '28000.00' });
    // same request again (double click): no second purchase
    await post('/api/purchases', body).expect(201);
    expect(await prisma.purchase.count({ where: { supplierInvoiceNo: 'GT-101' } })).toBe(1);
    // same bill number again with another id: refused
    await post('/api/purchases', { ...body, id: randomUUID() }).expect(409);
    const a = await fabric(fabricA);
    expect(a).toMatchObject({ currentStock: '30.000', averageCost: '866.67', purchasePrice: '900.00' });
    expect(a.lastPurchase.purchaseNo).toBe(p.body.purchaseNo);
    const s = await get(`/api/suppliers/${supplierId}`).expect(200);
    expect(s.body.balance).toBe('33000.00'); // 5000 opening + 38000 - 10000 paid
  });

  it('adjustments need a reason, are idempotent and never take reserved stock', async () => {
    const key = randomUUID();
    await post(`/api/inventory/fabrics/${fabricA}/adjust`, { direction: 'OUT', quantity: '1.5', reason: 'Cutting waste', idempotencyKey: key }).expect(201);
    await post(`/api/inventory/fabrics/${fabricA}/adjust`, { direction: 'OUT', quantity: '1.5', reason: 'Cutting waste', idempotencyKey: key }).expect(201);
    expect((await fabric(fabricA)).currentStock).toBe('28.500');
    await post(`/api/inventory/fabrics/${fabricA}/adjust`, { direction: 'OUT', quantity: '100', reason: 'Too much', idempotencyKey: randomUUID() }).expect(400);
    await post(`/api/inventory/fabrics/${fabricA}/adjust`, { direction: 'OUT', quantity: '1', reason: '', idempotencyKey: randomUUID() }).expect(400);
    // the ledger is append-only in the database
    const m = await prisma.inventoryMovement.findFirstOrThrow({ where: { fabricId: fabricA } });
    await expect(prisma.inventoryMovement.update({ where: { id: m.id }, data: { reason: 'x' } })).rejects.toThrow();
  });

  it('shop fabric on an order is reserved, issued on delivery and released on cancel', async () => {
    const order = await post('/api/orders', {
      customerId, orderType: 'STITCHING_WITH_FABRIC',
      items: [{ garmentName: 'Shalwar Kameez', quantity: 2, stitchingPrice: '2500', fabricSource: 'SHOP', fabricId: fabricA, fabricQuantity: '9' }],
    }).expect(201);
    const item = order.body.items[0];
    expect(item).toMatchObject({ fabricId: fabricA, fabricRate: '1200.00', fabricAmount: '10800.00', stock: { status: 'ACTIVE', reserved: '9.000', issued: '0.000' } });
    expect(item.fabricDescription).toContain('Premium Wash & Wear');
    let a = await fabric(fabricA);
    expect(a).toMatchObject({ currentStock: '28.500', reservedStock: '9.000', availableStock: '19.500' });
    expect(a.reservations).toHaveLength(1);

    // not enough free stock for a second big order
    await post('/api/orders', {
      customerId, orderType: 'STITCHING_WITH_FABRIC',
      items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '1000', fabricSource: 'SHOP', fabricId: fabricA, fabricQuantity: '25' }],
    }).expect(400);
    // reserved stock cannot be adjusted away
    await post(`/api/inventory/fabrics/${fabricA}/adjust`, { direction: 'OUT', quantity: '20', reason: 'Test', idempotencyKey: randomUUID() }).expect(400);

    // revise: more fabric -> reservation follows
    const rev = await put(`/api/orders/${order.body.id}`, {
      version: order.body.version, items: [{ id: item.id, garmentName: 'Shalwar Kameez', quantity: 2, stitchingPrice: '2500', fabricSource: 'SHOP', fabricId: fabricA, fabricQuantity: '10', fabricRate: '1200' }],
    }).expect(200);
    expect((await fabric(fabricA)).reservedStock).toBe('10.000');

    // deliver 1 of 2 pieces: half the fabric is issued
    await post(`/api/orders/${order.body.id}/deliveries`, { items: [{ orderItemId: item.id, quantity: 1 }] }).expect(201);
    a = await fabric(fabricA);
    expect(a).toMatchObject({ currentStock: '23.500', reservedStock: '5.000' });
    // fabric cannot drop below what was already issued
    const o2 = (await get(`/api/orders/${order.body.id}`).expect(200)).body;
    await put(`/api/orders/${order.body.id}`, {
      version: o2.version, items: [{ id: item.id, garmentName: 'Shalwar Kameez', quantity: 2, stitchingPrice: '2500', fabricSource: 'SHOP', fabricId: fabricA, fabricQuantity: '4', fabricRate: '1200' }],
    }).expect(400);
    // rest delivered: all issued, reservation closed
    await post(`/api/orders/${order.body.id}/deliveries`, { items: [{ orderItemId: item.id, quantity: 1 }] }).expect(201);
    a = await fabric(fabricA);
    expect(a).toMatchObject({ currentStock: '18.500', reservedStock: '0.000', reservations: [] });
    const used = await get(`/api/inventory/movements?fabricId=${fabricA}&type=ORDER_CONSUMPTION`).expect(200);
    expect(used.body.data.map((m: { quantity: string }) => m.quantity).sort()).toEqual(['5.000', '5.000']);
    expect(rev.body.items[0].stock.reserved).toBe('10.000');

    // cancel releases the reservation without touching stock
    const c = await post('/api/orders', {
      customerId, orderType: 'FABRIC_SALE',
      items: [{ garmentName: 'Fabric', quantity: 1, stitchingPrice: '0', fabricId: fabricB, fabricQuantity: '3.25' }],
    }).expect(201);
    expect((await fabric(fabricB)).reservedStock).toBe('3.250');
    await post(`/api/orders/${c.body.id}/cancel`, { reason: 'Customer changed mind' }).expect(201);
    expect(await fabric(fabricB)).toMatchObject({ reservedStock: '0.000', currentStock: '10.000' });

    // customer's own fabric never touches stock
    await post('/api/orders', {
      customerId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '1000', fabricSource: 'CUSTOMER', fabricId: fabricB, fabricQuantity: '2.5' }],
    }).expect(201);
    expect((await fabric(fabricB)).reservedStock).toBe('0.000');
  });

  it('purchase returns reduce stock and the supplier balance, and cannot exceed what was bought', async () => {
    const list = await get(`/api/purchases?supplierId=${supplierId}`).expect(200);
    const pid = list.body.data[0].id;
    await post(`/api/purchases/${pid}/returns`, { items: [{ fabricId: fabricB, quantity: '11' }], reason: 'Wrong colour' }).expect(400);
    const rid = randomUUID();
    const r = await post(`/api/purchases/${pid}/returns`, { id: rid, items: [{ fabricId: fabricB, quantity: '2' }], reason: 'Wrong colour' }).expect(201);
    await post(`/api/purchases/${pid}/returns`, { id: rid, items: [{ fabricId: fabricB, quantity: '2' }], reason: 'Wrong colour' }).expect(201);
    expect(r.body.returns).toHaveLength(1);
    expect(r.body.returns[0].totalAmount).toBe('4000.00');
    expect(r.body.balanceAmount).toBe('24000.00');
    expect(r.body.items.find((i: { fabric: { id: string } }) => i.fabric.id === fabricB).returnableQuantity).toBe('8.000');
    expect((await fabric(fabricB)).currentStock).toBe('8.000');
    expect((await get(`/api/suppliers/${supplierId}`).expect(200)).body.balance).toBe('29000.00');
  });

  it('supplier payments go to the oldest unpaid purchases first and are idempotent', async () => {
    const key = randomUUID();
    await post(`/api/suppliers/${supplierId}/payments`, { amount: '20000', method: 'BANK_TRANSFER', reference: 'TRX-1', idempotencyKey: key }).expect(201);
    const s = await post(`/api/suppliers/${supplierId}/payments`, { amount: '20000', method: 'BANK_TRANSFER', reference: 'TRX-1', idempotencyKey: key }).expect(201);
    expect(s.body.balance).toBe('9000.00');
    expect(s.body.payments).toHaveLength(2);
    expect(s.body.purchases[0].balanceAmount).toBe('4000.00');
    const ledger = await get(`/api/suppliers/${supplierId}/ledger`).expect(200);
    expect(ledger.body.totals.balance).toBe('9000.00');
    expect(ledger.body.entries.map((e: { entryType: string }) => e.entryType)).toEqual(['OPENING', 'PURCHASE', 'SUPPLIER_PAYMENT', 'PURCHASE_RETURN', 'SUPPLIER_PAYMENT']);
  });

  it('lists fabrics by stock level and shows inventory totals', async () => {
    await patch(`/api/inventory/fabrics/${fabricB}`, { minimumStock: '10' }).expect(200);
    const low = await get('/api/inventory/fabrics?stock=low').expect(200);
    expect(low.body.data.map((f: { id: string }) => f.id)).toContain(fabricB);
    const sum = await get('/api/inventory/summary').expect(200);
    expect(sum.body.activeFabrics).toBeGreaterThanOrEqual(2);
    expect(sum.body.lowStock).toBeGreaterThanOrEqual(1);
    expect(Number(sum.body.stockValue)).toBeGreaterThan(0);
    await patch(`/api/inventory/fabrics/${fabricA}`, { unit: 'YARD' }).expect(400);
    const picker = await get('/api/orders/fabric-options?search=boski').expect(200);
    expect(picker.body[0]).toMatchObject({ id: fabricB, availableStock: '8.000' });
  });

  it('deletes suppliers, fabrics and garments only when they have no history', async () => {
    const del = (path: string, a: Agent = owner) => a.agent.delete(path).set('X-CSRF-Token', a.csrf);
    // Used records are protected.
    await del(`/api/suppliers/${supplierId}`).expect(400);
    await del(`/api/inventory/fabrics/${fabricA}`).expect(400);
    // Unused records go away and leave the lists.
    const s = await post('/api/suppliers', { name: 'Temp Supplier' }).expect(201);
    const f = await post('/api/inventory/fabrics', { name: 'Temp Fabric', color: 'Grey', supplierId: s.body.id }).expect(201);
    await del(`/api/inventory/fabrics/${f.body.id}`).expect(200);
    await del(`/api/suppliers/${s.body.id}`).expect(200);
    const fabrics = await get('/api/inventory/fabrics?pageSize=200').expect(200);
    expect(fabrics.body.data.map((x: { id: string }) => x.id)).not.toContain(f.body.id);
    const suppliers = await get('/api/suppliers?pageSize=200').expect(200);
    expect(suppliers.body.data.map((x: { id: string }) => x.id)).not.toContain(s.body.id);
    const g = await post('/api/garments', { name: 'Temp Garment', category: 'CUSTOM' }).expect(201);
    await del(`/api/garments/${g.body.id}`).expect(200);
    await del(`/api/garments/${g.body.id}`).expect(404);
  });

  it('enforces inventory permissions', async () => {
    const roles = await get('/api/roles').expect(200);
    const tailorRole = roles.body.find((r: { code: string }) => r.code === 'TAILOR');
    await post('/api/users', { fullName: 'Shop Tailor', email: 'invtailor@test.local', username: 'inv_tailor', password: 'TailorPass123', roleIds: [tailorRole.id] }).expect(201);
    const tailor = await login(app, 'inv_tailor', 'TailorPass123');
    await get('/api/purchases', tailor).expect(403);
    await post(`/api/inventory/fabrics/${fabricA}/adjust`, { direction: 'IN', quantity: '1', reason: 'Test', idempotencyKey: randomUUID() }, tailor).expect(403);
  });
});
