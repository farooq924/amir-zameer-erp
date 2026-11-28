import { Injectable } from '@nestjs/common';
import { Tenant } from '../../common/tenant';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DecimalLike, dec, moneyString } from '../../common/utils/money';
import { ResolvedRange, dateColumnFilter, timestampFilter } from '../../common/utils/date-range';
import { PostingService } from '../accounting/posting.service';

const ACTIVE_ORDER = { deletedAt: null, lifecycle: { not: 'CANCELLED' as const } };

function monthKeys(endDate: string, count: number): string[] {
  const [y, m] = endDate.split('-').map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

function dayKeys(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Every figure comes from live PostgreSQL data. Money is returned as fixed
 * 2-decimal strings to avoid floating point in clients.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly posting: PostingService) {}

  async summary(range: ResolvedRange) {
    await this.posting.syncQuietly(); // profit figures come from the books: post anything new first
    const dates = dateColumnFilter(range);
    const times = timestampFilter(range);

    const [orderAgg, cancelled, pending, ready, delivered, receivable, expenseAgg, received, refunded, profit, stock, lowStock] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { ...ACTIVE_ORDER, orderDate: dates },
          _sum: { totalAmount: true, stitchingTotal: true, fabricTotal: true },
          _count: { _all: true },
        }),
        this.prisma.order.count({ where: { deletedAt: null, lifecycle: 'CANCELLED', orderDate: dates } }),
        this.prisma.order.count({ where: { deletedAt: null, lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] } } }),
        this.prisma.order.count({ where: { deletedAt: null, lifecycle: 'OPEN', stage: { code: 'READY' } } }),
        this.prisma.order.count({ where: { deletedAt: null, lifecycle: 'DELIVERED', actualDeliveryDate: dates } }),
        this.prisma.customerLedger.aggregate({ _sum: { debit: true, credit: true } }),
        this.prisma.expense.aggregate({ where: { deletedAt: null, status: 'APPROVED', expenseDate: dates }, _sum: { amount: true } }),
        this.prisma.payment.aggregate({ where: { status: 'POSTED', type: { not: 'REFUND' }, paymentDate: times }, _sum: { amount: true } }),
        this.prisma.payment.aggregate({ where: { status: 'POSTED', type: 'REFUND', paymentDate: times }, _sum: { amount: true } }),
        this.profitBetween(range.fromDate, range.toDate),
        this.prisma.$queryRaw<{ value: DecimalLike }[]>`
          SELECT COALESCE(SUM("currentStock" * "averageCost"), 0) AS value
          FROM fabrics WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "isActive"`,
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count FROM fabrics
          WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND "isActive" AND "currentStock" <= "minimumStock" AND "minimumStock" > 0`,
      ]);

    return {
      range: { preset: range.preset, from: range.fromDate, to: range.toDate },
      cards: {
        totalSales: moneyString(orderAgg._sum.totalAmount),
        stitchingRevenue: moneyString(orderAgg._sum.stitchingTotal),
        fabricSales: moneyString(orderAgg._sum.fabricTotal),
        totalOrders: orderAgg._count._all,
        cancelledOrders: cancelled,
        pendingOrders: pending,
        completedOrders: ready,
        deliveredOrders: delivered,
        customerOutstanding: moneyString(dec(receivable._sum.debit).minus(dec(receivable._sum.credit))),
        totalExpenses: moneyString(expenseAgg._sum.amount),
        cashReceived: moneyString(dec(received._sum.amount).minus(dec(refunded._sum.amount))),
        netProfit: moneyString(profit),
        fabricStockValue: moneyString(stock[0]?.value),
        lowStockItems: Number(lowStock[0]?.count ?? 0),
      },
    };
  }

  async charts(range: ResolvedRange) {
    const months = monthKeys(range.toDate, 12);
    const monthStart = `${months[0]}-01`;
    const days = dayKeys(range.fromDate, range.toDate);
    const fromD = new Date(`${range.fromDate}T00:00:00Z`);
    const toD = new Date(`${range.toDate}T00:00:00Z`);
    const monthStartD = new Date(`${monthStart}T00:00:00Z`);

    const [daily, monthlyOrders, monthlyExpenses, monthlyPL, stages, production] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; total: DecimalLike; stitching: DecimalLike; fabric: DecimalLike }[]>`
        SELECT to_char("orderDate", 'YYYY-MM-DD') AS day, SUM("totalAmount") AS total,
               SUM("stitchingTotal") AS stitching, SUM("fabricTotal") AS fabric
        FROM orders
        WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND lifecycle <> 'CANCELLED' AND "orderDate" BETWEEN ${fromD} AND ${toD}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; total: DecimalLike; stitching: DecimalLike; fabric: DecimalLike }[]>`
        SELECT to_char("orderDate", 'YYYY-MM') AS month, SUM("totalAmount") AS total,
               SUM("stitchingTotal") AS stitching, SUM("fabricTotal") AS fabric
        FROM orders
        WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND lifecycle <> 'CANCELLED' AND "orderDate" BETWEEN ${monthStartD} AND ${toD}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; total: DecimalLike }[]>`
        SELECT to_char("expenseDate", 'YYYY-MM') AS month, SUM(amount) AS total
        FROM expenses
        WHERE "companyId" = ${Tenant.require()}::uuid AND "deletedAt" IS NULL AND status = 'APPROVED' AND "expenseDate" BETWEEN ${monthStartD} AND ${toD}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; income: DecimalLike; expense: DecimalLike }[]>`
        SELECT to_char(je."entryDate", 'YYYY-MM') AS month,
               SUM(CASE WHEN a.type = 'INCOME'  THEN l.credit - l.debit ELSE 0 END) AS income,
               SUM(CASE WHEN a.type = 'EXPENSE' THEN l.debit - l.credit ELSE 0 END) AS expense
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l."journalEntryId"
        JOIN chart_of_accounts a ON a.id = l."accountId"
        WHERE je."companyId" = ${Tenant.require()}::uuid AND je.status IN ('POSTED', 'REVERSED') AND je."entryDate" BETWEEN ${monthStartD} AND ${toD}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ code: string; name: string; color: string; count: bigint }[]>`
        SELECT s.code, s.name, s.color, COUNT(o.id)::bigint AS count
        FROM workflow_stages s
        LEFT JOIN orders o ON o."stageId" = s.id AND o."deletedAt" IS NULL AND o."orderDate" BETWEEN ${fromD} AND ${toD}
        WHERE s."companyId" = ${Tenant.require()}::uuid AND s."isActive"
        GROUP BY s.id ORDER BY s."sortOrder"`,
      this.prisma.$queryRaw<{ employeeId: string; name: string; completed: bigint; rejected: bigint }[]>`
        SELECT e.id AS "employeeId", e.name, SUM(p."completedQuantity")::bigint AS completed,
               SUM(p."rejectedQuantity")::bigint AS rejected
        FROM production_records p JOIN employees e ON e.id = p."employeeId"
        WHERE p."companyId" = ${Tenant.require()}::uuid AND p."workDate" BETWEEN ${fromD} AND ${toD}
        GROUP BY e.id ORDER BY completed DESC LIMIT 10`,
    ]);

    const byDay = new Map(daily.map((r) => [r.day, r]));
    const byMonth = new Map(monthlyOrders.map((r) => [r.month, r]));
    const expByMonth = new Map(monthlyExpenses.map((r) => [r.month, r]));
    const plByMonth = new Map(monthlyPL.map((r) => [r.month, r]));

    return {
      range: { preset: range.preset, from: range.fromDate, to: range.toDate },
      dailySales: days.map((day) => ({
        date: day,
        total: moneyString(byDay.get(day)?.total),
        stitching: moneyString(byDay.get(day)?.stitching),
        fabric: moneyString(byDay.get(day)?.fabric),
      })),
      monthlyRevenue: months.map((month) => ({
        month,
        total: moneyString(byMonth.get(month)?.total),
        stitching: moneyString(byMonth.get(month)?.stitching),
        fabric: moneyString(byMonth.get(month)?.fabric),
      })),
      monthlyExpenses: months.map((month) => ({ month, total: moneyString(expByMonth.get(month)?.total) })),
      profitTrend: months.map((month) => {
        const r = plByMonth.get(month);
        return { month, income: moneyString(r?.income), expense: moneyString(r?.expense), profit: moneyString(dec(r?.income).minus(dec(r?.expense))) };
      }),
      orderStatus: stages.map((s) => ({ code: s.code, name: s.name, color: s.color, count: Number(s.count) })),
      employeeProduction: production.map((p) => ({ employeeId: p.employeeId, name: p.name, completed: Number(p.completed), rejected: Number(p.rejected) })),
    };
  }

  /** Accounting profit (accrual) for the period: income accounts minus expense accounts, from posted journals. */
  private async profitBetween(from: string, to: string): Promise<Prisma.Decimal> {
    const rows = await this.prisma.$queryRaw<{ income: DecimalLike; expense: DecimalLike }[]>`
      SELECT COALESCE(SUM(CASE WHEN a.type = 'INCOME'  THEN l.credit - l.debit ELSE 0 END), 0) AS income,
             COALESCE(SUM(CASE WHEN a.type = 'EXPENSE' THEN l.debit - l.credit ELSE 0 END), 0) AS expense
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l."journalEntryId"
      JOIN chart_of_accounts a ON a.id = l."accountId"
      WHERE je."companyId" = ${Tenant.require()}::uuid AND je.status IN ('POSTED', 'REVERSED')
        AND je."entryDate" BETWEEN ${new Date(`${from}T00:00:00Z`)} AND ${new Date(`${to}T00:00:00Z`)}`;
    return dec(rows[0]?.income).minus(dec(rows[0]?.expense));
  }
}
