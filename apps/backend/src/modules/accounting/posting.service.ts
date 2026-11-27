import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { JournalSource, PaymentMethod, Prisma } from '@prisma/client';
import { ACC, ACCOUNT_TYPES, DEFAULT_ACCOUNTS, DEFAULT_EXPENSE_CATEGORIES } from '@az/shared';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { karachiToday } from '../../common/utils/date-range';
import { DecimalLike, dec, money, moneyString } from '../../common/utils/money';

export const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
/** Karachi calendar date of a timestamp. */
export const karachiDate = (d: Date) => karachiToday(d);

export interface PostLine {
  code: string;
  debit?: DecimalLike;
  credit?: DecimalLike;
  description?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
}

export interface PostInput {
  date: string;
  description: string;
  sourceType: JournalSource;
  sourceId?: string | null;
  /** Unique key: the same source can never be posted twice. */
  sourceKey: string;
  lines: PostLine[];
  createdById?: string | null;
  reversalOfId?: string | null;
}

export interface SyncResult {
  at: string;
  posted: number;
  reversed: number;
  failed: { key: string; reason: string }[];
}

/** Cash / bank / wallet account a payment method lands in. */
export function cashAccount(method: PaymentMethod | string | null | undefined): string {
  switch (method) {
    case 'BANK_TRANSFER': case 'CARD': case 'CHEQUE': return ACC.BANK;
    case 'MOBILE_WALLET': return ACC.WALLET;
    default: return ACC.CASH;
  }
}

export const dr = (code: string, amount: DecimalLike, extra: Omit<PostLine, 'code' | 'debit' | 'credit'> = {}): PostLine => ({ code, debit: amount, ...extra });
export const cr = (code: string, amount: DecimalLike, extra: Omit<PostLine, 'code' | 'debit' | 'credit'> = {}): PostLine => ({ code, credit: amount, ...extra });

/**
 * Turns signed / zero lines into clean one-sided lines: a negative debit becomes a credit and
 * zero lines are dropped. Returns [] when nothing is left to post.
 */
export function normaliseLines(lines: PostLine[]): { code: string; debit: Prisma.Decimal; credit: Prisma.Decimal; rest: PostLine }[] {
  const out: { code: string; debit: Prisma.Decimal; credit: Prisma.Decimal; rest: PostLine }[] = [];
  for (const l of lines) {
    const net = money(l.debit).minus(money(l.credit));
    if (net.eq(0)) continue;
    out.push({ code: l.code, debit: net.gt(0) ? net : dec(0), credit: net.lt(0) ? net.abs() : dec(0), rest: l });
  }
  return out;
}

const BATCH = 300;

/**
 * Automatic double-entry bookkeeping.
 *
 * Every money document in the ERP (customer ledger rows, supplier ledger rows, stock movements with a
 * cost, payrolls, salary payments, advances, expenses) is turned into one balanced journal entry. Each
 * entry carries a unique `sourceKey`, so posting is idempotent: running the sync again never doubles
 * anything, and documents created by any module (or restored from a backup) are picked up.
 * The database refuses unbalanced, edited or deleted posted entries and anything dated in a closed month.
 */
