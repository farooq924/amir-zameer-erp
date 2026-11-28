# Phase 10 Report - Security, Backups & Deployment (v1.10.0)

Date: 2026-11-28. Software developed by Brandistan | www.brandistan.pk | 0333-2532924

## Delivered
### Backup & Restore (`/backup`, module `backup`)
* Encrypted backups of the whole database: `pg_dump` custom archive, AES-256-GCM with scrypt key, SHA-256 checksum,
  `.json` description next to every file. No plain data is ever written to disk.
* Daily automatic backup (default 23:00 Karachi, catches up after the PC was off), check after saving, keep newest N (14),
  optional second copy folder (USB / Google Drive / OneDrive folder), manual "Back up now" with note.
* Check file, Restore test (temporary database, 9 tables row-count comparison, then deleted), Download, Delete, Scan folder.
* Restore (Owner only, password + type RESTORE): check, restore test, version check, safety backup, single-transaction restore,
  backup list rebuilt from the folder, audit entry, everyone signs in again.
* Recovery key download (Owner + password), key never stored in the backups folder.
* CLI `dist/modules/backup/cli.js` (create, list, test, restore, key) and Windows scripts `backup-now.ps1`, `restore-backup.ps1`;
  `update-erp.ps1` now backs up before every update.

### Security Center (`/security`, module `security`)
* Checklist with score (HTTPS, cookies, API docs, Owner password, lockout, sign-out, failed logins, backups, recovery key,
  second copy, demo data, deactivated users with open sessions) with links to fix.
* Signed-in devices (all users or own), sign out one device or all other devices; Administrators cannot sign out the Owner.
* Login history (180 days) with filters; locked accounts with Unlock; "My Devices" in the user menu for every user.
* Housekeeping every 6 hours (old sessions, old login history).

### Hardening
* Permissions-Policy header (API + Nginx), clear 413 / 400 for too large or broken requests (was 500).
* Docker: PostgreSQL 18, backend image with pg_dump 18 (PGDG), backups + key volumes, API docs off.

### Documentation
docs/BACKUP-RESTORE.md, docs/SECURITY.md, docs/DEPLOYMENT.md (Windows + full VPS/Docker/Nginx/SSL guide), docs/HANDOVER.md,
ROADMAP (all phases done), .env.example (backup variables).

## Database
No migration. Uses the existing `backup_records` table; settings in `system_settings` keys `backup.config` and `backup.key_saved`.
New permissions `security.view`, `security.manage_settings` are added by the seed (update script runs it). Administrators get them automatically.

## Tests
* Backend: 28 suites, 228 tests passed (new: backup crypto 6, schedule 4, URL parsing 2 unit; `security-backup.e2e-spec.ts` 19 e2e incl. a performance smoke test).
* Frontend: 24 tests passed. Type check and production build clean.
* Restore checked also with a non-superuser database user (CREATEDB only), like the shop PC setup.
* Screenshots: docs/screenshots/phase-10 (desktop 1366 px and mobile 390 px).
* Not checked here: building the Docker image (no Docker daemon in the build environment).
