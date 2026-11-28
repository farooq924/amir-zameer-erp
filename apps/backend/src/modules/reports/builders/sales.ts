import { Prisma } from '@prisma/client';
import { Tenant } from '../../../common/tenant';
import { ORDER_TYPES } from '@az/shared';
import { dec } from '../../../common/utils/money';
import {
  BuiltReport, MAX_ROWS, PAYMENT_STATUS_LABEL, ReportBuilder, ReportInput, col, dateIn, daysBetween, label, m, money, num, pct, summary, sumOf, ymd,
} from '../report-kit';

const ORDER_TYPE = label(ORDER_TYPES);
const asDay = (s: string) => new Date(`${s}T00:00:00Z`);

function addDays(date: string, n: number) {
  const d = asDay(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Booked orders (not cancelled) and money received, grouped by day or month. */
async function salesBy(input: ReportInput, unit: 'day' | 'month'): Promise<BuiltReport> {
  const r = input.range!;
  const fmt = unit === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const orders = await input.prisma.$queryRaw<{ k: string; orders: bigint; pcs: Prisma.Decimal; st: Prisma.Decimal; fb: Prisma.Decimal; ad: Prisma.Decimal; disc: Prisma.Decimal; total: Prisma.Decimal }[]>`
    SELECT to_char(o."orderDate", ${fmt}) AS k, COUNT(*) AS orders,
           COALESCE(SUM((SELECT SUM(i.quantity) FROM order_items i WHERE i."orderId" = o.id)), 0) AS pcs,
           SUM(o."stitchingTotal") AS st, SUM(o."fabricTotal") AS fb, SUM(o."additionalCharges") AS ad, SUM(o.discount) AS disc, SUM(o."totalAmount") AS total
    FROM orders o
    WHERE o."companyId" = ${Tenant.require()}::uuid AND o."deletedAt" IS NULL AND o.lifecycle <> 'CANCELLED' AND o."orderDate" BETWEEN ${asDay(r.fromDate)}::date AND ${asDay(r.toDate)}::date
    GROUP BY 1`;
  const cash = await input.prisma.$queryRaw<{ k: string; recv: Prisma.Decimal; refund: Prisma.Decimal }[]>`
    SELECT to_char(("paymentDate" + interval '5 hours')::date, ${fmt}) AS k,
           COALESCE(SUM(CASE WHEN type <> 'REFUND' THEN amount ELSE 0 END), 0) AS recv,
           COALESCE(SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END), 0) AS refund
    FROM payments WHERE "companyId" = ${Tenant.require()}::uuid AND status = 'POSTED' AND "paymentDate" >= ${r.start} AND "paymentDate" < ${r.endExclusive}
    GROUP BY 1`;
  const byO = new Map(orders.map((o) => [o.k, o]));
  const byC = new Map(cash.map((c) => [c.k, c]));
  // Every day / month of the period up to today, so quiet days show as zero.
  const last = r.toDate < input.today ? r.toDate : input.today;
  const keys: string[] = [];
  if (unit === 'day') for (let d = r.fromDate; d <= last; d = addDays(d, 1)) keys.push(d);
  else for (let d = r.fromDate.slice(0, 7); d <= last.slice(0, 7); d = nextMonth(d)) keys.push(d);
  const rows = keys.reverse().map((k) => {
    const o = byO.get(k);
    const c = byC.get(k);
    const recv = dec(c?.recv);
    const refund = dec(c?.refund);
    return {
      period: unit === 'day' ? k : `${k}-01`, orders: Number(o?.orders ?? 0), pieces: Number(o?.pcs ?? 0), stitching: m(o?.st), fabric: m(o?.fb), other: m(o?.ad),
      discount: m(o?.disc), sales: m(o?.total), received: m(recv), refunds: m(refund), net: m(recv.minus(refund)),
      avg: o && Number(o.orders) ? m(dec(o.total).div(Number(o.orders))) : m(0),
    };
  });
  const totalSales = sumOf(rows, (x) => x.sales);
  const totalOrders = rows.reduce((t, x) => t + x.orders, 0);
  return {
    columns: [
      col('period', unit === 'day' ? 'Date' : 'Month', unit === 'day' ? 'date' : 'text'), num('orders', 'Orders'), num('pieces', 'Pieces'),
      money('stitching', 'Stitching'), money('fabric', 'Fabric'), money('other', 'Other charges', { optional: true }), money('discount', 'Discount'),
      money('sales', 'Net sales'), money('avg', 'Avg. order', { total: false, optional: true }), money('received', 'Received'), money('refunds', 'Refunds', { optional: true }), money('net', 'Net cash in'),
    ],
    rows: unit === 'month' ? rows.map((x) => ({ ...x, period: x.period.slice(0, 7) })) : rows,
    summary: [
      summary('Net sales', m(totalSales)), summary('Orders booked', totalOrders, 'number', `${rows.reduce((t, x) => t + x.pieces, 0)} pieces`),
      summary('Money received', m(sumOf(rows, (x) => x.net)), 'money', 'after refunds'), summary('Average order', m(totalOrders ? totalSales.div(totalOrders) : 0)),
    ],
    sortable: true,
  };
}

function nextMonth(key: string) {
  const [y, mo] = key.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export const dailySales: ReportBuilder = (input) => salesBy(input, 'day');
export const monthlySales: ReportBuilder = (input) => salesBy(input, 'month');

// ------------------------------------------------------------------ revenue by garment / fabric

export const stitchingRevenue: ReportBuilder = async (input) => {
  const r = input.range!;
  const conds: Prisma.Sql[] = [
    Prisma.sql`o."companyId" = ${Tenant.require()}::uuid`, Prisma.sql`o."deletedAt" IS NULL`, Prisma.sql`o.lifecycle <> 'CANCELLED'`,
    Prisma.sql`o."orderDate" BETWEEN ${asDay(r.fromDate)}::date AND ${asDay(r.toDate)}::date`,
  ];
  if (input.f.garment) conds.push(Prisma.sql`i."garmentTypeId" = ${input.f.garment}::uuid`);
  if (input.f.employee) conds.push(Prisma.sql`(i."assignedEmployeeId" = ${input.f.employee}::uuid OR o."assignedEmployeeId" = ${input.f.employee}::uuid)`);
  const rows = await input.prisma.$queryRaw<{ garment: string; orders: bigint; pcs: bigint; st: Prisma.Decimal; extra: Prisma.Decimal }[]>`
    SELECT COALESCE(g.name, i."garmentName") AS garment, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS pcs,
           SUM(i."stitchingAmount") AS st, SUM(i."additionalCharges") AS extra
    FROM order_items i JOIN orders o ON o.id = i."orderId" LEFT JOIN garments g ON g.id = i."garmentTypeId"
    WHERE ${Prisma.join(conds, ' AND ')}
    GROUP BY 1`;
  const total = sumOf(rows, (x) => x.st);
  const out = rows.map((x) => ({
    garment: x.garment, orders: Number(x.orders), pieces: Number(x.pcs), stitching: m(x.st), extra: m(x.extra),
    rate: m(Number(x.pcs) ? dec(x.st).div(Number(x.pcs)) : 0), share: pct(x.st, total),
  }));
  const pcs = out.reduce((t, x) => t + x.pieces, 0);
  return {
    columns: [col('garment', 'Garment'), num('orders', 'Orders'), num('pieces', 'Pieces'), money('stitching', 'Stitching income'), money('extra', 'Extra charges'),
      money('rate', 'Avg. per piece', { total: false }), col('share', 'Share', 'percent')],
    rows: out,
    summary: [summary('Stitching income', m(total)), summary('Pieces', pcs, 'number'), summary('Avg. per piece', m(pcs ? total.div(pcs) : 0)),
      summary('Top garment', [...out].sort((a, b) => Number(b.stitching) - Number(a.stitching))[0]?.garment ?? '-', 'text')],
    defaultSort: { key: 'stitching', dir: 'desc' },
  };
};

export const fabricSales: ReportBuilder = async (input) => {
  const r = input.range!;
  const conds: Prisma.Sql[] = [
    Prisma.sql`o."companyId" = ${Tenant.require()}::uuid`, Prisma.sql`o."deletedAt" IS NULL`, Prisma.sql`o.lifecycle <> 'CANCELLED'`, Prisma.sql`i."fabricSource" = 'SHOP'`, Prisma.sql`i."fabricId" IS NOT NULL`,
    Prisma.sql`o."orderDate" BETWEEN ${asDay(r.fromDate)}::date AND ${asDay(r.toDate)}::date`,
  ];
  if (input.f.fabricCategory) conds.push(Prisma.sql`f."categoryId" = ${input.f.fabricCategory}::uuid`);
  if (input.f.customer) conds.push(Prisma.sql`o."customerId" = ${input.f.customer}::uuid`);
  const rows = await input.prisma.$queryRaw<{ code: string; name: string; cat: string | null; unit: string; orders: bigint; q: Prisma.Decimal; amt: Prisma.Decimal; cost: Prisma.Decimal }[]>`
    SELECT f.code, f.name, c.name AS cat, f.unit::text AS unit, COUNT(DISTINCT o.id) AS orders, SUM(i."fabricQuantity") AS q, SUM(i."fabricAmount") AS amt,
           SUM(i."fabricQuantity" * f."averageCost") AS cost
    FROM order_items i JOIN orders o ON o.id = i."orderId" JOIN fabrics f ON f.id = i."fabricId" LEFT JOIN fabric_categories c ON c.id = f."categoryId"
    WHERE ${Prisma.join(conds, ' AND ')}
    GROUP BY f.id, f.code, f.name, c.name, f.unit`;
  const out = rows.map((x) => ({
    code: x.code, fabric: x.name, category: x.cat ?? '-', unit: x.unit.charAt(0) + x.unit.slice(1).toLowerCase(), orders: Number(x.orders), quantity: dec(x.q).toFixed(3),
    sales: m(x.amt), rate: m(dec(x.q).gt(0) ? dec(x.amt).div(x.q) : 0), cost: m(x.cost), margin: m(dec(x.amt).minus(dec(x.cost))), marginPct: pct(dec(x.amt).minus(dec(x.cost)), x.amt),
  }));
  const sales = sumOf(out, (x) => x.sales);
  const margin = sumOf(out, (x) => x.margin);
  return {
    columns: [col('code', 'Code'), col('fabric', 'Fabric'), col('category', 'Category'), col('unit', 'Unit', 'text', { optional: true }), num('orders', 'Orders'),
      col('quantity', 'Quantity', 'qty', { total: true }), money('sales', 'Sale value'), money('rate', 'Avg. rate', { total: false, optional: true }),
      money('cost', 'Cost (avg.)'), money('margin', 'Margin'), col('marginPct', 'Margin %', 'percent')],
    rows: out,
    summary: [summary('Fabric sales', m(sales)), summary('Margin', m(margin), 'money', `${pct(margin, sales)}% of sales`), summary('Fabrics sold', out.length, 'number')],
    note: 'Cost uses each fabric\'s average purchase cost.',
    defaultSort: { key: 'sales', dir: 'desc' },
  };
};

// ------------------------------------------------------------------ order lists

type OrderRow = Prisma.OrderGetPayload<{
  include: { customer: { select: { name: true; code: true; mobile: true } }; stage: { select: { name: true; code: true } }; assignedEmployee: { select: { name: true } };
    items: { select: { quantity: true; deliveredQuantity: true; garmentName: true; assignedEmployee: { select: { name: true } } } } };
}>;

async function findOrders(input: ReportInput, where: Prisma.OrderWhereInput, orderBy: Prisma.OrderOrderByWithRelationInput = { orderDate: 'desc' }) {
  const f = input.f;
  const and: Prisma.OrderWhereInput[] = [{ deletedAt: null }, where];
  if (f.customer) and.push({ customerId: f.customer });
  if (f.stage) and.push({ stageId: f.stage });
  if (f.paymentStatus) and.push({ paymentStatus: f.paymentStatus as Prisma.EnumPaymentStatusFilter['equals'] });
  if (f.employee) and.push({ OR: [{ assignedEmployeeId: f.employee }, { items: { some: { assignedEmployeeId: f.employee } } }] });
  if (f.garment) and.push({ items: { some: { garmentTypeId: f.garment } } });
  const rows: OrderRow[] = await input.prisma.order.findMany({
    where: { AND: and }, orderBy, take: MAX_ROWS + 1,
    include: {
      customer: { select: { name: true, code: true, mobile: true } }, stage: { select: { name: true, code: true } }, assignedEmployee: { select: { name: true } },
      items: { select: { quantity: true, deliveredQuantity: true, garmentName: true, assignedEmployee: { select: { name: true } } }, orderBy: { lineNo: 'asc' } },
    },
  });
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

function garments(o: OrderRow) {
  const byName = new Map<string, number>();
  o.items.forEach((i) => byName.set(i.garmentName, (byName.get(i.garmentName) ?? 0) + i.quantity));
  return [...byName.entries()].map(([n, q]) => `${q} ${n}`).join(', ');
}
const pieces = (o: OrderRow) => o.items.reduce((t, i) => t + i.quantity, 0);
const pendingPieces = (o: OrderRow) => o.items.reduce((t, i) => t + Math.max(0, i.quantity - i.deliveredQuantity), 0);
const assigned = (o: OrderRow) => {
  const names = new Set([o.assignedEmployee?.name, ...o.items.map((i) => i.assignedEmployee?.name)].filter(Boolean) as string[]);
  return names.size ? [...names].join(', ') : 'Not assigned';
};
const orderBalance = (o: OrderRow) => m(o.balanceAmount);
const orderTotal = (o: OrderRow) => m(dec(o.totalAmount).plus(dec(o.adjustmentsTotal)));

export const orderRegister: ReportBuilder = async (input) => {
  const { rows, truncated } = await findOrders(input, { orderDate: dateIn(input) });
  const out = rows.map((o) => ({
    orderNumber: o.orderNumber, orderDate: ymd(o.orderDate), customer: o.customer.name, mobile: o.customer.mobile, type: ORDER_TYPE[o.orderType] ?? o.orderType,
    garments: garments(o), pieces: pieces(o), status: o.stage.name, payment: o.lifecycle === 'CANCELLED' ? '-' : PAYMENT_STATUS_LABEL[o.paymentStatus],
    assigned: assigned(o), dueDate: ymd(o.expectedDeliveryDate), total: orderTotal(o), paid: m(o.paidAmount), balance: orderBalance(o),
    _exclude: o.lifecycle === 'CANCELLED' ? 1 : undefined,
  }));
  const live = out.filter((x) => !x._exclude);
  return {
    columns: [
      col('orderNumber', 'Order no'), col('orderDate', 'Date', 'date'), col('customer', 'Customer'), col('mobile', 'Mobile', 'text', { optional: true }),
      col('type', 'Type', 'text', { optional: true }), col('garments', 'Garments'), num('pieces', 'Pieces'), col('status', 'Status', 'status'),
      col('payment', 'Payment', 'status'), col('assigned', 'Assigned to', 'text', { optional: true }), col('dueDate', 'Delivery date', 'date'),
      money('total', 'Total'), money('paid', 'Paid'), money('balance', 'Balance'),
    ],
    rows: out, truncated,
    summary: [summary('Orders', live.length, 'number', `${out.length - live.length} cancelled`), summary('Order value', m(sumOf(live, (x) => x.total))),
      summary('Received', m(sumOf(live, (x) => x.paid))), summary('Balance due', m(sumOf(live, (x) => x.balance)))],
    note: out.length !== live.length ? 'Cancelled orders are listed but not added to the totals.' : null,
  };
};

export const pendingOrders: ReportBuilder = async (input) => {
  const { rows, truncated } = await findOrders(input, { lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] } }, { expectedDeliveryDate: 'asc' });
  const out = rows.map((o) => {
    const due = ymd(o.expectedDeliveryDate);
    return {
      orderNumber: o.orderNumber, orderDate: ymd(o.orderDate), customer: o.customer.name, mobile: o.customer.mobile, garments: garments(o), pending: pendingPieces(o),
      status: o.stage.name, assigned: assigned(o), dueDate: due, daysLeft: due ? daysBetween(input.today, due) : null, total: orderTotal(o), balance: orderBalance(o),
    };
  });
  const overdue = out.filter((x) => x.daysLeft !== null && x.daysLeft < 0).length;
  const soon = out.filter((x) => x.daysLeft !== null && x.daysLeft >= 0 && x.daysLeft <= 3).length;
  return {
    columns: [
      col('orderNumber', 'Order no'), col('orderDate', 'Booked', 'date'), col('customer', 'Customer'), col('mobile', 'Mobile', 'text', { optional: true }),
      col('garments', 'Garments'), num('pending', 'Pieces pending'), col('status', 'Status', 'status'), col('assigned', 'Assigned to'),
      col('dueDate', 'Delivery date', 'date'), col('daysLeft', 'Days left', 'number'), money('total', 'Total', { optional: true }), money('balance', 'Balance'),
    ],
    rows: out, truncated,
    summary: [summary('Open orders', out.length, 'number'), summary('Late', overdue, 'number', 'past delivery date'), summary('Due in 3 days', soon, 'number'),
      summary('Balance to collect', m(sumOf(out, (x) => x.balance)))],
    note: 'Days left below 0 means the order is late.',
    defaultSort: { key: 'daysLeft', dir: 'asc' },
  };
};

export const deliveredOrders: ReportBuilder = async (input) => {
  const { rows, truncated } = await findOrders(input, { lifecycle: 'DELIVERED', actualDeliveryDate: dateIn(input) }, { actualDeliveryDate: 'desc' });
  const out = rows.map((o) => {
    const due = ymd(o.expectedDeliveryDate);
    const done = ymd(o.actualDeliveryDate)!;
    const late = due ? Math.max(0, daysBetween(due, done)) : 0;
    return {
      orderNumber: o.orderNumber, customer: o.customer.name, orderDate: ymd(o.orderDate), dueDate: due, deliveredOn: done, daysLate: late,
      onTime: late > 0 ? 'Late' : 'On time', turnaround: daysBetween(ymd(o.orderDate)!, done), pieces: pieces(o), total: orderTotal(o), paid: m(o.paidAmount), balance: orderBalance(o),
    };
  });
  const onTime = out.filter((x) => x.daysLate === 0).length;
  return {
    columns: [
      col('orderNumber', 'Order no'), col('customer', 'Customer'), col('orderDate', 'Booked', 'date'), col('dueDate', 'Promised', 'date'), col('deliveredOn', 'Delivered', 'date'),
      col('onTime', 'On time', 'status'), num('daysLate', 'Days late', { total: false }), num('turnaround', 'Days taken', { total: false, optional: true }), num('pieces', 'Pieces'),
      money('total', 'Total'), money('paid', 'Paid'), money('balance', 'Balance'),
    ],
    rows: out, truncated,
    summary: [summary('Delivered', out.length, 'number'), summary('On time', `${pct(onTime, out.length || 1)}%`, 'text', `${onTime} of ${out.length}`),
      summary('Avg. days taken', out.length ? (out.reduce((t, x) => t + x.turnaround, 0) / out.length).toFixed(1) : '0', 'text'), summary('Balance still due', m(sumOf(out, (x) => x.balance)))],
  };
};

export const delayedOrders: ReportBuilder = async (input) => {
  const { rows, truncated } = await findOrders(input, { lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] }, expectedDeliveryDate: { lt: asDay(input.today) } }, { expectedDeliveryDate: 'asc' });
  const out = rows.map((o) => {
    const due = ymd(o.expectedDeliveryDate)!;
    return {
      orderNumber: o.orderNumber, customer: o.customer.name, mobile: o.customer.mobile, orderDate: ymd(o.orderDate), dueDate: due, daysLate: daysBetween(due, input.today),
      status: o.stage.name, assigned: assigned(o), pending: pendingPieces(o), balance: orderBalance(o),
    };
  });
  return {
    columns: [
      col('orderNumber', 'Order no'), col('customer', 'Customer'), col('mobile', 'Mobile'), col('orderDate', 'Booked', 'date', { optional: true }), col('dueDate', 'Promised', 'date'),
      num('daysLate', 'Days late', { total: false }), col('status', 'Status', 'status'), col('assigned', 'Assigned to'), num('pending', 'Pieces pending'), money('balance', 'Balance'),
    ],
    rows: out, truncated,
    summary: [summary('Late orders', out.length, 'number'), summary('Avg. days late', out.length ? (out.reduce((t, x) => t + x.daysLate, 0) / out.length).toFixed(1) : '0', 'text'),
      summary('Most late', out.length ? `${Math.max(...out.map((x) => x.daysLate))} days` : '-', 'text'), summary('Balance on late orders', m(sumOf(out, (x) => x.balance)))],
    defaultSort: { key: 'daysLate', dir: 'desc' },
  };
};
