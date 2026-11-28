# Security (Phase 10 review)

## Controls in place
| Area | Control |
|---|---|
| Passwords | Argon2id (19 MiB, t=2); policy: 10+ chars, upper + lower case, number; change logs out other devices |
| Login | Generic error message; account lock after `LOGIN_MAX_ATTEMPTS` (5) wrong passwords for `LOGIN_LOCK_MINUTES` (15); 30 failures per IP / 15 min block; login rate limit 10/min/IP; constant-time check for unknown users |
| Sessions | Server-side sessions table, random 256-bit token (only SHA-256 stored), HTTP-only + SameSite=Strict cookie, Secure on HTTPS, idle timeout 120 min, absolute 12 h, instant revoke |
| CSRF | Double-submit token checked on every POST/PUT/PATCH/DELETE |
| Authorisation | Server-side RBAC on every route (8 roles x 23 modules x 8 actions); Owner-only for restore and recovery key, with password re-entry |
| Input | Global validation with whitelist + forbidNonWhitelisted (mass assignment blocked), 1 MB JSON limit (413), Prisma parameterised queries (no SQL injection), React escaping (no stored XSS) |
| Headers | Helmet (CSP, X-Frame-Options SAMEORIGIN, nosniff, Referrer-Policy no-referrer, HSTS), Permissions-Policy, no X-Powered-By |
| Errors | One JSON shape, no stack traces / SQL to clients, request id for logs |
| Data integrity | Database triggers: append-only audit log, ledgers, measurement versions; posted journals immutable; payments not deletable |
| Audit | Every change, login, logout, lock, unlock, session revoke, backup, restore, key download |
| Backups | Encrypted AES-256-GCM, verified, restore-tested, second copy, retention |
| Secrets | Only in `apps/backend/.env` (never in git); WhatsApp tokens masked; backup key outside the backups folder |
| Network | PostgreSQL only on localhost / Docker network; HTTPS via Cloudflare Tunnel or Nginx + Let's Encrypt |

## Security Center (`/security`)
* **Checklist with score**: HTTPS address, secure cookies, API docs off in production, Owner password changed after setup,
  login protection, automatic sign-out, failed logins (24 h), backup age, recovery key downloaded, second backup copy,
  demo data still loaded, open sessions of deactivated users.
* **Signed-in devices**: every active session (device, address, last active); sign out one device, or *Sign out my other devices*.
  Every user sees their own devices (user menu > My Devices). An Administrator cannot sign out the Owner.
* **Login history** (kept 180 days) with filter failed / successful and search by username or address.
* **Locked accounts** with Unlock (security.manage_settings).
* Housekeeping every 6 hours removes sessions that ended more than 30 days ago and login history older than 180 days.

## Tests
`test/security-backup.e2e-spec.ts` (18 tests): headers, mass assignment, oversized body, SQL/script text in search, no internals in
errors, overview permissions, own vs all sessions, revoke rules, lockout + unlock, backup permissions, encryption (no readable
data in the file), download, verify, restore test, Owner-only restore with password and RESTORE, real restore (record made after
the backup disappears, triggers still active), settings validation, second copy, recovery key, daily schedule + retention, delete, folder scan.

## Owner checklist after go-live
1. Change the Owner password (user menu > Change Password).
2. Remove demo data: `scripts\remove-demo-data.ps1`.
3. Backup page: download the recovery key, set a second copy folder, press Back up now, run a Restore test.
4. Give every staff member their own login with the smallest role that fits; deactivate leavers at once.
5. Look at the Security Center once a week; aim for 100%.
