# Share the ERP online from your PC (Cloudflare Tunnel)

Lets a client open the ERP from anywhere while it runs on your Windows PC. Free. Your PC must stay on
and the share window must stay open. Nothing is uploaded to the cloud: the database stays on your PC.

```
Client browser --HTTPS--> Cloudflare --tunnel--> your PC: frontend :5173 --/api--> backend :4000 --> PostgreSQL
```
Only one link is needed: the frontend forwards `/api` to the backend.

## 1. Install cloudflared (once)
PowerShell:
```powershell
winget install --id Cloudflare.cloudflared
```
Close and reopen PowerShell, then check: `cloudflared --version`.
(No winget? Download `cloudflared-windows-amd64.msi` from https://github.com/cloudflare/cloudflared/releases/latest and install it.)

## 2. Before you share (security)
The link is public: anyone who has it can see the login page.
1. Log in as `owner` and change the owner password to a strong one (12+ characters).
2. Create a separate user for the client in **Users** with a limited role (for example *Sales Staff* or
   *Manager*), never *Owner*. Give the client only that username and password.
3. Use test data, not real customer data, while the client is testing.
4. Stop sharing (Ctrl+C) when the test is over.

## 3. Share (Quick Tunnel - no account, no domain)
Either double-click `SHARE-ERP-ONLINE.cmd` in the project folder, or in PowerShell:
```powershell
cd D:\Claude-AI\amir-zameer-erp
pnpm share
```
The script:
1. builds the shared package and the frontend,
2. opens a window **AZ ERP - Backend** (with `TRUST_PROXY=true`),
3. opens a window **AZ ERP - Frontend** (fast built version on port 5173),
4. starts the Cloudflare Tunnel and prints a link like `https://random-words.trycloudflare.com`
   (also copied to the clipboard).

Send that link to the client. The link changes every time you run the script.
Stop: press `Ctrl+C` in the share window. It closes the backend, frontend and tunnel.

Do not run `pnpm dev:backend` / `pnpm dev:frontend` at the same time; the script starts them itself.

Options (PowerShell, from the project folder):
| Command | Use |
|---|---|
| `powershell -ExecutionPolicy Bypass -File scripts\share-online.ps1 -Dev` | Vite dev server (live reload) instead of the built version. Slower for the client. |
| `... -SkipBuild` | Skip the build when nothing changed since the last run. |

## 4. Optional: fixed link on your own domain (named tunnel)
Needs a free Cloudflare account and a domain whose DNS is managed by Cloudflare.
```powershell
cloudflared tunnel login                                   # opens the browser, pick your domain
cloudflared tunnel create amir-erp
cloudflared tunnel route dns amir-erp erp.yourdomain.com
```
Then share with:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\share-online.ps1 -TunnelName amir-erp -Hostname erp.yourdomain.com
```
The link is always `https://erp.yourdomain.com`.
Extra hosts can also be allowed permanently in `apps\frontend\.env.local`: `ERP_ALLOWED_HOSTS=erp.yourdomain.com`.

## What was changed in the ERP to make this work
- `apps/frontend/vite.config.ts`: allows `*.trycloudflare.com` and `ERP_ALLOWED_HOSTS`; the built version
  (`vite preview`) also forwards `/api` to the backend.
- Backend login cookies become `Secure` automatically when the request came over HTTPS through the tunnel
  (`TRUST_PROXY=true`). Plain `http://localhost:5173` keeps working as before.
- With `TRUST_PROXY=true` the audit log and login limits see the client's real IP, not 127.0.0.1.

## Problems
| Message | Fix |
|---|---|
| `cloudflared is not installed` | Step 1, then reopen PowerShell |
| `Port 4000/5173 is already in use` | Close other ERP windows (`pnpm dev:backend`, `pnpm dev:frontend`) |
| Client sees `Blocked request. This host is not allowed` | Custom domain: pass `-Hostname`, or set `ERP_ALLOWED_HOSTS` |
| Link does not open right away | Wait 30 seconds; Quick Tunnel links take a moment |
| Client logs in but is sent back to login | Start the ERP with the share script (not `pnpm dev:backend`) and give the client the `https://` link |
| Running scripts is disabled | Use `SHARE-ERP-ONLINE.cmd` or `pnpm share` (they bypass the policy for this script only) |
| Tunnel stopped | See `logs\cloudflared.log` |
