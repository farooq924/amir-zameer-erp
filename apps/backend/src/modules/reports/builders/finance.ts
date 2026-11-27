import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXPENSE_STATUSES, JOURNAL_SOURCES, PAYMENT_METHODS, type ReportRow } from '@az/shared';
import { dec } from '../../../common/utils/money';
import { BuiltReport, MAX_ROWS, ReportBuilder, col, dateIn, humanize, label, m, money, num, pct, summary, sumOf, timeIn, ymd } from '../report-kit';

const METHOD = label(PAYMENT_METHODS);
const EXP_STATUS = label(EXPENSE_STATUSES);
const SOURCE = label(JOURNAL_SOURCES);

// ------------------------------------------------------------------ expenses

export const expenseRegister: ReportBuilder = async (input) => {
  const where: Prisma.ExpenseWhereInput = { deletedAt: null, expenseDate: dateIn(input) };
  if (input.f.expenseCategory) where.categoryId = input.f.expenseCategory;
  if (input.f.paymentMethod) where.paymentMethod = input.f.paymentMethod as Prisma.ExpenseWhereInput['paymentMethod'];
  if (input.f.expenseStatus) where.status = input.f.expenseStatus as Prisma.ExpenseWhereInput['status'];
  const rows = await input.prisma.expense.findMany({
    where, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], take: MAX_ROWS,
    include: { category: { select: { name: true } }, createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } },
  });
  const out = rows.map((x) => ({
    expenseNo: x.expenseNo, date: ymd(x.expenseDate), category: x.category.name, description: x.description, paidTo: x.paidTo ?? '-', method: METHOD[x.paymentMethod],
    reference: x.reference ?? '', amount: m(x.amount), status: EXP_STATUS[x.status] ?? humanize(x.status), by: x.createdBy?.fullName ?? '-', approvedBy: x.approvedBy?.fullName ?? '-',
    _exclude: x.status === 'CANCELLED' || x.status === 'REJECTED' ? 1 : undefined,
  }));
  const ok = rows.filter((x) => x.status === 'APPROVED');
  const pending = rows.filter((x) => x.status === 'PENDING_APPROVAL');
  return {
    columns: [col('expenseNo', 'Expense no'), col('date', 'Date', 'date'), col('category', 'Category'), col('description', 'Description'), col('paidTo', 'Paid to'),
      col('method', 'Paid by'), col('reference', 'Bill / reference', 'text', { optional: true }), money('amount', 'Amount'), col('status', 'Status', 'status'),
      col('by', 'Entered by', 'text', { optional: true }), col('approvedBy', 'Approved by', 'text', { optional: true })],
    rows: out,
    summary: [summary('Approved', m(sumOf(ok, (x) => x.amount)), 'money', `${ok.length} vouchers`), summary('Waiting for approval', m(sumOf(pending, (x) => x.amount)), 'money', `${pending.length} vouchers`),
      summary('Cash expenses', m(sumOf(ok.filter((x) => x.paymentMethod === 'CASH'), (x) => x.amount)))],
    note: 'Cancelled and rejected expenses are listed but not added to the totals.',
  };
};

export const expenseSummary: ReportBuilder = async (input) => {
  const where: Prisma.ExpenseWhereInput = { deletedAt: null, status: 'APPROVED', expenseDate: dateIn(input) };
  if (input.f.paymentMethod) where.paymentMethod = input.f.paymentMethod as Prisma.ExpenseWhereInput['paymentMethod'];
  const g = await input.prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amount: true }, _count: { _all: true }, _max: { amount: true } });
  const cats = await input.prisma.expenseCategory.findMany({ where: { id: { in: g.map((x) => x.categoryId) } }, include: { account: { select: { code: true, name: true } } } });
  const total = sumOf(g, (x) => x._sum.amount);
  const out = g.map((x) => {
    const c = cats.find((y) => y.id === x.categoryId)!;
    return {
      category: c.name, account: c.account ? `${c.account.code} ${c.account.name}` : '-', vouchers: x._count._all, amount: m(x._sum.amount), share: pct(dec(x._sum.amount), total),
      average: m(dec(x._sum.amount).div(x._count._all || 1)), biggest: m(x._max.amount),
    };
  });
  const top = [...out].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  return {
    columns: [col('category', 'Category'), col('account', 'Account', 'text', { optional: true }), num('vouchers', 'Vouchers'), money('amount', 'Amount'), col('share', 'Share', 'percent'),
      money('average', 'Average', { total: false }), money('biggest', 'Biggest', { total: false, optional: true })],
    rows: out,
    summary: [summary('Total expenses', m(total)), summary('Categories', out.length, 'number'), summary('Biggest category', top?.category ?? '-', 'text', top ? `${top.share}% of total` : undefined)],
    defaultSort: { key: 'amount', dir: 'desc' },
  };
};

