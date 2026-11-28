import { CheckCircle2, Info } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DEVELOPER } from '@/components/PrintFooter';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';

export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;

/** Release history shown in "About". Newest first. Version = 1.<phase>.<fix>. */
export const RELEASES = [
  {
    version: '2.1.0', title: 'Advanced tables and themed scrollbars',
    notes: [
      'Every table in the ERP is now an advanced table with the same look and tools',
      'Select one or many rows (also "select all" across pages) with a bulk bar: Print, Export, Duplicate, Delete',
      'Click a column heading to sort; rows per page 10, 25, 50 or 100 with page navigation',
      'Action buttons on every row: View, Edit, Duplicate, Delete (only where allowed for your role)',
      'Export to Excel (.xlsx) or CSV, and print any table on A4 with the shop name and Brandistan footer',
      'Import from Excel or CSV with a ready template for Customers, Suppliers, Fabrics and Garments',
      'Safe delete: suppliers, fabrics and garments can be deleted only when they have no history; orders and expenses are cancelled instead',
      'Scrollbars now match the navy and gold theme',
    ],
  },
  {
    version: '2.0.0', title: 'TailoringERP SaaS (many companies)',
    notes: [
      'The ERP is now TailoringERP By Brandistan: many tailoring shops (companies) can use one ERP, each with fully separate data',
      'All existing data moved safely into the company "Zameer Ansari" (nothing changes for its users)',
      'New Super Admin panel: overview, companies, create a company with its Owner login, edit, suspend / activate, reset Owner password',
      'Plans (Basic, Standard, Premium) with price, user limit and modules, editable by the Super Admin',
      '14-day free trial for new companies; subscription payments (JazzCash, EasyPaisa, bank, cash) marked as paid by the Super Admin',
      'When a subscription ends: grace days with a reminder, then read-only (view and print only) until renewed',
      'Open company (support access) for the Super Admin, recorded in the audit log of the platform and the company',
      'Menu shows only the modules of the company plan; user limit per plan',
      'Each company has its own shop name, address, phone and logo on prints, its own numbering, settings and WhatsApp',
      'Backups (whole system) moved to the Super Admin; new platform activity log',
    ],
  },
  {
    version: '1.11.0', title: 'Documents (User Guide)',
    notes: [
      'New Documents menu: a built-in user guide for every page and form of the ERP, written in simple Roman Urdu',
      '34 sections in order, from login and first-time setup to backups, with step-by-step instructions and every option explained',
      'Search the guide, jump between sections, and open the explained page in one click',
      'Daily, monthly and yearly routine, common problems and answers, and how to update the ERP',
      'Print one section or the full guide (with the developer footer)',
    ],
  },
  {
    version: '1.10.0', title: 'Security, Backups & Deployment',
    notes: [
      'New Backup & Restore page: encrypted backup of all ERP data with one click (Back up now)',
      'Automatic daily backup at a time you choose (default 11:00 PM); runs later if the PC was off at that time',
      'Every backup is encrypted (AES-256) and checked after saving; keeps the last 14 automatic backups',
      'Optional second copy folder: a USB drive or Google Drive / OneDrive folder gets a copy of every backup',
      'Restore test: restores a backup into a temporary database and compares the records, without touching live data',
      'Restore (Owner only, password + RESTORE): a safety backup is made first, then all data is replaced in one step',
      'Recovery key download for the Owner, needed to open backups on a new computer',
      'New Security Center: security checklist with score, signed-in devices, login history and locked accounts',
      'Sign out any device, or all your other devices; unlock a locked account',
      'My Devices in the user menu for every user',
      'Extra browser protection headers; clearer errors for too large requests',
      'Backup and restore scripts for Windows, automatic backup before every update, VPS / Docker deployment guide and handover guide',
    ],
  },
  {
    version: '1.9.0', title: 'Offline App & Sync',
    notes: [
      'Install the ERP as an app on phones, tablets and PCs (Install app button, or Add to Home Screen)',
      'Opens and works without internet once it has been opened online on that device',
      'New Offline Desk: add customers, edit customer details, take measurements, book orders and receive payments with no internet',
      'Work saved offline stays on the device and syncs to the server automatically when the internet returns',
      'Online / Offline pill in the top bar with the number of entries waiting to sync',
      'New Sync Center: entries waiting on this device, retry or discard, and the full sync history of every device',
      'Conflict review: when a customer was changed on two devices, choose field by field what to keep',
      'Possible duplicate customers from a device are held for review: use the existing customer or save a new one',
      'Safe to sync more than once: the same entry is never saved twice',
      'Warning before logout when offline work has not reached the server yet',
    ],
  },
  {
    version: '1.8.0', title: 'WhatsApp & Printing',
    notes: [
      'New WhatsApp page: every message with its status (queued, sent, delivered, read, failed), search and filters',
      'Send WhatsApp from an order, a payment receipt, a customer profile or a print page, with a preview of the text',
      'Works without any setup: the ERP fills the message and opens WhatsApp, you press Send',
      'Official WhatsApp Cloud API (Meta) option: messages go out automatically when an order is booked, is ready, is delivered or a payment is received',
      'Delivery and read ticks from Meta, automatic retry when WhatsApp is busy, and Send again for failed messages',
      'Message templates with values like customer name, order number and balance filled in automatically; check approval status in Meta',
      'Customer agreement (opt-in) on the customer profile; customers can reply STOP or START',
      'New A4 invoice with logo, bill-to, item table, payments, balance, terms and signature lines',
      'Thermal receipts: switch 58 mm / 80 mm on the print page, customer and shop copies, optional automatic print window',
      'More print settings: main print for orders, invoice title, terms, NTN and signature lines',
    ],
  },
  {
    version: '1.7.0', title: 'Reports & Exports',
    notes: [
      'New Reports page with all 30 business reports in one place, grouped by area',
      'Sales: daily and monthly sales, stitching revenue, fabric sales, order register, pending, delivered and delayed orders',
      'Customers: ledger with running balance, outstanding balances and payment report',
      'Fabric & purchases: stock, stock movements, fabric used on orders, supplier ledger and purchase register',
      'Staff: attendance, production, salaries, daily wages, advances and overtime',
      'Expenses register and summary; Profit & Loss, Cash Flow, Balance Sheet, Trial Balance and General Ledger',
      'Audit log report: who did what and when',
      'Every report: period and filters, search, sorting, paging, choose columns, totals and summary cards',
      'Download any report as Excel, CSV or PDF, or print it on A4 (with the developer footer)',
      'Save your favourite filters and open them again in one click',
    ],
  },
  {
    version: '1.6.0', title: 'Payments, Expenses & Accounting',
    notes: [
      'Payments page: every receipt in one place, receive payment for any order, reverse a wrong receipt',
      'Refunds for cancelled or overpaid orders, with refund receipts',
      'Supplier and salary payments listed with monthly money in / money out',
      'Expenses with categories, approval for staff entries, cancel with reversal, recurring bills and printable vouchers',
      'Automatic double-entry books: orders, receipts, purchases, stock used, payroll, salaries, advances and expenses',
      'Profit & Loss, Balance Sheet, Cash Flow, Trial Balance, journal and account ledgers',
      'Chart of accounts (cash, bank, JazzCash / Easypaisa) and manual journal entries',
      'Month closing and locking so past figures cannot change',
    ],
  },
  {
    version: '1.5.0', title: 'Employees, Attendance & Payroll',
    notes: [
      'Employees with codes, CNIC, bank details, job history and salary history',
      'Salary types: monthly, daily wage, per piece, and fixed + per piece',
      'Daily attendance in one tap, monthly register, leave with approval and overtime',
      'Production: record pieces finished by each tailor for per-piece wages',
      'Salary advances with monthly instalments, recovered automatically',
      'Monthly payroll: calculate, adjust bonus / deductions, approve, pay, and print payslips',
      'Approved months are locked so paid salaries never change',
    ],
  },
  { version: '1.4.1', title: 'Print footer', notes: ['Software developer details at the bottom of every print (receipts, job cards, measurement sheets and printed pages)'] },
  {
    version: '1.4.0', title: 'Fabric Inventory & Suppliers',
    notes: [
      'Fabric stock with codes, categories, minimum stock alerts and stock value',
      'Stock ledger: every change is recorded and cannot be edited',
      'Suppliers with balance, ledger and payments',
      'Purchases (supplier bills) and returns to supplier',
      'Shop fabric on orders is reserved from stock and issued on delivery',
      'App version shown in the side menu',
    ],
  },
  { version: '1.3.0', title: 'Orders & Garments', notes: ['Orders, workflow stages, deliveries, payments and receipts', 'Always online with auto-start'] },
  { version: '1.2.0', title: 'Customers & Measurements', notes: ['Customer profiles, measurement templates and versions', 'Navy and gold theme'] },
  { version: '1.1.0', title: 'Foundation', notes: ['Login, users, roles, audit log, settings and dashboard'] },
] as const;