@Injectable()
export class PostingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PostingService.name);
  private accounts = new Map<string, string>(); // code -> id
  private chain: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private skipped = new Set<string>();
  last: SyncResult | null = null;

  constructor(private readonly prisma: PrismaService, private readonly sequences: SequenceService) {}

  async onApplicationBootstrap() {
    try {
      await this.ensureDefaults();
    } catch (e) {
      this.logger.error(`Could not create the default chart of accounts: ${(e as Error).message}`);
    }
    if (process.env.NODE_ENV === 'test') return;
    // Post existing documents shortly after start, then keep the books current every minute.
    setTimeout(() => void this.sync().catch(() => undefined), 3_000).unref();
    this.timer = setInterval(() => void this.sync().catch(() => undefined), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Creates missing default accounts and expense categories. Never overwrites the owner's changes. */
  async ensureDefaults() {
    const existing = new Set((await this.prisma.chartOfAccount.findMany({ select: { code: true } })).map((a) => a.code));
    for (const a of DEFAULT_ACCOUNTS) {
      if (existing.has(a.code)) continue;
      const normal = a.subType === 'CONTRA_INCOME' ? 'DEBIT' : ACCOUNT_TYPES.find((t) => t.key === a.type)!.normal;
      await this.prisma.chartOfAccount.create({
        data: { code: a.code, name: a.name, type: a.type, subType: a.subType, normalBalance: normal, isSystem: a.isSystem, description: a.description ?? null },
      }).catch((e) => { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; });
    }
    await this.loadAccounts();
    const categories = await this.prisma.expenseCategory.findMany({ select: { name: true, accountId: true, id: true } });
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    for (const c of DEFAULT_EXPENSE_CATEGORIES) {
      const found = byName.get(c.name.toLowerCase());
      if (found) {
        if (!found.accountId) await this.prisma.expenseCategory.update({ where: { id: found.id }, data: { accountId: this.accounts.get(c.accountCode) ?? null } });
        continue;
      }
      await this.prisma.expenseCategory.create({ data: { name: c.name, accountId: this.accounts.get(c.accountCode) ?? null } })
        .catch((e) => { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; });
    }
    // Categories created by others (seed, imports) without an account post to Miscellaneous.
    const misc = this.accounts.get(ACC.MISC_EXPENSE);
    if (misc) await this.prisma.expenseCategory.updateMany({ where: { accountId: null }, data: { accountId: misc } });
  }

  private async loadAccounts() {
    const rows = await this.prisma.chartOfAccount.findMany({ select: { id: true, code: true } });
    this.accounts = new Map(rows.map((r) => [r.code, r.id]));
  }

  private async accountId(code: string, tx: PrismaTx): Promise<string> {
    let id = this.accounts.get(code);
    if (!id) {
      const row = await tx.chartOfAccount.findUnique({ where: { code } });
      if (!row) throw new Error(`Account ${code} is missing from the chart of accounts`);
      id = row.id;
      this.accounts.set(code, id);
    }
    return id;
  }

  async isClosed(tx: PrismaTx | PrismaService, date: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM accounting_periods
      WHERE ${asDate(date)}::date BETWEEN "startDate" AND "endDate" AND status <> 'OPEN'`;
    return rows[0].n > 0;
  }

  /**
   * Posts one balanced journal entry inside the caller's transaction. Returns the existing entry when the
   * source was already posted. A document dated in a closed month is posted on today's date instead.
   */
  async post(tx: PrismaTx, input: PostInput) {
    const existing = await tx.journalEntry.findUnique({ where: { sourceKey: input.sourceKey } });
    if (existing) return existing;
    const lines = normaliseLines(input.lines);
    if (lines.length < 2) return null;
    const debit = lines.reduce((a, l) => a.plus(l.debit), dec(0));
    const credit = lines.reduce((a, l) => a.plus(l.credit), dec(0));
    if (!debit.eq(credit)) throw new Error(`Entry ${input.sourceKey} is not balanced (${moneyString(debit)} / ${moneyString(credit)})`);
    let date = input.date;
    let description = input.description;
    if (await this.isClosed(tx, date)) {
      const today = karachiToday();
      if (await this.isClosed(tx, today)) throw new BadRequestException(`The month of ${today} is closed in Accounting. Reopen it first.`);
      description = `${description} (dated ${date}, posted late because that month is closed)`.slice(0, 300);
      date = today;
    }
    const period = await tx.accountingPeriod.findFirst({ where: { startDate: { lte: asDate(date) }, endDate: { gte: asDate(date) } }, select: { id: true } });
    const entryNo = await this.sequences.next({ key: 'JOURNAL', prefix: 'JV', period: date.slice(0, 4), padding: 6 }, tx);
    const entry = await tx.journalEntry.create({
      data: {
        entryNo, entryDate: asDate(date), periodId: period?.id ?? null, description: description.slice(0, 300), sourceType: input.sourceType,
        sourceId: input.sourceId ?? null, sourceKey: input.sourceKey, reversalOfId: input.reversalOfId ?? null, createdById: input.createdById ?? null,
      },
    });
    let lineNo = 1;
    for (const l of lines) {
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: entry.id, lineNo: lineNo++, accountId: await this.accountId(l.code, tx), debit: l.debit, credit: l.credit,
          description: l.rest.description?.slice(0, 300) ?? null, customerId: l.rest.customerId ?? null, supplierId: l.rest.supplierId ?? null, employeeId: l.rest.employeeId ?? null,
        },
      });
    }
    return tx.journalEntry.update({ where: { id: entry.id }, data: { status: 'POSTED', postedAt: new Date(), postedById: input.createdById ?? null } });
  }

  /** Posts the mirror image of a posted entry and marks the original as reversed. */
  async reverse(tx: PrismaTx, entryId: string, opts: { date?: string; description?: string; sourceKey?: string; createdById?: string | null }) {
    await tx.$queryRaw`SELECT id FROM journal_entries WHERE id = ${entryId}::uuid FOR UPDATE`;
    const e = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: { include: { account: { select: { code: true } } } } } });
    if (e.status !== 'POSTED') throw new Error(`Entry ${e.entryNo} is not posted`);
    const rev = await this.post(tx, {
      date: opts.date ?? karachiToday(),
      description: opts.description ?? `Reversal of ${e.entryNo}: ${e.description}`,
      sourceType: 'REVERSAL', sourceId: e.id, sourceKey: opts.sourceKey ?? `REV:${e.id}`, reversalOfId: e.id, createdById: opts.createdById,
      lines: e.lines.map((l) => ({ code: l.account.code, debit: l.credit, credit: l.debit, description: l.description, customerId: l.customerId, supplierId: l.supplierId, employeeId: l.employeeId })),
    });
    await tx.journalEntry.update({ where: { id: e.id }, data: { status: 'REVERSED' } });
    return rev;
  }

  // ===================================================================== builders (one per document type)

  async postExpense(tx: PrismaTx, expenseId: string) {
    const x = await tx.expense.findUniqueOrThrow({ where: { id: expenseId }, include: { category: { include: { account: { select: { code: true } } } } } });
    return this.post(tx, {
      date: dateOnly(x.expenseDate), description: `Expense ${x.expenseNo}: ${x.category.name} - ${x.description}`, sourceType: 'EXPENSE', sourceId: x.id,
      sourceKey: `EXP:${x.id}`, createdById: x.approvedById ?? x.createdById,
      lines: [dr(x.category.account?.code ?? ACC.MISC_EXPENSE, x.amount, { description: x.paidTo ? `Paid to ${x.paidTo}` : null }), cr(cashAccount(x.paymentMethod), x.amount)],
    });
  }

  async reverseExpense(tx: PrismaTx, expenseId: string, createdById: string | null) {
    const e = await tx.journalEntry.findUnique({ where: { sourceKey: `EXP:${expenseId}` } });
    if (!e || e.status !== 'POSTED') return null;
    const x = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
    return this.reverse(tx, e.id, { description: `Expense ${x.expenseNo} cancelled`, sourceKey: `EXPX:${expenseId}`, createdById });
  }

  // ===================================================================== sync

  /** Posts every document that has no journal entry yet. Calls are queued, never run in parallel. */
  sync(): Promise<SyncResult> {
    const run = this.chain.then(() => this.runSync());
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Same as sync() but never throws (used after business transactions). */
  async syncQuietly() {
    try { await this.sync(); } catch (e) { this.logger.warn(`Posting sync failed: ${(e as Error).message}`); }
  }

  private async runSync(): Promise<SyncResult> {
    if (!this.accounts.size) await this.ensureDefaults();
    const result: SyncResult = { at: new Date().toISOString(), posted: 0, reversed: 0, failed: [] };
    const each = async (key: string, fn: (tx: PrismaTx) => Promise<unknown>) => {
      if (this.skipped.has(key)) return;
      try {
        const r = await this.prisma.$transaction(fn, { timeout: 30_000 });
        if (r) result.posted += 1; else this.skipped.add(key);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // posted by someone else meanwhile
        result.failed.push({ key, reason: (e as Error).message.split('\n').pop()!.slice(0, 200) });
      }
    };
    const failedKeys = () => [...new Set(result.failed.map((f) => f.key).concat([...this.skipped]))];

    // 1. Customer ledger (orders, revisions, adjustments, cancellations, payments, refunds, opening balances)
    for (;;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT cl.id FROM customer_ledger cl
        WHERE NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'CL:' || cl.id::text)
          AND NOT (('CL:' || cl.id::text) = ANY(${failedKeys()}::text[]))
        ORDER BY cl."createdAt" LIMIT ${BATCH}`;
      if (!rows.length) break;
      for (const r of rows) await each(`CL:${r.id}`, (tx) => this.postCustomerLedger(tx, r.id));
    }
    // 2. Supplier ledger (purchases, returns, supplier payments, opening balances)
    for (;;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT sl.id FROM supplier_ledger sl
        WHERE NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'SL:' || sl.id::text)
          AND NOT (('SL:' || sl.id::text) = ANY(${failedKeys()}::text[]))
        ORDER BY sl."createdAt" LIMIT ${BATCH}`;
      if (!rows.length) break;
      for (const r of rows) await each(`SL:${r.id}`, (tx) => this.postSupplierLedger(tx, r.id));
    }
    // 3. Stock movements with a cost (opening stock, adjustments, fabric used on orders)
    for (;;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT m.id FROM inventory_movements m
        WHERE m.type IN ('OPENING','ADJUSTMENT_IN','ADJUSTMENT_OUT','ORDER_CONSUMPTION','ORDER_REVERSAL','SALE','SALE_RETURN')
          AND m."totalCost" > 0
          AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'INV:' || m.id::text)
          AND NOT (('INV:' || m.id::text) = ANY(${failedKeys()}::text[]))
        ORDER BY m."createdAt" LIMIT ${BATCH}`;
      if (!rows.length) break;
      for (const r of rows) await each(`INV:${r.id}`, (tx) => this.postMovement(tx, r.id));
    }
    // 4. Payroll: one entry per approval; reopened payrolls are reversed.
    const payrolls = await this.prisma.payroll.findMany({ select: { id: true, status: true, approvedAt: true, payrollNo: true } });
    const expected = new Map(payrolls.filter((p) => p.status !== 'DRAFT' && p.status !== 'CANCELLED' && p.approvedAt).map((p) => [`PAYROLL:${p.id}:${p.approvedAt!.getTime()}`, p]));
    const postedPayroll = await this.prisma.journalEntry.findMany({ where: { sourceType: 'PAYROLL', status: 'POSTED' }, select: { id: true, sourceKey: true } });
    for (const j of postedPayroll) {
      if (j.sourceKey && expected.has(j.sourceKey)) continue;
      try {
        await this.prisma.$transaction((tx) => this.reverse(tx, j.id, { description: undefined }));
        result.reversed += 1;
      } catch (e) {
        result.failed.push({ key: j.sourceKey ?? j.id, reason: (e as Error).message.slice(0, 200) });
      }
    }
    const havePayroll = new Set((await this.prisma.journalEntry.findMany({ where: { sourceType: 'PAYROLL' }, select: { sourceKey: true } })).map((j) => j.sourceKey));
    for (const [key, p] of expected) if (!havePayroll.has(key)) await each(key, (tx) => this.postPayroll(tx, p.id, key));
    // 5. Salary payments
    for (;;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM salary_payments s
        WHERE s.status = 'POSTED' AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'SALPAY:' || s.id::text)
          AND NOT (('SALPAY:' || s.id::text) = ANY(${failedKeys()}::text[]))
        ORDER BY s."createdAt" LIMIT ${BATCH}`;
      if (!rows.length) break;
      for (const r of rows) await each(`SALPAY:${r.id}`, (tx) => this.postSalaryPayment(tx, r.id));
    }
    // 6. Employee advances (given, and written off)
    for (;;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT a.id FROM employee_advances a
        WHERE NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'ADV:' || a.id::text)
          AND NOT (('ADV:' || a.id::text) = ANY(${failedKeys()}::text[]))
        ORDER BY a."createdAt" LIMIT ${BATCH}`;
      if (!rows.length) break;
      for (const r of rows) await each(`ADV:${r.id}`, (tx) => this.postAdvance(tx, r.id));
    }
    const writtenOff = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM employee_advances a
      WHERE a.status = 'WRITTEN_OFF' AND a."balanceAmount" > 0
        AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'ADVWO:' || a.id::text)`;
    for (const r of writtenOff) await each(`ADVWO:${r.id}`, (tx) => this.postAdvanceWriteOff(tx, r.id));
    // 7. Expenses (normally posted at approval; this catches anything missed)
    const expenses = await this.prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT x.id, x.status::text AS status FROM expenses x
      WHERE (x.status = 'APPROVED' OR (x.status = 'CANCELLED' AND x."approvedAt" IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceKey" = 'EXP:' || x.id::text)`;
    for (const x of expenses) {
      await each(`EXP:${x.id}`, async (tx) => {
        const e = await this.postExpense(tx, x.id);
        if (e && x.status === 'CANCELLED') await this.reverseExpense(tx, x.id, null);
        return e;
      });
    }
    const cancelled = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT x.id FROM expenses x JOIN journal_entries j ON j."sourceKey" = 'EXP:' || x.id::text AND j.status = 'POSTED'
      WHERE x.status = 'CANCELLED'`;
    for (const x of cancelled) await each(`EXPX:${x.id}`, (tx) => this.reverseExpense(tx, x.id, null));

    if (result.failed.length) this.logger.warn(`Posting: ${result.failed.length} document(s) could not be posted, e.g. ${result.failed[0].key}: ${result.failed[0].reason}`);
    this.last = result;
    return result;
  }

  private async postCustomerLedger(tx: PrismaTx, id: string) {
    const r = await tx.customerLedger.findUniqueOrThrow({ where: { id }, include: { customer: { select: { name: true, code: true } } } });
    const isDebit = dec(r.debit).gt(0);
    const amount = isDebit ? dec(r.debit) : dec(r.credit);
    const who = { customerId: r.customerId };
    const base = { date: dateOnly(r.entryDate), sourceId: r.referenceId, sourceKey: `CL:${r.id}`, description: `${r.description ?? r.entryType} - ${r.customer.name} (${r.customer.code})` };
    if (r.referenceType === 'PAYMENT') {
      const p = await tx.payment.findUnique({ where: { id: r.referenceId }, select: { method: true } });
      const cash = cashAccount(p?.method);
      if (!isDebit) return this.post(tx, { ...base, sourceType: 'PAYMENT', lines: [dr(cash, amount), cr(ACC.RECEIVABLE, amount, who)] });
      return this.post(tx, { ...base, sourceType: r.entryType === 'REFUND' ? 'REFUND' : 'REVERSAL', lines: [dr(ACC.RECEIVABLE, amount, who), cr(cash, amount)] });
    }
    if (r.entryType === 'OPENING') {
      return this.post(tx, { ...base, sourceType: 'OPENING', lines: isDebit ? [dr(ACC.RECEIVABLE, amount, who), cr(ACC.OPENING_EQUITY, amount)] : [dr(ACC.OPENING_EQUITY, amount), cr(ACC.RECEIVABLE, amount, who)] });
    }
    if (r.referenceType === 'ORDER') {
      // Booking (debit) or cancellation (credit): income split between stitching and fabric as on the order.
      const o = await tx.order.findUnique({ where: { id: r.referenceId }, select: { stitchingTotal: true, fabricTotal: true, additionalCharges: true } });
      const baseTotal = o ? dec(o.stitchingTotal).plus(o.fabricTotal).plus(o.additionalCharges) : dec(0);
      const fabric = o && baseTotal.gt(0) ? money(amount.times(o.fabricTotal).div(baseTotal)) : dec(0);
      const stitching = amount.minus(fabric);
      const income = [{ code: ACC.STITCHING_INCOME, amount: stitching }, { code: ACC.FABRIC_SALES, amount: fabric }];
      return this.post(tx, {
        ...base, sourceType: 'ORDER',
        lines: isDebit ? [dr(ACC.RECEIVABLE, amount, who), ...income.map((i) => cr(i.code, i.amount))] : [...income.map((i) => dr(i.code, i.amount)), cr(ACC.RECEIVABLE, amount, who)],
      });
    }
    if (r.entryType === 'SALE_RETURN') {
      return this.post(tx, { ...base, sourceType: 'SALE_RETURN', lines: isDebit ? [dr(ACC.RECEIVABLE, amount, who), cr(ACC.FABRIC_SALES, amount)] : [dr(ACC.FABRIC_SALES, amount), cr(ACC.RECEIVABLE, amount, who)] });
    }
    // Revisions and adjustments: increases are income, revision decreases reduce income, other decreases are discounts / waivers.
    const reduceAccount = r.referenceType === 'ORDER_REVISION' ? ACC.STITCHING_INCOME : ACC.DISCOUNTS;
    return this.post(tx, {
      ...base, sourceType: 'ORDER',
      lines: isDebit ? [dr(ACC.RECEIVABLE, amount, who), cr(ACC.STITCHING_INCOME, amount)] : [dr(reduceAccount, amount), cr(ACC.RECEIVABLE, amount, who)],
    });
  }

  private async postSupplierLedger(tx: PrismaTx, id: string) {
    const r = await tx.supplierLedger.findUniqueOrThrow({ where: { id }, include: { supplier: { select: { name: true, code: true } } } });
    const isDebit = dec(r.debit).gt(0);
    const amount = isDebit ? dec(r.debit) : dec(r.credit);
    const who = { supplierId: r.supplierId };
    const base = { date: dateOnly(r.entryDate), sourceId: r.referenceId, sourceKey: `SL:${r.id}`, description: `${r.description ?? r.entryType} - ${r.supplier.name} (${r.supplier.code})` };
    switch (r.entryType) {
      case 'OPENING':
        return this.post(tx, { ...base, sourceType: 'OPENING', lines: isDebit ? [dr(ACC.PAYABLE, amount, who), cr(ACC.OPENING_EQUITY, amount)] : [dr(ACC.OPENING_EQUITY, amount), cr(ACC.PAYABLE, amount, who)] });
      case 'PURCHASE':
        return this.post(tx, { ...base, sourceType: 'PURCHASE', lines: isDebit ? [dr(ACC.PAYABLE, amount, who), cr(ACC.INVENTORY, amount)] : [dr(ACC.INVENTORY, amount), cr(ACC.PAYABLE, amount, who)] });
      case 'PURCHASE_RETURN':
        return this.post(tx, { ...base, sourceType: 'PURCHASE_RETURN', lines: isDebit ? [dr(ACC.PAYABLE, amount, who), cr(ACC.INVENTORY, amount)] : [dr(ACC.INVENTORY, amount), cr(ACC.PAYABLE, amount, who)] });
      case 'SUPPLIER_PAYMENT': {
        const p = await tx.supplierPayment.findUnique({ where: { id: r.referenceId }, select: { method: true } });
        const cash = cashAccount(p?.method);
        return this.post(tx, { ...base, sourceType: 'SUPPLIER_PAYMENT', lines: isDebit ? [dr(ACC.PAYABLE, amount, who), cr(cash, amount)] : [dr(cash, amount), cr(ACC.PAYABLE, amount, who)] });
      }
      default:
        return this.post(tx, { ...base, sourceType: 'REVERSAL', lines: isDebit ? [dr(ACC.PAYABLE, amount, who), cr(ACC.OTHER_INCOME, amount)] : [dr(ACC.MISC_EXPENSE, amount), cr(ACC.PAYABLE, amount, who)] });
    }
  }

  private async postMovement(tx: PrismaTx, id: string) {
    const m = await tx.inventoryMovement.findUniqueOrThrow({ where: { id }, include: { fabric: { select: { name: true, code: true } } } });
    const amount = dec(m.totalCost);
    const base = { date: karachiDate(m.movementDate), sourceId: m.id, sourceKey: `INV:${m.id}`, sourceType: 'INVENTORY' as JournalSource };
    const label = `${m.movementNo} ${m.fabric.name} (${m.fabric.code})`;
    switch (m.type) {
      case 'OPENING':
        return this.post(tx, { ...base, sourceType: 'OPENING', description: `Opening stock ${label}`, lines: [dr(ACC.INVENTORY, amount), cr(ACC.OPENING_EQUITY, amount)] });
      case 'ADJUSTMENT_IN':
        return this.post(tx, { ...base, description: `Stock adjustment (in) ${label}${m.reason ? `: ${m.reason}` : ''}`, lines: [dr(ACC.INVENTORY, amount), cr(ACC.STOCK_ADJUSTMENT, amount)] });
      case 'ADJUSTMENT_OUT':
        return this.post(tx, { ...base, description: `Stock adjustment (out) ${label}${m.reason ? `: ${m.reason}` : ''}`, lines: [dr(ACC.STOCK_ADJUSTMENT, amount), cr(ACC.INVENTORY, amount)] });
      case 'ORDER_CONSUMPTION': case 'SALE':
        return this.post(tx, { ...base, description: `Fabric used ${label}`, lines: [dr(ACC.FABRIC_COST, amount), cr(ACC.INVENTORY, amount)] });
      default: // ORDER_REVERSAL, SALE_RETURN
        return this.post(tx, { ...base, description: `Fabric returned to stock ${label}`, lines: [dr(ACC.INVENTORY, amount), cr(ACC.FABRIC_COST, amount)] });
    }
  }

  private async postPayroll(tx: PrismaTx, id: string, key: string) {
    const p = await tx.payroll.findUniqueOrThrow({ where: { id }, include: { items: { include: { employee: { select: { name: true, code: true } } } } } });
    const lines: PostLine[] = [];
    for (const i of p.items) {
      const who = { employeeId: i.employeeId, description: `${i.employee.name} (${i.employee.code})` };
      const net = dec(i.netAmount);
      const advance = dec(i.advanceDeduction);
      lines.push(dr(ACC.SALARIES, net.plus(advance), who), cr(ACC.SALARIES_PAYABLE, net, who), cr(ACC.ADVANCES, advance, who));
    }
    return this.post(tx, {
      date: dateOnly(p.periodEnd), description: `Payroll ${p.payrollNo} (${p.periodKey}) approved`, sourceType: 'PAYROLL', sourceId: p.id, sourceKey: key,
      createdById: p.approvedById, lines,
    });
  }

  private async postSalaryPayment(tx: PrismaTx, id: string) {
    const s = await tx.salaryPayment.findUniqueOrThrow({ where: { id }, include: { employee: { select: { name: true, code: true } } } });
    const who = { employeeId: s.employeeId };
    return this.post(tx, {
      date: dateOnly(s.paymentDate), description: `Salary payment ${s.paymentNo} - ${s.employee.name} (${s.employee.code})`, sourceType: 'SALARY_PAYMENT',
      sourceId: s.id, sourceKey: `SALPAY:${s.id}`, createdById: s.createdById, lines: [dr(ACC.SALARIES_PAYABLE, s.amount, who), cr(cashAccount(s.method), s.amount)],
    });
  }

  private async postAdvance(tx: PrismaTx, id: string) {
    const a = await tx.employeeAdvance.findUniqueOrThrow({ where: { id }, include: { employee: { select: { name: true, code: true } } } });
    return this.post(tx, {
      date: dateOnly(a.advanceDate), description: `Advance ${a.advanceNo} - ${a.employee.name} (${a.employee.code})`, sourceType: 'ADVANCE', sourceId: a.id,
      sourceKey: `ADV:${a.id}`, createdById: a.createdById, lines: [dr(ACC.ADVANCES, a.amount, { employeeId: a.employeeId }), cr(cashAccount(a.paymentMethod), a.amount)],
    });
  }

  private async postAdvanceWriteOff(tx: PrismaTx, id: string) {
    const a = await tx.employeeAdvance.findUniqueOrThrow({ where: { id }, include: { employee: { select: { name: true, code: true } } } });
    return this.post(tx, {
      date: karachiToday(), description: `Advance ${a.advanceNo} written off - ${a.employee.name} (${a.employee.code})`, sourceType: 'ADVANCE', sourceId: a.id,
      sourceKey: `ADVWO:${a.id}`, lines: [dr(ACC.ADVANCE_WRITE_OFF, a.balanceAmount, { employeeId: a.employeeId }), cr(ACC.ADVANCES, a.balanceAmount, { employeeId: a.employeeId })],
    });
  }
}
