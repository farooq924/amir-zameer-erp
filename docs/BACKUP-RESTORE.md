# Backup & Restore (Phase 10)

## What is backed up
The **whole PostgreSQL database**: customers, measurements, orders, payments, stock, staff, payroll, accounting, settings,
users, audit log, WhatsApp messages and sync history. One backup = one file `AZ-backup-YYYYMMDD-HHMMSS-auto.azbak`
(or `-manual`) plus a small description file `<same name>.json`.

## How it is protected
| | |
|---|---|
| Format | `pg_dump` custom archive, compressed |
| Encryption | AES-256-GCM, key stretched with scrypt; every file has its own random salt + IV |
| Tamper check | GCM authentication tag + SHA-256 checksum; a changed byte or a wrong key is detected |
| Plain data on disk | Never: the dump is encrypted while it is written, and restore streams the decrypted archive straight into `pg_restore` |
| Key | `BACKUP_ENCRYPTION_KEY` in `apps/backend/.env`, or (default) a random key in `apps/backend/backup.key`, created on the first backup. The key is **not** inside the backups folder. |

> **Download the recovery key once** (Backup page > *Download recovery key*, Owner only, password required) and keep it on a USB
> drive and in your email. Without the key nobody (also not the developer) can open the backups, for example on a new PC.

## Automatic backups
* Daily at the time set on the Backup page (default **23:00 Karachi time**). The ERP checks every 5 minutes; if the PC was off
  at that time, the backup runs as soon as the ERP is on again.
* Each backup is checked after saving (decrypt + archive table list) and shows **Verified**.
* The newest **14** automatic backups are kept (3-365, Backup settings); older ones are deleted. Manual backups stay until you delete them.
* **Second copy folder** (recommended): a USB drive, another disk, or a Google Drive / OneDrive folder on the PC, e.g.
  `G:\My Drive\ERP-Backups`. Every backup and its `.json` file is copied there.
* `scripts\update-erp.ps1` makes a backup ("Before update") before every update.

## Buttons on the Backup page
| Action | Who | What it does |
|---|---|---|
| Back up now | backup.create | Encrypted backup now (optional note) |
| Check file | backup.create | Checksum + full decryption + table list |
| Restore test | backup.create | Restores into a temporary database `<db>_restore_check`, compares row counts of 9 main tables with the counts saved in the backup, then deletes the temporary database. Live data is not touched. |
| Download | backup.export | Downloads the encrypted `.azbak` |
| Restore this backup | **Owner only**, password + type `RESTORE` | 1. check file, 2. restore test, 3. safety backup of current data, 4. replace all data in **one transaction** (all or nothing), 5. everyone signs in again |
| Delete | backup.approve | Deletes the file, its `.json` and its second copy |
| Scan folder | backup.create | Adds `.azbak` files found in the backups folder (e.g. copied from another PC) |
| Settings | backup.approve | Daily on/off, time, how many to keep, second folder, check after saving |

A backup made by a **different ERP version** (different database structure) is not restored from the web page. Use
`scripts\restore-backup.ps1`, which restores and then updates the database structure.

## Windows scripts (Administrator PowerShell, in the project folder)
```powershell
# backup now
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-now.ps1
# restore (lists the backups and asks which one); also works when the ERP does not start
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-backup.ps1
# restore a file from a USB drive
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-backup.ps1 -File "E:\ERP-Backups\AZ-backup-20261128-230000-auto.azbak"
```
Command line tool (any OS): `node apps/backend/dist/modules/backup/cli.js create | list | test <file> | restore <file> | key`.

## Move the ERP to a new PC (disaster recovery)
1. Install the ERP on the new PC (docs/RUN-ON-WINDOWS.md + SETUP-AUTO-START), with an empty database.
2. Open `apps\backend\.env` and add the line from your recovery key file: `BACKUP_ENCRYPTION_KEY=<key>`.
3. Copy the newest `.azbak` (and its `.json`) from the USB / Google Drive folder.
4. Run `scripts\restore-backup.ps1 -File "<path to the .azbak>"` and type `RESTORE`.
5. Sign in with your normal (old) username and password.

## Requirements
* `pg_dump` / `pg_restore` of the same or newer major version as the server. Found automatically in
  `C:\Program Files\PostgreSQL\<newest>\bin` on Windows; otherwise set `PG_BIN_DIR`.
* The database user needs the **CREATEDB** right for the restore test (docs/RUN-ON-WINDOWS.md creates `az_erp` with it).
  Without it: `ALTER USER az_erp CREATEDB;` as `postgres`.
