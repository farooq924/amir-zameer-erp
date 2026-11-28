import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant, byCompany } from '../../common/tenant';
import { Prisma, RecurrenceFrequency } from '@prisma/client';
import { monthLabel } from '@az/shared';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService, PrismaTx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { dec, money, moneyString } from '../../common/utils/money';
import { PostingService, asDate, dateOnly } from '../accounting/posting.service';
import {
  CreateExpenseDto, ExpenseCategoryDto, ExpenseQueryDto, RecurringExpenseDto, UpdateExpenseCategoryDto, UpdateExpenseDto, UpdateRecurringExpenseDto,
} from './dto/expense.dto';

const include = {
  category: { select: { id: true, name: true, account: { select: { id: true, code: true, name: true } } } },
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  recurringExpense: { select: { id: true, description: true, frequency: true } },
} satisfies Prisma.ExpenseInclude;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof include }>;

function present(x: ExpenseRow) {
  return {
    id: x.id, expenseNo: x.expenseNo, expenseDate: dateOnly(x.expenseDate), category: x.category, description: x.description, amount: moneyString(x.amount),
    paymentMethod: x.paymentMethod, paidTo: x.paidTo, reference: x.reference, notes: x.notes, status: x.status, approvedBy: x.approvedBy, approvedAt: x.approvedAt,
    recurring: x.recurringExpense, createdBy: x.createdBy, createdAt: x.createdAt, version: x.version,
  };
}

export function canApprove(user: AuthUser | null | undefined) {
  return !!user && (user.isOwner || user.permissions.includes('expenses.approve'));
}

