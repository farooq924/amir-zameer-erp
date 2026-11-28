import { BadRequestException } from '@nestjs/common';
import { Tenant } from '../../../common/tenant';
import { Prisma } from '@prisma/client';
import { PAYMENT_METHODS } from '@az/shared';
import { dec } from '../../../common/utils/money';
import { MAX_ROWS, ReportBuilder, rs, ReportInput, col, daysBetween, humanize, label, m, money, num, summary, sumOf, timeIn, ymd } from '../report-kit';

const METHOD = label(PAYMENT_METHODS);
const PAY_TYPE: Record<string, string> = { ADVANCE: 'Advance', PARTIAL: 'Part payment', FULL: 'Full payment', REFUND: 'Refund' };
const ENTRY: Record<string, string> = {
  OPENING: 'Opening balance', ORDER: 'Order', ORDER_ADJUSTMENT: 'Order adjustment', PAYMENT: 'Payment', REFUND: 'Refund', SALE_RETURN: 'Sale return',
  PURCHASE: 'Purchase bill', PURCHASE_RETURN: 'Return to supplier', SUPPLIER_PAYMENT: 'Payment', REVERSAL: 'Reversal',
};
const asDay = (s: string) => new Date(`${s}T00:00:00Z`);

/** Document numbers for ledger references (orders, receipts, purchases, supplier payments, returns). */
async function referenceNumbers(input: ReportInput, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await input.prisma.$queryRaw<{ id: string; no: string }[]>`
    SELECT id::text, "orderNumber" AS no FROM orders WHERE id = ANY(${ids}::uuid[])
    UNION ALL SELECT id::text, "receiptNo" FROM payments WHERE id = ANY(${ids}::uuid[])
    UNION ALL SELECT id::text, "purchaseNo" FROM purchases WHERE id = ANY(${ids}::uuid[])
    UNION ALL SELECT id::text, "paymentNo" FROM supplier_payments WHERE id = ANY(${ids}::uuid[])
    UNION ALL SELECT id::text, "returnNo" FROM purchase_returns WHERE id = ANY(${ids}::uuid[])
    UNION ALL SELECT id::text, "returnNo" FROM sale_returns WHERE id = ANY(${ids}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r.no]));
}

/**
 * Shared ledger logic for customers (balance = debit - credit, what they owe us) and
 * suppliers (balance = credit - debit, what we owe them).
 */
export async function partyLedger(input: ReportInput, party: 'customer' | 'supplier') {
  const r = input.range!;
  const table = party === 'customer' ? Prisma.sql`customer_ledger` : Prisma.sql`supplier_ledger`;
  const idCol = party === 'customer' ? Prisma.sql`"customerId"` : Prisma.sql`"supplierId"`;
  const sign = (d: Prisma.Decimal, c: Prisma.Decimal) => (party === 'customer' ? d.minus(c) : c.minus(d));
  const id = party === 'customer' ? input.f.customer : input.f.supplier;
  const chargeLabel = party === 'customer' ? 'Charges' : 'Bills';
  const paidLabel = party === 'customer' ? 'Payments' : 'Paid / returned';

  if (!id) {
    // Summary of every party with a balance or activity.
    const rows = await input.prisma.$queryRaw<{ id: string; code: string; name: string; phone: string | null; od: Prisma.Decimal; oc: Prisma.Decimal; d: Prisma.Decimal; c: Prisma.Decimal }[]>`
      SELECT p.id::text, p.code, p.name, ${party === 'customer' ? Prisma.sql`p.mobile` : Prisma.sql`p."contactNumber"`} AS phone,
             COALESCE(SUM(CASE WHEN l."entryDate" < ${asDay(r.fromDate)}::date THEN l.debit END), 0) AS od,
             COALESCE(SUM(CASE WHEN l."entryDate" < ${asDay(r.fromDate)}::date THEN l.credit END), 0) AS oc,
             COALESCE(SUM(CASE WHEN l."entryDate" BETWEEN ${asDay(r.fromDate)}::date AND ${asDay(r.toDate)}::date THEN l.debit END), 0) AS d,
             COALESCE(SUM(CASE WHEN l."entryDate" BETWEEN ${asDay(r.fromDate)}::date AND ${asDay(r.toDate)}::date THEN l.credit END), 0) AS c
      FROM ${table} l JOIN ${party === 'customer' ? Prisma.sql`customers` : Prisma.sql`suppliers`} p ON p.id = l.${idCol}
      WHERE l."companyId" = ${Tenant.require()}::uuid AND l."entryDate" <= ${asDay(r.toDate)}::date
      GROUP BY p.id, p.code, p.name, phone`;
    const out = rows.map((x) => {
      const opening = sign(dec(x.od), dec(x.oc));
      const charges = party === 'customer' ? dec(x.d) : dec(x.c);
      const paid = party === 'customer' ? dec(x.c) : dec(x.d);
      return { code: x.code, name: x.name, phone: x.phone, opening: m(opening), charges: m(charges), paid: m(paid), closing: m(opening.plus(charges).minus(paid)) };
    }).filter((x) => !(dec(x.opening).eq(0) && dec(x.charges).eq(0) && dec(x.paid).eq(0) && dec(x.closing).eq(0)));
    return {
      columns: [col('code', 'Code'), col('name', party === 'customer' ? 'Customer' : 'Supplier'), col('phone', 'Phone', 'text', { optional: true }),
        money('opening', 'Opening'), money('charges', chargeLabel), money('paid', paidLabel), money('closing', 'Closing balance')],
      rows: out,
      summary: [summary(party === 'customer' ? 'Customers' : 'Suppliers', out.length, 'number'), summary('Opening', m(sumOf(out, (x) => x.opening))),
        summary(chargeLabel, m(sumOf(out, (x) => x.charges))), summary('Closing balance', m(sumOf(out, (x) => x.closing)))],
      note: `Pick a ${party} in the filters to see every entry with a running balance.`,
      defaultSort: { key: 'closing', dir: 'desc' as const },
    };
  }

  const exists = party === 'customer'
    ? await input.prisma.customer.findUnique({ where: { id }, select: { name: true, code: true } })
    : await input.prisma.supplier.findUnique({ where: { id }, select: { name: true, code: true } });
  if (!exists) throw new BadRequestException(`${party === 'customer' ? 'Customer' : 'Supplier'} not found`);
  const where = { [party === 'customer' ? 'customerId' : 'supplierId']: id };
  const model = (party === 'customer' ? input.prisma.customerLedger : input.prisma.supplierLedger) as unknown as {
    aggregate: (a: object) => Promise<{ _sum: { debit: Prisma.Decimal | null; credit: Prisma.Decimal | null } }>;
    findMany: (a: object) => Promise<{ id: string; entryDate: Date; entryType: string; referenceId: string; description: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>;
  };
  const before = await model.aggregate({ where: { ...where, entryDate: { lt: asDay(r.fromDate) } }, _sum: { debit: true, credit: true } });
  const lines = await model.findMany({
    where: { ...where, entryDate: { gte: asDay(r.fromDate), lte: asDay(r.toDate) } }, orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }], take: MAX_ROWS,
  });
  const refs = await referenceNumbers(input, [...new Set(lines.map((l) => l.referenceId))]);
  const opening = sign(dec(before._sum.debit), dec(before._sum.credit));
  let bal = opening;
  const rows = [
    { date: r.fromDate, type: 'Opening balance', reference: '-', description: `Balance before ${r.fromDate}`, charge: m(0), paid: m(0), balance: m(opening), _kind: 'section' as const, _exclude: 1 },
    ...lines.map((l) => {
      bal = bal.plus(sign(dec(l.debit), dec(l.credit)));
      const charge = party === 'customer' ? l.debit : l.credit;
      const paid = party === 'customer' ? l.credit : l.debit;
      return { date: ymd(l.entryDate), type: ENTRY[l.entryType] ?? humanize(l.entryType), reference: refs.get(l.referenceId) ?? '-', description: l.description ?? '', charge: m(charge), paid: m(paid), balance: m(bal) };
    }),
  ];
  const charges = sumOf(lines, (l) => (party === 'customer' ? l.debit : l.credit));
  const paid = sumOf(lines, (l) => (party === 'customer' ? l.credit : l.debit));
  return {
    columns: [col('date', 'Date', 'date'), col('type', 'Entry'), col('reference', 'Reference'), col('description', 'Description'),
      money('charge', party === 'customer' ? 'Charge (Dr)' : 'Bill (Cr)'), money('paid', party === 'customer' ? 'Paid (Cr)' : 'Paid (Dr)'), money('balance', 'Balance', { total: false })],
    rows,
    summary: [summary('Opening', m(opening)), summary(chargeLabel, m(charges)), summary(paidLabel, m(paid)), summary('Closing balance', m(bal), 'money', `${exists.name} (${exists.code})`)],
    note: `${exists.name} (${exists.code}). ${party === 'customer' ? 'A positive balance is what the customer owes the shop.' : 'A positive balance is what the shop owes the supplier.'}`,
    sortable: false,
    truncated: lines.length >= MAX_ROWS,
  };
}

export const customerLedger: ReportBuilder = (input) => partyLedger(input, 'customer');

export const customerOutstanding: ReportBuilder = async (input) => {
  const filter = input.f.customer ? Prisma.sql`AND c.id = ${input.f.customer}::uuid` : Prisma.empty;
  const rows = await input.prisma.$queryRaw<{ code: string; name: string; mobile: string; type: string; d: Prisma.Decimal; c: Prisma.Decimal; bal: Prisma.Decimal; open: bigint; oldest: Date | null; lastPay: Date | null }[]>`
    SELECT c.code, c.name, c.mobile, c."customerType"::text AS type, b.d, b.c, b.bal,
      (SELECT COUNT(*) FROM orders o WHERE o."customerId" = c.id AND o."deletedAt" IS NULL AND o.lifecycle <> 'CANCELLED' AND o."balanceAmount" > 0) AS open,
      (SELECT MIN(o."orderDate") FROM orders o WHERE o."customerId" = c.id AND o."deletedAt" IS NULL AND o.lifecycle <> 'CANCELLED' AND o."balanceAmount" > 0) AS oldest,
      (SELECT MAX(p."paymentDate") FROM payments p WHERE p."customerId" = c.id AND p.status = 'POSTED' AND p.type <> 'REFUND') AS "lastPay"
    FROM customers c
    JOIN (SELECT "customerId", SUM(debit) AS d, SUM(credit) AS c, SUM(debit - credit) AS bal FROM customer_ledger WHERE "companyId" = ${Tenant.require()}::uuid GROUP BY "customerId") b ON b."customerId" = c.id
    WHERE c."companyId" = ${Tenant.require()}::uuid AND b.bal > 0 AND c."deletedAt" IS NULL ${filter}`;
  const out = rows.map((x) => {
    const oldest = ymd(x.oldest);
    return {
      code: x.code, name: x.name, mobile: x.mobile, type: humanize(x.type), billed: m(x.d), paid: m(x.c), balance: m(x.bal), openOrders: Number(x.open),
      oldest, days: oldest ? daysBetween(oldest, input.today) : null, lastPayment: x.lastPay ? ymd(new Date(x.lastPay.getTime() + 5 * 3_600_000)) : null,
    };
  });
  const total = sumOf(out, (x) => x.balance);
  const old = out.filter((x) => (x.days ?? 0) > 30);
  return {
    columns: [col('code', 'Code'), col('name', 'Customer'), col('mobile', 'Mobile'), col('type', 'Type', 'text', { optional: true }), money('billed', 'Total billed', { optional: true }),
      money('paid', 'Total paid', { optional: true }), money('balance', 'Balance due'), num('openOrders', 'Unpaid orders'), col('oldest', 'Oldest unpaid', 'date'),
      num('days', 'Days', { total: false }), col('lastPayment', 'Last payment', 'date')],
    rows: out,
    summary: [summary('Total outstanding', m(total)), summary('Customers', out.length, 'number'), summary('Over 30 days', m(sumOf(old, (x) => x.balance)), 'money', `${old.length} customers`),
      summary('Biggest balance', out.length ? [...out].sort((a, b) => Number(b.balance) - Number(a.balance))[0].name : '-', 'text')],
    defaultSort: { key: 'balance', dir: 'desc' },
  };
};

export const customerPayments: ReportBuilder = async (input) => {
  const where: Prisma.PaymentWhereInput = { paymentDate: timeIn(input) };
  if (input.f.customer) where.customerId = input.f.customer;
  if (input.f.paymentMethod) where.method = input.f.paymentMethod as Prisma.PaymentWhereInput['method'];
  const rows = await input.prisma.payment.findMany({
    where, orderBy: { paymentDate: 'desc' }, take: MAX_ROWS + 1,
    include: { customer: { select: { name: true, code: true } }, order: { select: { orderNumber: true } }, createdBy: { select: { fullName: true } } },
  });
  const out = rows.slice(0, MAX_ROWS).map((p) => {
    const refund = p.type === 'REFUND';
    return {
      receiptNo: p.receiptNo, date: p.paymentDate.toISOString(), customer: p.customer.name, order: p.order?.orderNumber ?? '-', type: PAY_TYPE[p.type] ?? p.type,
      method: METHOD[p.method] ?? p.method, reference: p.reference ?? '', amount: m(refund ? dec(p.amount).neg() : p.amount),
      status: p.status === 'REVERSED' ? 'Reversed' : refund ? 'Refund' : 'Received', by: p.createdBy?.fullName ?? '-', _exclude: p.status === 'REVERSED' ? 1 : undefined,
    };
  });
  const live = rows.filter((p) => p.status === 'POSTED');
  const received = sumOf(live.filter((p) => p.type !== 'REFUND'), (p) => p.amount);
  const refunds = sumOf(live.filter((p) => p.type === 'REFUND'), (p) => p.amount);
  const byMethod = new Map<string, Prisma.Decimal>();
  live.filter((p) => p.type !== 'REFUND').forEach((p) => byMethod.set(p.method, (byMethod.get(p.method) ?? dec(0)).plus(p.amount)));
  const top = [...byMethod.entries()].sort((a, b) => b[1].cmp(a[1]))[0];
  return {
    columns: [col('receiptNo', 'Receipt no'), col('date', 'Date', 'datetime'), col('customer', 'Customer'), col('order', 'Order'), col('type', 'Type'), col('method', 'Method'),
      col('reference', 'Reference', 'text', { optional: true }), money('amount', 'Amount'), col('status', 'Status', 'status'), col('by', 'Received by', 'text', { optional: true })],
    rows: out, truncated: rows.length > MAX_ROWS,
    summary: [summary('Received', m(received), 'money', `${live.filter((p) => p.type !== 'REFUND').length} receipts`), summary('Refunds', m(refunds)),
      summary('Net received', m(received.minus(refunds))), summary('Top method', top ? METHOD[top[0]] : '-', 'text', top ? rs(top[1]) : undefined)],
    note: 'Refunds are shown as minus amounts. Reversed receipts are listed but not added to the totals.',
  };
};
