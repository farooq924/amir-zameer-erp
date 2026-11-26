# Testing

| Suite | Command | What it covers |
|---|---|---|
| Backend unit | `pnpm --filter @az/backend test:unit` | Karachi date ranges (week/month/quarter/leap year/day boundary), decimal money, sequence format, secret redaction, Argon2id + password policy, permission & CSRF guards |
| Backend e2e (real PostgreSQL) | `pnpm --filter @az/backend test:e2e` | Login/logout, cookie flags, CSRF, lockout, IP rate limit, session expiry, RBAC enforcement per role, live permission changes, last-owner protection, user deactivation, password reset, settings validation + audit, append-only audit log, dashboard figures from real rows, concurrent document numbers, double-entry balance + immutability, stock non-negative + duplicate movement prevention, measurement immutability, payment duplicate/delete prevention |
| Frontend unit | `pnpm --filter @az/frontend test` | Permission helpers & navigation filtering, PKR/date formatting, login form validation, error display, cookie-based login request |
| Browser (Playwright) | `E2E_PASSWORD=... pnpm --filter @az/frontend test:e2e` | Login, dashboard, audit log page, logout, wrong-password message |

The e2e suite rebuilds the `amir_zameer_erp_test` database from migrations before each run.
It refuses to run against a database whose name does not end in `_test`.

## Phase 1 results (2026-11-26)
* Backend: 9 suites, 59 tests passed.
* Frontend: 3 files, 10 tests passed.
* Playwright: 2 passed.
* Manual browser walkthrough: owner login, dashboard (empty + with sample data), create receptionist user, roles matrix, settings save, audit log, planned-module page, receptionist sees only permitted menu items and gets "Access denied" on Audit Logs, 390 px mobile layout without horizontal scroll.
