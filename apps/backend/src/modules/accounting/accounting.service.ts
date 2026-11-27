import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { ACCOUNT_SUBTYPES, ACCOUNT_TYPES, JOURNAL_SOURCES, monthLabel } from '@az/shared';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { AccountDto, JournalQueryDto, LedgerQueryDto, ManualJournalDto, UpdateAccountDto } from './dto/accounting.dto';
import { PostingService, asDate, dateOnly } from './posting.service';

type Row = { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal };
interface AccountRow { id: string; code: string; name: string; type: AccountType; subType: string | null; isSystem: boolean; isActive: boolean; description: string | null; normalBalance: string }

const SOURCE_LABEL = Object.fromEntries(JOURNAL_SOURCES.map((s) => [s.key, s.label]));
const SUBTYPE_LABEL = Object.fromEntries(ACCOUNT_SUBTYPES.map((s) => [s.key, s.label]));
const isDebitNormal = (t: string) => t === 'ASSET' || t === 'EXPENSE';
/** Balance in the account's natural direction (assets / expenses: debit - credit, others: credit - debit). */
const natural = (type: string, d: Prisma.Decimal, c: Prisma.Decimal) => (isDebitNormal(type) ? d.minus(c) : c.minus(d));

function addDays(date: string, days: number) {
  const d = asDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}
