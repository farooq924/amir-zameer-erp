# Phase 9 Report: Offline App & Sync (v1.9.0)

## Delivered
**Installable offline app (PWA)**
* `vite-plugin-pwa` (Workbox) service worker precaches the app screens; `manifest.webmanifest` with navy/gold icons
  (`apps/frontend/public/icons`), shortcuts to Offline Desk and Sync Center. "Update now" prompt when a new version is deployed.
* Install button (Chrome / Edge / Android) in Sync Center > Offline app; iPhone instructions shown.
* The signed-in profile is remembered on the device (no password or secret), so the ERP opens without internet and starts on the
  Offline Desk. The server still checks the session and every permission on sync. Logout warns if unsynced work exists and
  removes the downloaded data (unsent entries stay).

**Device storage and sync engine** (`apps/frontend/src/offline`)
* IndexedDB (Dexie): outbox, customers, measurement templates, garments, open orders, meta.
* Outbox entries have client UUIDs and dependencies (e.g. order depends on its new customer). Sync pushes in order, removes saved
  entries, keeps conflicts / rejections for a person, retries temporary errors. Auto sync when the connection returns and every
  45 s check; full download on demand, changes-only download otherwise.

**Sync API** (`apps/backend/src/modules/sync`)
* `POST /api/sync/push`: idempotent by operation id (replay returns the stored result), each entry checked with the same permission
  and validation as the normal screen, dependencies (WAITING until applied), new-customer id remapping when a duplicate is merged.
* Supported offline: customer create / edit, measurement, order (with advance), order payment.
* Conflicts: customer edited on server and device (VERSION: keep server / keep device / merge field by field; identical values
  apply automatically) and duplicate phone on a new customer (DUPLICATE: use existing customer / keep both).
* `GET /api/sync/snapshot?since=`, `/sync/summary`, `/sync/operations` (log), `/sync/conflicts`, `POST /sync/conflicts/:id/resolve`.
  Everyone can sync their own work; seeing and resolving other users' conflicts needs Synchronization APPROVE (Owner / Administrator).

**Screens**: Offline Desk (`/offline`), Sync Center (`/sync`: This device, Conflicts, Sync log, Offline app), connection pill
and offline strip on every page, desktop and mobile.

**Demo data**: 17 sync entries from "web-demo-shop-tablet" and "web-demo-counter-pc", one rejected payment, one VERSION and one
DUPLICATE conflict to try. Removal deletes them (and any customer saved from a demo conflict).

## Database
No migration: `sync_operations` and `sync_conflicts` were created in Phase 1.

## Tests
* Backend e2e `test/phase9-sync.e2e-spec.ts` (10 tests) + demo-data checks; frontend `src/test/offline-sync.test.ts`.
* All 143 e2e + frontend tests pass; type-check and production build pass.
* Browser check (Playwright): login online, go offline, reload (app opens from the service worker), save customer, measurement,
  order and payment, go online: all four synced (customer code, order number, receipt) automatically.

Screenshots: `docs/screenshots/phase-9/` (desktop and mobile).
