# Deployment

AMIR ZAMEER ERP can run in two ways. Both are complete and supported.

| | A. Shop PC (current) | B. VPS with Docker |
|---|---|---|
| Where | Windows PC in the shop | Ubuntu cloud server (e.g. 2 vCPU / 4 GB) |
| Start | Windows scheduled task (auto-start, no login needed) | `docker compose` (restart: unless-stopped) |
| HTTPS | Cloudflare Tunnel -> `https://tailoringerp.brandistan.pk` | Nginx + Let's Encrypt (certbot) |
| Guide | docs/ONLINE-AUTO-START.md, docs/RUN-ON-WINDOWS.md | this file, part B |
| Backups | Backup page + scripts (docs/BACKUP-RESTORE.md) | same, folder = Docker volume `backups` |

## A. Shop PC (Windows)
Already live. Updates: paste the update zip into the project folder (Replace), then in an **Administrator PowerShell**:
```powershell
cd D:\Claude-AI\amir-zameer-erp
Get-ChildItem -Recurse -File | Unblock-File
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-erp.ps1
```
From v1.10.0 the update script makes a backup first. `SETUP-AUTO-START` already wrote `APP_URL=https://tailoringerp.brandistan.pk`
and `TRUST_PROXY=true` to `apps\backend\.env`, and the background server runs with `NODE_ENV=production` (API docs off).

## B. VPS with Docker (Ubuntu 24.04)
1. **Server**: create the VPS, point a DNS A record (e.g. `erp.example.com`) to its IP. Log in as a sudo user.
2. **Firewall**:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
   ```
3. **Docker + Nginx + certbot**:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo apt-get install -y nginx certbot python3-certbot-nginx
   ```
4. **Code and settings**:
   ```bash
   git clone https://github.com/farooq924/amir-zameer-erp.git && cd amir-zameer-erp
   cp .env.example .env && nano .env
   ```
   Set: `NODE_ENV=production`, `APP_URL=https://erp.example.com`, a long random `POSTGRES_PASSWORD` (also inside
   `DATABASE_URL` is not needed: docker-compose builds it), `OWNER_PASSWORD`, and `BACKUP_ENCRYPTION_KEY` (run `openssl rand -base64 32`;
   store a copy in your password manager).
5. **Start**:
   ```bash
   docker compose up -d --build
   docker compose exec backend node dist-seed/seed.js     # first time: roles + Owner (safe to re-run)
   ```
   PostgreSQL 18 has no published port; only the backend reaches it. The web app listens on `127.0.0.1:8080` only.
6. **Nginx site** `/etc/nginx/sites-available/amir-zameer-erp`:
   ```nginx
   server {
     server_name erp.example.com;
     client_max_body_size 10m;
     location / {
       proxy_pass http://127.0.0.1:8080;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_read_timeout 300s;   # restores of a large database
     }
   }
   ```
   ```bash
   sudo ln -s /etc/nginx/sites-available/amir-zameer-erp /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d erp.example.com --redirect      # free SSL, renews automatically
   ```
7. **Backups off the server** (daily, e.g. with cron to another server or object storage):
   ```bash
   docker run --rm -v amir-zameer-erp_backups:/b -v /root/erp-backups:/out alpine sh -c 'cp -n /b/*.azbak /b/*.json /out/'
   ```
   Then copy `/root/erp-backups` off the server (rclone / scp). Restore on the server:
   `docker compose exec backend node dist/modules/backup/cli.js restore <file>` then `docker compose restart backend`.
8. **Update**: `git pull && docker compose up -d --build` (migrations run automatically when the backend starts).
9. **Health**: `curl https://erp.example.com/api/health` -> `{"status":"ok","database":"up"}`. Add it to a free uptime monitor
   (e.g. UptimeRobot) for an alert when the ERP is down.

## Production settings reference
| Variable | Production value | Why |
|---|---|---|
| `NODE_ENV` | `production` | turns off API docs by default, production logging |
| `APP_URL` | `https://...` | CORS origin; Security Center HTTPS check |
| `COOKIE_SECURE` / `TRUST_PROXY` | `true` | Secure cookies behind Nginx / Cloudflare |
| `SWAGGER_ENABLED` | `false` | no public API docs |
| `BACKUP_ENCRYPTION_KEY` | random 32+ chars | backups readable only with this key |
| `BACKUP_DIR` | volume / folder | where `.azbak` files go |
| `PG_BIN_DIR` | optional | folder of `pg_dump` / `pg_restore` |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `SESSION_IDLE_MINUTES`, `SESSION_TTL_HOURS` | 5, 15, 120, 12 | login protection |