function monthEnd(key: string) {
  const [y, m] = key.split('-').map(Number);
  return dateOnly(new Date(Date.UTC(y, m, 0)));
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService, private readonly posting: PostingService, private readonly audit: AuditService) {}

  /** Sums of posted lines per account between two dates (inclusive, either end optional). */
  private async sums(from?: string, to?: string): Promise<Map<string, Row>> {
    const conds: Prisma.Sql[] = [Prisma.sql`j.status <> 'DRAFT'`];
    if (from) conds.push(Prisma.sql`j."entryDate" >= ${asDate(from)}::date`);
    if (to) conds.push(Prisma.sql`j."entryDate" <= ${asDate(to)}::date`);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT l."accountId" AS "accountId", COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit
      FROM journal_entry_lines l JOIN journal_entries j ON j.id = l."journalEntryId"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY l."accountId"`;
    return new Map(rows.map((r) => [r.accountId, { accountId: r.accountId, debit: dec(r.debit), credit: dec(r.credit) }]));
  }

  private accountsList() {
    return this.prisma.chartOfAccount.findMany({ orderBy: { code: 'asc' } }) as Promise<AccountRow[]>;
  }

  private presentAccount(a: AccountRow, s?: Row) {
    const d = s?.debit ?? dec(0);
    const c = s?.credit ?? dec(0);
    return {
      id: a.id, code: a.code, name: a.name, type: a.type, subType: a.subType, subTypeLabel: a.subType ? SUBTYPE_LABEL[a.subType] ?? a.subType : null,
      isSystem: a.isSystem, isActive: a.isActive, description: a.description, debit: moneyString(d), credit: moneyString(c), balance: moneyString(natural(a.type, d, c)),
    };
  }

  // ================================================================= sync & overview

  async syncNow() {
    const r = await this.posting.sync();
    return { ...r, failed: r.failed.slice(0, 20), failedCount: r.failed.length };
  }

  async overview() {
    await this.posting.syncQuietly();
    const today = karachiToday();
    const monthStart = `${today.slice(0, 7)}-01`;
    const [accounts, all, month] = await Promise.all([this.accountsList(), this.sums(undefined, today), this.sums(monthStart, today)]);
    const bal = (codeFilter: (a: AccountRow) => boolean, sums: Map<string, Row>) =>
      accounts.filter(codeFilter).reduce((t, a) => t.plus(natural(a.type, sums.get(a.id)?.debit ?? dec(0), sums.get(a.id)?.credit ?? dec(0))), dec(0));
    const cash = accounts.filter((a) => a.subType === 'CASH').map((a) => ({ id: a.id, code: a.code, name: a.name, balance: moneyString(natural(a.type, all.get(a.id)?.debit ?? dec(0), all.get(a.id)?.credit ?? dec(0))) }));
    const income = bal((a) => a.type === 'INCOME', month);
    const expenses = bal((a) => a.type === 'EXPENSE', month);
    const journalCount = await this.prisma.journalEntry.count({ where: { status: { not: 'DRAFT' } } });
    const last = this.posting.last;
    return {
      today, monthLabel: monthLabel(today.slice(0, 7)),
      cash, totalCash: moneyString(cash.reduce((t, c) => t.plus(c.balance), dec(0))),
      receivables: moneyString(bal((a) => a.code === '1100', all)),
      payables: moneyString(bal((a) => a.code === '2000', all)),
      inventory: moneyString(bal((a) => a.code === '1200', all)),
      month: { income: moneyString(income), expenses: moneyString(expenses), profit: moneyString(income.minus(expenses)) },
      journalCount,
      sync: last ? { at: last.at, posted: last.posted, failedCount: last.failed.length, failed: last.failed.slice(0, 10) } : null,
    };
  }

  // ================================================================= chart of accounts

  async accounts() {
    await this.posting.syncQuietly();
    const [rows, sums] = await Promise.all([this.accountsList(), this.sums()]);
    return rows.map((a) => this.presentAccount(a, sums.get(a.id)));
  }

  async createAccount(dto: AccountDto, ctx: RequestContext) {
    if (await this.prisma.chartOfAccount.findUnique({ where: { code: dto.code } })) throw new ConflictException(`Account code ${dto.code} is already used`);
    const sub = ACCOUNT_SUBTYPES.find((s) => s.key === dto.subType);
    if (!sub) throw new BadRequestException('Choose a valid group');
    const type = sub.type;
    const normal = dto.subType === 'CONTRA_INCOME' ? 'DEBIT' : ACCOUNT_TYPES.find((t) => t.key === type)!.normal;
    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.chartOfAccount.create({ data: { code: dto.code, name: dto.name, type, subType: dto.subType, normalBalance: normal, description: dto.description || null } });
      await this.audit.log({ action: 'CREATE', module: 'accounting', recordId: row.id, newValues: { code: row.code, name: row.name, type } }, ctx, tx);
      return row;
    });
    return this.presentAccount(a as AccountRow);
  }

  async updateAccount(id: string, dto: UpdateAccountDto, ctx: RequestContext) {
    const a = await this.prisma.chartOfAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Account not found');
    if (a.isSystem && dto.isActive === false) throw new BadRequestException('System accounts are used by automatic posting and cannot be switched off');
    const row = await this.prisma.$transaction(async (tx) => {
      const u = await tx.chartOfAccount.update({ where: { id }, data: { name: dto.name ?? undefined, description: dto.description === undefined ? undefined : dto.description || null, isActive: dto.isActive ?? undefined } });
      await this.audit.log({ action: 'UPDATE', module: 'accounting', recordId: id, oldValues: { name: a.name, isActive: a.isActive }, newValues: { name: u.name, isActive: u.isActive } }, ctx, tx);
      return u;
    });
    return this.presentAccount(row as AccountRow);
  }

  /** Account statement with opening balance and running balance. */
  async ledger(id: string, q: LedgerQueryDto) {
    await this.posting.syncQuietly();
    const a = (await this.prisma.chartOfAccount.findUnique({ where: { id } })) as AccountRow | null;
    if (!a) throw new NotFoundException('Account not found');
    const to = q.to ?? karachiToday();
    const from = q.from ?? `${to.slice(0, 7)}-01`;
    if (from > to) throw new BadRequestException('"From" date must be before "To" date');
    const before = (await this.sums(undefined, addDays(from, -1))).get(a.id);
    const opening = natural(a.type, before?.debit ?? dec(0), before?.credit ?? dec(0));
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { accountId: id, journalEntry: { status: { not: 'DRAFT' }, entryDate: { gte: asDate(from), lte: asDate(to) } } },
      include: {
        journalEntry: { select: { id: true, entryNo: true, entryDate: true, description: true, sourceType: true, status: true, createdAt: true } },
        customer: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } }, employee: { select: { id: true, name: true } },
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { journalEntry: { createdAt: 'asc' } }, { lineNo: 'asc' }],
      take: 5000,
    });
    let running = opening;
    let td = dec(0);
    let tc = dec(0);
    const entries = lines.map((l) => {
      running = running.plus(natural(a.type, dec(l.debit), dec(l.credit)));
      td = td.plus(l.debit);
      tc = tc.plus(l.credit);
      return {
        id: l.id, entryId: l.journalEntry.id, entryNo: l.journalEntry.entryNo, date: dateOnly(l.journalEntry.entryDate), description: l.description ? `${l.journalEntry.description} · ${l.description}` : l.journalEntry.description,
        source: SOURCE_LABEL[l.journalEntry.sourceType] ?? l.journalEntry.sourceType, party: l.customer?.name ?? l.supplier?.name ?? l.employee?.name ?? null,
        debit: moneyString(l.debit), credit: moneyString(l.credit), balance: moneyString(running),
      };
    });
    return {
      account: this.presentAccount(a), from, to, opening: moneyString(opening), closing: moneyString(running),
      totals: { debit: moneyString(td), credit: moneyString(tc) }, entries,
    };
  }

  // ================================================================= journal

  async journals(q: JournalQueryDto) {
    await this.posting.syncQuietly();
    const where: Prisma.JournalEntryWhereInput = { status: { not: 'DRAFT' } };
    if (q.from || q.to) where.entryDate = { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) };
    if (q.sourceType) where.sourceType = q.sourceType as Prisma.EnumJournalSourceFilter['equals'];
    if (q.search) where.OR = [{ entryNo: { contains: q.search.trim(), mode: 'insensitive' } }, { description: { contains: q.search.trim(), mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([
      this.prisma.journalEntry.findMany({ where, orderBy: [{ entryDate: q.sortOrder }, { createdAt: q.sortOrder }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return paginate(rows.map((j) => ({
      id: j.id, entryNo: j.entryNo, date: dateOnly(j.entryDate), description: j.description, sourceType: j.sourceType, source: SOURCE_LABEL[j.sourceType] ?? j.sourceType,
      status: j.status, amount: moneyString(j.totalDebit), isReversal: !!j.reversalOfId,
    })), total, q);
  }

  async journal(id: string) {
    const j = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { lineNo: 'asc' }, include: { account: { select: { id: true, code: true, name: true } }, customer: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } }, employee: { select: { id: true, name: true } } } },
        reversalOf: { select: { id: true, entryNo: true } }, reversedBy: { select: { id: true, entryNo: true } },
        createdBy: { select: { id: true, fullName: true } }, period: { select: { name: true, status: true } },
      },
    });
    if (!j) throw new NotFoundException('Journal entry not found');
    return {
      id: j.id, entryNo: j.entryNo, date: dateOnly(j.entryDate), description: j.description, sourceType: j.sourceType, source: SOURCE_LABEL[j.sourceType] ?? j.sourceType,
      sourceId: j.sourceId, status: j.status, totalDebit: moneyString(j.totalDebit), totalCredit: moneyString(j.totalCredit), postedAt: j.postedAt, createdBy: j.createdBy,
      reversalOf: j.reversalOf, reversedBy: j.reversedBy, canReverse: j.status === 'POSTED' && j.sourceType === 'MANUAL' && !j.reversalOfId,
      lines: j.lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, account: l.account, debit: moneyString(l.debit), credit: moneyString(l.credit), description: l.description,
        party: l.customer ? { kind: 'customer', ...l.customer } : l.supplier ? { kind: 'supplier', ...l.supplier } : l.employee ? { kind: 'employee', ...l.employee } : null,
      })),
    };
  }

  async createManual(dto: ManualJournalDto, ctx: RequestContext) {
    const done = await this.prisma.journalEntry.findUnique({ where: { sourceKey: `MANUAL:${dto.idempotencyKey}` } });
    if (done) return this.journal(done.id);
    const date = dto.entryDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Date cannot be in the future');
    let debit = dec(0);
    let credit = dec(0);
    for (const l of dto.lines) {
      const d = money(l.debit ?? 0);
      const c = money(l.credit ?? 0);
      if (d.gt(0) === c.gt(0)) throw new BadRequestException('Each line needs either a debit or a credit amount (not both)');
      debit = debit.plus(d);
      credit = credit.plus(c);
    }
    if (!debit.eq(credit)) throw new BadRequestException(`Debits (${moneyString(debit)}) and credits (${moneyString(credit)}) must be equal`);
    const ids = [...new Set(dto.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { id: { in: ids } } });
    if (accounts.length !== ids.length) throw new BadRequestException('One of the accounts was not found');
    const inactive = accounts.find((a) => !a.isActive);
    if (inactive) throw new BadRequestException(`Account ${inactive.code} ${inactive.name} is switched off`);
    const code = new Map(accounts.map((a) => [a.id, a.code]));
    if (await this.posting.isClosed(this.prisma, date)) throw new BadRequestException(`The month of ${date} is closed. Reopen it or choose another date.`);
    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await this.posting.post(tx, {
        date, description: dto.description, sourceType: 'MANUAL', sourceKey: `MANUAL:${dto.idempotencyKey}`, createdById: ctx.userId,
        lines: dto.lines.map((l) => ({ code: code.get(l.accountId)!, debit: l.debit ?? 0, credit: l.credit ?? 0, description: l.description || null })),
      });
      if (!e) throw new BadRequestException('Enter at least two lines with amounts');
      await this.audit.log({ action: 'CREATE', module: 'accounting', recordId: e.id, newValues: { entryNo: e.entryNo, amount: moneyString(debit), description: dto.description } }, ctx, tx);
      return e;
    });
    return this.journal(entry.id);
  }

  async reverseManual(id: string, reason: string, ctx: RequestContext) {
    const j = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('Journal entry not found');
    if (j.sourceType !== 'MANUAL' || j.reversalOfId) throw new BadRequestException('Automatic entries are corrected from their document (cancel the expense, reverse the receipt, and so on)');
    if (j.status !== 'POSTED') throw new BadRequestException('This entry is already reversed');
    if (await this.posting.isClosed(this.prisma, karachiToday())) throw new BadRequestException('This month is closed');
    await this.prisma.$transaction(async (tx) => {
      await this.posting.reverse(tx, id, { description: `Reversal of ${j.entryNo}: ${reason}`, createdById: ctx.userId });
      await this.audit.log({ action: 'REVERSE', module: 'accounting', recordId: id, newValues: { entryNo: j.entryNo, reason } }, ctx, tx);
    });
    return this.journal(id);
  }

  // ================================================================= reports

  async trialBalance(asOf?: string) {
    await this.posting.syncQuietly();
    const to = asOf ?? karachiToday();
    const [accounts, sums] = await Promise.all([this.accountsList(), this.sums(undefined, to)]);
    let td = dec(0);
    let tc = dec(0);
    const rows = accounts.flatMap((a) => {
      const s = sums.get(a.id);
      if (!s) return [];
      const net = s.debit.minus(s.credit);
      if (net.eq(0)) return [];
      const debit = net.gt(0) ? net : dec(0);
      const credit = net.lt(0) ? net.abs() : dec(0);
      td = td.plus(debit);
      tc = tc.plus(credit);
      return [{ id: a.id, code: a.code, name: a.name, type: a.type, debit: moneyString(debit), credit: moneyString(credit) }];
    });
    return { asOf: to, rows, totals: { debit: moneyString(td), credit: moneyString(tc), balanced: td.eq(tc) } };
  }

  async profitAndLoss(fromQ?: string, toQ?: string) {
    await this.posting.syncQuietly();
    const to = toQ ?? karachiToday();
    const from = fromQ ?? `${to.slice(0, 7)}-01`;
    if (from > to) throw new BadRequestException('"From" date must be before "To" date');
    const [accounts, sums] = await Promise.all([this.accountsList(), this.sums(from, to)]);
    const line = (a: AccountRow) => {
      const s = sums.get(a.id);
      return { id: a.id, code: a.code, name: a.name, amount: a.type === 'INCOME' ? dec(s?.credit).minus(dec(s?.debit)) : dec(s?.debit).minus(dec(s?.credit)) };
    };
    const group = (filter: (a: AccountRow) => boolean) => {
      const rows = accounts.filter(filter).map(line).filter((r) => !r.amount.eq(0));
      const total = rows.reduce((t, r) => t.plus(r.amount), dec(0));
      return { rows: rows.map((r) => ({ ...r, amount: moneyString(r.amount) })), total };
    };
    const sales = group((a) => a.type === 'INCOME' && (a.subType === 'OPERATING_INCOME' || a.subType === 'CONTRA_INCOME' || !a.subType));
    const cogs = group((a) => a.type === 'EXPENSE' && a.subType === 'COGS');
    const labour = group((a) => a.type === 'EXPENSE' && a.subType === 'DIRECT_LABOUR');
    const operating = group((a) => a.type === 'EXPENSE' && a.subType !== 'COGS' && a.subType !== 'DIRECT_LABOUR');
    const other = group((a) => a.type === 'INCOME' && a.subType === 'OTHER_INCOME');
    const gross = sales.total.minus(cogs.total);
    const net = gross.minus(labour.total).minus(operating.total).plus(other.total);
    const out = (g: { rows: unknown[]; total: Prisma.Decimal }) => ({ rows: g.rows, total: moneyString(g.total) });
    return {
      from, to, sales: out(sales), costOfSales: out(cogs), grossProfit: moneyString(gross), salaries: out(labour), expenses: out(operating), otherIncome: out(other),
      netProfit: moneyString(net),
      margin: sales.total.gt(0) ? net.div(sales.total).times(100).toDecimalPlaces(1).toString() : null,
    };
  }

  async balanceSheet(asOf?: string) {
    await this.posting.syncQuietly();
    const to = asOf ?? karachiToday();
    const [accounts, sums] = await Promise.all([this.accountsList(), this.sums(undefined, to)]);
    const section = (type: AccountType) => {
      const rows = accounts.filter((a) => a.type === type).map((a) => {
        const s = sums.get(a.id);
        return { id: a.id, code: a.code, name: a.name, subType: a.subType, amount: natural(a.type, dec(s?.debit), dec(s?.credit)) };
      }).filter((r) => !r.amount.eq(0));
      return { rows, total: rows.reduce((t, r) => t.plus(r.amount), dec(0)) };
    };
    const assets = section('ASSET');
    const liabilities = section('LIABILITY');
    const equity = section('EQUITY');
    const income = section('INCOME').total;
    const expense = section('EXPENSE').total;
    const profit = income.minus(expense);
    const totalEquity = equity.total.plus(profit);
    const fmt = (g: { rows: { amount: Prisma.Decimal }[]; total: Prisma.Decimal }) => ({ rows: g.rows.map((r) => ({ ...r, amount: moneyString(r.amount) })), total: moneyString(g.total) });
    return {
      asOf: to, assets: fmt(assets), liabilities: fmt(liabilities), equity: { ...fmt(equity), profitToDate: moneyString(profit), total: moneyString(totalEquity) },
      totalLiabilitiesAndEquity: moneyString(liabilities.total.plus(totalEquity)), balanced: assets.total.eq(liabilities.total.plus(totalEquity)),
    };
  }

  /** Direct-method cash flow: money in and out of cash, bank and wallet accounts, grouped by what caused it. */
  async cashFlow(fromQ?: string, toQ?: string) {
    await this.posting.syncQuietly();
    const to = toQ ?? karachiToday();
    const from = fromQ ?? `${to.slice(0, 7)}-01`;
    if (from > to) throw new BadRequestException('"From" date must be before "To" date');
    const cashAccounts = await this.prisma.chartOfAccount.findMany({ where: { subType: 'CASH' }, orderBy: { code: 'asc' } });
    const ids = cashAccounts.map((a) => a.id);
    if (!ids.length) return { from, to, opening: '0.00', closing: '0.00', inflow: [], outflow: [], totalIn: '0.00', totalOut: '0.00', net: '0.00', accounts: [] };
    const before = await this.sums(undefined, addDays(from, -1));
    const after = await this.sums(undefined, to);
    const balanceOf = (m: Map<string, Row>) => ids.reduce((t, id) => t.plus(dec(m.get(id)?.debit).minus(dec(m.get(id)?.credit))), dec(0));
    const rows = await this.prisma.$queryRaw<{ sourceType: string; reversalSource: string | null; delta: Prisma.Decimal }[]>`
      SELECT j."sourceType"::text AS "sourceType", o."sourceType"::text AS "reversalSource", SUM(l.debit - l.credit) AS delta
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l."journalEntryId"
      LEFT JOIN journal_entries o ON o.id = j."reversalOfId"
      WHERE j.status <> 'DRAFT' AND l."accountId" = ANY(${ids}::uuid[])
        AND j."entryDate" >= ${asDate(from)}::date AND j."entryDate" <= ${asDate(to)}::date
      GROUP BY 1, 2`;
    const LABEL: Record<string, string> = {
      PAYMENT: 'Received from customers', REFUND: 'Refunds to customers', REVERSAL: 'Reversed receipts', SUPPLIER_PAYMENT: 'Paid to suppliers', SALARY_PAYMENT: 'Salaries paid',
      ADVANCE: 'Advances to employees', EXPENSE: 'Shop expenses', MANUAL: 'Owner & other entries', OPENING: 'Opening balances', PURCHASE: 'Purchases',
    };
    const bySource = new Map<string, Prisma.Decimal>();
    for (const r of rows) {
      const key = r.sourceType === 'REVERSAL' && r.reversalSource ? (r.reversalSource === 'EXPENSE' ? 'EXPENSE' : r.reversalSource === 'MANUAL' ? 'MANUAL' : 'REVERSAL') : r.sourceType;
      bySource.set(key, (bySource.get(key) ?? dec(0)).plus(dec(r.delta)));
    }
    const list = [...bySource.entries()].filter(([, v]) => !v.eq(0)).map(([k, v]) => ({ key: k, label: LABEL[k] ?? SOURCE_LABEL[k] ?? k, amount: v }));
    const inflow = list.filter((l) => l.amount.gt(0)).sort((a, b) => b.amount.cmp(a.amount));
    const outflow = list.filter((l) => l.amount.lt(0)).sort((a, b) => a.amount.cmp(b.amount));
    const totalIn = inflow.reduce((t, l) => t.plus(l.amount), dec(0));
    const totalOut = outflow.reduce((t, l) => t.plus(l.amount.abs()), dec(0));
    const opening = balanceOf(before);
    const closing = balanceOf(after);
    return {
      from, to, opening: moneyString(opening), closing: moneyString(closing),
      inflow: inflow.map((l) => ({ ...l, amount: moneyString(l.amount) })), outflow: outflow.map((l) => ({ ...l, amount: moneyString(l.amount.abs()) })),
      totalIn: moneyString(totalIn), totalOut: moneyString(totalOut), net: moneyString(totalIn.minus(totalOut)),
      accounts: cashAccounts.map((a) => ({
        id: a.id, code: a.code, name: a.name,
        opening: moneyString(dec(before.get(a.id)?.debit).minus(dec(before.get(a.id)?.credit))), closing: moneyString(dec(after.get(a.id)?.debit).minus(dec(after.get(a.id)?.credit))),
      })),
    };
  }

  // ================================================================= periods (month closing)

  async periods() {
    const today = karachiToday();
    const first = await this.prisma.journalEntry.findFirst({ where: { status: { not: 'DRAFT' } }, orderBy: { entryDate: 'asc' }, select: { entryDate: true } });
    const stored = await this.prisma.accountingPeriod.findMany();
    const byStart = new Map(stored.map((p) => [dateOnly(p.startDate), p]));
    const startKey = (first ? dateOnly(first.entryDate) : today).slice(0, 7);
    const months: string[] = [];
    let k = today.slice(0, 7);
    const earliest = [startKey, ...stored.map((p) => dateOnly(p.startDate).slice(0, 7))].sort()[0];
    while (k >= earliest && months.length < 120) {
      months.push(k);
      const [y, m] = k.split('-').map(Number);
      k = dateOnly(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
    }
    const counts = await this.prisma.$queryRaw<{ month: string; n: number; amount: Prisma.Decimal }[]>`
      SELECT to_char("entryDate", 'YYYY-MM') AS month, COUNT(*)::int AS n, COALESCE(SUM("totalDebit"),0) AS amount
      FROM journal_entries WHERE status <> 'DRAFT' GROUP BY 1`;
    const cmap = new Map(counts.map((c) => [c.month, c]));
    const users = await this.prisma.user.findMany({ where: { id: { in: stored.map((p) => p.closedById).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } });
    const uname = new Map(users.map((u) => [u.id, u.fullName]));
    return months.map((m) => {
      const p = byStart.get(`${m}-01`);
      return {
        month: m, label: monthLabel(m), status: p?.status ?? 'OPEN', closedAt: p?.closedAt ?? null, closedBy: p?.closedById ? uname.get(p.closedById) ?? null : null,
        entries: cmap.get(m)?.n ?? 0, amount: moneyString(cmap.get(m)?.amount ?? 0),
      };
    });
  }

  async setPeriod(month: string, action: 'close' | 'reopen' | 'lock', ctx: RequestContext) {
    const today = karachiToday();
    if (month > today.slice(0, 7)) throw new BadRequestException('Future months cannot be closed');
    const start = `${month}-01`;
    const end = monthEnd(month);
    if (action !== 'reopen') {
      const r = await this.posting.sync();
      const blocking = r.failed.length;
      if (blocking) throw new BadRequestException(`${blocking} document(s) could not be posted yet. Open Accounting > Overview to see why, fix them, then close the month.`);
    }
    const p = await this.prisma.accountingPeriod.findUnique({ where: { startDate_endDate: { startDate: asDate(start), endDate: asDate(end) } } });
    if (p?.status === 'LOCKED') throw new BadRequestException(`${monthLabel(month)} is locked for ever and cannot be changed`);
    if (action === 'reopen' && (!p || p.status === 'OPEN')) throw new BadRequestException(`${monthLabel(month)} is already open`);
    if (action === 'close' && p?.status === 'CLOSED') throw new BadRequestException(`${monthLabel(month)} is already closed`);
    if (action === 'lock' && p?.status !== 'CLOSED') throw new BadRequestException('Close the month first, then lock it');
    const status = action === 'close' ? 'CLOSED' : action === 'lock' ? 'LOCKED' : 'OPEN';
    await this.prisma.$transaction(async (tx) => {
      const row = p
        ? await tx.accountingPeriod.update({ where: { id: p.id }, data: { status, closedById: status === 'OPEN' ? null : ctx.userId, closedAt: status === 'OPEN' ? null : new Date() } })
        : await tx.accountingPeriod.create({ data: { name: monthLabel(month), startDate: asDate(start), endDate: asDate(end), status, closedById: ctx.userId, closedAt: new Date() } });
      await tx.journalEntry.updateMany({ where: { periodId: null, entryDate: { gte: asDate(start), lte: asDate(end) }, status: 'DRAFT' }, data: { periodId: row.id } });
      await this.audit.log({ action: action.toUpperCase(), module: 'accounting', recordId: row.id, oldValues: { status: p?.status ?? 'OPEN' }, newValues: { month, status } }, ctx, tx);
    });
    return this.periods();
  }
}
