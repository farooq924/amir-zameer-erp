import { PrismaService, PrismaTx } from '../common/prisma/prisma.service';
import { Tenant } from '../common/tenant';
import { purgeJournalsFor } from '../modules/accounting/purge-journals';
import { DEMO_SETTING_KEY, DEMO_USER } from './demo-dataset';
import { readManifest } from './demo-loader';

/** Append-only / no-delete rules that must be paused while demo rows are deleted (only inside the removal transaction). */
const GUARDS: [string, string][] = [
  ['audit_logs', 'audit_logs_append_only'],
  ['inventory_movements', 'inventory_movements_append_only'],
  ['customer_ledger', 'customer_ledger_append_only'],
  ['supplier_ledger', 'supplier_ledger_append_only'],
  ['measurement_values', 'measurement_values_append_only'],
  ['customer_measurements', 'customer_measurements_immutable'],
  ['payments', 'payments_guard'],
  ['orders', 'orders_no_delete'],
  ['order_deliveries', 'order_deliveries_append_only'],
  ['order_delivery_items', 'order_delivery_items_append_only'],
  ['order_adjustments', 'order_adjustments_append_only'],
  ['employment_history', 'employment_history_append_only'],
  ['salary_payments', 'salary_payments_append_only'],
  ['payroll_items', 'payroll_items_no_delete_paid'],
  ['expenses', 'expenses_guard'],
];

export interface RemoveResult {
  status: 'removed' | 'nothing-to-remove';
  counts: Record<string, number>;
}

/**
 * Deletes the demo user and every record that hangs off the demo customers, suppliers, fabrics,
 * employees and payrolls. Real records are never deleted. If a real record depends on demo data
 * (for example a real purchase of a demo fabric) the whole removal is cancelled and nothing changes.
 */
