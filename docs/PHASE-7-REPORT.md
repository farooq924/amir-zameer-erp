# Phase 7 - Reports & Exports: Completion Report (2026-11-27)

Version: **1.7.0** (bottom of the side menu; click it for release notes).

## Implemented
* **Reports home** (`/reports`): all 30 reports grouped by area (Sales & Orders, Customers, Inventory & Purchases, Staff & Payroll,
  Expenses, Accounts, System) with a search box. Reports a user's role cannot open are shown locked.
* **One report viewer** (`/reports/<report>`) for every report:
  * Period: Today, Yesterday, This / Last week, This / Last month, This quarter, This year or Custom range (statements use "As of" a date).
  * Filters that fit the report: customer (type to search by name, code or mobile), employee, supplier, garment, order stage, payment status,
    payment method, expense category / status, fabric / fabric category, movement type, stock status, account, audit module and user.
  * Search inside the report, click a column header to sort, 25 / 50 / 100 / 250 rows per page, totals row.
  * **Columns**: show or hide columns; the choice is remembered on this device.
  * **Saved filters**: save the current filters with a name, open them again with one click, delete them (per user).
  * **Export**: Excel (.xlsx), CSV and PDF of all rows and the visible columns, each with the business name, period and the developer footer;
    PDF pages are numbered. Every export is written to the audit log.
  * **Print**: A4 (landscape when more than 6 columns) with summary boxes, totals and the Brandistan footer.
  * Phones: filters fold behind a "Filters" button and rows show as cards.
* **The 30 reports**
  1. Daily Sales 2. Monthly Sales 3. Stitching Revenue 4. Fabric Sales 5. Order Register 6. Pending Orders 7. Delivered Orders
  8. Delayed Orders 9. Customer Ledger 10. Customer Outstanding 11. Customer Payments 12. Fabric Stock 13. Stock Movements
  14. Fabric Consumption 15. Supplier Ledger 16. Purchase Register 17. Employee Attendance 18. Employee Production 19. Employee Salary
  20. Daily Wages 21. Advance Register 22. Overtime 23. Expense Register 24. Expense Summary 25. Profit & Loss 26. Cash Flow
  27. Balance Sheet 28. Trial Balance 29. General Ledger 30. Audit Log.
* Cancelled orders and rejected / cancelled expenses are listed (greyed) but never added to totals.
* **Access**: a report opens only with the Reports permission **and** permission for its data (e.g. Payroll for salary reports, Accounting for
  statements). Export needs "Export" and print needs "Print" on Reports. The owner sees everything.

## Database
No migration and no new tables. Saved filters are stored in the settings table. New backend packages: `exceljs` and `pdfkit`
(installed by the update script).

## Demo data
The demo loader now also adds Karachi expenses (rent, K-Electric, SSGC, water, StormFiber, chowkidar, tea, rickshaw, diesel ...),
2 expenses waiting for approval, 3 recurring bills, the owner's opening capital and 3 saved report filters. The remover deletes all of it.

## Tests
* Backend: **172 tests** passed (new `test/phase7-reports.e2e-spec.ts`, 11 tests: every report runs, filters, totals, search, sort, paging,
  ledger vs outstanding, statements balance, bad filters rejected, Excel / CSV / PDF export with footer and audit, CSV formula guard,
  role access, saved filters, cancelled orders out of totals).
* Frontend: 20 tests, type check and production build clean. Manual check at 1366 px and 390 px. Screenshots: `docs/screenshots/phase-7`.
