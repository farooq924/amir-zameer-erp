# Phase 2 - Customers & Measurements: Completion Report (2026-11-26)

## Implemented
* **Customers** (`/customers`)
  * Create, edit, view, activate / deactivate / block, delete (soft delete, only when the customer has no orders, payments or ledger entries).
  * Automatic customer code from the `customerPrefix` setting (`AZC-00001`), generated atomically.
  * Pakistani mobile numbers are normalised (`0300-1234567`, `+92 300 1234567` and `3001234567` are the same number).
  * Duplicate detection by mobile, WhatsApp and similar name, checked while typing; the user can still save a separate customer on purpose.
  * Search by name (trigram index, handles partial names), customer code or mobile; filters for status and type; sorting and pagination.
  * Optimistic locking: if two people edit the same customer, the second save is refused with a clear message instead of overwriting.
  * Opening balance creates an `OPENING` entry in the customer ledger.
  * Offline-ready create: the client may send its own id, so a repeated request never creates a second customer.
* **Customer profile** (`/customers/:id`): header with Call and WhatsApp buttons, Edit, status menu, Delete; stat cards (orders, billed, paid, outstanding); tabs Overview, Measurements, Orders, Payments, Ledger (running balance), Notes. Orders and Payments tabs read real tables and will fill once Phases 3 and 6 are in use.
* **Measurement templates** (`/measurements?tab=templates`): 7 garment templates seeded (Shalwar Kameez, Waistcoat, Formal Suit, Shirt, Trouser, Pant, Kurta) plus a Custom template. Users with `Measurements - Manage settings` can create templates, rename, add fields, reorder, mark required, and switch fields off. Fields are never deleted, so old measurements keep their labels.
* **Measurements** (Measurements tab on a customer)
  * Each save creates a new version; older versions are immutable (enforced by a database trigger). Concurrent saves are serialised so version numbers never clash.
  * The new-version form is prefilled from the latest version of that garment; inches/centimetres switch converts the values.
  * Extra (custom) measurements per customer, with a number and/or a note.
  * History list, view any older version, compare two versions (values converted to the same unit, differences highlighted).
  * A4 print sheet (`/print/measurements/:id`) with the business header from Settings.
  * Recent measurements list across all customers with search and garment filter.
* Every change is written to the audit log.

## Database changes
* Migration `20261126222146_customer_search`: enables the `pg_trgm` extension and adds a trigram index on customer name plus an index on WhatsApp number. Run `pnpm --filter @az/backend db:migrate`.
* Seed adds the measurement templates only if they do not already exist, so it is safe to run again: `pnpm --filter @az/backend db:seed`.

## Tested workflows
See `TESTING.md`: 90 backend tests, 14 frontend tests, 3 Playwright tests, manual browser check on desktop and mobile.

## Remaining issues / notes
* The Orders and Payments tabs show empty states until Phase 3 (Orders) and Phase 6 (Payments) are built.
* WhatsApp button opens a normal WhatsApp chat (wa.me link). Automatic messages come in Phase 8.
* `pg_trgm` is a trusted extension in PostgreSQL 13+, so the normal database owner can enable it. On a very restricted hosted database it may need to be enabled once by the provider.

## Next phase dependencies (Phase 3 - Orders & Garments)
* Orders will pick a customer and copy (snapshot) the latest measurement of each garment into the order, so later measurement changes never alter an existing order.
