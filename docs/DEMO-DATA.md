# Demo login and Karachi demo data

A ready-made demo so the ERP can be shown to clients: a demo login plus realistic data for a tailoring shop in Karachi.
All names, phone numbers and CNICs are made up.

## Demo login

| Username | Password | Role |
|---|---|---|
| `demo` | `Demo@12345` | Manager (customers, orders, stock, staff, reports; payroll view only; no users or settings) |

## What is loaded

* 24 customers across Karachi (Gulshan-e-Iqbal, DHA, Clifton, North Nazimabad, Nazimabad, Saddar, PECHS, Bahadurabad, Korangi, Malir, Bahria Town ...), 03xx mobiles, VIP / regular / walk-in / corporate, two with old balances.
* Measurements (shalwar kameez, kurta, waistcoat, formal suit, shirt, pant) in inches.
* 33 orders over the last ~7 weeks in every state: new, cutting, stitching, trial, alteration, quality check, ready, part delivered, delivered, cancelled, overdue; customer fabric and shop fabric, fabric sales and alterations; advances and balance payments (cash, JazzCash / Easypaisa, bank transfer, card).
* 5 suppliers (Jodia Bazaar, Bolton Market, Tariq Road, SITE Area), 12 fabrics (wash & wear, cotton, latha, boski, karandi, khaddar, linen, suiting, blended; one below minimum stock), 5 purchases with part payments and supplier payments.
* 8 staff (master tailor, cutting master, per-piece tailors, finishing, helper, counter sales) with attendance for last month and this month, sick leave, overtime, salary advances, production (pieces) and last month's payroll approved and paid.
  The payroll is skipped when the ERP already has real employees (a demo payroll would include them).

Dates are spread over the past weeks so the dashboard charts look real. Every demo customer, supplier, fabric and employee note starts with `[Demo]`.

## Commands (Administrator PowerShell, in the project folder)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\load-demo-data.ps1     # add (safe to run twice)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\remove-demo-data.ps1   # remove everything demo
```

Developers: `pnpm --filter @az/backend demo:load | demo:remove | demo:status` (after `build`), or `demo:dev load` with ts-node.

## How removal stays safe

The loader records the demo's root records (user, customers, suppliers, fabrics, employees, payroll) in the `demo.data` system setting.
Removal deletes those and everything that belongs to them (orders, payments, ledgers, stock movements, measurements, attendance,
production, salary payments, audit entries), in one transaction. Append-only rules are paused only inside that transaction.
Customers created with the demo login are treated as demo too. If a real record uses demo data (for example a real order
with a demo fabric) nothing is removed and the message names the record. Document numbers (order, receipt) are not reused after removal.

Future modules that post their own records for orders, payments, purchases or payroll (for example Phase 6 journal entries)
must extend `apps/backend/src/demo/demo-remover.ts` so those records are removed too.
