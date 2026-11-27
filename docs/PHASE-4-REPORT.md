# Phase 4 - Fabric Inventory & Suppliers: Completion Report (2026-11-27)

Version: **1.4.0** (shown at the bottom of the side menu on desktop and in the mobile menu).

## Implemented
* **Fabric Inventory** (`/inventory`): cards for total fabrics, stock value, low stock and out of stock; search by code, name, colour or brand;
  filters for category, supplier, stock level and status; table on desktop, cards on phones. Fabric codes `AZF-0001` (prefix from Settings).
* **Add / edit fabric**: name, brand, category, colour, design, quality, usual supplier, purchase and sale price, unit (meter, yard, piece, suit),
  minimum stock, rack location, and opening stock with its cost. The unit cannot be changed once stock has moved.
* **Fabric details** (`/inventory/fabrics/:id`): in stock, reserved for orders, free to use, average cost, stock value, last purchase,
  open order reservations and the full stock ledger of that fabric.
* **Stock ledger** (Inventory > Stock ledger tab): every movement (opening, purchase, purchase return, adjustment in/out, order issue) with filters
  by type, fabric and dates. Movements can never be edited or deleted (database rule). Number `STK-YYYY-000001`.
* **Adjust stock** (needs Inventory - Approve): add or remove stock with a reason (physical count, damage, sample, etc.). Stock that is reserved
  for orders cannot be removed. Saving twice saves once.
* **Categories**: 6 default categories are seeded (Wash & Wear, Cotton, Lawn, Khaddar, Boski, Suiting); add, rename or switch off.
* **Low stock**: a fabric is "Low" when free stock falls to its minimum, "Out" at zero. Dashboard "Fabric Stock" card opens Inventory.
* **Suppliers** (`/suppliers`): codes `AZS-0001`, phone, WhatsApp, city, address, opening balance, status. Supplier page with Purchases,
  Payments, Ledger, Fabrics and Details tabs, Call / WhatsApp buttons, New purchase and Pay supplier.
* **Supplier payments**: `SPY-YYYY-00001`, cash / bank / JazzCash / Easypaisa / cheque, applied to the oldest unpaid bills first or to one bill.
* **Purchases** (`/purchases`, dashboard "Receive Fabric"): supplier bill number (no duplicates per supplier), many fabric lines, quantity and rate,
  discount, freight / other charges, payment now. Stock and the weighted average cost update at once. Numbers `PUR-YYYY-00001`.
  Extra charges and discount are spread over the lines (landed cost).
* **Purchase returns**: `PRT-YYYY-00001`, return part of a bill; stock goes out and the supplier balance goes down.
* **Orders use real stock**: in the order form, a garment with "Shop fabric" now picks the fabric from stock (shows free stock and fills the rate
  from the sale price). On save the fabric is **reserved**; on delivery it is **issued** in proportion to the delivered pieces; cancel or removing
  the garment **releases** it. Order details show Reserved / Issued from stock / Released. Old orders with typed fabric names still work.
* **App version** at the bottom of the side menu (desktop) and the mobile menu: `v1.4.0` with the build date. Click it for "About" with
  release notes. Version numbers: `1.<phase>.<fix>`, taken from `package.json`.

## Database changes
* None. All inventory tables were created in Phase 1. Seed adds the default fabric categories (only if none exist).
  The update script still runs `prisma generate`, `db:migrate` and `db:seed` - that is safe.

## Permissions (existing roles)
* Inventory - View / Create / Edit; Adjust stock: Inventory - Approve.
* Suppliers - View / Create / Edit (payments need Edit). Purchases - View / Create; returns need Purchases - Edit.
* Order form fabric list only needs Orders - View (staff without Inventory access can still book shop fabric).

## Tests
* Backend: 121 tests pass (10 new inventory tests: opening stock, purchase + average cost, return, payment FIFO, reservation, delivery issue,
  cancel release, reserved stock protection, idempotency, duplicate bill). Frontend: 15 tests pass, type check clean, production build passes.

## Screenshots
`docs/screenshots/phase-4/`

## Update 1.4.1 - developer footer on prints
* Every print now ends with "Software developed by Brandistan | www.brandistan.pk | 0333-2532924": order receipts (58/80 mm, two short
  lines), payment receipts, workshop job cards, measurement sheets, and any app page printed with the Print button (e.g. purchase bills).
* One shared component `apps/frontend/src/components/PrintFooter.tsx`. **Every new print layout must end with `<PrintFooter />`**
  (`variant="receipt"` for thermal). Normal app pages get it automatically when printed (hidden on screen).
* The About window (click the version in the menu) also shows the developer details.
