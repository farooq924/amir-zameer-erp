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
* Lists: table on tablet/desktop; card list on phones (see Customers).

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
