# AMIR ZAMEER Design System (navy and gold)

Every screen in every phase uses these rules. Do not hard-code colours in pages; use the tokens and components below.

## Colours (tokens in `apps/frontend/src/index.css`)
| Token | Use |
|---|---|
| `navy` (#101f3d approx.) | Sidebar, mobile header, featured stat card, avatar |
| `primary` / `gold` (#be9637 approx.) | Primary buttons, active menu item, active tab, focus ring, icons in quick actions |
| `gold-soft` | Icon tile background, selected list item, empty-state icon circle |
| `background` | Page background (light grey) |
| `card` | Cards, inputs, dialogs (white) |
| `destructive` | Delete buttons and confirmations |
| `--series-1` / `--series-2` | Chart series (validated for colour-blind safety in light and dark) |

Dark mode: every token has a `.dark` value. Users switch it from the profile menu (saved per device).

## Components (`apps/frontend/src/components`)
* **Button**: `default` (gold), `navy`, `outline` (secondary, white), `gold` (outlined "+ Add"), `destructive`, `ghost`.
* **Badge**: soft pills. `warning` = pending/in production, `success` = active/delivered, `danger` = blocked/overdue, `secondary` = cancelled/inactive, `info`, `gold`, `outline`.
* **Tabs**: white strip with a gold active pill. Use for form sections (e.g. Order Info / Measurement / Payment).
* **Input / NativeSelect / Textarea**: 40 px high, rounded, gold focus border. Mark required fields with `<Label required>` (red *).
* **Dialog**: header with an icon + title + divider, close (X) top right, footer buttons right-aligned (Cancel outline, primary gold).
* **ConfirmDialog**: centred, red trash icon for deletes.
* **EmptyState / LoadingState / ErrorState** (`components/common.tsx`).
* **StatCard** (`features/dashboard/StatCard.tsx`): coloured icon tile; `featured` = navy hero card; `compact` for secondary rows.
* **Toasts**: `sonner` with rich colours (green success, blue info, amber warning, red error).
* **Brand** (`components/brand.tsx`): `BrandLogo`, `SewingMachineMark`, `TailorArt`, `SuitArt` (original artwork).

## Layout
* Desktop: navy sidebar (gold active item, tailoring artwork at the bottom, collapsible), white top bar with customer search (Ctrl + K) and profile menu (Change Password, Dark Mode, Logout).
* Mobile: navy header, slide-in navy menu with user card and Logout, bottom bar with Home, Customers, gold + (Quick add), Measure, More.
* Lists: always the advanced `DataTable` (see below); give it a `mobileCard` for a card list on phones (see Customers).
* Scrollbars: thin, themed in `index.css` (navy thumb, gold on hover; gold thumb in dark mode). Use the `scrollbar-navy` class on scroll areas that sit on navy (the sidebar).

## Advanced tables (standard since v2.1.0, required for every table)
Every list / table in the ERP, now and in future, uses `DataTable` from `apps/frontend/src/components/data-table/DataTable.tsx`. Never build a plain `<Table>` for a list.
It gives, with no extra work:
* **Row selection**: checkbox per row, page checkbox, "Select all N" across pages (server tables pass `fetchAll`).
* **Bulk actions** (gold-soft bar): Print, Export (Excel / CSV), Duplicate, Delete, Clear.
* **Sortable columns**: client tables sort by `value`; server tables set `sortKey` (backend sort field) and pass `sort` / `onSortChange`.
* **Row action buttons**: View, Edit, Duplicate, Delete icons; extra items go in `rowMenu` (three-dot menu). Hidden when the role lacks the permission (`canRow`, `can()`).
* **Pagination**: rows per page 10 / 25 / 50 / 100 (minimum 10, remembered per table), first / previous / page numbers / next / last. Server tables pass `pagination`.
* **Import / Export / Print**: toolbar buttons. Export and Print follow the module's EXPORT / PRINT permission. Excel uses `exceljs`; print is A4 with the shop name and Brandistan footer. Import (`importer` prop) gives a template download, column mapping, preview and a per-row error list.
* Totals row with `footer`, phone card list with `mobileCard`, filters in `toolbar`.

Delete must stay safe: master data (customer, supplier, fabric, garment, employee) is deleted only when it has no history (the API checks). Transactions are never hard-deleted: Delete maps to cancel / reject / reverse, or is not offered. Duplicate is offered only where a copy makes sense.

Not converted on purpose: input grids (attendance register, permission matrix), printable documents, and the report viewer (it has its own server sort, column chooser, Excel / CSV / PDF export and print).

## Rules for new phases
1. Page = `PageHeader` + `Card` sections. Forms in a `Dialog` or a page with `Tabs` for sections.
2. Primary action is the gold button, placed top right of the page header.
3. Status always uses `Badge` with the mapping above, never plain text colour.
4. No fake numbers or trends: cards show only real data.

## Order status colours (Phase 3, `features/orders/badges.tsx`)
| Stage | Badge |
|---|---|
| New Order, Measurement Completed | `danger` (pink "Pending") |
| Fabric Allocated, Cutting, Stitching, Quality Check, Trial, custom stages | `warning` (amber "In production") |
| Alteration | `gold` |
| Ready | `info` |
| Delivered | `success` |
| Cancelled | `secondary` |
Payment: Unpaid = `danger`, Partly paid = `warning`, Paid = `success`, Credit = `info`. Overdue = solid red pill.

## Printing
* Every printed document ends with the developer footer: `<PrintFooter />` from `@/components/PrintFooter`
  (`variant="receipt"` on 58/80 mm thermal receipts). App pages printed with `window.print()` get it from the layout automatically.

## Reports (Phase 7)
* Every report uses one viewer (`pages/ReportViewerPage.tsx`): header with Saved / Columns / Export (navy) / Print (gold), a filter card,
  stat cards, then a sortable table on desktop and a card list on phones (filters fold behind a "Filters" button).
* Cell formatting and status badges come from `features/reports/shared.tsx` (`cellText`, `Cell`, `reportStatusTone` in `@az/shared`);
  minus money is shown in red. New reports only add a definition in `packages/shared/src/reports.ts` and a builder in the backend.
* Report print (`/print/reports/:key`) is A4, landscape when more than 6 columns, navy table header and `<PrintFooter />`.
  Excel, CSV and PDF exports carry the same footer text.

## WhatsApp & printing (Phase 8)
* Send from anywhere with `SendWhatsAppDialog` (`features/whatsapp`): template select, green chat-bubble preview, amber warnings,
  "Open WhatsApp" (manual) and gold "Send now (Cloud API)".
* Message status badges: Queued = `warning`, Sent = `info`, Delivered / Read = `success` (double tick), Failed = `danger`;
  channel badge Cloud API = `gold`, Manual = `outline`.
* A4 invoice: navy table header and gold title / balance strip (`print-color-exact` keeps the colours in print), `<PrintFooter />`.
* Print pages share one toolbar: document tabs (Receipt / A4 invoice / Job card), paper width for receipts, WhatsApp, gold Print.

## Offline app & sync (Phase 9)
* Top bar shows a connection pill (`features/offline/ConnectionStatus.tsx`): green Online, amber Offline, spinning Syncing,
  with a gold count of entries waiting (red when some need review). It opens the Sync Center.
* Offline = amber strip under the header with a link to the Offline Desk; entries needing review = rose strip.
* Offline Desk (`pages/OfflineDeskPage.tsx`): status strip, navy "Waiting to sync" card, gold quick-action tiles, customer list
  from the device copy, "Not synced" = `warning` badge.
* Outbox badges: Waiting to sync / Will retry = `warning`, Waiting for earlier entry = `info`, Needs review = `gold`, Rejected = `danger`.
  Server log: Saved = `success`, Already saved = `info`, Conflict = `gold`, Rejected = `danger`.
* Conflict review: navy table header (Field / On server / On device), changed fields highlighted amber, the chosen value has a gold border.
  Buttons: Keep server copy (outline), Keep device copy (navy), Save merged (gold); duplicates: Save as a separate customer / Use existing customer.
