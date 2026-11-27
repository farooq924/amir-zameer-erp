# Phase 3 - Orders & Garments: Completion Report (2026-11-27)

## Implemented
* **Garments** (`/garments`): 7 default garments seeded (Shalwar Kameez, Kurta, Waistcoat, Formal Suit, Shirt, Trouser, Pant), each linked to its
  measurement template. Add / edit / switch off garments; default stitching price, fabric per piece and tailor wage per piece (used in Phase 5).
  Prices start at 0: set your own shop prices once.
* **Orders list** (`/orders`): cards for open orders, overdue, due today, money to collect; stage chips with counts; search by order number,
  customer name, code or mobile; filters for status, due date and payment; sort; table on desktop, cards on phones.
* **New order** (`/orders/new`), tabs Order Info / Garments / Measurements / Payment with a live summary:
  * customer search with a gold "+" to add a customer on the spot (blocked customers cannot get orders);
  * order types: stitching only, stitching with shop fabric, fabric sale, alteration;
  * many garments per order, quantity, stitching price (filled from the garment), shop or customer fabric, meters, rate, extra charges, notes;
  * order extra charges, discount, advance payment with method and reference (minimum advance from Settings > Orders if switched on);
  * order number `AZ-YYYY-NNNNN` (prefix from Settings), never duplicated even when two people save at once;
  * "Order Created" success window with View Order / Print receipt / Book another order.
* **Measurement snapshot**: the latest (or a chosen) measurement version is copied into each garment of the order. Later measurement changes never
  change an existing order (database trigger). "Copy latest measurement" updates it on purpose, e.g. when the customer was measured after booking.
* **Order details** (`/orders/:id`): status, payment and overdue badges; total / paid / balance / delivery cards; production progress stepper;
  call and WhatsApp buttons; garments with their frozen measurements; payments with receipts; deliveries; status history and activity.
* **Workflow**: Update status for the whole order or a single garment. Stages are configurable (rename, colour, reorder, switch off, add new such as
  "Embroidery") from Orders > Workflow stages. Delivered and Cancelled are fixed. Every change is kept in the status history (cannot be edited).
* **Assignment**: assign a tailor to the order or one garment (employee list fills once Employees are added in Phase 5).
* **Partial delivery**: deliver some pieces now and the rest later, optionally collecting payment at the same time. The order becomes
  "Part delivered", then "Delivered" with the actual delivery date.
* **Payments on orders**: receipt numbers `RCP-YYYY-NNNNN`, never more than the balance, same request never saved twice, payments cannot be deleted.
* **Revise** (edit an open order with a reason), **Duplicate**, **New alteration order** (from a delivered order), **Cancel** (with reason; the
  amount is reversed in the customer ledger and money already paid stays as customer credit), **Price adjustment** (price increase / decrease,
  extra discount, alteration charge, write-off; needs the Orders - Approve permission; the only way to change a delivered order's value).
* **Printing**: customer receipt for thermal printers (80 mm or 58 mm from Settings > Printing), single payment receipt, and an A4 workshop job card
  with measurements and no prices.
* Customer profile: "New order" button, Orders tab opens the order, Payments and Ledger tabs now fill from real orders.
* Mobile bottom bar: Home, Orders, +, Customers, More (as in the mockup). Quick add "New Order" opens the order form.

## Database changes
* Migration `20261127080000_order_rules`: frozen measurement snapshots, non-editable status history, append-only adjustments and deliveries,
  orders can never be deleted, discount cannot exceed the subtotal, total + adjustments never negative, extra indexes for search and due dates.
* Seed adds the 7 default garments (only if missing). Run `prisma generate`, `db:migrate`, `db:seed`.

## Permissions (existing roles)
* Book order: Orders - Create. Status, deliver, revise, assign: Orders - Edit. Cancel: Orders - Delete. Adjustment: Orders - Approve.
  Workflow stages: Orders - Manage settings. Receive payment: Payments - Create. Print: Orders - Print. Garments: Garments module.
* The Tailor role can view orders only. To let tailors update status, give them "Orders - Edit" in Settings > Roles.

## Remaining notes
* Fabric from the shop is entered by hand (description, meters, rate). Linking to fabric stock and automatic stock deduction comes in Phase 4.
* Refunds of customer credit come in Phase 6 (Payments). WhatsApp order messages are manual links until Phase 8.
