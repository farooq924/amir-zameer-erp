# ERP always online at tr-erp.brandistan.pk (auto-start on this PC)

Goal: whenever this PC/laptop is switched on, the ERP is live at **https://tr-erp.brandistan.pk**
with nothing to start by hand. The ERP and the database stay on this PC.

```
Browser (anywhere) --HTTPS--> Cloudflare --tunnel--> this PC: ERP on port 4000 --> PostgreSQL
```

What runs by itself after setup:
| Part | How it starts | Name in Windows |
|---|---|---|
| PostgreSQL | Windows service (already) | `postgresql-x64-18` |
| ERP (API + web app, port 4000) | Task Scheduler, "At startup", no login needed | Task `AMIR ZAMEER ERP` |
| Cloudflare Tunnel | Windows service | `cloudflared` |

## Step A - Cloudflare (one time, in the browser)

### A1. brandistan.pk must use Cloudflare DNS
Log in at https://dash.cloudflare.com (free account). If **brandistan.pk** is already listed with status
**Active**, go to A2.

If not:
1. **Add a domain** > type `brandistan.pk` > choose the **Free** plan.
2. Cloudflare copies the existing DNS records. Check that the website and email records (A, CNAME, MX, TXT)
   of brandistan.pk are all there, so the website and email keep working.
3. Cloudflare shows two nameservers (like `xxx.ns.cloudflare.com`). Log in where brandistan.pk was bought
   (PKNIC or your reseller) and replace the nameservers with these two.
4. Wait until Cloudflare shows **Active** (usually 1-24 hours; you get an email).

### A2. Create the tunnel
1. In the Cloudflare dashboard open **Zero Trust** > **Networks** > **Tunnels**
   (on newer dashboards: **Networks** > **Connectors** > **Cloudflare Tunnels**).
2. **Create a tunnel** > type **Cloudflared** > name `amir-zameer-erp` > Save.
3. Choose **Windows**. Cloudflare shows a command like
   `cloudflared.exe service install eyJhIjoi...`. **Copy it** (you paste it in step B). Keep it private:
   anyone with it can run your tunnel.
4. Next > **Public hostname**:
   - Subdomain: `tr-erp`
   - Domain: `brandistan.pk`
   - Service type: `HTTP`
   - URL: `localhost:4000`
5. Save.

## Step B - This PC (one time)
1. Apply the update zip (Replace) into `D:\Claude-AI\amir-zameer-erp`.
2. Close any PowerShell window running `pnpm dev:backend` or `pnpm dev:frontend`.
3. Double-click **`SETUP-AUTO-START.cmd`** in the project folder. Click **Yes** when Windows asks.
4. It installs packages, builds the ERP, updates the database, registers auto-start and starts the ERP
   (5-10 minutes the first time).
5. When it asks for the token, paste the command copied in A2 step 3 and press Enter.
6. Done. Open https://tr-erp.brandistan.pk (and http://localhost:4000 on this PC).

Also set **Settings > System > Power > Screen and sleep > "When plugged in, put my device to sleep after" = Never**.
A sleeping PC is offline. On a laptop, also set "When I close the lid" to **Do nothing** (Control Panel > Power Options).

## Updates later
1. Paste the update zip into `D:\Claude-AI\amir-zameer-erp` (Replace).
2. Double-click **`UPDATE-ERP.cmd`**, click **Yes**.
It stops the ERP, rebuilds, updates the database (migrate + seed) and starts it again. The link stays the same.

## Security
The ERP is on the internet now.
- Change the `owner` password to a strong one (12+ characters).
- Give every person (client, staff) their own user with a limited role; never share the owner login.
- Keep the tunnel token private.

## Useful checks
| Check | How |
|---|---|
| Is the ERP running? | Open http://localhost:4000 on this PC |
| Server messages / errors | `logs\erp-server.log`, `logs\erp-server-errors.log`, `logs\erp-server-events.log` |
| Tunnel status | Cloudflare dashboard > Tunnels: status **Healthy** |
| Restart the ERP | Double-click `UPDATE-ERP.cmd` (or Task Scheduler > `AMIR ZAMEER ERP` > End, then Run) |
| Turn everything off for good | Run in the project folder: `.\SETUP-AUTO-START.cmd -Uninstall` |

## Problems
| Problem | Fix |
|---|---|
| Domain shows Cloudflare error 1033 | The PC is off/asleep or the `cloudflared` service is stopped (Services > cloudflared > Start) |
| Domain shows error 502 | The ERP is not running: check `logs\erp-server-errors.log`, then run `UPDATE-ERP.cmd` |
| `Port 4000 is in use` during setup | Close windows running `pnpm dev:backend` |
| `pnpm dev:backend` says port 4000 in use | Normal: the ERP is already running in the background. Use http://localhost:4000 |
| Token rejected | Copy the full command again from Cloudflare (A2 step 3) and run `SETUP-AUTO-START.cmd` again |

## Technical notes
- In production the backend serves the built web app (`apps/frontend/dist`) on port 4000 next to `/api`,
  so one address runs the whole ERP. `FRONTEND_DIST` in `apps\backend\.env` can point elsewhere.
- The server runs with `NODE_ENV=production` (API docs at /api/docs are off) and `TRUST_PROXY=true`
  (real client IPs in the audit log; login cookies marked Secure over HTTPS).
- Setup writes `APP_URL=https://tr-erp.brandistan.pk` and `TRUST_PROXY=true` to `apps\backend\.env`.
  Another domain: `SETUP-AUTO-START.cmd -Domain erp.example.com`.
