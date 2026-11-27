import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PostingService } from '../src/modules/accounting/posting.service';
import { DEMO_USER } from '../src/demo/demo-dataset';
import { loadDemoData, readManifest } from '../src/demo/demo-loader';
import { removeDemoData } from '../src/demo/demo-remover';
import { bootApp, login } from './helpers';

/** Runs last (see sequencer.js): the database already holds "real" records from the other suites. */
describe('Demo data load / remove (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const realCounts = async () => ({
    customers: await prisma.customer.count(), orders: await prisma.order.count(), payments: await prisma.payment.count(),
    fabrics: await prisma.fabric.count(), movements: await prisma.inventoryMovement.count(), employees: await prisma.employee.count(),
    attendance: await prisma.attendance.count(), payrolls: await prisma.payroll.count(), users: await prisma.user.count(),
    ledger: await prisma.customerLedger.count(), whatsapp: await prisma.whatsAppMessage.count(), journals: await prisma.journalEntry.count(), audit: await prisma.auditLog.count(), stock: (await prisma.fabric.aggregate({ _sum: { currentStock: true } }))._sum.currentStock?.toString(),
  });

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('loads, is safe to run twice, and removes only demo records', async () => {
    await app.get(PostingService).sync(); // books of the other suites' records first
    const before = await realCounts();
    const r = await loadDemoData(app);
    // The demo is posted to the books with its own (past) dates, and the books balance.
    expect(await prisma.journalEntry.count()).toBeGreaterThan(before.journals);
    const tb = await prisma.journalEntryLine.aggregate({ _sum: { debit: true, credit: true } });
    expect(tb._sum.debit?.toString()).toBe(tb._sum.credit?.toString());
    expect(r.status).toBe('loaded');
    expect(r.counts).toMatchObject({ customers: 24, suppliers: 5, fabrics: 12, employees: 8 });
    expect(r.counts.orders).toBeGreaterThan(25);
    // Real employees exist in this database, so no demo payroll is made.
    expect(r.counts.payrolls).toBe(0);
    // WhatsApp history: manual and Cloud API messages, half the customers opted in, nothing in the queue.
    expect(r.counts.whatsappMessages).toBeGreaterThan(20);
    const m = (await readManifest(app.get(PrismaService)))!;
    expect(await prisma.customer.count({ where: { id: { in: m.customers }, whatsappOptIn: true } })).toBe(12);
    expect(await prisma.whatsAppMessage.count({ where: { customerId: { in: m.customers }, status: 'QUEUED' } })).toBe(0);
    expect(await prisma.whatsAppMessage.count({ where: { customerId: { in: m.customers }, status: 'READ' } })).toBeGreaterThan(0);
    expect(await prisma.whatsAppMessage.count({ where: { customerId: { in: m.customers }, channel: 'MANUAL' } })).toBeGreaterThan(0);

    const demo = await login(app, DEMO_USER.username, DEMO_USER.password);
    const dash = await demo.agent.get('/api/dashboard/summary').expect(200);
    expect(dash.body).toBeDefined();
    const orders = await demo.agent.get('/api/orders?pageSize=5').expect(200);
    expect(orders.body.meta.total).toBeGreaterThan(25);

    expect((await loadDemoData(app)).status).toBe('already-loaded');

    const removed = await removeDemoData(app.get(PrismaService));
    expect(removed.status).toBe('removed');
    expect(await readManifest(app.get(PrismaService))).toBeNull();
    const after = await realCounts();
    expect({ ...after, audit: undefined, users: undefined }).toEqual({ ...before, audit: undefined, users: undefined });
    expect(after.users).toBe(before.users);
    expect(await prisma.user.findUnique({ where: { username: DEMO_USER.username } })).toBeNull();
    const disabled = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'`;
    expect(Number(disabled[0].n)).toBe(0);
    expect((await removeDemoData(app.get(PrismaService))).status).toBe('nothing-to-remove');
  }, 180_000);
});