/** Version line at the bottom of the side menu. Click opens "About" with what is new. */
export function AppVersion({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`TailoringERP By Brandistan v${APP_VERSION} (built ${formatDate(BUILD_DATE)})`}
        aria-label={`Version ${APP_VERSION}. Show what is new`}
        className={cn(
          'group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-[11px] leading-tight text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-white',
          collapsed && 'justify-center px-0',
          className,
        )}
      >
        <span className="rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-semibold tracking-wide text-gold">v{APP_VERSION}</span>
        {!collapsed && <span className="truncate">Build {formatDate(BUILD_DATE)}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle><Info className="h-5 w-5 text-primary" /> About TailoringERP</DialogTitle>
            <DialogDescription>Version {APP_VERSION} · built {formatDate(BUILD_DATE)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {RELEASES.map((r, i) => (
              <section key={r.version} className={cn('rounded-xl border p-3', i === 0 && 'border-primary/40 bg-gold-soft/40')}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', i === 0 ? 'bg-primary text-white' : 'bg-muted text-foreground')}>v{r.version}</span>
                  <span className="text-sm font-semibold">{r.title}</span>
                  {i === 0 && <span className="ml-auto text-xs font-medium text-primary">Current</span>}
                </div>
                <ul className="space-y-1">
                  {r.notes.map((n) => (
                    <li key={n} className="flex gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />{n}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="border-t pt-3 text-center text-xs text-muted-foreground">
            Software developed by <a href={DEVELOPER.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">{DEVELOPER.name}</a> · {DEVELOPER.website} · {DEVELOPER.phone}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