/** Next date of a recurring expense. Monthly dates keep their day where possible (31 Jan -> 28/29 Feb -> 31 Mar). */
export function nextDate(date: string, freq: RecurrenceFrequency, dayOfMonth?: number | null): string {
  const d = asDate(date);
  if (freq === 'WEEKLY') {
    d.setUTCDate(d.getUTCDate() + 7);
    return dateOnly(d);
  }
  const months = freq === 'MONTHLY' ? 1 : freq === 'QUARTERLY' ? 3 : 12;
  const day = dayOfMonth ?? d.getUTCDate();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dateOnly(new Date(Date.UTC(y, m, Math.min(day, last))));
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly posting: PostingService,
  ) {}

  // ================================================================= expenses

  async list(q: ExpenseQueryDto) {
    const where: Prisma.ExpenseWhereInput = { deletedAt: null };
    if (q.status && q.status !== 'ALL') where.status = q.status as Prisma.EnumExpenseStatusFilter['equals'];
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.from || q.to) where.expenseDate = { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) };
    if (q.search) {
      const s = q.search.trim();
      where.OR = [{ expenseNo: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }, { paidTo: { contains: s, mode: 'insensitive' } }, { reference: { contains: s, mode: 'insensitive' } }];
    }
    const [rows, total, sum] = await Promise.all([
      this.prisma.expense.findMany({ where, include, orderBy: [{ expenseDate: q.sortOrder }, { createdAt: q.sortOrder }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where: { ...where, status: where.status ?? { in: ['APPROVED', 'PENDING_APPROVAL'] } }, _sum: { amount: true } }),
    ]);
    return { ...paginate(rows.map(present), total, q), totalAmount: moneyString(sum._sum.amount) };
  }

  /** This month at a glance and the last months by category (approved expenses only). */
  async summary(monthQ?: string) {
    const month = monthQ ?? karachiToday().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const start = asDate(`${month}-01`);
    const end = new Date(Date.UTC(y, m, 0));
    const [byCategory, pending, recurringDue, trend] = await Promise.all([
      this.prisma.expense.groupBy({ by: ['categoryId'], where: { deletedAt: null, status: 'APPROVED', expenseDate: { gte: start, lte: end } }, _sum: { amount: true }, _count: true }),
      this.prisma.expense.aggregate({ where: { deletedAt: null, status: 'PENDING_APPROVAL' }, _sum: { amount: true }, _count: true }),
      this.prisma.recurringExpense.count({ where: { isActive: true, nextRunDate: { lte: asDate(karachiToday()) } } }),
      this.prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
        SELECT to_char("expenseDate", 'YYYY-MM') AS month, SUM(amount) AS amount FROM expenses
        WHERE "companyId" = ${Tenant.require()}::uuid AND status = 'APPROVED' AND "deletedAt" IS NULL AND "expenseDate" >= (${start}::date - interval '5 months')
        GROUP BY 1 ORDER BY 1`,
    ]);
    const cats = await this.prisma.expenseCategory.findMany({ where: { id: { in: byCategory.map((c) => c.categoryId) } }, select: { id: true, name: true } });
    const name = new Map(cats.map((c) => [c.id, c.name]));
    const total = byCategory.reduce((t, c) => t.plus(dec(c._sum.amount)), dec(0));
    return {
      month, monthLabel: monthLabel(month), total: moneyString(total), count: byCategory.reduce((t, c) => t + c._count, 0),
      pendingCount: pending._count, pendingAmount: moneyString(pending._sum.amount), recurringDue,
      byCategory: byCategory.map((c) => ({ categoryId: c.categoryId, name: name.get(c.categoryId) ?? '-', amount: moneyString(c._sum.amount), count: c._count }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
      trend: trend.map((t) => ({ month: t.month, label: monthLabel(t.month), amount: moneyString(t.amount) })),
    };
  }

  async get(id: string) {
    const x = await this.prisma.expense.findFirst({ where: { id, deletedAt: null }, include });
    if (!x) throw new NotFoundException('Expense not found');
    const journal = await this.prisma.journalEntry.findUnique({ where: { sourceKey: `EXP:${id}` }, select: { id: true, entryNo: true, status: true } });
    return { ...present(x), journal };
  }

  async create(dto: CreateExpenseDto, user: AuthUser, ctx: RequestContext) {
    const done = await this.prisma.expense.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (done) return this.get(done.id);
    const date = dto.expenseDate ?? karachiToday();
    if (date > karachiToday()) throw new BadRequestException('Expense date cannot be in the future');
    const amount = money(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    await this.activeCategory(dto.categoryId);
    const approve = canApprove(user);
    const id = await this.prisma.$transaction(async (tx) => {
      const x = await this.insert(tx, { ...dto, expenseDate: date, amount }, approve, ctx.userId, null);
      await this.audit.log({ action: 'CREATE', module: 'expenses', recordId: x.id, newValues: { expenseNo: x.expenseNo, amount: moneyString(amount), status: x.status, description: dto.description } }, ctx, tx);
      return x.id;
    });
    return this.get(id);
  }

  private async insert(
    tx: PrismaTx,
    d: { expenseDate: string; categoryId: string; description: string; amount: Prisma.Decimal; paymentMethod: CreateExpenseDto['paymentMethod']; paidTo?: string; reference?: string; notes?: string; idempotencyKey: string },
    approve: boolean, userId: string | null, recurringId: string | null,
  ) {
    const expenseNo = await this.sequences.next({ key: 'EXPENSE', prefix: 'EXP', period: d.expenseDate.slice(0, 4), padding: 5 }, tx);
    const x = await tx.expense.create({
      data: {
        expenseNo, expenseDate: asDate(d.expenseDate), categoryId: d.categoryId, description: d.description, amount: d.amount, paymentMethod: d.paymentMethod,
        paidTo: d.paidTo || null, reference: d.reference || null, notes: d.notes || null, status: approve ? 'APPROVED' : 'PENDING_APPROVAL',
        approvedById: approve ? userId : null, approvedAt: approve ? new Date() : null, idempotencyKey: d.idempotencyKey, createdById: userId, recurringExpenseId: recurringId,
      },
    });
    if (approve) await this.posting.postExpense(tx, x.id);
    return x;
  }

  async update(id: string, dto: UpdateExpenseDto, ctx: RequestContext) {
    const x = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!x) throw new NotFoundException('Expense not found');
    if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException('Only expenses waiting for approval can be edited. Cancel an approved expense and record it again.');
    if (dto.version !== x.version) throw new ConflictException('Someone else changed this expense. Reload and try again.');
    if (dto.expenseDate && dto.expenseDate > karachiToday()) throw new BadRequestException('Expense date cannot be in the future');
    if (dto.categoryId) await this.activeCategory(dto.categoryId);
    const amount = dto.amount !== undefined ? money(dto.amount) : undefined;
    if (amount && amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.expense.updateMany({
        where: { id, version: dto.version },
        data: {
          expenseDate: dto.expenseDate ? asDate(dto.expenseDate) : undefined, categoryId: dto.categoryId, description: dto.description, amount, paymentMethod: dto.paymentMethod,
          paidTo: dto.paidTo === undefined ? undefined : dto.paidTo || null, reference: dto.reference === undefined ? undefined : dto.reference || null,
          notes: dto.notes === undefined ? undefined : dto.notes || null, version: { increment: 1 },
        },
      });
      if (!r.count) throw new ConflictException('Someone else changed this expense. Reload and try again.');
      await this.audit.log({ action: 'UPDATE', module: 'expenses', recordId: id, oldValues: { amount: moneyString(x.amount), description: x.description }, newValues: { amount: amount ? moneyString(amount) : undefined, description: dto.description } }, ctx, tx);
    });
    return this.get(id);
  }

  async approve(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const x = await this.lock(tx, id);
      if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException('Only expenses waiting for approval can be approved');
      await tx.expense.update({ where: { id }, data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date(), version: { increment: 1 } } });
      await this.posting.postExpense(tx, id);
      await this.audit.log({ action: 'APPROVE', module: 'expenses', recordId: id, newValues: { expenseNo: x.expenseNo, amount: moneyString(x.amount) } }, ctx, tx);
    });
    return this.get(id);
  }

  async reject(id: string, reason: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const x = await this.lock(tx, id);
      if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException('Only expenses waiting for approval can be rejected');
      await tx.expense.update({ where: { id }, data: { status: 'REJECTED', notes: [x.notes, `Rejected: ${reason}`].filter(Boolean).join('\n'), version: { increment: 1 } } });
      await this.audit.log({ action: 'REJECT', module: 'expenses', recordId: id, newValues: { expenseNo: x.expenseNo, reason } }, ctx, tx);
    });
    return this.get(id);
  }

  /** Cancels an expense. An approved one gets a reversal entry so the books go back to how they were. */
  async cancel(id: string, reason: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const x = await this.lock(tx, id);
      if (x.status !== 'APPROVED' && x.status !== 'PENDING_APPROVAL') throw new BadRequestException('This expense is already closed');
      await tx.expense.update({ where: { id }, data: { status: 'CANCELLED', notes: [x.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n'), version: { increment: 1 } } });
      if (x.status === 'APPROVED') await this.posting.reverseExpense(tx, id, ctx.userId);
      await this.audit.log({ action: 'CANCEL', module: 'expenses', recordId: id, oldValues: { status: x.status }, newValues: { expenseNo: x.expenseNo, amount: moneyString(x.amount), reason } }, ctx, tx);
    });
    return this.get(id);
  }

  private async lock(tx: PrismaTx, id: string) {
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
    const x = await tx.expense.findFirst({ where: { id, deletedAt: null } });
    if (!x) throw new NotFoundException('Expense not found');
    return x;
  }

  private async activeCategory(id: string) {
    const c = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!c) throw new BadRequestException('Category not found');
    if (!c.isActive) throw new BadRequestException(`Category "${c.name}" is switched off`);
    return c;
  }

  // ================================================================= categories

  async categories() {
    const [rows, counts] = await Promise.all([
      this.prisma.expenseCategory.findMany({ orderBy: { name: 'asc' }, include: { account: { select: { id: true, code: true, name: true } } } }),
      this.prisma.expense.groupBy({ by: ['categoryId'], where: { deletedAt: null }, _count: true }),
    ]);
    const n = new Map(counts.map((c) => [c.categoryId, c._count]));
    return rows.map((c) => ({ id: c.id, name: c.name, account: c.account, isActive: c.isActive, expenses: n.get(c.id) ?? 0 }));
  }

  async createCategory(dto: ExpenseCategoryDto, ctx: RequestContext) {
    await this.assertCategoryName(dto.name);
    const accountId = await this.expenseAccount(dto.accountId);
    const c = await this.prisma.$transaction(async (tx) => {
      const row = await tx.expenseCategory.create({ data: { name: dto.name, accountId } });
      await this.audit.log({ action: 'CREATE', module: 'expenses', recordId: row.id, newValues: { category: row.name } }, ctx, tx);
      return row;
    });
    return (await this.categories()).find((x) => x.id === c.id);
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto, ctx: RequestContext) {
    const c = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    if (dto.name && dto.name.toLowerCase() !== c.name.toLowerCase()) await this.assertCategoryName(dto.name, id);
    const accountId = dto.accountId ? await this.expenseAccount(dto.accountId) : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.expenseCategory.update({ where: { id }, data: { name: dto.name, accountId, isActive: dto.isActive } });
      await this.audit.log({ action: 'UPDATE', module: 'expenses', recordId: id, oldValues: { name: c.name, isActive: c.isActive }, newValues: { name: dto.name, isActive: dto.isActive, accountId } }, ctx, tx);
    });
    return (await this.categories()).find((x) => x.id === id);
  }

  private async assertCategoryName(name: string, excludeId?: string) {
    const dup = await this.prisma.expenseCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`A category named "${dup.name}" already exists`);
  }

  private async expenseAccount(id?: string) {
    if (!id) {
      const misc = await this.prisma.chartOfAccount.findUnique({ where: { companyId_code: byCompany({ code: '5390' }) } });
      return misc?.id ?? null;
    }
    const a = await this.prisma.chartOfAccount.findUnique({ where: { id } });
    if (!a || a.type !== 'EXPENSE') throw new BadRequestException('Choose an expense account');
    if (!a.isActive) throw new BadRequestException(`Account ${a.code} is switched off`);
    return a.id;
  }

  // ================================================================= recurring

  async recurring() {
    const rows = await this.prisma.recurringExpense.findMany({ orderBy: [{ isActive: 'desc' }, { nextRunDate: 'asc' }], include: { category: { select: { id: true, name: true } }, _count: { select: { expenses: true } } } });
    const today = karachiToday();
    return rows.map((r) => ({
      id: r.id, category: r.category, description: r.description, amount: moneyString(r.amount), paymentMethod: r.paymentMethod, frequency: r.frequency,
      nextRunDate: dateOnly(r.nextRunDate), isActive: r.isActive, created: r._count.expenses, isDue: r.isActive && dateOnly(r.nextRunDate) <= today,
    }));
  }

  async createRecurring(dto: RecurringExpenseDto, ctx: RequestContext) {
    await this.activeCategory(dto.categoryId);
    const amount = money(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await tx.recurringExpense.create({
        data: { categoryId: dto.categoryId, description: dto.description, amount, paymentMethod: dto.paymentMethod, frequency: dto.frequency, nextRunDate: asDate(dto.nextRunDate), dayOfMonth: Number(dto.nextRunDate.slice(8, 10)) },
      });
      await this.audit.log({ action: 'CREATE', module: 'expenses', recordId: row.id, newValues: { recurring: row.description, amount: moneyString(amount), frequency: row.frequency } }, ctx, tx);
      return row;
    });
    return (await this.recurring()).find((x) => x.id === r.id);
  }

  async updateRecurring(id: string, dto: UpdateRecurringExpenseDto, ctx: RequestContext) {
    const r = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Recurring expense not found');
    if (dto.categoryId) await this.activeCategory(dto.categoryId);
    const amount = dto.amount !== undefined ? money(dto.amount) : undefined;
    if (amount && amount.lte(0)) throw new BadRequestException('Amount must be more than 0');
    await this.prisma.$transaction(async (tx) => {
      await tx.recurringExpense.update({
        where: { id },
        data: {
          categoryId: dto.categoryId, description: dto.description, amount, paymentMethod: dto.paymentMethod, frequency: dto.frequency, isActive: dto.isActive,
          ...(dto.nextRunDate ? { nextRunDate: asDate(dto.nextRunDate), dayOfMonth: Number(dto.nextRunDate.slice(8, 10)) } : {}),
        },
      });
      await this.audit.log({ action: 'UPDATE', module: 'expenses', recordId: id, oldValues: { amount: moneyString(r.amount), isActive: r.isActive }, newValues: { ...dto } }, ctx, tx);
    });
    return (await this.recurring()).find((x) => x.id === id);
  }

  /** Creates every recurring expense that is due up to today (at most 12 per template per run). */
  async generateDue(user: AuthUser, ctx: RequestContext) {
    const today = karachiToday();
    const due = await this.prisma.recurringExpense.findMany({ where: { isActive: true, nextRunDate: { lte: asDate(today) } }, include: { category: true } });
    const approve = canApprove(user);
    let created = 0;
    for (const r of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM recurring_expenses WHERE id = ${r.id}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
        const fresh = await tx.recurringExpense.findUniqueOrThrow({ where: { id: r.id } });
        let date = dateOnly(fresh.nextRunDate);
        for (let i = 0; i < 12 && date <= today && fresh.isActive; i++) {
          const key = `recurring:${r.id}:${date}`;
          if (!(await tx.expense.findUnique({ where: { idempotencyKey: key } }))) {
            const x = await this.insert(tx, {
              expenseDate: date, categoryId: r.categoryId, description: r.description, amount: dec(r.amount), paymentMethod: r.paymentMethod, idempotencyKey: key,
              notes: 'Created from a recurring expense',
            }, approve && r.category.isActive, ctx.userId, r.id);
            await this.audit.log({ action: 'CREATE', module: 'expenses', recordId: x.id, newValues: { expenseNo: x.expenseNo, recurring: r.description, amount: moneyString(r.amount) } }, ctx, tx);
            created += 1;
          }
          date = nextDate(date, fresh.frequency, fresh.dayOfMonth);
        }
        await tx.recurringExpense.update({ where: { id: r.id }, data: { nextRunDate: asDate(date) } });
      }, { timeout: 30_000 });
    }
    return { created, approved: approve };
  }
}
