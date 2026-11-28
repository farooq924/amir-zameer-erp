# Handover - AMIR ZAMEER ERP

Software developed by Brandistan | www.brandistan.pk | 0333-2532924

## 1. What the owner receives
* The ERP (web app + offline app) with 23 modules: dashboard, customers, measurements, orders, garments, fabric inventory,
  purchases, suppliers, employees, attendance, production, payroll, expenses, payments, accounting, 30 reports,
  WhatsApp, offline desk + sync, security center, backup & restore, audit logs, settings, users & roles.
* Source code: https://github.com/farooq924/amir-zameer-erp (main branch). Phase reports: docs/PHASE-1-REPORT.md ... PHASE-10-REPORT.md.
* Live address: https://tailoringerp.brandistan.pk (shop PC + Cloudflare Tunnel, auto-start).

## 2. Accounts and secrets (keep private)
| Item | Where it lives | Who keeps a copy |
|---|---|---|
| Owner login | ERP database (Argon2id hash) | Owner only |
| Database password | `apps\backend\.env` (`DATABASE_URL`) | Owner (password manager) |
| Backup recovery key | `apps\backend\backup.key` or `BACKUP_ENCRYPTION_KEY` | Owner: USB drive + email (Backup > Download recovery key) |
| Cloudflare account | cloudflare.com | Owner |
| WhatsApp Cloud API token (optional) | Settings > WhatsApp (masked) | Owner |

## 3. Daily / weekly / monthly routine
| When | What |
|---|---|
| Daily (automatic) | 23:00 encrypted backup, checked; copy to the second folder |
| Weekly (5 minutes) | Security Center: score, failed logins, devices. Backup page: last backup "Verified". |
| Monthly | Backup page: Restore test on the newest backup. Copy one backup to a USB drive kept outside the shop. |
| When staff leave | Users & Roles: deactivate the user (signs them out everywhere at once). |
| Each update | Paste the update zip, run `scripts\update-erp.ps1` (backs up first). |

## 4. If something goes wrong
| Problem | Fix |
|---|---|
| ERP does not open | Check the PC is on; run `scripts\update-erp.ps1` (restarts it); see `logs\erp-server-errors.log` |
| Wrong data entered / deleted by mistake | Audit Logs shows who changed what. Restore only if really needed: Backup > Restore test first, then Restore |
| PC broken / stolen | New PC: install ERP, put the recovery key in `.env`, `scripts\restore-backup.ps1 -File <backup>` (docs/BACKUP-RESTORE.md) |
| Account locked | Security > Locked accounts > Unlock (or wait 15 minutes) |
| Forgotten staff password | Users & Roles > Reset password |
| Forgotten Owner password | A second Owner/Administrator resets it; otherwise contact Brandistan |

## 5. Go-live checklist
- [ ] Owner password changed after setup
- [ ] Demo data removed (`scripts\remove-demo-data.ps1`)
- [ ] Business details, logo, print settings filled in (Settings)
- [ ] Staff users created with the right roles
- [ ] Recovery key downloaded and stored twice
- [ ] Second backup folder set; first manual backup + restore test passed
- [ ] Security Center score reviewed
- [ ] `apps\backend\.env`: `NODE_ENV=production`, `APP_URL=https://tailoringerp.brandistan.pk`, `SWAGGER_ENABLED=false`
