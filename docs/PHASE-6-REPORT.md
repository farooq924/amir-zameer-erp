# Phase 6 - Payments, Expenses & Accounting: Completion Report (2026-11-27)

Version: **1.6.0** (bottom of the side menu; click it for release notes).

## Implemented
* **Automatic double-entry books.** Every money and stock event already in the ERP is posted to the journal without any typing:
  customer receipts and refunds, order charges and discounts, fabric purchases and returns, supplier payments, stock adjustments,
  payroll (salaries payable), salary payments, staff advances and write-offs, and expenses. Each source document is posted once only
  (unique source key), so running the sync again never doubles anything. The sync runs a few seconds after the server starts, then every
  minute, and also before every report and the dashboard. If a document falls in a closed month it is posted on today's date.
* **Chart of accounts** (`/accounting` > Chart of Accounts): 37 standard accounts for a Karachi tailoring shop (Cash in Hand, Bank Account,
  Mobile Wallet (JazzCash / Easypaisa), Customer Receivables, Staff Advances, Fabric Stock, Supplier Payables, Salaries Payable, Owner's Capital,
  Drawings, Stitching Income, Fabric Sales, Discounts Given, Fabric Cost, Salaries & Wages, Shop Rent, Electricity (K-Electric), Gas (SSGC) ...).
  Add your own accounts; system accounts cannot be removed. Click an account to open its **ledger** with opening balance, every line and
  running balance (printable).
* **Payments** (`/payments`):
  * Cards: received today, received this month (by method), paid out this month (suppliers, salaries, expenses), net cash.
  * Tabs: Customer receipts, Refunds, Supplier payments, Salary payments, with search, method and date filters.
  * *Receive payment* against any order with a balance. *Refund* for overpaid orders (`RFD-YYYY-00001`). *Reverse* a wrong receipt with a reason.
    Refund and reverse need the approve permission; both write to the customer ledger and the books.
* **Expenses** (`/expenses`):
  * `EXP-YYYY-00001`, category, description, paid to, method, bill / reference, notes.
  * Owner / managers with approve permission: saved as Approved and posted at once. Other staff: Waiting for approval; approve or reject later.
    Cancelling an approved expense posts a reversal (nothing is deleted).
  * 15 categories ready (Shop Rent, Electricity, Gas, Water, Internet & Phone, Staff Food & Tea, Transport & Delivery, Repairs & Maintenance,
    Stationery & Printing, Tailoring Accessories, Marketing, Bank Charges, Generator Fuel, Cleaning & Security, Miscellaneous), each linked to an account.
  * *Recurring* bills (monthly / weekly / yearly) with a "Create due expenses" button.
  * Charts: this month by category, last 6 months. A5 **expense voucher** print with signature boxes and the Brandistan footer.
* **Accounting** (`/accounting`): Overview, Profit & Loss, Balance Sheet (balanced check), Cash Flow (cash, bank and wallet by source),
  Trial Balance, Journal (search, view any entry, **manual journal entry** for capital, drawings, opening balances, corrections, with reverse),
  Chart of Accounts, **Month Closing** (close, reopen, lock; a locked month can never change).
* **Dashboard** net profit now includes approved expenses.

## Database
No new tables (created in Phase 1). New migration `20261127200000_finance_rules`, safe on live data: approved expenses cannot be
edited or deleted (only cancelled), rejected / cancelled expenses are final, locked months cannot change, two speed indexes.
On first start the server adds any missing standard accounts and expense categories (existing ones are kept).

## Tests
* Backend: **157 tests** passed (new: posting unit tests, `test/phase6-finance.e2e-spec.ts` with 15 tests: automatic posting of orders,
  receipts, purchases, payroll and expenses; idempotent sync; refunds; reversals; expense approval flow; recurring bills; manual journals;
  trial balance, P&L and balance sheet balance; month close / lock; role access; journal clean-up for demo data).
* Frontend: 17 tests, type check and production build clean. Manual check at 1366 px and 390 px: all new pages, dialogs and the voucher print.
