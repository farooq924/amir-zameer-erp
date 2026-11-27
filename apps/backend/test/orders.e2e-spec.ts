import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Agent, bootApp, login } from './helpers';

describe('Orders & Garments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const put = (path: string, body: unknown, a: Agent = owner) => a.agent.put(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const patch = (path: string, body: unknown, a: Agent = owner) => a.agent.patch(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);

  let customerId: string;
  let otherId: string; // second customer for side orders, so the main customer's ledger stays predictable
  let skId: string; // Shalwar Kameez garment
  let wcId: string; // Waistcoat garment
  let measurementV1: string;
  const ledgerBalance = async (cid: string) => {
    const l = await get(`/api/customers/${cid}/ledger`).expect(200);
    return l.body.totals.balance as string;
  };

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    const c = await post('/api/customers', { name: 'Order Customer', mobile: '0345-7770001' }).expect(201);
    customerId = c.body.id;
    otherId = (await post('/api/customers', { name: 'Side Customer', mobile: '0345-7770003' }).expect(201)).body.id;
    const garments = await get('/api/garments').expect(200);
    skId = garments.body.find((g: { code: string }) => g.code === 'SHALWAR_KAMEEZ').id;
    wcId = garments.body.find((g: { code: string }) => g.code === 'WAISTCOAT').id;
    const templates = await get('/api/measurement-templates').expect(200);
    const sk = templates.body.find((t: { code: string }) => t.code === 'SHALWAR_KAMEEZ');
    const values = sk.fields.filter((f: { isRequired: boolean }) => f.isRequired).map((f: { key: string }) => ({ fieldKey: f.key, value: '20' }));
    const m = await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values }).expect(201);
    measurementV1 = m.body.id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------- garments

  it('seeds default garments linked to measurement templates and lets the owner set prices', async () => {
    const list = await get('/api/garments').expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(7);
    const sk = list.body.find((g: { id: string }) => g.id === skId);
    expect(sk.measurementTemplate.code).toBe('SHALWAR_KAMEEZ');
    const upd = await patch(`/api/garments/${skId}`, { defaultStitchingPrice: '2500', defaultPieceRate: '600' }).expect(200);
    expect(upd.body).toMatchObject({ defaultStitchingPrice: '2500.00', defaultPieceRate: '600.00' });
    const created = await post('/api/garments', { name: 'Sherwani', category: 'CUSTOM', defaultStitchingPrice: '12000' }).expect(201);
    expect(created.body.code).toBe('SHERWANI');
    await post('/api/garments', { name: 'sherwani', category: 'CUSTOM' }).expect(409);
    await post('/api/garments', { name: 'Bad', category: 'CUSTOM', defaultStitchingPrice: '-1' }).expect(400);
    await patch(`/api/garments/${created.body.id}`, { isActive: false }).expect(200);
    expect((await get('/api/garments').expect(200)).body.some((g: { id: string }) => g.id === created.body.id)).toBe(false);
    expect((await get('/api/garments?all=true').expect(200)).body.some((g: { id: string }) => g.id === created.body.id)).toBe(true);
  });

  // ------------------------------------------------------------- booking

  let orderId: string;
  let orderNumber: string;

  it('books a multi-garment order with totals, measurement snapshot, advance receipt and ledger entries', async () => {
    const res = await post('/api/orders', {
      customerId, orderType: 'STITCHING_WITH_FABRIC', expectedDeliveryDate: '2099-12-31', discount: '500', additionalCharges: '200',
      items: [
        { garmentTypeId: skId, garmentName: 'Shalwar Kameez', quantity: 2, stitchingPrice: '2500', fabricSource: 'SHOP', fabricDescription: 'Wash & wear white', fabricQuantity: '9', fabricRate: '850.50', additionalCharges: '300' },
        { garmentTypeId: wcId, garmentName: 'Waistcoat', quantity: 1, stitchingPrice: '3000', fabricSource: 'CUSTOMER', fabricQuantity: '1.25', fabricRate: '999' },
      ],
      advance: { amount: '5000', method: 'CASH' },
    }).expect(201);
    orderId = res.body.id;
    orderNumber = res.body.orderNumber;
    const year = new Date().getFullYear();
    expect(orderNumber).toMatch(new RegExp(`^AZ-(${year}|${year + 1})-\\d{5}$`));
    // SK: 2 x 2500 = 5000, fabric 9 x 850.50 = 7654.50, extra 300 -> 12954.50 ; WC: 3000, customer fabric not charged
    expect(res.body).toMatchObject({
      stitchingTotal: '8000.00', fabricTotal: '7654.50', additionalCharges: '200.00', subtotal: '16154.50', discount: '500.00',
      totalAmount: '15654.50', paidAmount: '5000.00', balanceAmount: '10654.50', paymentStatus: 'PARTIAL', lifecycle: 'OPEN',
    });
    expect(res.body.stage.code).toBe('NEW');
    expect(res.body.items[0]).toMatchObject({ lineNo: 1, fabricAmount: '7654.50', lineTotal: '12954.50', fabricPerPiece: '4.500' });
    expect(res.body.items[1]).toMatchObject({ fabricRate: '0.00', fabricAmount: '0.00', lineTotal: '3000.00' });
    expect(res.body.items[0].measurement.sourceMeasurementId).toBe(measurementV1);
    expect(res.body.items[0].measurement.values.find((v: { key: string }) => v.key === 'chest').value).toBe('20.00');
    expect(res.body.items[1].measurement).toBeNull(); // no waistcoat measurement yet
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0]).toMatchObject({ amount: '5000.00', type: 'ADVANCE', method: 'CASH' });
    expect(res.body.payments[0].receiptNo).toMatch(/^RCP-\d{4}-\d{5}$/);
    expect(res.body.statusHistory).toHaveLength(1);
    expect(await ledgerBalance(customerId)).toBe('10654.50');
  });

  it('is idempotent with a client id and validates input', async () => {
    const id = randomUUID();
    const body = { id, customerId: otherId, items: [{ garmentTypeId: skId, garmentName: 'Shalwar Kameez', quantity: 1, stitchingPrice: '2500' }] };
    const a = await post('/api/orders', body).expect(201);
    const b = await post('/api/orders', body).expect(201);
    expect(b.body.orderNumber).toBe(a.body.orderNumber);
    expect(await prisma.order.count({ where: { id } })).toBe(1);
    await post('/api/orders', { customerId: otherId, items: [] }).expect(400);
    await post('/api/orders', { customerId: otherId, items: [{ garmentName: 'X1', quantity: 0, stitchingPrice: '1' }] }).expect(400);
    await post('/api/orders', { customerId: otherId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }], discount: '500' }).expect(400);
    await post('/api/orders', { customerId: otherId, orderDate: '2026-11-20', expectedDeliveryDate: '2026-11-10', items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }] }).expect(400);
    await post('/api/orders', { customerId: otherId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }], advance: { amount: '200', method: 'CASH' } }).expect(400);
    // default delivery date = order date + defaultDeliveryDays (7)
    const d = await post('/api/orders', { customerId: otherId, orderDate: '2026-11-20', items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }] }).expect(201);
    expect(d.body.expectedDeliveryDate).toBe('2026-11-27');
  });

  it('refuses new orders for blocked customers', async () => {
    const c = await post('/api/customers', { name: 'Blocked Guy', mobile: '0345-7770002' }).expect(201);
    await patch(`/api/customers/${c.body.id}/status`, { status: 'BLOCKED' }).expect(200);
    const res = await post('/api/orders', { customerId: c.body.id, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }] }).expect(400);
    expect(res.body.message).toMatch(/blocked/i);
  });

  it('keeps the snapshot frozen when the customer is measured again, until refreshed on purpose', async () => {
    const templates = await get('/api/measurement-templates').expect(200);
    const sk = templates.body.find((t: { code: string }) => t.code === 'SHALWAR_KAMEEZ');
    const values = sk.fields.filter((f: { isRequired: boolean }) => f.isRequired).map((f: { key: string }) => ({ fieldKey: f.key, value: '22' }));
    const v2 = await post(`/api/customers/${customerId}/measurements`, { templateId: sk.id, unit: 'INCH', values }).expect(201);
    const before = await get(`/api/orders/${orderId}`).expect(200);
    expect(before.body.items[0].measurement.sourceMeasurementId).toBe(measurementV1);
    const snapId = before.body.items[0].measurement.id;
    await expect(prisma.$executeRawUnsafe(`UPDATE garment_measurements SET notes = 'x' WHERE id = '${snapId}'`)).rejects.toThrow(/append-only/);
    const after = await post(`/api/orders/${orderId}/items/${before.body.items[0].id}/measurement`, {}).expect(201);
    expect(after.body.items[0].measurement.sourceMeasurementId).toBe(v2.body.id);
    const noMeas = await post(`/api/orders/${orderId}/items/${before.body.items[1].id}/measurement`, {}).expect(400);
    expect(noMeas.body.message).toMatch(/no saved measurement/);
  });

  // ------------------------------------------------------------- revise

  it('revises an open order with optimistic locking and posts the difference to the ledger', async () => {
    const o = (await get(`/api/orders/${orderId}`).expect(200)).body;
    const items = o.items.map((i: Record<string, string | number>) => ({
      id: i.id, garmentTypeId: i.garmentTypeId, garmentName: i.garmentName, quantity: i.quantity, stitchingPrice: i.stitchingPrice,
      fabricSource: i.fabricSource, fabricQuantity: i.fabricQuantity, fabricRate: i.fabricRate, additionalCharges: i.additionalCharges,
    }));
    items[1].stitchingPrice = '3500'; // +500
    items.push({ garmentName: 'Extra Kurta', quantity: 1, stitchingPrice: '1000' }); // +1000
    const res = await put(`/api/orders/${orderId}`, { version: o.version, items, revisionNote: 'Customer added a kurta' }).expect(200);
    expect(res.body).toMatchObject({ totalAmount: '17154.50', balanceAmount: '12154.50', revisionNo: 1 });
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[2].lineNo).toBe(3);
    expect(await ledgerBalance(customerId)).toBe('12154.50');
    // stale version
    await put(`/api/orders/${orderId}`, { version: o.version, items }).expect(409);
    // remove the kurta again
    const latest = res.body;
    const back = latest.items.slice(0, 2).map((i: Record<string, string | number>) => ({ id: i.id, garmentTypeId: i.garmentTypeId, garmentName: i.garmentName, quantity: i.quantity, stitchingPrice: i.stitchingPrice, fabricSource: i.fabricSource, fabricQuantity: i.fabricQuantity, fabricRate: i.fabricRate, additionalCharges: i.additionalCharges }));
    const res2 = await put(`/api/orders/${orderId}`, { version: latest.version, items: back }).expect(200);
    expect(res2.body.items).toHaveLength(2);
    expect(res2.body.totalAmount).toBe('16154.50');
    expect(await ledgerBalance(customerId)).toBe('11154.50');
  });

  // ------------------------------------------------------------- workflow

  it('moves the order through configurable stages with history', async () => {
    const stages = (await get('/api/orders/workflow-stages').expect(200)).body as { id: string; code: string }[];
    const cutting = stages.find((s) => s.code === 'CUTTING')!;
    const stitching = stages.find((s) => s.code === 'STITCHING')!;
    const delivered = stages.find((s) => s.code === 'DELIVERED')!;
    const r1 = await post(`/api/orders/${orderId}/stage`, { stageId: cutting.id, notes: 'Cutting master Aslam' }).expect(201);
    expect(r1.body.stage.code).toBe('CUTTING');
    expect(r1.body.items.every((i: { stage: { code: string } }) => i.stage.code === 'CUTTING')).toBe(true);
    // one garment moves ahead: order stays at the slowest garment
    const r2 = await post(`/api/orders/${orderId}/stage`, { stageId: stitching.id, itemIds: [r1.body.items[0].id] }).expect(201);
    expect(r2.body.items[0].stage.code).toBe('STITCHING');
    expect(r2.body.stage.code).toBe('CUTTING');
    await post(`/api/orders/${orderId}/stage`, { stageId: delivered.id }).expect(400);
    // custom stage
    const emb = await post('/api/orders/workflow-stages', { name: 'Embroidery', color: 'violet' }).expect(201);
    const r3 = await post(`/api/orders/${orderId}/stage`, { stageId: emb.body.id }).expect(201);
    expect(r3.body.stage.name).toBe('Embroidery');
    await patch(`/api/orders/workflow-stages/${emb.body.id}`, { isActive: false }).expect(400); // in use
    await post(`/api/orders/${orderId}/stage`, { stageId: stitching.id }).expect(201);
    await patch(`/api/orders/workflow-stages/${emb.body.id}`, { isActive: false }).expect(200);
    const history = (await get(`/api/orders/${orderId}`).expect(200)).body.statusHistory;
    expect(history.length).toBeGreaterThanOrEqual(5);
    await expect(prisma.$executeRawUnsafe(`UPDATE order_status_history SET notes = 'x' WHERE "orderId" = '${orderId}'`)).rejects.toThrow(/append-only/);
    const summary = (await get('/api/orders/summary').expect(200)).body;
    expect(summary.stages.find((s: { code: string }) => s.code === 'STITCHING').count).toBeGreaterThanOrEqual(1);
  });

  it('assigns garments to an active employee', async () => {
    const e = await prisma.employee.create({ data: { code: 'AZE-T001', name: 'Ustad Rafiq', joiningDate: new Date('2026-01-01'), employeeType: 'TAILOR' } });
    const opts = (await get('/api/orders/form-options').expect(200)).body;
    expect(opts.employees.some((x: { id: string }) => x.id === e.id)).toBe(true);
    const r = await post(`/api/orders/${orderId}/assign`, { employeeId: e.id }).expect(201);
    expect(r.body.assignedEmployee.name).toBe('Ustad Rafiq');
    expect(r.body.items.every((i: { assignedEmployee: { id: string } }) => i.assignedEmployee.id === e.id)).toBe(true);
    await post(`/api/orders/${orderId}/assign`, { employeeId: randomUUID() }).expect(400);
  });

  // ------------------------------------------------------------- payments

  it('records payments once per key, never above the balance', async () => {
    const key = randomUUID();
    const p = await post(`/api/orders/${orderId}/payments`, { amount: '1000', method: 'MOBILE_WALLET', reference: 'JC-123', idempotencyKey: key }).expect(201);
    expect(p.body.paidAmount).toBe('6000.00');
    await post(`/api/orders/${orderId}/payments`, { amount: '1000', method: 'MOBILE_WALLET', idempotencyKey: key }).expect(201);
    expect((await get(`/api/orders/${orderId}`).expect(200)).body.payments).toHaveLength(2);
    const over = await post(`/api/orders/${orderId}/payments`, { amount: '999999', method: 'CASH', idempotencyKey: randomUUID() }).expect(400);
    expect(over.body.message).toMatch(/more than the balance/);
    // concurrent payments for the remaining balance: only one may succeed
    const balance = p.body.balanceAmount as string;
    const results = await Promise.all([0, 1, 2].map(() => post(`/api/orders/${orderId}/payments`, { amount: balance, method: 'CASH', idempotencyKey: randomUUID() })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const after = (await get(`/api/orders/${orderId}`).expect(200)).body;
    expect(after).toMatchObject({ paymentStatus: 'PAID', balanceAmount: '0.00' });
    expect(after.payments.at(-1).type).toBe('FULL');
    expect(await ledgerBalance(customerId)).toBe('0.00');
  });

  // ------------------------------------------------------------- adjustments

  it('applies authorised adjustments and keeps them append-only', async () => {
    const r = await post(`/api/orders/${orderId}/adjustments`, { type: 'ALTERATION_CHARGE', amount: '400', reason: 'Sleeve shortened' }).expect(201);
    expect(r.body).toMatchObject({ adjustmentsTotal: '400.00', effectiveTotal: '16554.50', balanceAmount: '400.00', paymentStatus: 'PARTIAL' });
    const r2 = await post(`/api/orders/${orderId}/adjustments`, { type: 'DISCOUNT', amount: '400', reason: 'Goodwill' }).expect(201);
    expect(r2.body).toMatchObject({ adjustmentsTotal: '0.00', balanceAmount: '0.00', paymentStatus: 'PAID' });
    await post(`/api/orders/${orderId}/adjustments`, { type: 'WRITE_OFF', amount: '99999999', reason: 'Too much' }).expect(400);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM order_adjustments WHERE "orderId" = '${orderId}'`)).rejects.toThrow(/append-only/);
    expect(await ledgerBalance(customerId)).toBe('0.00');
  });

  // ------------------------------------------------------------- delivery

  it('supports partial delivery and completes the order on the last delivery', async () => {
    const o = (await get(`/api/orders/${orderId}`).expect(200)).body;
    const [sk, wc] = o.items;
    await post(`/api/orders/${orderId}/deliveries`, { items: [{ orderItemId: sk.id, quantity: 3 }] }).expect(400);
    const d1 = await post(`/api/orders/${orderId}/deliveries`, { items: [{ orderItemId: sk.id, quantity: 1 }], receivedBy: 'Brother' }).expect(201);
    expect(d1.body.lifecycle).toBe('PARTIALLY_DELIVERED');
    expect(d1.body.deliveredPieces).toBe(1);
    // cannot cancel or remove a delivered garment
    await post(`/api/orders/${orderId}/cancel`, { reason: 'Changed mind' }).expect(400);
    const d2 = await post(`/api/orders/${orderId}/deliveries`, { items: [{ orderItemId: sk.id, quantity: 1 }, { orderItemId: wc.id, quantity: 1 }] }).expect(201);
    expect(d2.body).toMatchObject({ lifecycle: 'DELIVERED', deliveredPieces: 3 });
    expect(d2.body.stage.code).toBe('DELIVERED');
    expect(d2.body.actualDeliveryDate).toBeTruthy();
    expect(d2.body.deliveries).toHaveLength(2);
    await post(`/api/orders/${orderId}/deliveries`, { items: [{ orderItemId: wc.id, quantity: 1 }] }).expect(400);
    const revise = await put(`/api/orders/${orderId}`, { version: d2.body.version, items: [{ id: sk.id, garmentName: 'SK', quantity: 2, stitchingPrice: '1' }] }).expect(400);
    expect(revise.body.message).toMatch(/adjustment/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM orders WHERE id = '${orderId}'`)).rejects.toThrow(/cannot be deleted/);
  });

  // ------------------------------------------------------------- cancel / duplicate

  it('cancels an open order, reverses the ledger and keeps paid money as customer credit', async () => {
    const before = await ledgerBalance(customerId);
    const o = await post('/api/orders', {
      customerId, items: [{ garmentTypeId: skId, garmentName: 'Shalwar Kameez', quantity: 1, stitchingPrice: '2500' }], advance: { amount: '1000', method: 'CASH' },
    }).expect(201);
    expect(await ledgerBalance(customerId)).toBe((Number(before) + 1500).toFixed(2));
    const c = await post(`/api/orders/${o.body.id}/cancel`, { reason: 'Customer travelling' }).expect(201);
    expect(c.body).toMatchObject({ lifecycle: 'CANCELLED', cancelReason: 'Customer travelling', effectiveTotal: '0.00', balanceAmount: '-1000.00' });
    expect(c.body.stage.code).toBe('CANCELLED');
    expect(await ledgerBalance(customerId)).toBe((Number(before) - 1000).toFixed(2));
    await post(`/api/orders/${o.body.id}/payments`, { amount: '10', method: 'CASH', idempotencyKey: randomUUID() }).expect(400);
    await post(`/api/orders/${o.body.id}/cancel`, { reason: 'again' }).expect(400);
  });

  it('duplicates an order as a new order linked to the original', async () => {
    const src = (await get(`/api/orders/${orderId}`).expect(200)).body;
    const res = await post('/api/orders', {
      customerId, duplicatedFromId: orderId, orderType: 'ALTERATION',
      items: [{ garmentTypeId: skId, garmentName: 'Shalwar Kameez', quantity: 1, stitchingPrice: '300', notes: 'Loosen chest' }],
    }).expect(201);
    expect(res.body.duplicatedFrom).toMatchObject({ id: orderId, orderNumber: src.orderNumber });
    expect(res.body.orderNumber).not.toBe(src.orderNumber);
    expect(res.body.orderType).toBe('ALTERATION');
  });

  // ------------------------------------------------------------- lists & numbers

  it('searches and filters orders', async () => {
    const byNumber = await get(`/api/orders?search=${orderNumber}`).expect(200);
    expect(byNumber.body.data[0].id).toBe(orderId);
    const byMobile = await get('/api/orders?search=0345-7770001').expect(200);
    expect(byMobile.body.meta.total).toBeGreaterThanOrEqual(3); // main + cancelled + duplicate
    const cancelled = await get('/api/orders?lifecycle=CANCELLED').expect(200);
    expect(cancelled.body.data.every((o: { lifecycle: string }) => o.lifecycle === 'CANCELLED')).toBe(true);
    const active = await get('/api/orders?lifecycle=ACTIVE').expect(200);
    expect(active.body.data.every((o: { lifecycle: string }) => ['OPEN', 'PARTIALLY_DELIVERED'].includes(o.lifecycle))).toBe(true);
    const overdue = await get('/api/orders?due=overdue').expect(200);
    expect(overdue.body.data.every((o: { isOverdue: boolean }) => o.isOverdue)).toBe(true);
    const profile = await get(`/api/customers/${customerId}`).expect(200);
    expect(profile.body.stats.totalOrders).toBe(2); // cancelled orders are not counted
  });

  it('gives unique order numbers under concurrent booking', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => post('/api/orders', { customerId: otherId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }] })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.orderNumber)).size).toBe(6);
  });

  // ------------------------------------------------------------- RBAC

  it('enforces permissions per role', async () => {
    const roles = await get('/api/roles').expect(200);
    const roleId = (code: string) => roles.body.find((r: { code: string }) => r.code === code).id;
    await post('/api/users', { fullName: 'Front Desk', email: 'orderdesk@test.local', username: 'orderdesk', password: 'DeskPass1234', roleIds: [roleId('RECEPTIONIST')] }).expect(201);
    await post('/api/users', { fullName: 'Tailor One', email: 'ordertailor@test.local', username: 'ordertailor', password: 'TailorPass123', roleIds: [roleId('TAILOR')] }).expect(201);
    const desk = await login(app, 'orderdesk', 'DeskPass1234');
    const tailor = await login(app, 'ordertailor', 'TailorPass123');
    // receptionist: can book + take payment, but not cancel, adjust or change garments
    const o = await post('/api/orders', { customerId: otherId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }] }, desk).expect(201);
    await get('/api/orders/form-options', desk).expect(200);
    await post(`/api/orders/${o.body.id}/payments`, { amount: '50', method: 'CASH', idempotencyKey: randomUUID() }, desk).expect(201);
    await post(`/api/orders/${o.body.id}/cancel`, { reason: 'no' }, desk).expect(403);
    await post(`/api/orders/${o.body.id}/adjustments`, { type: 'DISCOUNT', amount: '10', reason: 'xx x' }, desk).expect(403);
    await patch(`/api/garments/${skId}`, { defaultStitchingPrice: '1' }, desk).expect(403);
    await post('/api/orders/workflow-stages', { name: 'Hack' }, desk).expect(403);
    // tailor: view only
    await get(`/api/orders/${o.body.id}`, tailor).expect(200);
    await post('/api/orders', { customerId: otherId, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '100' }] }, tailor).expect(403);
  });
});
