import { Prisma } from '@prisma/client';
import { MOVEMENT_TYPES } from '@az/shared';
import { dec } from '../../../common/utils/money';
import { MAX_ROWS, ReportBuilder, col, dateIn, label, m, money, num, q3, qty, summary, sumOf, timeIn, ymd } from '../report-kit';
import { partyLedger } from './customers';

const MOVE = label(MOVEMENT_TYPES);
const unitLabel = (u: string) => u.charAt(0) + u.slice(1).toLowerCase();

export const fabricStock: ReportBuilder = async (input) => {
  const where: Prisma.FabricWhereInput = { deletedAt: null };
  if (input.f.fabricCategory) where.categoryId = input.f.fabricCategory;
  if (input.f.supplier) where.supplierId = input.f.supplier;
  const fabrics = await input.prisma.fabric.findMany({
    where, orderBy: { code: 'asc' }, take: MAX_ROWS,
    include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
  });
  let out = fabrics.map((f) => {
    const stock = dec(f.currentStock);
    const available = stock.minus(dec(f.reservedStock));
    const status = stock.lte(0) ? 'Out of stock' : stock.lte(dec(f.minimumStock)) ? 'Low stock' : 'In stock';
    return {
      code: f.code, fabric: f.name, category: f.category?.name ?? '-', supplier: f.supplier?.name ?? '-', brand: f.brand ?? '', color: f.color ?? '', location: f.location ?? '',
      unit: unitLabel(f.unit), stock: q3(stock), reserved: q3(f.reservedStock), available: q3(available), minimum: q3(f.minimumStock), avgCost: m(f.averageCost),
      value: m(stock.gt(0) ? stock.times(dec(f.averageCost)) : 0), salePrice: m(f.salePrice), status, active: f.isActive ? 'Active' : 'Inactive',
    };
  });
  const st = input.f.stockStatus;
  if (st) out = out.filter((x) => (st === 'LOW' ? x.status === 'Low stock' : st === 'OUT' ? x.status === 'Out of stock' : x.status === 'In stock'));
  return {
    columns: [
      col('code', 'Code'), col('fabric', 'Fabric'), col('category', 'Category'), col('supplier', 'Supplier', 'text', { optional: true }), col('brand', 'Brand', 'text', { optional: true }),
      col('color', 'Colour', 'text', { optional: true }), col('location', 'Location', 'text', { optional: true }), col('unit', 'Unit'),
      qty('stock', 'In stock'), qty('reserved', 'Reserved'), qty('available', 'Available'), qty('minimum', 'Minimum', { total: false, optional: true }),
      money('avgCost', 'Avg. cost', { total: false }), money('value', 'Stock value'), money('salePrice', 'Sale price', { total: false, optional: true }), col('status', 'Status', 'status'),
    ],
    rows: out,
    summary: [summary('Stock value', m(sumOf(out, (x) => x.value)), 'money', 'at average cost'), summary('Fabrics', out.length, 'number'),
      summary('Low stock', out.filter((x) => x.status === 'Low stock').length, 'number'), summary('Out of stock', out.filter((x) => x.status === 'Out of stock').length, 'number')],
    note: 'Quantities are in each fabric\'s own unit, so the quantity totals add different units together.',
  };
};

export const stockMovements: ReportBuilder = async (input) => {
  const where: Prisma.InventoryMovementWhereInput = { movementDate: timeIn(input) };
  if (input.f.fabric) where.fabricId = input.f.fabric;
  if (input.f.fabricCategory) where.fabric = { categoryId: input.f.fabricCategory };
  if (input.f.movementType) where.type = input.f.movementType as Prisma.InventoryMovementWhereInput['type'];
  const rows = await input.prisma.inventoryMovement.findMany({
    where, orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }], take: MAX_ROWS + 1,
    include: { fabric: { select: { code: true, name: true, unit: true } }, createdBy: { select: { fullName: true } } },
  });
  const refIds = [...new Set(rows.map((r) => r.referenceId).filter(Boolean) as string[])];
  const refs = refIds.length
    ? new Map((await input.prisma.$queryRaw<{ id: string; no: string }[]>`
        SELECT id::text, "orderNumber" AS no FROM orders WHERE id = ANY(${refIds}::uuid[])
        UNION ALL SELECT id::text, "purchaseNo" FROM purchases WHERE id = ANY(${refIds}::uuid[])
        UNION ALL SELECT id::text, "returnNo" FROM purchase_returns WHERE id = ANY(${refIds}::uuid[])
        UNION ALL SELECT id::text, "returnNo" FROM sale_returns WHERE id = ANY(${refIds}::uuid[])`).map((r) => [r.id, r.no]))
    : new Map<string, string>();
  const out = rows.slice(0, MAX_ROWS).map((r) => ({
    movementNo: r.movementNo, date: r.movementDate.toISOString(), fabric: `${r.fabric.code} ${r.fabric.name}`, unit: unitLabel(r.fabric.unit), type: MOVE[r.type] ?? r.type,
    in: r.direction === 'IN' ? q3(r.quantity) : q3(0), out: r.direction === 'OUT' ? q3(r.quantity) : q3(0), balance: q3(r.balanceAfter), unitCost: m(r.unitCost),
    value: m(r.direction === 'OUT' ? dec(r.totalCost).neg() : r.totalCost), reference: (r.referenceId && refs.get(r.referenceId)) || r.reason || '-', by: r.createdBy?.fullName ?? '-',
  }));
  return {
    columns: [col('movementNo', 'Movement no'), col('date', 'Date', 'datetime'), col('fabric', 'Fabric'), col('unit', 'Unit', 'text', { optional: true }), col('type', 'Type'),
      qty('in', 'In'), qty('out', 'Out'), qty('balance', 'Balance after', { total: false }), money('unitCost', 'Unit cost', { total: false, optional: true }),
      money('value', 'Value'), col('reference', 'Reference'), col('by', 'By', 'text', { optional: true })],
    rows: out, truncated: rows.length > MAX_ROWS,
    summary: [summary('Movements', out.length, 'number'), summary('Stock in (value)', m(sumOf(rows.filter((r) => r.direction === 'IN'), (r) => r.totalCost))),
      summary('Stock out (value)', m(sumOf(rows.filter((r) => r.direction === 'OUT'), (r) => r.totalCost)))],
    note: 'Value is minus for stock going out.',
  };
};