// ------------------------------------------------------------------ financial statements

const section = (label: string): ReportRow => ({ code: '', account: label, amount: null, _kind: 'section' });
const line = (code: string, account: string, amount: string): ReportRow => ({ code, account, amount, _kind: 'row' });
const subtotal = (label: string, amount: string, kind: 'subtotal' | 'total' = 'subtotal'): ReportRow => ({ code: '', account: label, amount, _kind: kind });
const STATEMENT_COLS = [col('code', 'Code'), col('account', 'Account'), col('amount', 'Amount (Rs)', 'money')];

export const profitLoss: ReportBuilder = async (input) => {
  const p = await input.accounting.profitAndLoss(input.range!.fromDate, input.range!.toDate);
  type G = { rows: { code: string; name: string; amount: string }[]; total: string };
  const block = (title: string, grp: unknown, totalLabel: string): ReportRow[] => { const g = grp as G; return [section(title), ...g.rows.map((r) => line(r.code, r.name, r.amount)), subtotal(totalLabel, g.total)]; };
  const expenses = dec(p.salaries.total).plus(dec(p.expenses.total));
  const rows: ReportRow[] = [
    ...block('Revenue', p.sales, 'Total revenue'),
    ...block('Cost of sales (fabric used)', p.costOfSales, 'Total cost of sales'),
    subtotal('Gross profit', p.grossProfit, 'total'),
    ...block('Direct labour (salaries & wages)', p.salaries, 'Total direct labour'),
    ...block('Operating expenses', p.expenses, 'Total operating expenses'),
    ...(p.otherIncome.rows.length ? block('Other income', p.otherIncome, 'Total other income') : []),
    subtotal('Net profit', p.netProfit, 'total'),
  ];
  return {
    columns: STATEMENT_COLS, rows,
    summary: [summary('Revenue', p.sales.total), summary('Gross profit', p.grossProfit), summary('Expenses', m(expenses), 'money', 'labour + operating'),
      summary('Net profit', p.netProfit, 'money', p.margin !== null ? `${p.margin}% margin` : undefined)],
    note: 'Accounting profit from the books. It is not the same as cash received: see the Cash Flow report.',
    sortable: false,
  };
};

export const cashFlow: ReportBuilder = async (input) => {
  const c = await input.accounting.cashFlow(input.range!.fromDate, input.range!.toDate);
  const rows: ReportRow[] = [
    subtotal('Opening balance (cash, bank & wallets)', c.opening),
    section('Money in'), ...c.inflow.map((x) => line('', x.label, x.amount)), subtotal('Total money in', c.totalIn),
    section('Money out'), ...c.outflow.map((x) => line('', x.label, dec(x.amount).neg().toFixed(2))), subtotal('Total money out', dec(c.totalOut).neg().toFixed(2)),
    subtotal('Net change', c.net, 'total'),
    subtotal('Closing balance', c.closing, 'total'),
    section('Closing balance by account'), ...c.accounts.map((a) => line(a.code, a.name, a.closing)),
  ];
  return {
    columns: [col('code', 'Code'), col('account', 'Item'), col('amount', 'Amount (Rs)', 'money')], rows,
    summary: [summary('Opening', c.opening), summary('Money in', c.totalIn), summary('Money out', c.totalOut), summary('Closing', c.closing)],
    note: 'Cash, bank and mobile wallet accounts only. Money out is shown as minus.',
    sortable: false,
  };
};

