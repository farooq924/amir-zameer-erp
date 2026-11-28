# Testing

| Suite | Command | What it covers |
|---|---|---|
| Backend unit | `pnpm --filter @az/backend test:unit` | Karachi date ranges (week/month/quarter/leap year/day boundary), decimal money, sequence format, secret redaction, Argon2id + password policy, permission & CSRF guards |
| Backend e2e (real PostgreSQL) | `pnpm --filter @az/backend test:e2e` | Login/logout, cookie flags, CSRF, lockout, IP rate limit, session expiry, RBAC enforcement per role, live permission changes, last-owner protection, user deactivation, password reset, settings validation + audit, append-only audit log, dashboard figures from real rows, concurrent document numbers, double-entry balance + immutability, stock non-negative + duplicate movement prevention, measurement immutability, payment duplicate/delete prevention, customers (codes, duplicate detection, idempotent create, optimistic locking, clearing fields, status, delete rules, opening-balance ledger, search by name/code/mobile, RBAC), measurements (templates, custom template, field deactivation, versioning, concurrent saves, unit conversion in compare, validation, custom fields, recent list) |
| Frontend unit | `pnpm --filter @az/frontend test` | Permission helpers & navigation filtering, PKR/date formatting, login form validation, error display, cookie-based login request, measurement form (required fields, number/range validation, prefill from latest version, inch/cm conversion, idempotent save request) |
| Browser (Playwright) | `E2E_PASSWORD=... pnpm --filter @az/frontend test:e2e` | Login, dashboard, audit log page, logout, wrong-password message; create customer, search by mobile, take measurement (required-field check), new version, compare, print sheet |

The e2e suite rebuilds the `amir_zameer_erp_test` database from migrations before each run.
It refuses to run against a database whose name does not end in `_test`.

## Phase 1 results (2026-11-26)
* Backend: 9 suites, 59 tests passed.
* Frontend: 3 files, 10 tests passed.
* Playwright: 2 passed.
* Manual browser walkthrough: owner login, dashboard (empty + with sample data), create receptionist user, roles matrix, settings save, audit log, planned-module page, receptionist sees only permitted menu items and gets "Access denied" on Audit Logs, 390 px mobile layout without horizontal scroll.

## Phase 2 results (2026-11-26)
* Backend: 12 suites, 90 tests passed (31 new: phone/unit conversion units, 10 customer e2e, 10 measurement e2e).
* Frontend: 4 files, 14 tests passed (4 new for the measurement form).
* Playwright: 3 passed (new customer + measurement workflow).
* Type check (`pnpm -r typecheck`) and production build (`pnpm build`) clean.
* Manual browser check on desktop (1366 px) and mobile (390 px): customers list, profile tabs, measurement card, new-version form, templates list and editor, recent measurements, print sheet.

## Phase 3 results (2026-11-27)
* Backend: 14 suites, 110 tests passed (20 new: 4 order-maths unit tests, 16 orders/garments e2e).
  Orders e2e covers: garment prices, booking with totals + measurement snapshot + advance receipt + ledger, idempotent create, validation,
  blocked customers, frozen snapshots (database trigger), revision with optimistic locking and ledger difference, configurable stages and
  per-garment status, custom stage, assignment, idempotent payments, concurrent payments (only one succeeds), overpayment refused,
  append-only adjustments, partial and full delivery, cancel with ledger reversal and customer credit, duplicate / alteration orders,
  search and filters, concurrent order numbers, role permissions (receptionist / tailor).
* e2e suites now run in alphabetical order (`test/sequencer.js`) because they share one test database.
* Frontend: 4 files, 15 tests passed. Playwright: new `e2e/orders.spec.ts` (customer -> measurement -> order -> status -> part delivery -> payment -> search) passed.
* Type check and production build clean. Manual check on desktop (1366 px) and mobile (390 px): orders list, new order tabs, success modal,
  order details, dialogs, receipt (80 mm), workshop job card (A4), garments, workflow stages.

## Phase 5 results (2026-11-27)
* Backend: 17 suites, 143 tests passed. New `payroll-calc.spec.ts` (monthly with absences, mid-month joiner, daily wage, per piece,
  fixed + incentive, overtime / bonus / deductions, advance caps, employed days) and `test/payroll.e2e-spec.ts` (employee codes, CNIC
  duplicates, optimistic locking, salary history, daily attendance + register, leave approval into attendance, overtime approval,
  production limits, idempotent advances, payroll calculation, draft edits, stale-figures check on approve, month lock, reopen,
  part / full / pay-all payments with idempotency, salary payments immutable, payslip, role access).
* Frontend: 5 files, 17 tests. Playwright: `e2e/employees.spec.ts` passed.

## Phase 6 results (2026-11-27)
* Backend: 157 tests passed. New `posting.spec.ts` (line building, cash account by method, Karachi dates) and
  `test/phase6-finance.e2e-spec.ts` (automatic posting of orders, receipts, purchases, payroll and expenses; sync runs twice without
  duplicates; refunds and reversals; expense approval, rejection and cancel; recurring bills; manual journals and reversal; trial balance,
  P&L and balance sheet in balance; month close / reopen / lock; role access; journal clean-up for demo data).
* Frontend: 5 files, 17 tests; type check and production build clean.

## Phase 7 results (2026-11-27)
* Backend: 21 suites, 172 tests passed. New `test/phase7-reports.e2e-spec.ts` (11 tests): all 30 reports run for the owner; order register
  filter, totals, search, sort and paging; customer ledger balance equals the outstanding report; expense reports agree with P&L, trial
  balance and balance sheet (balanced); bad filters give 400 and unknown reports 404; Excel / CSV / PDF export with the developer footer and
  an audit entry; CSV formula neutralising; role access (inventory manager sees only stock reports, cashier none); saved filters per user;
  cancelled orders listed but kept out of the totals.
* Frontend: 6 files, 20 tests (new report cell formatting test); type check and production build clean.
* Manual check at 1366 px and 390 px: reports home, viewer, columns, export, saved filters and A4 print. Screenshots in `docs/screenshots/phase-7`.

## Phase 10 results (2026-11-28)
* Backend: 28 suites, 228 tests passed. New unit tests: backup encryption (no readable data, wrong key, changed byte, not a backup),
  Karachi backup schedule, DATABASE_URL to pg_dump connection. New `test/security-backup.e2e-spec.ts` (19): security headers,
  mass assignment, 413 body limit, SQL/script text, error bodies, performance smoke test (90th percentile < 1.5 s on 6 main screens),
  Security Center permissions, sessions (own / all / revoke rules), lockout + unlock, backup permissions, encrypted backup, download,
  verify, restore test, Owner-only restore, real restore with safety backup, settings + second copy, recovery key, daily schedule +
  retention, delete, folder scan.
* Frontend: 24 tests passed. Type check and production build clean.
* Manual browser check desktop (1366 px) and mobile (390 px): Backup page, restore test result, restore dialog, recovery key dialog,
  Security Center overview, devices, login history, locked accounts.
