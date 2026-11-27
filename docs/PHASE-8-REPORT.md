# Phase 8 Report: WhatsApp & Printing (v1.8.0)

## Delivered
**WhatsApp**
* `whatsapp` module (backend `apps/backend/src/modules/whatsapp`, page `pages/WhatsAppPage.tsx`).
* Manual mode (no setup): message filled from a template or typed, opened with a wa.me link, logged as "Opened in WhatsApp".
* Official Meta Cloud API: template messages with body values, queue with claimed attempts (no double sends), retries with
  back-off (1, 2, 4 ... 60 min, max tries configurable), permanent errors fail at once, Send again / Cancel, "Send queued now".
* Webhook `GET/POST /api/whatsapp/webhook`: verify token handshake, `X-Hub-Signature-256` check with the App Secret on the raw
  body, every event stored in `whatsapp_webhook_events`, status ticks (sent / delivered / read / failed, never moving backwards),
  STOP / START replies change the customer's opt-in.
* Automatic messages from orders: booked, ready, fully delivered, payment received (on/off per event, opt-in required,
  one per event and record, never block the order or payment).
* Templates: 6 defaults (order_confirmation, order_ready, order_delivered, payment_received, payment_reminder, delivery_reminder),
  add / edit with placeholder check, read approval status from Meta.
* Send WhatsApp dialog on order detail, payment rows (order + Payments page), customer profile and print pages, with preview,
  warnings (no opt-in, odd number) and reasons when the Cloud API cannot be used.
* Customer profile **WhatsApp** tab: opt-in switch and message history.
* Settings: secrets stored server-side, returned only as "...last 4", never written to the audit log.
* Setup guide: `docs/WHATSAPP-SETUP.md`.

**Printing**
* New **A4 invoice** (`/print/orders/:id?copy=invoice`): navy header, logo mark, NTN, bill-to, item table, payments, totals,
  balance, terms, signature lines, developer footer.
* Print page toolbar: Receipt / A4 invoice / Job card, receipt width 58 mm / 80 mm, WhatsApp.
* Printing settings: main print for orders, invoice title, terms, NTN and signature switches, receipt copies (customer / shop copy),
  automatic print window.

**Demo data**: half the demo customers opted in; ~50 WhatsApp messages (manual, read, delivered and one failed) dated with the
orders. Removal deletes them. Demo customers are blocked from Cloud API sending.

## Database
No migration: the WhatsApp tables were created in Phase 1. Settings are stored in `system_settings`.

## Tests
* Backend e2e `test/phase8-whatsapp.e2e-spec.ts` (10 tests: manual send, templates, config secrecy, Cloud API with mocked Meta,
  signature, out-of-order ticks, retries, automatic messages, STOP/START, list/summary) and demo-data checks.
* All suites: 132 e2e + 54 backend unit + 20 frontend tests pass; type-check and production build pass.

Screenshots: `docs/screenshots/phase-8/` (desktop and mobile).