export const balanceSheet: ReportBuilder = async (input) => {
  const b = await input.accounting.balanceSheet(input.asOf!);
  type R = { code: string; name: string; amount: string };
  const rows: ReportRow[] = [
    section('Assets'), ...(b.assets.rows as R[]).map((r) => line(r.code, r.name, r.amount)), subtotal('Total assets', b.assets.total, 'total'),
    section('Liabilities'), ...(b.liabilities.rows as R[]).map((r) => line(r.code, r.name, r.amount)), subtotal('Total liabilities', b.liabilities.total),
    section("Owner's equity"), ...(b.equity.rows as R[]).map((r) => line(r.code, r.name, r.amount)), line('', 'Profit to date', b.equity.profitToDate), subtotal('Total equity', b.equity.total),
    subtotal('Total liabilities & equity', b.totalLiabilitiesAndEquity, 'total'),
  ];
  return {
    columns: STATEMENT_COLS, rows,
    summary: [summary('Total assets', b.assets.total), summary('Liabilities', b.liabilities.total), summary('Equity', b.equity.total),
      summary('Check', b.balanced ? 'Balanced' : 'Not balanced', 'text')],
    note: b.balanced ? 'Balanced: assets = liabilities + equity.' : 'NOT balanced. Run Accounting > Sync, then check manual journal entries.',
    sortable: false,
  };
};

export const trialBalance: ReportBuilder = async (input) => {
  const t = await input.accounting.trialBalance(input.asOf!);
  const rows: ReportRow[] = [
    ...t.rows.map((r) => ({ code: r.code, account: r.name, type: humanize(r.type), debit: r.debit, credit: r.credit, _kind: 'row' as const })),
    { code: '', account: 'Total', type: '', debit: t.totals.debit, credit: t.totals.credit, _kind: 'total' },
  ];
  return {
    columns: [col('code', 'Code'), col('account', 'Account'), col('type', 'Type'), col('debit', 'Debit', 'money'), col('credit', 'Credit', 'money')], rows,
    summary: [summary('Total debit', t.totals.debit), summary('Total credit', t.totals.credit), summary('Accounts', t.rows.length, 'number'),
      summary('Check', t.totals.balanced ? 'Balanced' : 'Not balanced', 'text')],
    note: t.totals.balanced ? 'Balanced: total debit equals total credit.' : 'NOT balanced.',
    sortable: false,
  };
};

