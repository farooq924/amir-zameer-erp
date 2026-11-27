import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { purgeJournalsFor } from '../src/modules/accounting/purge-journals';
import { Agent, bootApp, login } from './helpers';

/** Karachi dates so the suite works on any day. */
function karachi() {
  const now = new Date(Date.now() + 5 * 3_600_000);
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const twoMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 10);
  return { today, month, monthStart, twoMonthsAgo };
}

describe('Phase 6: payments, expenses & accounting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let cashier: Agent;
  const k = karachi();
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const patch = (path: string, body: unknown, a: Agent = owner) => a.agent.patch(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);

  let customerId: string;
  let orderId: string;
  let rentCat: string;
  const accountByCode = async (code: string) => (await get('/api/accounting/accounts').expect(200)).body.find((a: { code: string }) => a.code === code);
  const customerAR = async (cid: string) => {
    const ar = await accountByCode('1100');
    const lines = await prisma.journalEntryLine.findMany({ where: { accountId: ar.id, customerId: cid, journalEntry: { status: { not: 'DRAFT' } } } });
    return lines.reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0).toFixed(2);
  };

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    const roles = (await get('/api/roles').expect(200)).body as { id: string; code: string }[];
    await post('/api/users', { fullName: 'Finance Cashier', email: 'fcash@test.local', username: 'fcashier', password: 'Cashier12345', roleIds: [roles.find((r) => r.code === 'CASHIER')!.id] }).expect(201);
    cashier = await login(app, 'fcashier', 'Cashier12345');
    customerId = (await post('/api/customers', { name: 'Finance Customer', mobile: '0345-6660071' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates the default chart of accounts and expense categories', async () => {
    const accounts = (await get('/api/accounting/accounts').expect(200)).body as { code: string; isSystem: boolean }[];
    for (const code of ['1000', '1010', '1020', '1100', '1200', '2000', '2100', '3200', '4000', '4010', '4100', '5000', '5100', '5390']) {
      expect(accounts.some((a) => a.code === code)).toBe(true);
    }
    const cats = (await get('/api/expenses/categories').expect(200)).body as { id: string; name: string; account: { code: string } }[];
    const rent = cats.find((c) => c.name === 'Shop Rent')!;
    expect(rent.account.code).toBe('5200');
    rentCat = rent.id;
  });

  it('posts every earlier document (orders, purchases, payroll...) as balanced entries, and a second sync posts nothing', async () => {
    const first = await post('/api/accounting/sync', {}).expect(201);
    expect(first.body.failedCount).toBe(0);
    const second = await post('/api/accounting/sync', {}).expect(201);
    expect(second.body.posted).toBe(0);
    const tb = (await get('/api/accounting/reports/trial-balance').expect(200)).body;
    expect(tb.totals.balanced).toBe(true);
    const unbalanced = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM journal_entries WHERE status <> 'DRAFT' AND "totalDebit" <> "totalCredit"`;
    expect(unbalanced[0].n).toBe(0);
  });

  it('books an order: receivable and income, the advance goes to cash, and receivables match the customer ledger', async () => {
    const o = await post('/api/orders', {
      customerId, orderType: 'STITCHING_WITH_FABRIC',
      items: [{ garmentName: 'Shalwar Kameez', quantity: 2, stitchingPrice: '3000', fabricSource: 'SHOP', fabricDescription: 'Lawn', fabricQuantity: '8', fabricRate: '500' }],
      advance: { amount: '4000', method: 'CASH' },
    }).expect(201);
    orderId = o.body.id;
    expect(o.body.totalAmount).toBe('10000.00');
    const before = (await get(`/api/accounting/reports/profit-loss?from=${k.monthStart}&to=${k.today}`).expect(200)).body;
    await post('/api/accounting/sync', {}).expect(201);
    expect(await customerAR(customerId)).toBe('6000.00');
    const ledger = (await get(`/api/customers/${customerId}/ledger`).expect(200)).body;
    expect(ledger.totals.balance).toBe('6000.00');
    const je = await prisma.journalEntry.findMany({ where: { sourceType: 'ORDER', sourceId: orderId }, include: { lines: { include: { account: true } } } });
    expect(je).toHaveLength(1);
    const byCode = Object.fromEntries(je[0].lines.map((l) => [l.account.code, Number(l.debit) - Number(l.credit)]));
    expect(byCode).toEqual({ '1100': 10000, '4000': -6000, '4010': -4000 });
    expect(Number(before.sales.total)).toBeGreaterThanOrEqual(10000);
  });

  it('lists receipts with totals, and the cashier cannot reverse them', async () => {
    const list = (await get(`/api/payments?search=Finance Customer&kind=RECEIPT`).expect(200)).body;
    expect(list.data).toHaveLength(1);
    expect(list.totals.received).toBe('4000.00');
    const summary = (await get('/api/payments/summary').expect(200)).body;
    expect(Number(summary.today.received)).toBeGreaterThanOrEqual(4000);
    await post(`/api/payments/${list.data[0].id}/reverse`, { reason: 'Test' }, cashier).expect(403);
  });

  it('reverses a wrong receipt: the order owes it again and the cash goes back', async () => {
    const wallet = await accountByCode('1020');
    const pay = await post(`/api/orders/${orderId}/payments`, { amount: '1000', method: 'MOBILE_WALLET', idempotencyKey: randomUUID() }).expect(201);
    const receipt = pay.body.payments.find((p: { amount: string }) => p.amount === '1000.00');
    const r = await post(`/api/payments/${receipt.id}/reverse`, { reason: 'Entered on the wrong order' }).expect(201);
    expect(r.body.status).toBe('REVERSED');
    await post(`/api/payments/${receipt.id}/reverse`, { reason: 'Again' }).expect(400);
    const o = (await get(`/api/orders/${orderId}`).expect(200)).body;
    expect(o.paidAmount).toBe('4000.00');
    expect(o.balanceAmount).toBe('6000.00');
    expect(await customerAR(customerId)).toBe('6000.00');
    const walletAfter = await accountByCode('1020');
    expect(walletAfter.balance).toBe(wallet.balance); // +1000 then -1000
  });

  it('refunds a cancelled order up to what was paid', async () => {
    await post(`/api/orders/${orderId}/cancel`, { reason: 'Customer changed mind' }).expect(201);
    const refundable = (await get('/api/payments/refundable').expect(200)).body as { id: string; refundable: string }[];
    expect(refundable.find((r) => r.id === orderId)?.refundable).toBe('4000.00');
    await post('/api/payments/refunds', { orderId, amount: '5000', method: 'CASH', reason: 'Cancelled', idempotencyKey: randomUUID() }).expect(400);
    await post('/api/payments/refunds', { orderId, amount: '1000', method: 'CASH', reason: 'Cancelled', idempotencyKey: randomUUID() }, cashier).expect(403);
    const key = randomUUID();
    const rf = await post('/api/payments/refunds', { orderId, amount: '4000', method: 'CASH', reason: 'Cancelled', idempotencyKey: key }).expect(201);
    expect(rf.body).toMatchObject({ type: 'REFUND', amount: '4000.00' });
    expect(rf.body.receiptNo).toMatch(/^RFD-\d{4}-\d{5}$/);
    const again = await post('/api/payments/refunds', { orderId, amount: '4000', method: 'CASH', reason: 'Cancelled', idempotencyKey: key }).expect(201);
    expect(again.body.id).toBe(rf.body.id);
    const o = (await get(`/api/orders/${orderId}`).expect(200)).body;
    expect(o.paidAmount).toBe('0.00');
    expect(await customerAR(customerId)).toBe('0.00');
    expect((await get(`/api/customers/${customerId}/ledger`).expect(200)).body.totals.balance).toBe('0.00');
  });

  let expenseId: string;
  it('records expenses: owner = approved and posted, cashier = waiting for approval', async () => {
    const before = (await get(`/api/accounting/reports/profit-loss?from=${k.monthStart}&to=${k.today}`).expect(200)).body;
    const key = randomUUID();
    const x = await post('/api/expenses', { categoryId: rentCat, description: 'Shop rent', amount: '85000', paymentMethod: 'BANK_TRANSFER', paidTo: 'Landlord', idempotencyKey: key }).expect(201);
    expenseId = x.body.id;
    expect(x.body).toMatchObject({ status: 'APPROVED', amount: '85000.00' });
    expect(x.body.expenseNo).toMatch(/^EXP-\d{4}-\d{5}$/);
    expect(x.body.journal.status).toBe('POSTED');
    expect((await post('/api/expenses', { categoryId: rentCat, description: 'Shop rent', amount: '85000', paymentMethod: 'BANK_TRANSFER', idempotencyKey: key }).expect(201)).body.id).toBe(expenseId);
    await post('/api/expenses', { categoryId: rentCat, description: 'Future', amount: '10', paymentMethod: 'CASH', expenseDate: '2099-01-01', idempotencyKey: randomUUID() }).expect(400);
    await post('/api/expenses', { categoryId: rentCat, description: 'Zero', amount: '0', paymentMethod: 'CASH', idempotencyKey: randomUUID() }).expect(400);
    const after = (await get(`/api/accounting/reports/profit-loss?from=${k.monthStart}&to=${k.today}`).expect(200)).body;
    expect(Number(after.netProfit)).toBeCloseTo(Number(before.netProfit) - 85000, 2);
    expect(after.expenses.rows.find((r: { code: string }) => r.code === '5200').amount).toBe('85000.00');

    const cats = (await get('/api/expenses/categories').expect(200)).body as { id: string; name: string }[];
    const tea = cats.find((c) => c.name === 'Staff Food & Tea')!.id;
    const p = await post('/api/expenses', { categoryId: tea, description: 'Tea for staff', amount: '1200', paymentMethod: 'CASH', idempotencyKey: randomUUID() }, cashier).expect(201);
    expect(p.body.status).toBe('PENDING_APPROVAL');
    expect(p.body.journal).toBeNull();
    await post(`/api/expenses/${p.body.id}/approve`, {}, cashier).expect(403);
    const edited = await patch(`/api/expenses/${p.body.id}`, { amount: '1300', version: p.body.version }).expect(200);
    await patch(`/api/expenses/${p.body.id}`, { amount: '1400', version: p.body.version }).expect(409);
    const ok = await post(`/api/expenses/${p.body.id}/approve`, {}).expect(201);
    expect(ok.body).toMatchObject({ status: 'APPROVED', amount: '1300.00' });
    expect(ok.body.journal.status).toBe('POSTED');
    await patch(`/api/expenses/${p.body.id}`, { amount: '1500', version: edited.body.version + 1 }).expect(400);
    const rej = await post('/api/expenses', { categoryId: tea, description: 'Not allowed', amount: '500', paymentMethod: 'CASH', idempotencyKey: randomUUID() }, cashier).expect(201);
    await post(`/api/expenses/${rej.body.id}/reject`, { reason: 'Personal expense' }).expect(201);
    await post(`/api/expenses/${rej.body.id}/approve`, {}).expect(400);
    const summary = (await get('/api/expenses/summary').expect(200)).body;
    expect(Number(summary.total)).toBeGreaterThanOrEqual(86300);
  });

  it('protects approved expenses in the database and reverses the books when one is cancelled', async () => {
    await expect(prisma.expense.update({ where: { id: expenseId }, data: { amount: '1' } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.expense.delete({ where: { id: expenseId } })).rejects.toThrow(/cannot be deleted/);
    const bank = await accountByCode('1010');
    await post(`/api/expenses/${expenseId}/cancel`, { reason: 'Paid twice' }).expect(201);
    const x = (await get(`/api/expenses/${expenseId}`).expect(200)).body;
    expect(x.status).toBe('CANCELLED');
    expect(x.journal.status).toBe('REVERSED');
    const bankAfter = await accountByCode('1010');
    expect(Number(bankAfter.balance) - Number(bank.balance)).toBeCloseTo(85000, 2);
    await post(`/api/expenses/${expenseId}/cancel`, { reason: 'Again' }).expect(400);
  });

  it('creates due recurring expenses once', async () => {
    const r = await post('/api/expenses/recurring', { categoryId: rentCat, description: 'Monthly rent', amount: '1000', paymentMethod: 'CASH', frequency: 'MONTHLY', nextRunDate: k.twoMonthsAgo }).expect(201);
    expect(r.body.isDue).toBe(true);
    const g = await post('/api/expenses/recurring/generate', {}).expect(201);
    expect(g.body.created).toBe(3); // two months ago, last month, this month
    expect((await post('/api/expenses/recurring/generate', {}).expect(201)).body.created).toBe(0);
    const list = (await get('/api/expenses/recurring').expect(200)).body as { id: string; nextRunDate: string; created: number; isDue: boolean }[];
    const row = list.find((x) => x.id === r.body.id)!;
    expect(row.created).toBe(3);
    expect(row.isDue).toBe(false);
    expect(row.nextRunDate > k.today).toBe(true);
  });

  it('posts balanced manual entries and reverses them', async () => {
    const cash = await accountByCode('1000');
    const capital = await accountByCode('3000');
    await post('/api/accounting/journals', { description: 'Bad', lines: [{ accountId: cash.id, debit: '100' }, { accountId: capital.id, credit: '90' }], idempotencyKey: randomUUID() }).expect(400);
    await post('/api/accounting/journals', { description: 'Bad', lines: [{ accountId: cash.id, debit: '100', credit: '100' }, { accountId: capital.id, credit: '100' }], idempotencyKey: randomUUID() }).expect(400);
    const key = randomUUID();
    const j = await post('/api/accounting/journals', { description: 'Owner added cash', lines: [{ accountId: cash.id, debit: '50000' }, { accountId: capital.id, credit: '50000' }], idempotencyKey: key }).expect(201);
    expect(j.body).toMatchObject({ status: 'POSTED', totalDebit: '50000.00', canReverse: true });
    expect(j.body.entryNo).toMatch(/^JV-\d{4}-\d{6}$/);
    expect((await post('/api/accounting/journals', { description: 'Owner added cash', lines: [{ accountId: cash.id, debit: '50000' }, { accountId: capital.id, credit: '50000' }], idempotencyKey: key }).expect(201)).body.id).toBe(j.body.id);
    await post('/api/accounting/journals', { description: 'x', lines: [{ accountId: cash.id, debit: '1' }, { accountId: capital.id, credit: '1' }], idempotencyKey: randomUUID() }, cashier).expect(403);
    const ledger = (await get(`/api/accounting/accounts/${cash.id}/ledger?from=${k.monthStart}&to=${k.today}`).expect(200)).body;
    expect(ledger.entries.some((e: { entryNo: string }) => e.entryNo === j.body.entryNo)).toBe(true);
    expect(Number(ledger.closing)).toBeCloseTo(Number(ledger.opening) + Number(ledger.totals.debit) - Number(ledger.totals.credit), 2);
    const rev = await post(`/api/accounting/journals/${j.body.id}/reverse`, { reason: 'Wrong amount' }).expect(201);
    expect(rev.body.status).toBe('REVERSED');
    expect(rev.body.reversedBy.entryNo).toMatch(/^JV-/);
    await post(`/api/accounting/journals/${j.body.id}/reverse`, { reason: 'Again' }).expect(400);
    const auto = await prisma.journalEntry.findFirstOrThrow({ where: { sourceType: 'ORDER' } });
    await post(`/api/accounting/journals/${auto.id}/reverse`, { reason: 'No' }).expect(400);
  });

  it('balance sheet balances and cash flow adds up', async () => {
    const bs = (await get('/api/accounting/reports/balance-sheet').expect(200)).body;
    expect(bs.balanced).toBe(true);
    const cf = (await get(`/api/accounting/reports/cash-flow?from=${k.monthStart}&to=${k.today}`).expect(200)).body;
    expect(Number(cf.closing)).toBeCloseTo(Number(cf.opening) + Number(cf.totalIn) - Number(cf.totalOut), 2);
    expect(cf.inflow.some((l: { key: string }) => l.key === 'PAYMENT')).toBe(true);
    const ov = (await get('/api/accounting/overview').expect(200)).body;
    expect(ov.cash).toHaveLength(3);
    expect(ov.sync.failedCount).toBe(0);
    const journals = (await get('/api/accounting/journals?sourceType=EXPENSE').expect(200)).body;
    expect(journals.data.length).toBeGreaterThan(0);
    const detail = (await get(`/api/accounting/journals/${journals.data[0].id}`).expect(200)).body;
    expect(detail.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('closes a month: nothing can be posted into it until it is reopened; a locked month stays closed', async () => {
    const cash = await accountByCode('1000');
    const capital = await accountByCode('3000');
    await post('/api/accounting/periods', { month: k.month, action: 'close' }, cashier).expect(403);
    const closed = (await post('/api/accounting/periods', { month: k.month, action: 'close' }).expect(201)).body as { month: string; status: string }[];
    expect(closed.find((p) => p.month === k.month)?.status).toBe('CLOSED');
    await post('/api/accounting/journals', { description: 'In closed month', lines: [{ accountId: cash.id, debit: '10' }, { accountId: capital.id, credit: '10' }], idempotencyKey: randomUUID() }).expect(400);
    // the database refuses it too
    const draft = await prisma.journalEntry.create({ data: { entryNo: 'JV-CLOSED-1', entryDate: new Date(`${k.today}T00:00:00Z`), description: 'x', sourceType: 'MANUAL' } });
    await prisma.journalEntryLine.createMany({ data: [{ journalEntryId: draft.id, lineNo: 1, accountId: cash.id, debit: '5' }, { journalEntryId: draft.id, lineNo: 2, accountId: capital.id, credit: '5' }] });
    await expect(prisma.journalEntry.update({ where: { id: draft.id }, data: { status: 'POSTED' } })).rejects.toThrow(/closed/);
    await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: draft.id } });
    await prisma.journalEntry.delete({ where: { id: draft.id } });
    // documents created while the month is closed wait, then post once it is reopened
    const x = await post('/api/expenses', { categoryId: rentCat, description: 'While closed', amount: '700', paymentMethod: 'CASH', idempotencyKey: randomUUID() }).expect(400);
    expect(x.body.message).toMatch(/closed/);
    await post('/api/accounting/periods', { month: k.month, action: 'reopen' }).expect(201);
    await post('/api/accounting/journals', { description: 'After reopening', lines: [{ accountId: cash.id, debit: '10' }, { accountId: capital.id, credit: '10' }], idempotencyKey: randomUUID() }).expect(201);
    await post('/api/accounting/periods', { month: k.month, action: 'lock' }).expect(400); // must be closed first
    // lock an old empty month and prove it cannot be reopened
    const old = '2020-01';
    await post('/api/accounting/periods', { month: old, action: 'close' }).expect(201);
    await post('/api/accounting/periods', { month: old, action: 'lock' }).expect(201);
    await post('/api/accounting/periods', { month: old, action: 'reopen' }).expect(400);
    const p = await prisma.accountingPeriod.findFirstOrThrow({ where: { startDate: new Date('2020-01-01T00:00:00Z') } });
    await expect(prisma.accountingPeriod.update({ where: { id: p.id }, data: { status: 'OPEN' } })).rejects.toThrow(/Locked/);
  });

  it('keeps finance pages behind permissions', async () => {
    await get('/api/accounting/overview', cashier).expect(403);
    await get('/api/payments', cashier).expect(200);
    await get('/api/expenses', cashier).expect(200);
    await post('/api/accounting/accounts', { code: '5340', name: 'Security', subType: 'OPERATING_EXPENSE' }, cashier).expect(403);
    const a = await post('/api/accounting/accounts', { code: '5340', name: 'Security Guard', subType: 'OPERATING_EXPENSE' }).expect(201);
    expect(a.body).toMatchObject({ type: 'EXPENSE', code: '5340' });
    await post('/api/accounting/accounts', { code: '5340', name: 'Dup', subType: 'OPERATING_EXPENSE' }).expect(409);
    const cash = await accountByCode('1000');
    await patch(`/api/accounting/accounts/${cash.id}`, { isActive: false }).expect(400);
  });
  it('can purge the journals of sample data (used by demo removal) and the books stay balanced', async () => {
    const c = (await post('/api/customers', { name: 'Purge Customer', mobile: '0345-6660072' }).expect(201)).body.id;
    await post('/api/orders', { customerId: c, items: [{ garmentName: 'Kurta', quantity: 1, stitchingPrice: '1500' }], advance: { amount: '500', method: 'CASH' } }).expect(201);
    await post('/api/accounting/sync', {}).expect(201);
    const n = await prisma.$transaction((tx) => purgeJournalsFor(tx, { customerIds: [c] }));
    expect(n).toBe(2);
    expect(await prisma.journalEntryLine.count({ where: { customerId: c } })).toBe(0);
    const posted = await prisma.journalEntry.findFirstOrThrow({ where: { status: 'POSTED' } });
    await expect(prisma.journalEntry.delete({ where: { id: posted.id } })).rejects.toThrow(/cannot be deleted/); // guards are back on
    expect((await get('/api/accounting/reports/trial-balance').expect(200)).body.totals.balanced).toBe(true);
  });
});
