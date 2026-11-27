import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SequenceService } from '../src/common/services/sequence.service';
import { Agent, bootApp, login } from './helpers';

describe('Settings, audit log, dashboard & database rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('settings: defaults, validation and audited updates', async () => {
    const all = (await owner.agent.get('/api/settings').expect(200)).body;
    expect(all.business.businessName).toBe('AMIR ZAMEER');
    expect(all.regional).toMatchObject({ currency: 'PKR', timezone: 'Asia/Karachi' });
    await owner.agent.put('/api/settings/business').set('X-CSRF-Token', owner.csrf).send({ businessName: 'A' }).expect(400);
    await owner.agent.put('/api/settings/regional').set('X-CSRF-Token', owner.csrf).send({ currency: 'USD' }).expect(400);
    const saved = await owner.agent.put('/api/settings/business').set('X-CSRF-Token', owner.csrf)
      .send({ businessName: 'AMIR ZAMEER', phone: '0300-1234567', city: 'Lahore' }).expect(200);
    expect(saved.body).toMatchObject({ phone: '0300-1234567', city: 'Lahore' });
    const reread = (await owner.agent.get('/api/settings').expect(200)).body;
    expect(reread.business.city).toBe('Lahore');
    expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_CHANGED', recordId: 'business' } })).toBeGreaterThan(0);
  });

  it('audit log API lists records with filters and has no write endpoints', async () => {
    const res = await owner.agent.get('/api/audit-logs?preset=today&module=settings').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r: { module: string }) => r.module === 'settings')).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1 });
    await owner.agent.delete('/api/audit-logs').set('X-CSRF-Token', owner.csrf).expect(404);
  });

  it('audit logs are append-only at database level', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'TAMPERED' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it('audit logs never contain password hashes', async () => {
    const rows = await prisma.auditLog.findMany({ where: { module: 'users' } });
    expect(JSON.stringify(rows)).not.toMatch(/\$argon2/);
  });

  it('dashboard summary returns real zero-state figures and validates ranges', async () => {
    const res = await owner.agent.get('/api/dashboard/summary?preset=this_month').expect(200);
    expect(res.body.cards).toMatchObject({ totalSales: '0.00', totalOrders: 0, netProfit: '0.00', fabricStockValue: '0.00' });
    await owner.agent.get('/api/dashboard/summary?preset=custom&from=2026-02-10&to=2026-01-01').expect(400);
    await owner.agent.get('/api/dashboard/summary?preset=bogus').expect(400);
  });

  it('dashboard reflects real order and expense records', async () => {
    const stage = await prisma.workflowStage.findUniqueOrThrow({ where: { code: 'NEW' } });
    const customer = await prisma.customer.create({ data: { code: 'AZC-T0001', name: 'Dashboard Test', mobile: '923001112233' } });
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    // order dated "today" in Karachi
    const pkToday = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    await prisma.order.create({
      data: {
        orderNumber: 'AZ-TEST-00001', customerId: customer.id, stageId: stage.id, orderDate: new Date(`${pkToday}T00:00:00Z`),
        stitchingTotal: '2500.00', fabricTotal: '4000.50', subtotal: '6500.50', totalAmount: '6500.50', balanceAmount: '6500.50',
      },
    });
    const category = await prisma.expenseCategory.create({ data: { name: 'Electricity (test)' } });
    await prisma.expense.create({
      data: { expenseNo: 'EXP-T1', expenseDate: new Date(`${pkToday}T00:00:00Z`), categoryId: category.id, description: 'Bill', amount: '1200.25', paymentMethod: 'CASH', idempotencyKey: 'exp-t1' },
    });
    const res = await owner.agent.get('/api/dashboard/summary?preset=today').expect(200);
    expect(res.body.cards).toMatchObject({
      totalSales: '6500.50', stitchingRevenue: '2500.00', fabricSales: '4000.50', totalOrders: 1, pendingOrders: 1, totalExpenses: '1200.25',
    });
    const charts = await owner.agent.get('/api/dashboard/charts?preset=this_month').expect(200);
    expect(charts.body.monthlyRevenue).toHaveLength(12);
    expect(charts.body.orderStatus.find((s: { code: string }) => s.code === 'NEW').count).toBe(1);
    expect(today).toBeInstanceOf(Date);
  });

  it('sequence numbers are unique under concurrency', async () => {
    const seq = app.get(SequenceService);
    const numbers = await Promise.all(Array.from({ length: 25 }, () => seq.next({ key: 'TEST', prefix: 'AZ', period: '2026' })));
    expect(new Set(numbers).size).toBe(25);
    expect(numbers.sort()[0]).toBe('AZ-2026-00001');
    expect(numbers.sort()[24]).toBe('AZ-2026-00025');
  });

  it('journal entries must balance and become immutable once posted', async () => {
    const cash = await prisma.chartOfAccount.create({ data: { code: 'T1000', name: 'Cash (test)', type: 'ASSET', normalBalance: 'DEBIT' } });
    const rev = await prisma.chartOfAccount.create({ data: { code: 'T4000', name: 'Revenue (test)', type: 'INCOME', normalBalance: 'CREDIT' } });
    const je = await prisma.journalEntry.create({
      data: { entryNo: 'JV-T1', entryDate: new Date('2026-11-26T00:00:00Z'), description: 'Test', sourceType: 'MANUAL',
        lines: { create: [
          { lineNo: 1, accountId: cash.id, debit: '100.00' },
          { lineNo: 2, accountId: rev.id, credit: '90.00' },
        ] } },
    });
    await expect(prisma.journalEntry.update({ where: { id: je.id }, data: { status: 'POSTED' } })).rejects.toThrow(/not balanced/);
    await prisma.journalEntryLine.updateMany({ where: { journalEntryId: je.id, lineNo: 2 }, data: { credit: '100.00' } });
    const posted = await prisma.journalEntry.update({ where: { id: je.id }, data: { status: 'POSTED' } });
    expect(posted.totalDebit.toFixed(2)).toBe('100.00');
    await expect(prisma.journalEntryLine.updateMany({ where: { journalEntryId: je.id }, data: { debit: '0' } })).rejects.toThrow(/posted journal entry/);
    await expect(prisma.journalEntry.update({ where: { id: je.id }, data: { description: 'changed' } })).rejects.toThrow(/immutable/);
    await expect(prisma.journalEntry.delete({ where: { id: je.id } })).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.journalEntry.create({ data: { entryNo: 'JV-T2', entryDate: new Date(), description: 'x', sourceType: 'MANUAL', status: 'POSTED' } }))
      .rejects.toThrow(/DRAFT/);
    // a line may not be both debit and credit
    const draft = await prisma.journalEntry.create({ data: { entryNo: 'JV-T3', entryDate: new Date(), description: 'x', sourceType: 'MANUAL' } });
    await expect(prisma.journalEntryLine.create({ data: { journalEntryId: draft.id, lineNo: 1, accountId: cash.id, debit: '5', credit: '5' } }))
      .rejects.toThrow();
    // dashboard net profit now reflects the posted revenue
    const res = await owner.agent.get('/api/dashboard/summary?preset=custom&from=2026-11-01&to=2026-11-30').expect(200);
    // approved expenses are posted to the books automatically (Phase 6), so this month's expense of 1200.25 counts too
    const pkMonth = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
    expect(Number(res.body.cards.netProfit)).toBeCloseTo(100 - (pkMonth === '2026-11' ? 1200.25 : 0), 2);
  });

  it('stock cannot go negative and inventory movements are append-only', async () => {
    const fabric = await prisma.fabric.create({ data: { code: 'FAB-T1', name: 'Wash & Wear' } });
    await expect(prisma.fabric.update({ where: { id: fabric.id }, data: { currentStock: '-1' } })).rejects.toThrow();
    const mv = await prisma.inventoryMovement.create({
      data: { movementNo: 'MV-T1', fabricId: fabric.id, type: 'OPENING', direction: 'IN', quantity: '10.000', balanceAfter: '10.000', idempotencyKey: 'opening:FAB-T1' },
    });
    await expect(prisma.inventoryMovement.create({
      data: { movementNo: 'MV-T2', fabricId: fabric.id, type: 'OPENING', direction: 'IN', quantity: '10.000', balanceAfter: '20.000', idempotencyKey: 'opening:FAB-T1' },
    })).rejects.toThrow(/Unique constraint/);
    await expect(prisma.inventoryMovement.update({ where: { id: mv.id }, data: { quantity: '5' } })).rejects.toThrow(/append-only/);
  });

  it('measurement versions are immutable', async () => {
    const customer = await prisma.customer.create({ data: { code: 'AZC-T0002', name: 'Measure Test', mobile: '923004445566' } });
    const tpl = await prisma.measurementTemplate.create({ data: { code: 'T_SK', name: 'Test SK', garmentCategory: 'SHALWAR_KAMEEZ' } });
    const m = await prisma.customerMeasurement.create({
      data: { customerId: customer.id, templateId: tpl.id, versionNo: 1, values: { create: [{ fieldKey: 'chest', fieldLabel: 'Chest', value: '40.50' }] } },
    });
    await expect(prisma.customerMeasurement.update({ where: { id: m.id }, data: { notes: 'edited' } })).rejects.toThrow(/immutable/);
    await prisma.customerMeasurement.update({ where: { id: m.id }, data: { isLatest: false } }); // allowed
    await expect(prisma.measurementValue.updateMany({ where: { measurementId: m.id }, data: { value: '41' } })).rejects.toThrow(/append-only/);
  });

  it('payments cannot be duplicated or deleted', async () => {
    const customer = await prisma.customer.findFirstOrThrow({ where: { code: 'AZC-T0001' } });
    const p = await prisma.payment.create({
      data: { receiptNo: 'RCP-T1', customerId: customer.id, amount: '500.00', method: 'CASH', type: 'ADVANCE', idempotencyKey: 'pay-key-1' },
    });
    await expect(prisma.payment.create({
      data: { receiptNo: 'RCP-T2', customerId: customer.id, amount: '500.00', method: 'CASH', type: 'ADVANCE', idempotencyKey: 'pay-key-1' },
    })).rejects.toThrow(/Unique constraint/);
    await expect(prisma.payment.delete({ where: { id: p.id } })).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.payment.update({ where: { id: p.id }, data: { amount: '50' } })).rejects.toThrow(/immutable/);
    await expect(prisma.payment.create({
      data: { receiptNo: 'RCP-T3', customerId: customer.id, amount: '0', method: 'CASH', type: 'ADVANCE', idempotencyKey: 'pay-key-3' },
    })).rejects.toThrow();
  });
});