export const generalLedger: ReportBuilder = async (input): Promise<BuiltReport> => {
  const r = input.range!;
  if (input.f.account) {
    const l = await input.accounting.ledger(input.f.account, { from: r.fromDate, to: r.toDate }).catch(() => {
      throw new BadRequestException('Account not found');
    });
    const rows: ReportRow[] = [
      { date: r.fromDate, entryNo: '-', account: `${l.account.code} ${l.account.name}`, description: 'Opening balance', source: '', party: '', debit: m(0), credit: m(0), balance: l.opening, _kind: 'section', _exclude: 1 },
      ...l.entries.map((e) => ({ date: e.date, entryNo: e.entryNo, account: `${l.account.code} ${l.account.name}`, description: e.description, source: e.source, party: e.party ?? '', debit: e.debit, credit: e.credit, balance: e.balance })),
    ];
    return {
      columns: [col('date', 'Date', 'date'), col('entryNo', 'Entry no'), col('description', 'Description'), col('source', 'Source', 'text', { optional: true }),
        col('party', 'Party', 'text', { optional: true }), money('debit', 'Debit'), money('credit', 'Credit'), money('balance', 'Balance', { total: false })],
      rows,
      summary: [summary('Opening', l.opening), summary('Debit', l.totals.debit), summary('Credit', l.totals.credit), summary('Closing', l.closing, 'money', `${l.account.code} ${l.account.name}`)],
      note: `${l.account.code} ${l.account.name}. Balance is shown in the account's normal direction.`,
      sortable: false,
      truncated: l.entries.length >= 5000,
    };
  }
  const lines = await input.prisma.journalEntryLine.findMany({
    where: { journalEntry: { status: { not: 'DRAFT' }, entryDate: dateIn(input) } },
    include: {
      account: { select: { code: true, name: true } },
      journalEntry: { select: { entryNo: true, entryDate: true, description: true, sourceType: true } },
      customer: { select: { name: true } }, supplier: { select: { name: true } }, employee: { select: { name: true } },
    },
    orderBy: [{ journalEntry: { entryDate: 'desc' } }, { journalEntry: { entryNo: 'desc' } }, { lineNo: 'asc' }],
    take: MAX_ROWS + 1,
  });
  const out = lines.slice(0, MAX_ROWS).map((l) => ({
    date: ymd(l.journalEntry.entryDate), entryNo: l.journalEntry.entryNo, account: `${l.account.code} ${l.account.name}`,
    description: l.description ? `${l.journalEntry.description} · ${l.description}` : l.journalEntry.description, source: SOURCE[l.journalEntry.sourceType] ?? l.journalEntry.sourceType,
    party: l.customer?.name ?? l.supplier?.name ?? l.employee?.name ?? '', debit: m(l.debit), credit: m(l.credit),
  }));
  const d = sumOf(out, (x) => x.debit);
  const c = sumOf(out, (x) => x.credit);
  return {
    columns: [col('date', 'Date', 'date'), col('entryNo', 'Entry no'), col('account', 'Account'), col('description', 'Description'), col('source', 'Source', 'text', { optional: true }),
      col('party', 'Party', 'text', { optional: true }), money('debit', 'Debit'), money('credit', 'Credit')],
    rows: out, truncated: lines.length > MAX_ROWS,
    summary: [summary('Lines', out.length, 'number'), summary('Debit', m(d)), summary('Credit', m(c)), summary('Check', d.eq(c) ? 'Balanced' : 'Not balanced', 'text')],
    note: 'Pick an account in the filters to see its opening and running balance.',
  };
};

// ------------------------------------------------------------------ audit log

export const auditLog: ReportBuilder = async (input) => {
  const where: Prisma.AuditLogWhereInput = { createdAt: timeIn(input) };
  if (input.f.auditModule) where.module = input.f.auditModule;
  if (input.f.user) where.userId = input.f.user;
  const rows = await input.prisma.auditLog.findMany({
    where, orderBy: { createdAt: 'desc' }, take: MAX_ROWS + 1, include: { user: { select: { fullName: true, username: true } } },
  });
  const brief = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = JSON.stringify(v);
    return s.length > 160 ? `${s.slice(0, 157)}...` : s;
  };
  const out = rows.slice(0, MAX_ROWS).map((a) => ({
    time: a.createdAt.toISOString(), user: a.user ? `${a.user.fullName} (${a.user.username})` : 'System', action: humanize(a.action), module: humanize(a.module),
    record: a.recordId ?? '', ip: a.ipAddress ?? '', details: brief(a.newValues ?? a.oldValues),
  }));
  return {
    columns: [col('time', 'Time', 'datetime'), col('user', 'User'), col('action', 'Action'), col('module', 'Module'), col('record', 'Record', 'text', { optional: true }),
      col('ip', 'IP address', 'text', { optional: true }), col('details', 'Details')],
    rows: out, truncated: rows.length > MAX_ROWS,
    summary: [summary('Events', out.length, 'number'), summary('Users', new Set(rows.map((r) => r.userId)).size, 'number'),
      summary('Logins', rows.filter((r) => r.action === 'LOGIN').length, 'number'), summary('Changes', rows.filter((r) => ['CREATE', 'UPDATE', 'DELETE'].includes(r.action)).length, 'number')],
  };
};