export const fabricConsumption: ReportBuilder = async (input) => {
  const r = input.range!;
  const cat = input.f.fabricCategory ? Prisma.sql`AND f."categoryId" = ${input.f.fabricCategory}::uuid` : Prisma.empty;
  const rows = await input.prisma.$queryRaw<{ code: string; name: string; cat: string | null; unit: string; used: Prisma.Decimal; back: Prisma.Decimal; cu: Prisma.Decimal; cb: Prisma.Decimal; orders: bigint }[]>`
    SELECT f.code, f.name, c.name AS cat, f.unit::text AS unit,
           COALESCE(SUM(CASE WHEN m.type = 'ORDER_CONSUMPTION' THEN m.quantity END), 0) AS used,
           COALESCE(SUM(CASE WHEN m.type = 'ORDER_REVERSAL' THEN m.quantity END), 0) AS back,
           COALESCE(SUM(CASE WHEN m.type = 'ORDER_CONSUMPTION' THEN m."totalCost" END), 0) AS cu,
           COALESCE(SUM(CASE WHEN m.type = 'ORDER_REVERSAL' THEN m."totalCost" END), 0) AS cb,
           COUNT(DISTINCT CASE WHEN m.type = 'ORDER_CONSUMPTION' THEN m."referenceId" END) AS orders
    FROM inventory_movements m JOIN fabrics f ON f.id = m."fabricId" LEFT JOIN fabric_categories c ON c.id = f."categoryId"
    WHERE m.type IN ('ORDER_CONSUMPTION', 'ORDER_REVERSAL') AND m."movementDate" >= ${r.start} AND m."movementDate" < ${r.endExclusive} ${cat}
    GROUP BY f.id, f.code, f.name, c.name, f.unit`;
  const out = rows.map((x) => ({
    code: x.code, fabric: x.name, category: x.cat ?? '-', unit: unitLabel(x.unit), orders: Number(x.orders), used: q3(x.used), returned: q3(x.back),
    net: q3(dec(x.used).minus(dec(x.back))), cost: m(dec(x.cu).minus(dec(x.cb))),
  }));
  return {
    columns: [col('code', 'Code'), col('fabric', 'Fabric'), col('category', 'Category'), col('unit', 'Unit'), num('orders', 'Orders'), qty('used', 'Used'),
      qty('returned', 'Returned', { optional: true }), qty('net', 'Net used'), money('cost', 'Cost')],
    rows: out,
    summary: [summary('Fabric cost used', m(sumOf(out, (x) => x.cost))), summary('Fabrics used', out.length, 'number'),
      summary('Biggest use', out.length ? [...out].sort((a, b) => Number(b.cost) - Number(a.cost))[0].fabric : '-', 'text')],
    defaultSort: { key: 'cost', dir: 'desc' },
  };
};

export const supplierLedger: ReportBuilder = (input) => partyLedger(input, 'supplier');

export const purchaseRegister: ReportBuilder = async (input) => {
  const where: Prisma.PurchaseWhereInput = { purchaseDate: dateIn(input) };
  if (input.f.supplier) where.supplierId = input.f.supplier;
  const rows = await input.prisma.purchase.findMany({
    where, orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }], take: MAX_ROWS,
    include: { supplier: { select: { name: true } }, _count: { select: { items: true } }, returns: { select: { totalAmount: true } } },
  });
  const out = rows.map((p) => ({
    purchaseNo: p.purchaseNo, date: ymd(p.purchaseDate), supplier: p.supplier.name, invoice: p.supplierInvoiceNo ?? '-', items: p._count.items,
    subtotal: m(p.subtotal), discount: m(p.discount), other: m(p.otherCharges), total: m(p.totalAmount), returned: m(sumOf(p.returns, (x) => x.totalAmount)),
    paid: m(p.paidAmount), balance: m(p.balanceAmount), status: p.status === 'CANCELLED' ? 'Cancelled' : p.status === 'DRAFT' ? 'Draft' : 'Posted',
    _exclude: p.status === 'POSTED' ? undefined : 1,
  }));
  const live = out.filter((x) => !x._exclude);
  return {
    columns: [col('purchaseNo', 'Purchase no'), col('date', 'Date', 'date'), col('supplier', 'Supplier'), col('invoice', 'Supplier bill no'), num('items', 'Items', { optional: true }),
      money('subtotal', 'Subtotal', { optional: true }), money('discount', 'Discount', { optional: true }), money('other', 'Other charges', { optional: true }),
      money('total', 'Bill total'), money('returned', 'Returned', { optional: true }), money('paid', 'Paid'), money('balance', 'Balance'), col('status', 'Status', 'status')],
    rows: out,
    summary: [summary('Purchases', m(sumOf(live, (x) => x.total)), 'money', `${live.length} bills`), summary('Paid', m(sumOf(live, (x) => x.paid))),
      summary('Balance to pay', m(sumOf(live, (x) => x.balance))), summary('Suppliers', new Set(live.map((x) => x.supplier)).size, 'number')],
  };
};