export async function removeDemoData(prisma: PrismaService): Promise<RemoveResult> {
  const m = await readManifest(prisma);
  if (!m) return { status: 'nothing-to-remove', counts: {} };
  const counts: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    const run = async (label: string, sql: string, ...params: unknown[]) => {
      const n = await tx.$executeRawUnsafe(sql, ...params);
      if (label) counts[label] = (counts[label] ?? 0) + n;
      return n;
    };
    const ids = async (sql: string, ...params: unknown[]) => (await tx.$queryRawUnsafe<{ id: string }[]>(sql, ...params)).map((r) => r.id);

    const U = m.userId;
    // Customers made by the demo login, including ones saved from a demo sync conflict ("Keep both").
    const C = [...new Set([
      ...m.customers,
      ...(U ? await ids(`SELECT id::text FROM customers WHERE "createdById" = $1::uuid`, U) : []),
      ...(U ? await ids(`SELECT c.id::text FROM customers c JOIN sync_operations s ON s."entityId" = c.id WHERE s."userId" = $1::uuid AND s."entityType" = 'customer' AND s.operation = 'CREATE'`, U) : []),
    ])];
    const S = m.suppliers;
    const F = m.fabrics;
    const E = m.employees;
    const P = m.payrolls;
    const O = await ids(`SELECT id::text FROM orders WHERE "customerId" = ANY($1::uuid[])`, C);
    const OI = await ids(`SELECT id::text FROM order_items WHERE "orderId" = ANY($1::uuid[])`, O);
    const PAY = await ids(`SELECT id::text FROM payments WHERE "customerId" = ANY($1::uuid[]) OR "orderId" = ANY($2::uuid[])`, C, O);
    const PUR = await ids(`SELECT id::text FROM purchases WHERE "supplierId" = ANY($1::uuid[])`, S);
    const PI = await ids(`SELECT id::text FROM payroll_items WHERE "payrollId" = ANY($1::uuid[]) OR "employeeId" = ANY($2::uuid[])`, P, E);

    // Safety: real records that use demo fabrics or demo staff in a way we will not undo.
    const realUse = await tx.$queryRawUnsafe<{ what: string }[]>(
      `SELECT 'purchase ' || p."purchaseNo" AS what FROM purchase_items i JOIN purchases p ON p.id = i."purchaseId"
         WHERE i."fabricId" = ANY($1::uuid[]) AND NOT (p.id = ANY($2::uuid[]))
       UNION ALL
       SELECT 'order ' || o."orderNumber" FROM order_items i JOIN orders o ON o.id = i."orderId"
         WHERE i."fabricId" = ANY($1::uuid[]) AND NOT (o.id = ANY($3::uuid[]))
       LIMIT 5`, F, PUR, O,
    );
    if (realUse.length) {
      throw new Error(`Real records use demo fabric, so nothing was removed: ${realUse.map((r) => r.what).join(', ')}. Change those records to a real fabric first.`);
    }

    // Automatic journal entries of the demo (Phase 6 accounting), before the records they point to are deleted.
    // This also locks the journal tables until the removal commits, so the background posting cannot add new ones meanwhile.
    const extraSources = [
      ...(await ids(`SELECT id::text FROM supplier_payments WHERE "supplierId" = ANY($1::uuid[])`, S)),
      ...(await ids(`SELECT id::text FROM salary_payments WHERE "payrollItemId" = ANY($1::uuid[]) OR "employeeId" = ANY($2::uuid[])`, PI, E)),
      ...(await ids(`SELECT id::text FROM employee_advances WHERE "employeeId" = ANY($1::uuid[])`, E)),
    ];
    const X = m.expenses ?? [];
    counts.journalEntries = await purgeJournalsFor(tx, {
      customerIds: C, supplierIds: S, employeeIds: E, fabricIds: F, sourceIds: [...O, ...PUR, ...PAY, ...P, ...X, ...extraSources], entryIds: m.journals ?? [],
    });

    for (const [t, g] of GUARDS) await tx.$executeRawUnsafe(`ALTER TABLE ${t} DISABLE TRIGGER ${g}`);

    // Demo orders made with REAL fabric (only possible if someone used the demo login): give the stock back.
    await tx.$executeRawUnsafe(
      `UPDATE fabrics f SET "currentStock" = f."currentStock" - x.delta
         FROM (SELECT "fabricId", SUM(CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END) AS delta
                 FROM inventory_movements WHERE "referenceId" = ANY($1::uuid[]) AND NOT ("fabricId" = ANY($2::uuid[])) GROUP BY "fabricId") x
        WHERE f.id = x."fabricId"`, [...O, ...PUR], F,
    );
    await tx.$executeRawUnsafe(
      `UPDATE fabrics f SET "reservedStock" = GREATEST(0, f."reservedStock" - x.q)
         FROM (SELECT "fabricId", SUM(quantity - consumed) AS q FROM stock_reservations
                WHERE "orderId" = ANY($1::uuid[]) AND status = 'ACTIVE' AND NOT ("fabricId" = ANY($2::uuid[])) GROUP BY "fabricId") x
        WHERE f.id = x."fabricId"`, O, F,
    );

    // Staff and payroll.
    await run('production', `DELETE FROM production_records WHERE "orderItemId" = ANY($1::uuid[]) OR "employeeId" = ANY($2::uuid[])`, OI, E);
    await run('', `DELETE FROM employee_assignments WHERE "orderItemId" = ANY($1::uuid[]) OR "employeeId" = ANY($2::uuid[])`, OI, E);
    // Advance instalments taken by a demo payroll from a real employee go back on that advance.
    await tx.$executeRawUnsafe(
      `UPDATE employee_advances a SET "recoveredAmount" = a."recoveredAmount" - r.amt, "balanceAmount" = a."balanceAmount" + r.amt, status = 'OPEN'
         FROM (SELECT "advanceId", SUM(amount) AS amt FROM advance_recoveries WHERE "payrollItemId" = ANY($1::uuid[]) GROUP BY "advanceId") r
        WHERE a.id = r."advanceId" AND NOT (a."employeeId" = ANY($2::uuid[]))`, PI, E,
    );
    await run('', `DELETE FROM advance_recoveries WHERE "payrollItemId" = ANY($1::uuid[]) OR "advanceId" IN (SELECT id FROM employee_advances WHERE "employeeId" = ANY($2::uuid[]))`, PI, E);
    await run('salaryPayments', `DELETE FROM salary_payments WHERE "payrollItemId" = ANY($1::uuid[]) OR "employeeId" = ANY($2::uuid[])`, PI, E);
    const realPayrolls = await ids(`SELECT DISTINCT "payrollId"::text AS id FROM payroll_items WHERE id = ANY($1::uuid[]) AND NOT ("payrollId" = ANY($2::uuid[]))`, PI, P);
    await run('', `DELETE FROM payroll_items WHERE id = ANY($1::uuid[])`, PI);
    await run('payrolls', `DELETE FROM payrolls WHERE id = ANY($1::uuid[])`, P);
    if (realPayrolls.length) await refreshPayrollTotals(tx, realPayrolls);
    for (const t of ['overtime_records', 'leave_records', 'attendance', 'employee_advances', 'salary_structures', 'employment_history']) {
      await run(t === 'attendance' ? 'attendance' : '', `DELETE FROM ${t} WHERE "employeeId" = ANY($1::uuid[])`, E);
    }

    // Orders and customers.
    await run('', `DELETE FROM stock_reservations WHERE "orderId" = ANY($1::uuid[]) OR "fabricId" = ANY($2::uuid[])`, O, F);
    await run('stockMovements', `DELETE FROM inventory_movements WHERE "fabricId" = ANY($1::uuid[]) OR "referenceId" = ANY($2::uuid[])`, F, [...O, ...PUR]);
    await run('', `DELETE FROM order_adjustments WHERE "orderId" = ANY($1::uuid[])`, O);
    await run('', `DELETE FROM order_deliveries WHERE "orderId" = ANY($1::uuid[])`, O);
    await run('', `UPDATE payments SET "reversalOfId" = NULL WHERE "reversalOfId" = ANY($1::uuid[])`, PAY);
    await run('payments', `DELETE FROM payments WHERE id = ANY($1::uuid[])`, PAY);
    await run('', `DELETE FROM sale_returns WHERE "customerId" = ANY($1::uuid[]) OR "orderId" = ANY($2::uuid[])`, C, O);
    await run('', `UPDATE orders SET "duplicatedFromId" = NULL WHERE "duplicatedFromId" = ANY($1::uuid[])`, O);
    await run('orders', `DELETE FROM orders WHERE id = ANY($1::uuid[])`, O);
    await run('', `DELETE FROM customer_ledger WHERE "customerId" = ANY($1::uuid[]) OR "referenceId" = ANY($2::uuid[])`, C, [...O, ...PAY]);
    await run('whatsappMessages', `DELETE FROM whatsapp_messages WHERE "customerId" = ANY($1::uuid[]) OR "relatedId" = ANY($2::uuid[])`, C, [...O, ...PAY]);
    await run('measurements', `DELETE FROM customer_measurements WHERE "customerId" = ANY($1::uuid[])`, C);
    await run('customers', `DELETE FROM customers WHERE id = ANY($1::uuid[])`, C);

    // Suppliers, purchases and fabrics.
    await run('', `DELETE FROM supplier_payments WHERE "supplierId" = ANY($1::uuid[])`, S);
    await run('', `DELETE FROM purchase_returns WHERE "supplierId" = ANY($1::uuid[])`, S);
    await run('purchases', `DELETE FROM purchases WHERE id = ANY($1::uuid[])`, PUR);
    await run('', `DELETE FROM purchase_orders WHERE "supplierId" = ANY($1::uuid[])`, S);
    await run('', `DELETE FROM supplier_ledger WHERE "supplierId" = ANY($1::uuid[])`, S);
    await run('fabrics', `DELETE FROM fabrics WHERE id = ANY($1::uuid[])`, F);
    await run('suppliers', `DELETE FROM suppliers WHERE id = ANY($1::uuid[])`, S);
    await run('employees', `DELETE FROM employees WHERE id = ANY($1::uuid[])`, E);

    // Shop expenses and repeating bills of the demo (v1.7.0).
    const R = m.recurring ?? [];
    await run('expenses', `DELETE FROM expenses WHERE id = ANY($1::uuid[])`, X);
    await run('', `UPDATE expenses SET "recurringExpenseId" = NULL WHERE "recurringExpenseId" = ANY($1::uuid[])`, R);
    await run('', `DELETE FROM recurring_expenses WHERE id = ANY($1::uuid[])`, R);
    const CID = Tenant.require();
    if (U) await run('', `DELETE FROM system_settings WHERE "companyId" = $2::uuid AND key = $1`, `reports.saved_filters.${U}`, CID);

    // History of the demo, then the demo login itself.
    const all = [...C, ...S, ...F, ...E, ...P, ...O, ...PUR, ...PAY, ...X, ...R, ...(m.journals ?? [])];
    await run('', `DELETE FROM audit_logs WHERE ($1::uuid IS NOT NULL AND "userId" = $1::uuid) OR "recordId" = ANY($2::text[])`, U, all);
    // Offline sync history of the demo login (Phase 9); its conflicts are deleted with it.
    if (U) await run('syncEntries', `DELETE FROM sync_operations WHERE "userId" = $1::uuid`, U);
    if (U) await run('users', `DELETE FROM users WHERE id = $1::uuid`, U);
    await run('', `DELETE FROM login_attempts WHERE "companyId" = $3::uuid AND lower(identifier) IN ($1, $2)`, m.username ?? DEMO_USER.username, m.email ?? DEMO_USER.email, CID);
    await run('', `DELETE FROM system_settings WHERE "companyId" = $2::uuid AND key = $1`, DEMO_SETTING_KEY, CID);

    for (const [t, g] of GUARDS) await tx.$executeRawUnsafe(`ALTER TABLE ${t} ENABLE TRIGGER ${g}`);
  }, { timeout: 180_000 });

  return { status: 'removed', counts };
}

async function refreshPayrollTotals(tx: PrismaTx, payrollIds: string[]) {
  await tx.$executeRawUnsafe(
    `UPDATE payrolls p SET "totalGross" = COALESCE(x.gross, 0), "totalNet" = COALESCE(x.net, 0), "totalPaid" = COALESCE(x.paid, 0),
            "totalDeductions" = COALESCE(x.ded, 0)
       FROM (SELECT pp.id, SUM(i."grossAmount") gross, SUM(i."netAmount") net, SUM(i."paidAmount") paid,
                    SUM(i."absenceDeduction" + i."advanceDeduction" + i."otherDeductions") ded
               FROM payrolls pp LEFT JOIN payroll_items i ON i."payrollId" = pp.id WHERE pp.id = ANY($1::uuid[]) GROUP BY pp.id) x
      WHERE p.id = x.id`, payrollIds,
  );
}
