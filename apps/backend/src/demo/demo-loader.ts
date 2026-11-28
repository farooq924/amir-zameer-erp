/* eslint-disable no-console */
import { INestApplicationContext } from '@nestjs/common';
import { Tenant, byCompany } from '../common/tenant';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContext } from '../common/types/auth-user';
import { karachiToday } from '../common/utils/date-range';
import { AttendanceService } from '../modules/attendance/attendance.service';
import { AccountingService } from '../modules/accounting/accounting.service';
import { PostingService } from '../modules/accounting/posting.service';
import { ExpensesService } from '../modules/expenses/expenses.service';
import { purgeJournalsFor } from '../modules/accounting/purge-journals';
import { PasswordService } from '../modules/auth/password.service';
import { CustomersService } from '../modules/customers/customers.service';
import { EmployeesService } from '../modules/employees/employees.service';
import { FabricsService } from '../modules/inventory/fabrics.service';
import { MeasurementsService } from '../modules/measurements/measurements.service';
import { OrdersService } from '../modules/orders/orders.service';
import { WhatsAppService } from '../modules/whatsapp/whatsapp.service';
import { PayrollService } from '../modules/payroll/payroll.service';
import { ProductionService } from '../modules/production/production.service';
import { PurchasesService } from '../modules/purchases/purchases.service';
import { SettingsService } from '../modules/settings/settings.service';
import { SuppliersService } from '../modules/suppliers/suppliers.service';
import {
  DEMO_CUSTOMERS, DEMO_DAILY_EXPENSES, DEMO_EMPLOYEES, DEMO_MONTHLY_EXPENSES, DEMO_OWNER_CAPITAL, DEMO_PENDING_EXPENSES, DEMO_SAVED_FILTERS, DEMO_FABRICS, DEMO_NOTE, DEMO_PURCHASES, DEMO_SETTING_KEY, DEMO_SUPPLIERS, DEMO_SUPPLIER_PAYMENTS, DEMO_USER,
  FABRIC_PER_PIECE, GARMENT_PRICES, SPECIAL_INSTRUCTIONS, bodyMeasurements,
} from './demo-dataset';

/** Root records of the demo. Everything else the demo creates hangs off these, so removal can find it. */
export interface DemoManifest {
  version: 1;
  complete: boolean;
  loadedAt: string;
  userId: string | null;
  /** Demo login of this company (usernames are unique across all companies). */
  username?: string;
  email?: string;
  customers: string[];
  suppliers: string[];
  fabrics: string[];
  employees: string[];
  payrolls: string[];
  /** Added in v1.7.0 (older manifests do not have them). */
  expenses?: string[];
  recurring?: string[];
  journals?: string[];
  savedFilters?: boolean;
  /** Added in v1.8.0: demo customers opted in and WhatsApp history written. */
  whatsapp?: boolean;
  /** Added in v1.9.0: offline sync history (two shop devices) with one rejected entry and two conflicts to review. */
  sync?: boolean;
}

export async function readManifest(prisma: PrismaService): Promise<DemoManifest | null> {
  const row = await prisma.systemSetting.findUnique({ where: { companyId_key: byCompany({ key: DEMO_SETTING_KEY }) } });
  return (row?.value as unknown as DemoManifest) ?? null;
}

async function saveManifest(prisma: PrismaService, m: DemoManifest) {
  const value = m as unknown as Prisma.InputJsonValue;
  await prisma.systemSetting.upsert({
    where: { companyId_key: byCompany({ key: DEMO_SETTING_KEY }) },
    create: { key: DEMO_SETTING_KEY, group: 'demo', value, description: 'Demo data loaded by scripts/load-demo-data.ps1. Removed by scripts/remove-demo-data.ps1.' },
    update: { value },
  });
}

// ------------------------------------------------------------------ dates (Karachi)

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Karachi local date + time -> real instant. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`);
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Small deterministic random generator, so every load gives the same demo. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(a: T[]) => a[Math.floor(next() * a.length)], chance: (p: number) => next() < p };
}

// ------------------------------------------------------------------ timeline

interface Step {
  when: Date;
  label: string;
  run: () => Promise<void>;
}

/** Tables whose new demo rows get the step's date instead of "now" (they are append-only, so this is done in one guarded pass at the end). */
const STAMP_TABLES = {
  payments: { by: 'customers', scope: '"customerId" = ANY($1::uuid[])', set: '"paymentDate" = v.at, "createdAt" = v.at' },
  customer_ledger: { by: 'customers', scope: '"customerId" = ANY($1::uuid[])', set: '"entryDate" = (v.at + interval \'5 hours\')::date, "createdAt" = v.at' },
  order_deliveries: { by: 'customers', scope: '"orderId" IN (SELECT id FROM orders WHERE "customerId" = ANY($1::uuid[]))', set: '"deliveredAt" = v.at' },
  order_status_history: { by: 'customers', scope: '"orderId" IN (SELECT id FROM orders WHERE "customerId" = ANY($1::uuid[]))', set: '"changedAt" = v.at' },
  inventory_movements: { by: 'fabrics', scope: '"fabricId" = ANY($1::uuid[])', set: '"movementDate" = v.at, "createdAt" = v.at' },
  supplier_ledger: { by: 'suppliers', scope: '"supplierId" = ANY($1::uuid[])', set: '"createdAt" = v.at' },
  customer_measurements: { by: 'customers', scope: '"customerId" = ANY($1::uuid[])', set: '"takenAt" = v.at, "createdAt" = v.at' },
} as const;
type StampTable = keyof typeof STAMP_TABLES;
const STAMP_TRIGGERS: Record<StampTable, string> = {
  payments: 'payments_guard',
  customer_ledger: 'customer_ledger_append_only',
  order_deliveries: 'order_deliveries_append_only',
  order_status_history: 'order_status_history_no_update',
  inventory_movements: 'inventory_movements_append_only',
  supplier_ledger: 'supplier_ledger_append_only',
  customer_measurements: 'customer_measurements_immutable',
};

export interface LoadResult {
  status: 'loaded' | 'already-loaded';
  counts: Record<string, number>;
  notes: string[];
  /** Demo login username (when loaded). */
  username?: string;
}

export async function loadDemoData(app: INestApplicationContext): Promise<LoadResult> {
  const get = <T>(t: new (...args: never[]) => T) => app.get(t, { strict: false });
  const prisma = get(PrismaService);
  const customersSvc = get(CustomersService);
  const measurementsSvc = get(MeasurementsService);
  const ordersSvc = get(OrdersService);
  get(WhatsAppService).pauseAutomatic(); // never message demo customers
  const fabricsSvc = get(FabricsService);
  const suppliersSvc = get(SuppliersService);
  const purchasesSvc = get(PurchasesService);
  const employeesSvc = get(EmployeesService);
  const attendanceSvc = get(AttendanceService);
  const productionSvc = get(ProductionService);
  const payrollSvc = get(PayrollService);
  const settingsSvc = get(SettingsService);
  const passwords = get(PasswordService);
  const expensesSvc = get(ExpensesService);
  const accountingSvc = get(AccountingService);

  const existing = await readManifest(prisma);
  if (existing?.complete) return { status: 'already-loaded', counts: countsOf(existing), notes: ['Demo data is already loaded. Nothing was changed.'] };
  if (existing) throw new Error('An earlier demo load did not finish. Run scripts\\remove-demo-data.ps1 first, then load again.');

  const notes: string[] = [];
  const counts_wa = { messages: 0 };
  const R = rng(20261127);
  const today = karachiToday();
  const day = (daysAgo: number) => addDays(today, -daysAgo);
  const thisMonth = today.slice(0, 7);
  const prevMonthStart = `${addDays(`${thisMonth}-01`, -1).slice(0, 7)}-01`;
  const prevMonth = prevMonthStart.slice(0, 7);

  const manifest: DemoManifest = { version: 1, complete: false, loadedAt: new Date().toISOString(), userId: null, customers: [], suppliers: [], fabrics: [], employees: [], payrolls: [], expenses: [], recurring: [], journals: [] };

  // ---------------------------------------------------------------- 1. demo login
  const role = await prisma.role.findUnique({ where: { companyId_code: byCompany({ code: DEMO_USER.roleCode }) } });
  if (!role) throw new Error(`Role ${DEMO_USER.roleCode} was not found. Run the normal update first.`);
  // Usernames are unique across all companies: the first company gets "demo", others "demo-<company code>".
  const company = await prisma.company.findUniqueOrThrow({ where: { id: Tenant.require() } });
  const isTaken = (username: string, email: string) => Tenant.system(() => prisma.user.findFirst({ where: { OR: [{ username }, { email }] } }));
  let demoUsername: string = DEMO_USER.username;
  let demoEmail: string = DEMO_USER.email;
  if (await isTaken(demoUsername, demoEmail)) {
    demoUsername = `demo-${company.code}`.slice(0, 60);
    demoEmail = `demo.${company.code}@example.com`;
  }
  if (await isTaken(demoUsername, demoEmail)) throw new Error(`A user named "${demoUsername}" (or ${demoEmail}) already exists. Rename or delete that user first.`);
  manifest.username = demoUsername;
  manifest.email = demoEmail;
  const user = await prisma.user.create({
    data: {
      fullName: DEMO_USER.fullName, email: demoEmail, username: demoUsername,
      passwordHash: await passwords.hash(DEMO_USER.password), roles: { create: [{ roleId: role.id }] },
    },
  });
  manifest.userId = user.id;
  await saveManifest(prisma, manifest);
  const ctx: RequestContext = { userId: user.id, ipAddress: null, userAgent: 'demo-data-loader', sessionId: null };
  await prisma.auditLog.create({ data: { action: 'CREATE', module: 'users', recordId: user.id, userId: user.id, userAgent: ctx.userAgent, newValues: { username: user.username, note: 'Demo user created by the demo data loader' } } });

  // Reference data that already exists in the ERP (read only).
  const garments = new Map((await prisma.garmentType.findMany({ where: { isActive: true } })).map((g) => [g.code, g]));
  const stages = new Map((await prisma.workflowStage.findMany({ where: { isActive: true } })).map((s) => [s.code, s]));
  const categories = new Map((await prisma.fabricCategory.findMany()).map((c) => [c.name.toLowerCase(), c.id]));
  const templates = await prisma.measurementTemplate.findMany({ where: { isActive: true }, include: { fields: { where: { isActive: true } } } });
  const orderSettings = await settingsSvc.getGroup('orders');
  const minAdvancePct = orderSettings.requireAdvancePayment ? Number(orderSettings.minimumAdvancePercent ?? 0) : 0;

  // Payroll months that are already approved are frozen: no demo attendance / production can go there.
  const lockedMonths = new Set((await prisma.payroll.findMany({ where: { status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] } }, select: { periodKey: true } })).map((p) => p.periodKey));
  const monthOpen = (date: string) => !lockedMonths.has(date.slice(0, 7));

  // ---------------------------------------------------------------- 2. timeline of everything that happens
  const steps: Step[] = [];
  const add = (when: Date, label: string, run: () => Promise<void>) => steps.push({ when, label, run });

  const customerIds: string[] = [];
  const supplierIds = new Map<string, string>();
  const fabricIds = new Map<string, string>();
  const employeeIds = new Map<string, string>();
  const stamps: { table: StampTable; id: string; at: Date }[] = [];
  const seen = new Map<StampTable, Set<string>>();
  const direct: (() => Promise<unknown>)[] = []; // plain date fixes (tables without append-only rules)

  const stampNew = async (when: Date, tables: StampTable[]) => {
    for (const t of tables) {
      const by = STAMP_TABLES[t].by;
      const ids = by === 'customers' ? customerIds : by === 'fabrics' ? [...fabricIds.values()] : [...supplierIds.values()];
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text FROM ${t} WHERE ${STAMP_TABLES[t].scope}`, ids);
      const s = seen.get(t) ?? new Set<string>();
      for (const r of rows) {
        if (s.has(r.id)) continue;
        s.add(r.id);
        stamps.push({ table: t, id: r.id, at: when });
      }
      seen.set(t, s);
    }
  };
  const ORDER_TABLES: StampTable[] = ['payments', 'customer_ledger', 'order_deliveries', 'order_status_history', 'inventory_movements'];

  // Suppliers and fabrics (opening stock 60 days ago).
  const setupDay = day(60);
  add(at(setupDay, '10:00'), 'suppliers', async () => {
    for (const s of DEMO_SUPPLIERS) {
      const created = await suppliersSvc.create({
        name: s.name, contactNumber: s.contact, whatsapp: s.contact, address: s.address, city: 'Karachi',
        openingBalance: s.openingBalance, notes: `${DEMO_NOTE} ${s.note ?? ''}`.trim(),
      }, ctx);
      supplierIds.set(s.key, created.id);
      manifest.suppliers.push(created.id);
      await saveManifest(prisma, manifest);
    }
    await stampNew(at(setupDay, '10:00'), ['supplier_ledger']);
    direct.push(() => prisma.supplier.updateMany({ where: { id: { in: manifest.suppliers } }, data: { createdAt: at(setupDay, '10:00') } }));
  });
  add(at(setupDay, '11:00'), 'fabrics', async () => {
    for (const f of DEMO_FABRICS) {
      const dto = {
        name: f.name, brand: f.brand, categoryId: categories.get(f.category.toLowerCase()) ?? null, color: f.color, quality: f.quality,
        supplierId: supplierIds.get(f.supplier) ?? null, purchasePrice: f.purchasePrice, salePrice: f.salePrice, unit: 'METER' as const,
        minimumStock: f.minimum, location: f.location, openingStock: f.opening, openingCost: f.purchasePrice,
      };
      let created;
      try {
        created = await fabricsSvc.create(dto, ctx);
      } catch {
        created = await fabricsSvc.create({ ...dto, design: 'Demo' }, ctx); // same name + colour already in the real stock
      }
      fabricIds.set(f.key, created.id);
      manifest.fabrics.push(created.id);
      await saveManifest(prisma, manifest);
    }
    await stampNew(at(setupDay, '11:00'), ['inventory_movements']);
    direct.push(() => prisma.fabric.updateMany({ where: { id: { in: manifest.fabrics } }, data: { createdAt: at(setupDay, '11:00') } }));
  });

  // Purchases and supplier payments.
  for (const p of DEMO_PURCHASES) {
    const date = day(p.daysAgo);
    add(at(date, '13:30'), `purchase ${p.invoice}`, async () => {
      const created = await purchasesSvc.create({
        id: randomUUID(), supplierId: supplierIds.get(p.supplier)!, supplierInvoiceNo: p.invoice, purchaseDate: date,
        items: p.lines.map((l) => ({ fabricId: fabricIds.get(l.fabric)!, quantity: l.quantity, rate: l.rate })),
        otherCharges: p.otherCharges, notes: p.notes ? `${DEMO_NOTE} ${p.notes}` : DEMO_NOTE,
        payment: p.paid ? { amount: p.paid.amount, method: p.paid.method } : undefined,
      }, ctx);
      await stampNew(at(date, '13:30'), ['inventory_movements', 'supplier_ledger']);
      direct.push(() => prisma.purchase.update({ where: { id: created.id }, data: { createdAt: at(date, '13:30') } }));
    });
  }
  for (const [s, daysAgo, amount, method] of DEMO_SUPPLIER_PAYMENTS) {
    const date = day(daysAgo);
    add(at(date, '16:00'), 'supplier payment', async () => {
      await suppliersSvc.recordPayment(supplierIds.get(s)!, { amount, method, paymentDate: date, reference: method === 'CHEQUE' ? 'Cheque 004517' : 'IBFT', idempotencyKey: randomUUID() }, ctx);
      await stampNew(at(date, '16:00'), ['supplier_ledger']);
    });
  }

  // Employees (joined long before the demo window, except one helper who joined last month).
  const joiningOf = (j: string) => (j === 'PREV_MONTH_10' ? `${prevMonth}-10` : j);
  add(at(setupDay, '09:00'), 'employees', async () => {
    for (const e of DEMO_EMPLOYEES) {
      const dto = {
        name: e.name, fatherName: e.fatherName, contactNumber: e.contact, cnic: e.cnic, address: e.address, designation: e.designation,
        employeeType: e.type, employmentType: e.employment, joiningDate: joiningOf(e.joining), salary: e.salary,
        bankName: e.bank?.name ?? null, bankAccountTitle: e.bank?.title ?? null, bankAccountNumber: e.bank?.account ?? null, notes: DEMO_NOTE,
      };
      let created;
      try {
        created = await employeesSvc.create(dto, ctx);
      } catch {
        created = await employeesSvc.create({ ...dto, cnic: null }, ctx); // CNIC already used by a real employee
      }
      employeeIds.set(e.key, created.id);
      manifest.employees.push(created.id);
      await saveManifest(prisma, manifest);
    }
  });
  const emp = (k: string) => employeeIds.get(k)!;
  const employed = (k: string, date: string) => joiningOf(DEMO_EMPLOYEES.find((e) => e.key === k)!.joining) <= date;

  // ---------------------------------------------------------------- orders
  type Line = { code: string; qty: number; shopFabric?: string };
  interface OrderPlan {
    ci: number; daysAgo: number; type: 'STITCHING' | 'STITCHING_WITH_FABRIC' | 'FABRIC_SALE' | 'ALTERATION'; lines: Line[];
    delayed?: boolean; notCollected?: boolean; partial?: boolean; cancel?: boolean; balanceLeft?: boolean; urgent?: boolean; discount?: number;
  }
  const plans: OrderPlan[] = [
    { ci: 0, daysAgo: 52, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 3 }] },
    { ci: 1, daysAgo: 50, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'FORMAL_SUIT', qty: 1, shopFabric: 'F10' }] },
    { ci: 2, daysAgo: 47, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2 }, { code: 'WAISTCOAT', qty: 1 }] },
    { ci: 3, daysAgo: 44, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2, shopFabric: 'F1' }], balanceLeft: true },
    { ci: 4, daysAgo: 41, type: 'STITCHING', lines: [{ code: 'KURTA', qty: 2 }] },
    { ci: 5, daysAgo: 39, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 1 }] },
    { ci: 23, daysAgo: 38, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHIRT', qty: 10, shopFabric: 'F2' }, { code: 'TROUSER', qty: 10, shopFabric: 'F3' }], discount: 3000 },
    { ci: 6, daysAgo: 36, type: 'ALTERATION', lines: [{ code: 'ALTERATION', qty: 1 }] },
    { ci: 7, daysAgo: 34, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 1, shopFabric: 'F6' }] },
    { ci: 8, daysAgo: 33, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 4 }], balanceLeft: true },
    { ci: 9, daysAgo: 31, type: 'FABRIC_SALE', lines: [{ code: 'FABRIC', qty: 1, shopFabric: 'F7' }] },
    { ci: 10, daysAgo: 29, type: 'STITCHING', lines: [{ code: 'PANT', qty: 2 }, { code: 'SHIRT', qty: 2 }] },
    { ci: 11, daysAgo: 27, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'WAISTCOAT', qty: 1, shopFabric: 'F8' }, { code: 'SHALWAR_KAMEEZ', qty: 1, shopFabric: 'F1' }] },
    { ci: 12, daysAgo: 25, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2 }], cancel: true },
    { ci: 13, daysAgo: 23, type: 'STITCHING', lines: [{ code: 'KURTA', qty: 3 }], notCollected: true },
    { ci: 14, daysAgo: 21, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2, shopFabric: 'F4' }], partial: true },
    { ci: 0, daysAgo: 19, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'WAISTCOAT', qty: 1, shopFabric: 'F11' }] },
    { ci: 15, daysAgo: 18, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 1 }, { code: 'KURTA', qty: 1 }], partial: true },
    { ci: 16, daysAgo: 16, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2 }], delayed: true },
    { ci: 17, daysAgo: 15, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'FORMAL_SUIT', qty: 1, shopFabric: 'F11' }], delayed: true },
    { ci: 18, daysAgo: 13, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2 }] },
    { ci: 19, daysAgo: 12, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'KURTA', qty: 2, shopFabric: 'F9' }], notCollected: true },
    { ci: 20, daysAgo: 10, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 3 }] },
    { ci: 21, daysAgo: 9, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2, shopFabric: 'F6' }, { code: 'WAISTCOAT', qty: 1, shopFabric: 'F8' }], urgent: true },
    { ci: 22, daysAgo: 8, type: 'ALTERATION', lines: [{ code: 'ALTERATION', qty: 2 }] },
    { ci: 1, daysAgo: 7, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2 }] },
    { ci: 3, daysAgo: 6, type: 'STITCHING', lines: [{ code: 'KURTA', qty: 1 }] },
    { ci: 5, daysAgo: 5, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 1, shopFabric: 'F2' }] },
    { ci: 9, daysAgo: 4, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 2 }, { code: 'WAISTCOAT', qty: 1 }] },
    { ci: 2, daysAgo: 3, type: 'FABRIC_SALE', lines: [{ code: 'FABRIC', qty: 1, shopFabric: 'F5' }] },
    { ci: 11, daysAgo: 2, type: 'STITCHING', lines: [{ code: 'KURTA', qty: 2 }], urgent: true },
    { ci: 7, daysAgo: 1, type: 'STITCHING', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 1 }] },
    { ci: 14, daysAgo: 0, type: 'STITCHING_WITH_FABRIC', lines: [{ code: 'SHALWAR_KAMEEZ', qty: 1, shopFabric: 'F3' }] },
  ];
  // Customers: registered 20-120 days ago, each with a shalwar kameez measurement.
  const regDays = DEMO_CUSTOMERS.map(() => R.int(20, 120));
  // A customer is registered before (or on the day of) their first order.
  plans.forEach((p) => { regDays[p.ci] = Math.max(regDays[p.ci], p.daysAgo); });
  const customerIdx = new Map<number, string>();
  const measured = new Set<string>(); // customerIndex:templateCode
  const takeMeasurement = async (ci: number, templateCode: string, when: Date) => {
    const k = `${ci}:${templateCode}`;
    if (measured.has(k)) return;
    const t = templates.find((x) => x.code === templateCode);
    if (!t) return;
    const c = DEMO_CUSTOMERS[ci];
    const body = bodyMeasurements(c.size.chest, c.size.height);
    const values = t.fields.filter((f) => f.isRequired || body[f.key] !== undefined).map((f) => ({ fieldKey: f.key, value: (body[f.key] ?? 10).toFixed(2) }));
    await measurementsSvc.saveVersion(customerIdx.get(ci)!, { templateId: t.id, unit: 'INCH', values, takenByName: 'Ustad Abdul Rasheed', notes: ci === 0 ? 'Customer likes extra room in the chest.' : undefined }, ctx);
    measured.add(k);
    await stampNew(when, ['customer_measurements']);
  };
  DEMO_CUSTOMERS.forEach((c, ci) => {
    const reg = day(regDays[ci]);
    const orderSameDay = plans.some((p) => p.ci === ci && p.daysAgo === regDays[ci]);
    let when = at(reg, orderSameDay ? '10:30' : hhmm(R.int(11 * 60, 20 * 60)));
    if (when.getTime() > Date.now() - 2 * 3_600_000) when = new Date(Date.now() - 2 * 3_600_000);
    add(when, `customer ${c.name}`, async () => {
      const created = await customersSvc.create({
        name: c.name, mobile: c.mobile, whatsapp: c.mobile, email: c.email ?? null, address: c.address, city: 'Karachi', customerType: c.type,
        registrationDate: reg, notes: `${DEMO_NOTE} ${c.area}.${c.note ? ` ${c.note}` : ''}`, openingBalance: c.openingBalance, allowDuplicate: true,
      }, ctx);
      customerIdx.set(ci, created.id);
      customerIds.push(created.id);
      manifest.customers.push(created.id);
      await saveManifest(prisma, manifest);
      await stampNew(when, ['customer_ledger']);
      direct.push(() => prisma.customer.update({ where: { id: created.id }, data: { createdAt: when } }));
      if (c.type !== 'WALK_IN') await takeMeasurement(ci, 'SHALWAR_KAMEEZ', new Date(when.getTime() + 10 * 60_000));
    });
  });

  const methods: ('CASH' | 'BANK_TRANSFER' | 'MOBILE_WALLET' | 'CARD')[] = ['CASH', 'CASH', 'CASH', 'MOBILE_WALLET', 'BANK_TRANSFER', 'CARD'];
  const productionRecords: { emp: string; itemIdx: number; task: 'CUTTING' | 'STITCHING' | 'FINISHING'; date: string; rate: number; plan: number }[] = [];
  let orderCount = 0;

  const ctls: { orderId?: string; itemIds: string[] }[] = plans.map(() => ({ itemIds: [] }));
  plans.forEach((p, pi) => {
    const orderDate = day(p.daysAgo);
    let created = at(orderDate, hhmm(R.int(12 * 60, 21 * 60)));
    if (created > new Date()) created = new Date(Date.now() - 45 * 60_000);
    const vip = DEMO_CUSTOMERS[p.ci].type === 'VIP';
    const isSuit = p.lines.some((l) => l.code === 'FORMAL_SUIT');
    const ctl = ctls[pi];
    const stagePlan: [string, number][] = p.type === 'FABRIC_SALE' ? []
      : p.type === 'ALTERATION' ? [['STITCHING', 0], ['READY', 1]]
        : isSuit ? [['MEASUREMENT_DONE', 0], ['CUTTING', 1], ['STITCHING', 2], ['TRIAL', 6], ['ALTERATION', 7], ['QUALITY_CHECK', 9], ['READY', 10]]
          : [['CUTTING', 1], ['STITCHING', 2], ['QUALITY_CHECK', 4], ['READY', 5]];
    const slow = p.delayed ? 2.2 : 1;
    const deliverAfter = p.type === 'FABRIC_SALE' ? 0 : Math.round((stagePlan.at(-1)?.[1] ?? 0) * slow) + R.int(1, 3);
    const expectedDays = p.type === 'ALTERATION' ? 2 : isSuit ? 12 : p.urgent ? 3 : 7;

    add(created, `order ${pi + 1}`, async () => {
      const ci = p.ci;
      const items = [];
      for (const l of p.lines) {
        if (l.code === 'FABRIC') {
          const f = DEMO_FABRICS.find((x) => x.key === l.shopFabric)!;
          items.push({ garmentName: `${f.name} fabric`, quantity: 1, stitchingPrice: '0', fabricSource: 'SHOP' as const, fabricId: fabricIds.get(f.key), fabricQuantity: '4.750' });
          continue;
        }
        if (l.code === 'ALTERATION') {
          items.push({ garmentName: R.pick(['Kameez alteration (loosen chest)', 'Shalwar length shorten', 'Pant waist alteration']), quantity: l.qty, stitchingPrice: '500', fabricSource: 'CUSTOMER' as const });
          continue;
        }
        const g = garments.get(l.code);
        if (g?.measurementTemplateId) {
          const t = templates.find((x) => x.id === g.measurementTemplateId);
          if (t && DEMO_CUSTOMERS[ci].type !== 'WALK_IN') await takeMeasurement(ci, t.code, new Date(created.getTime() - 15 * 60_000));
        }
        const price = GARMENT_PRICES[l.code];
        const fab = l.shopFabric ? DEMO_FABRICS.find((x) => x.key === l.shopFabric)! : null;
        items.push({
          garmentTypeId: g?.id ?? null, garmentName: g?.name ?? l.code, quantity: l.qty, stitchingPrice: String(vip ? price.vipPrice : price.price),
          fabricSource: fab ? ('SHOP' as const) : ('CUSTOMER' as const), fabricId: fab ? fabricIds.get(fab.key) : undefined,
          fabricQuantity: fab ? (FABRIC_PER_PIECE[l.code] * l.qty).toFixed(3) : undefined,
          fabricDescription: fab ? undefined : R.pick(['Customer fabric - white wash & wear', 'Customer fabric - cotton', 'Customer fabric - karandi', 'Customer fabric - unstitched suit']),
        });
      }
      // Work out the total first so the advance is right.
      const subtotal = items.reduce((a, i) => a + Number(i.stitchingPrice) * i.quantity + (i.fabricSource === 'SHOP' ? Number(i.fabricQuantity) * Number(DEMO_FABRICS.find((f) => fabricIds.get(f.key) === i.fabricId)!.salePrice) : 0), 0);
      const extra = p.urgent ? 1000 : 0;
      const total = subtotal + extra - (p.discount ?? 0);
      const advancePct = p.type === 'FABRIC_SALE' ? 100 : Math.max(minAdvancePct, R.pick([0, 30, 50, 50, 50, 100]));
      const advance = Math.min(total, Math.ceil((total * advancePct) / 100 / 100) * 100);
      const o = await ordersSvc.create({
        id: randomUUID(), customerId: customerIdx.get(ci)!, orderType: p.type, orderDate, expectedDeliveryDate: addDays(orderDate, expectedDays),
        specialInstructions: p.type === 'FABRIC_SALE' ? undefined : (p.urgent ? 'URGENT. ' : '') + R.pick(SPECIAL_INSTRUCTIONS) || undefined,
        additionalCharges: extra ? String(extra) : undefined, discount: p.discount ? String(p.discount) : undefined,
        items, advance: advance > 0 ? { amount: String(advance), method: R.pick(methods) } : undefined,
      }, ctx);
      ctl.orderId = o.id;
      ctl.itemIds = o.items.map((i: { id: string }) => i.id);
      orderCount += 1;
      await stampNew(created, ORDER_TABLES);
      direct.push(() => prisma.order.update({ where: { id: o.id }, data: { createdAt: created } }));
      if (p.type !== 'FABRIC_SALE' && p.type !== 'ALTERATION') {
        const tailor = GARMENT_PRICES[p.lines[0].code]?.tailor ?? 'E3';
        await ordersSvc.assign(o.id, { employeeId: emp(tailor) }, ctx);
      }
    });

    // Fabric sale: paid and handed over on the spot.
    if (p.type === 'FABRIC_SALE') {
      const when = new Date(created.getTime() + 20 * 60_000);
      add(when, `order ${pi + 1} handover`, async () => {
        await ordersSvc.deliver(ctl.orderId!, { items: ctl.itemIds.map((id) => ({ orderItemId: id, quantity: 1 })), receivedBy: DEMO_CUSTOMERS[p.ci].name }, ctx);
        await stampNew(when, ORDER_TABLES);
        direct.push(() => prisma.order.update({ where: { id: ctl.orderId! }, data: { actualDeliveryDate: new Date(`${orderDate}T00:00:00Z`) } }));
      });
      return;
    }

    // Cancelled before work started.
    if (p.cancel) {
      const date = addDays(orderDate, 2);
      add(at(date, '15:10'), `order ${pi + 1} cancel`, async () => {
        await ordersSvc.cancel(ctl.orderId!, { reason: 'Customer cancelled - travelling abroad. Advance kept as credit.' }, ctx);
        await stampNew(at(date, '15:10'), ORDER_TABLES);
        direct.push(() => prisma.order.update({ where: { id: ctl.orderId! }, data: { cancelledAt: at(date, '15:10') } }));
      });
      return;
    }

    for (const [code, offset] of stagePlan) {
      const days = Math.round(offset * slow);
      if (days > p.daysAgo) break;
      const date = addDays(orderDate, days);
      const when = days === 0 ? new Date(created.getTime() + 30 * 60_000) : at(date, hhmm(R.int(11 * 60, 19 * 60)));
      if (when > new Date()) break;
      const stage = stages.get(code);
      if (!stage) continue;
      add(when, `order ${pi + 1} ${code}`, async () => {
        await ordersSvc.changeStage(ctl.orderId!, { stageId: stage.id, notes: code === 'TRIAL' ? 'Customer came for trial. Sleeves to shorten 0.5 inch.' : undefined }, ctx);
        await stampNew(when, ORDER_TABLES);
      });
      // Piece work: cutting on the cutting day, stitching when it reaches quality check / ready.
      if (p.type === 'ALTERATION') continue;
      if (code === 'CUTTING') p.lines.forEach((l, li) => productionRecords.push({ emp: 'E2', itemIdx: li, task: 'CUTTING', date, rate: GARMENT_PRICES[l.code].cutRate, plan: pi }));
      if (code === 'QUALITY_CHECK') {
        p.lines.forEach((l, li) => productionRecords.push({ emp: GARMENT_PRICES[l.code].tailor, itemIdx: li, task: 'STITCHING', date, rate: GARMENT_PRICES[l.code].pieceRate, plan: pi }));
      }
    }

    // Delivery and the balance payment.
    if (p.notCollected || deliverAfter > p.daysAgo) return;
    const dDate = addDays(orderDate, deliverAfter);
    const dWhen = at(dDate, hhmm(R.int(17 * 60, 21 * 60 + 30)));
    if (dWhen > new Date()) return;
    add(dWhen, `order ${pi + 1} delivery`, async () => {
      const o = await prisma.order.findUniqueOrThrow({ where: { id: ctl.orderId! }, include: { items: { orderBy: { lineNo: 'asc' } } } });
      const deliverItems = p.partial ? [o.items[0]] : o.items;
      const balance = Number(o.totalAmount) + Number(o.adjustmentsTotal) - Number(o.paidAmount);
      const pay = p.partial ? Math.min(balance, Math.round(balance / 2 / 100) * 100) : p.balanceLeft ? Math.max(0, balance - 1500) : balance;
      await ordersSvc.deliver(o.id, {
        items: deliverItems.map((i) => ({ orderItemId: i.id, quantity: p.partial && i.quantity > 1 ? 1 : i.quantity })),
        receivedBy: R.chance(0.2) ? `${DEMO_CUSTOMERS[p.ci].name.split(' ')[0]}'s brother` : DEMO_CUSTOMERS[p.ci].name,
        payment: pay > 0 ? { amount: String(pay), method: R.pick(methods) } : undefined,
      }, ctx);
      await stampNew(dWhen, ORDER_TABLES);
      if (!p.partial) direct.push(() => prisma.order.update({ where: { id: o.id }, data: { actualDeliveryDate: new Date(`${dDate}T00:00:00Z`) } }));
    });
  });

  // Production entries (after the order steps they belong to; same day, evening).
  for (const r of productionRecords) {
    add(at(r.date, '19:30'), 'production', async () => {
      if (!monthOpen(r.date) || !employed(r.emp, r.date)) return;
      const itemId = ctls[r.plan].itemIds[r.itemIdx];
      const item = itemId ? await prisma.orderItem.findUnique({ where: { id: itemId } }) : null;
      if (!item) return;
      await productionSvc.create({ employeeId: emp(r.emp), orderItemId: item.id, taskType: r.task, quantity: item.quantity, pieceRate: String(r.rate), workDate: r.date }, ctx);
    });
  }

  // ---------------------------------------------------------------- attendance, leave, overtime, advances
  const attendanceFrom = prevMonthStart;
  const leaveDays = new Set([`E5:${prevMonth}-14`, `E5:${prevMonth}-15`]);
  for (let d = attendanceFrom; d < today; d = addDays(d, 1)) {
    const date = d;
    if (!monthOpen(date)) continue;
    add(at(date, '22:00'), `attendance ${date}`, async () => {
      const sunday = dow(date) === 0;
      const entries = DEMO_EMPLOYEES.filter((e) => employed(e.key, date) && !leaveDays.has(`${e.key}:${date}`)).map((e) => {
        if (sunday) return { employeeId: emp(e.key), status: 'HOLIDAY' as const, notes: 'Sunday' };
        const roll = R.next();
        if (roll < 0.03) return { employeeId: emp(e.key), status: 'ABSENT' as const };
        if (roll < 0.06) return { employeeId: emp(e.key), status: 'HALF_DAY' as const, checkIn: '11:00', checkOut: '15:30', notes: 'Left early' };
        const late = R.chance(0.12) ? R.int(10, 45) : 0;
        return { employeeId: emp(e.key), status: 'PRESENT' as const, checkIn: hhmm(11 * 60 + late), checkOut: hhmm(R.int(20 * 60 + 30, 22 * 60)), lateMinutes: late || undefined };
      });
      if (entries.length) await attendanceSvc.save({ date, entries }, ctx);
    });
  }
  if (monthOpen(prevMonthStart)) {
    add(at(`${prevMonth}-16`, '10:00'), 'leave', async () => {
      const l = await attendanceSvc.createLeave({ employeeId: emp('E5'), leaveType: 'SICK', fromDate: `${prevMonth}-14`, toDate: `${prevMonth}-15`, reason: 'Fever (doctor slip given)' }, ctx);
      await attendanceSvc.decideLeave(l.id, true, ctx);
    });
    for (const [d, hours] of [[18, '3'], [19, '3'], [20, '2.5']] as const) {
      const date = `${prevMonth}-${String(d).padStart(2, '0')}`;
      add(at(date, '23:00'), 'overtime', async () => {
        const o = await attendanceSvc.createOvertime({ employeeId: emp('E1'), date, hours, notes: 'Wedding season rush' }, ctx);
        await attendanceSvc.decideOvertime(o.id, true, ctx);
      });
    }
    add(at(`${prevMonth}-08`, '18:00'), 'advance', async () => {
      await employeesSvc.giveAdvance(emp('E3'), { amount: '15000', installmentAmount: '5000', paymentMethod: 'CASH', advanceDate: `${prevMonth}-08`, reason: 'Child school fee', idempotencyKey: randomUUID() }, ctx);
    });
  }
  if (monthOpen(today)) {
    const d5 = `${thisMonth}-05`;
    if (d5 < today) {
      add(at(d5, '18:00'), 'advance', async () => {
        await employeesSvc.giveAdvance(emp('E6'), { amount: '5000', installmentAmount: '2500', paymentMethod: 'MOBILE_WALLET', advanceDate: d5, reason: 'Medical', idempotencyKey: randomUUID() }, ctx);
      });
    }
    const yesterday = day(1);
    if (yesterday.startsWith(thisMonth)) {
      add(at(yesterday, '23:00'), 'overtime', async () => {
        await attendanceSvc.createOvertime({ employeeId: emp('E8'), date: yesterday, hours: '2', notes: 'Stock counting' }, ctx); // left pending
      });
    }
    add(at(today, '09:00'), 'leave request', async () => {
      await attendanceSvc.createLeave({ employeeId: emp('E4'), leaveType: 'CASUAL', fromDate: addDays(today, 3), toDate: addDays(today, 4), reason: 'Family wedding in Hyderabad' }, ctx); // left pending
    });
  }

  // ---------------------------------------------------------------- last month's payroll
  const realEmployees = await prisma.employee.count({ where: { deletedAt: null } });
  const payrollExists = await prisma.payroll.findFirst({ where: { OR: [{ periodKey: prevMonth }, { status: 'DRAFT' }] } });
  if (realEmployees > 0) notes.push('Payroll was not made: the ERP already has real employees, so a demo payroll would include them.');
  else if (payrollExists) notes.push(`Payroll was not made: a payroll for ${prevMonth} (or a draft payroll) already exists.`);
  else if (lockedMonths.has(prevMonth)) notes.push(`Payroll was not made: ${prevMonth} is already locked.`);
  else {
    const payDay = `${thisMonth}-03` < today ? `${thisMonth}-03` : today;
    add(at(payDay, '17:00'), 'payroll', async () => {
      const p = await payrollSvc.create({ periodKey: prevMonth, notes: `${DEMO_NOTE} Salaries for last month` }, ctx);
      manifest.payrolls.push(p.id);
      await saveManifest(prisma, manifest);
      await payrollSvc.approve(p.id, ctx);
      const full = await payrollSvc.get(p.id);
      const master = full.items.find((i) => i.employee.id === emp('E1'));
      if (master) await payrollSvc.pay(master.id, { amount: master.netAmount, method: 'BANK_TRANSFER', paymentDate: payDay, reference: 'Meezan IBFT', idempotencyKey: randomUUID() }, ctx);
      await payrollSvc.payAll(p.id, { method: 'CASH', paymentDate: payDay, idempotencyKey: randomUUID() }, ctx);
    });
  }

  // ---------------------------------------------------------------- owner capital and shop expenses (books + expense reports)
  const accountId = async (code: string) => (await prisma.chartOfAccount.findUnique({ where: { companyId_code: byCompany({ code }) } }))?.id;
  add(at(addDays(setupDay, -1), '09:00'), 'owner capital', async () => {
    const [cash, bank, capital] = await Promise.all([accountId('1000'), accountId('1010'), accountId('3000')]);
    if (!cash || !bank || !capital) { notes.push('Owner capital was not added: the standard accounts are missing.'); return; }
    if (lockedMonths.has(addDays(setupDay, -1).slice(0, 7))) return;
    const j = await accountingSvc.createManual({
      entryDate: addDays(setupDay, -1), description: `${DEMO_NOTE} ${DEMO_OWNER_CAPITAL.description}`, idempotencyKey: randomUUID(),
      lines: [
        { accountId: cash, debit: DEMO_OWNER_CAPITAL.cash, description: 'Cash in hand' },
        { accountId: bank, debit: DEMO_OWNER_CAPITAL.bank, description: 'Meezan Bank' },
        { accountId: capital, credit: String(Number(DEMO_OWNER_CAPITAL.cash) + Number(DEMO_OWNER_CAPITAL.bank)), description: "Owner's capital" },
      ],
    } as never, ctx);
    manifest.journals!.push(j.id);
    await saveManifest(prisma, manifest);
  });
  const expenseCats = new Map((await prisma.expenseCategory.findMany({ where: { isActive: true } })).map((c) => [c.name, c.id]));
  const approver = { id: user.id, fullName: user.fullName, email: user.email, username: user.username, isOwner: true, roles: [], permissions: [], sessionId: '' };
  const staff = { ...approver, isOwner: false, permissions: ['expenses.view', 'expenses.create'] };
  const addExpense = (date: string, time: string, category: string, description: string, paidTo: string, method: string, amount: string, reference: string | undefined, pending = false) => {
    const categoryId = expenseCats.get(category);
    if (!categoryId || !monthOpen(date)) return;
    add(at(date, time), `expense ${description}`, async () => {
      const x = await expensesSvc.create({
        expenseDate: date, categoryId, description, paidTo, paymentMethod: method, amount, reference, notes: DEMO_NOTE, idempotencyKey: randomUUID(),
      } as never, (pending ? staff : approver) as never, ctx);
      manifest.expenses!.push(x.id);
      await saveManifest(prisma, manifest);
    });
  };
  for (let m = setupDay.slice(0, 7); m <= thisMonth; m = nextMonthKey(m)) {
    DEMO_MONTHLY_EXPENSES.forEach((e, i) => {
      const date = `${m}-${String(e.day).padStart(2, '0')}`;
      if (date < setupDay || date > today) return;
      addExpense(date, '12:00', e.category, `${e.description} (${monthName(m)})`, e.paidTo, e.method, e.amounts[(i + Number(m.slice(5))) % e.amounts.length], e.reference);
    });
  }
  for (const [ago, cat, desc, to, method, amount] of DEMO_DAILY_EXPENSES) addExpense(day(ago), '18:30', cat, desc, to, method, amount, undefined);
  for (const [ago, cat, desc, to, method, amount] of DEMO_PENDING_EXPENSES) addExpense(day(ago), '19:00', cat, desc, to, method, amount, undefined, true);
  add(at(today, '08:30'), 'recurring bills', async () => {
    const next = `${nextMonthKey(thisMonth)}-01`;
    for (const r of [
      { category: 'Shop Rent', description: 'Shop rent, Shop 14 Tariq Road', amount: '85000', paymentMethod: 'BANK_TRANSFER', nextRunDate: next },
      { category: 'Internet & Phone', description: 'StormFiber internet 15 Mbps', amount: '3499', paymentMethod: 'MOBILE_WALLET', nextRunDate: `${nextMonthKey(thisMonth)}-07` },
      { category: 'Cleaning & Security', description: 'Chowkidar and sweeper monthly', amount: '6000', paymentMethod: 'CASH', nextRunDate: `${nextMonthKey(thisMonth)}-03` },
    ]) {
      const categoryId = expenseCats.get(r.category);
      if (!categoryId) continue;
      const row = await expensesSvc.createRecurring({ categoryId, description: `${r.description} ${DEMO_NOTE}`, amount: r.amount, paymentMethod: r.paymentMethod, frequency: 'MONTHLY', nextRunDate: r.nextRunDate } as never, ctx);
      if (row) manifest.recurring!.push(row.id);
    }
    await saveManifest(prisma, manifest);
  });

  // ---------------------------------------------------------------- run in time order
  steps.sort((a, b) => a.when.getTime() - b.when.getTime());
  const done = new Set<string>();
  for (const s of steps) {
    try {
      await s.run();
    } catch (err) {
      throw new Error(`Demo step "${s.label}" (${s.when.toISOString()}) failed: ${(err as Error).message}`);
    }
    done.add(s.label);
  }

  // ---------------------------------------------------------------- give the records their story dates
  await prisma.$transaction(async (tx) => {
    const tables = Object.keys(STAMP_TABLES) as StampTable[];
    for (const t of tables) await tx.$executeRawUnsafe(`ALTER TABLE ${t} DISABLE TRIGGER ${STAMP_TRIGGERS[t]}`);
    for (const t of tables) {
      const rows = stamps.filter((s) => s.table === t);
      if (!rows.length) continue;
      await tx.$executeRawUnsafe(
        `UPDATE ${t} SET ${STAMP_TABLES[t].set} FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::timestamp[]) AS at) v WHERE ${t}.id = v.id`,
        rows.map((r) => r.id), rows.map((r) => r.at.toISOString().replace('Z', '')),
      );
    }
    for (const t of tables) await tx.$executeRawUnsafe(`ALTER TABLE ${t} ENABLE TRIGGER ${STAMP_TRIGGERS[t]}`);
  }, { timeout: 120_000 });
  for (const fix of direct) await fix();

  // Accounting: the books post automatically from the ledgers and stock movements. Entries posted while the demo was
  // loading still carry today's date, so remove them and post again now that every record has its story date.
  const posting = get(PostingService);
  const demoOrders = (await prisma.order.findMany({ where: { customerId: { in: manifest.customers } }, select: { id: true } })).map((o) => o.id);
  await prisma.$transaction(async (tx) => {
    await purgeJournalsFor(tx, {
      customerIds: manifest.customers, supplierIds: manifest.suppliers, employeeIds: manifest.employees, fabricIds: manifest.fabrics,
      sourceIds: [...demoOrders, ...manifest.payrolls],
    });
  }, { timeout: 120_000 });
  const books = await posting.sync();
  if (books.failed.length) notes.push(`${books.failed.length} accounting entries could not be posted (for example a closed month). See Accounting > Sync.`);

  // WhatsApp (Phase 8): about half the customers agreed to messages, and a realistic message history.
  counts_wa.messages = await addDemoWhatsApp(prisma, get(WhatsAppService), manifest.customers, user.id);
  manifest.whatsapp = true;

  // Saved report filters for the demo login (Reports > Saved).
  await prisma.systemSetting.upsert({
    where: { companyId_key: byCompany({ key: `reports.saved_filters.${user.id}` }) },
    create: {
      key: `reports.saved_filters.${user.id}`, group: 'report_filters', description: 'Saved report filters', updatedById: user.id,
      value: DEMO_SAVED_FILTERS.map((f) => ({ id: randomUUID(), ...f, createdAt: new Date().toISOString() })) as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  manifest.savedFilters = true;

  // Offline sync (Phase 9): entries that came in from the shop tablet and counter PC, plus work to review in Sync Center.
  const syncEntries = await addDemoSync(prisma, manifest.customers, user.id);
  manifest.sync = true;

  manifest.complete = true;
  await saveManifest(prisma, manifest);
  const counts = countsOf(manifest);
  counts.orders = orderCount;
  counts.whatsappMessages = counts_wa.messages;
  counts.syncEntries = syncEntries;
  return { status: 'loaded', counts, notes, username: demoUsername };
}

function countsOf(m: DemoManifest): Record<string, number> {
  return {
    customers: m.customers.length, suppliers: m.suppliers.length, fabrics: m.fabrics.length, employees: m.employees.length, payrolls: m.payrolls.length,
    expenses: m.expenses?.length ?? 0,
  };
}

function nextMonthKey(key: string) {
  const [y, mo] = key.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}
function monthName(key: string) {
  const [y, mo] = key.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]} ${y}`;
}

/**
 * Demo WhatsApp history. Rows are written directly (nothing is sent): manual messages opened in WhatsApp and
 * Cloud API messages with delivered / read ticks and one failure, dated with each order's own story dates.
 * Demo customers are never messaged through the Cloud API (WhatsAppService blocks it), even when opted in.
 */
async function addDemoWhatsApp(prisma: PrismaService, wa: WhatsAppService, customerIds: string[], userId: string): Promise<number> {
  await wa.ensureDefaults();
  const templates = new Map((await prisma.whatsAppTemplate.findMany()).map((t) => [t.purpose, t]));
  const customers = await prisma.customer.findMany({ where: { id: { in: customerIds } }, orderBy: { code: 'asc' } });
  const optedIn = new Set<string>();
  for (const [i, c] of customers.entries()) {
    if (i % 2 === 1) continue;
    optedIn.add(c.id);
    await prisma.customer.update({ where: { id: c.id }, data: { whatsappOptIn: true, whatsappOptInAt: c.createdAt } });
  }
  const orders = await prisma.order.findMany({
    where: { customerId: { in: customerIds } }, orderBy: { createdAt: 'asc' },
    include: { payments: { where: { status: 'POSTED', type: { not: 'REFUND' } }, orderBy: { paymentDate: 'asc' } }, stage: { select: { code: true } } },
  });
  const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
  const rows: Prisma.WhatsAppMessageCreateManyInput[] = [];
  let n = 0;
  const add = async (purpose: string, relatedType: 'ORDER' | 'PAYMENT', relatedId: string, customerId: string, at: Date) => {
    const t = templates.get(purpose);
    if (!t) return;
    const p = await wa.preview({ templateId: t.id, relatedType, relatedId });
    if (!p.toNumber) return;
    n += 1;
    const cloud = optedIn.has(customerId);
    const failed = cloud && n % 17 === 0;
    const read = cloud && !failed && n % 3 !== 0;
    rows.push({
      customerId, toNumber: p.toNumber, templateId: t.id, channel: cloud ? 'CLOUD_API' : 'MANUAL', messageType: 'TEMPLATE', body: p.text,
      status: failed ? 'FAILED' : !cloud ? 'SENT' : read ? 'READ' : 'DELIVERED', attempts: cloud ? (failed ? 5 : 1) : 0,
      waMessageId: cloud && !failed ? `wamid.DEMO${randomUUID().replace(/-/g, '')}` : null,
      errorCode: failed ? '131026' : null, errorMessage: failed ? 'Message undeliverable: the number is not on WhatsApp' : null,
      relatedType, relatedId, createdById: cloud ? null : userId, createdAt: at, updatedAt: at,
      sentAt: failed ? null : minutes(at, 1), deliveredAt: cloud && !failed ? minutes(at, 2) : null, readAt: read ? minutes(at, 25) : null,
      failedAt: failed ? minutes(at, 90) : null,
    });
  };
  for (const o of orders) {
    if (o.lifecycle === 'CANCELLED') continue;
    await add('ORDER_CONFIRMATION', 'ORDER', o.id, o.customerId, minutes(o.createdAt, 2));
    for (const pay of o.payments.slice(1)) await add('PAYMENT_RECEIVED', 'PAYMENT', pay.id, o.customerId, minutes(pay.paymentDate, 1));
    if (o.stage.code === 'READY') await add('ORDER_READY', 'ORDER', o.id, o.customerId, minutes(o.updatedAt, 5));
    if (o.lifecycle === 'DELIVERED' && o.actualDeliveryDate && Number(o.balanceAmount) > 0) {
      await add('PAYMENT_REMINDER', 'ORDER', o.id, o.customerId, new Date(o.actualDeliveryDate.getTime() + 3 * 86_400_000 + 7 * 3_600_000));
    }
  }
  // Never in the future (the reminder above can land after today).
  const now = new Date();
  const safe = rows.filter((r) => (r.createdAt as Date) <= now);
  if (safe.length) await prisma.whatsAppMessage.createMany({ data: safe });
  return safe.length;
}

/**
 * Demo offline-sync history, written directly (nothing is re-applied): customers, measurements, orders and payments
 * that "arrived" from two shop devices, one payment the server rejected, one customer edited on both the tablet
 * and the counter (needs a merge) and one possible duplicate customer. All rows belong to the demo login,
 * so scripts\remove-demo-data.ps1 removes them.
 */
async function addDemoSync(prisma: PrismaService, customerIds: string[], userId: string): Promise<number> {
  const TABLET = 'web-demo-shop-tablet';
  const COUNTER = 'web-demo-counter-pc';
  const customers = await prisma.customer.findMany({ where: { id: { in: customerIds } }, orderBy: { code: 'asc' }, include: { addresses: { where: { isDefault: true }, take: 1 } } });
  if (customers.length < 6) return 0;
  const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
  const rows: Prisma.SyncOperationCreateManyInput[] = [];
  const applied = (deviceId: string, entityType: string, entityId: string, at: Date, payload: Record<string, unknown>, result: Record<string, unknown>) => {
    rows.push({
      id: randomUUID(), deviceId, userId, entityType, entityId, operation: 'CREATE', payload: payload as Prisma.InputJsonValue,
      status: 'APPLIED', result: result as Prisma.InputJsonValue, clientTimestamp: at, serverTimestamp: minutes(at, 3 + (rows.length % 9)),
    });
  };

  // Last few customers were registered on the tablet during a power cut, with their first measurement and order.
  for (const c of customers.slice(-4)) {
    applied(TABLET, 'customer', c.id, c.createdAt, { name: c.name, mobile: c.mobile, city: c.city, address: c.addresses[0]?.addressLine ?? null }, { entityId: c.id, code: c.code, name: c.name, version: 1 });
    const m = await prisma.customerMeasurement.findFirst({ where: { customerId: c.id }, orderBy: { createdAt: 'asc' }, include: { template: { select: { name: true } } } });
    if (m) applied(TABLET, 'measurement', m.id, m.createdAt, { customerId: c.id, templateId: m.templateId, unit: m.unit }, { entityId: m.id, customerId: c.id, template: m.template.name, versionNo: m.versionNo });
    const o = await prisma.order.findFirst({ where: { customerId: c.id }, orderBy: { createdAt: 'asc' } });
    if (o) applied(TABLET, 'order', o.id, o.createdAt, { customerId: c.id }, { entityId: o.id, orderNumber: o.orderNumber, totalAmount: o.totalAmount.toFixed(2), balanceAmount: o.balanceAmount.toFixed(2) });
  }
  // Counter PC: payments received while the internet was down.
  const pays = await prisma.payment.findMany({ where: { customerId: { in: customerIds }, type: { not: 'REFUND' }, status: 'POSTED', orderId: { not: null } }, orderBy: { paymentDate: 'desc' }, take: 3, include: { order: { select: { orderNumber: true } } } });
  for (const p of pays) {
    applied(COUNTER, 'payment', p.id, p.paymentDate, { orderId: p.orderId, amount: p.amount.toFixed(2), method: p.method }, { entityId: p.id, receiptNo: p.receiptNo, orderId: p.orderId, orderNumber: p.order?.orderNumber ?? null });
  }

  // Rejected: a second cashier took the same balance on the counter PC after it was already paid.
  const paidOrder = await prisma.order.findFirst({ where: { customerId: { in: customerIds }, paymentStatus: 'PAID', lifecycle: { not: 'CANCELLED' } }, orderBy: { updatedAt: 'desc' } });
  if (paidOrder) {
    const at = minutes(new Date(), -95);
    rows.push({
      id: randomUUID(), deviceId: COUNTER, userId, entityType: 'payment', entityId: randomUUID(), operation: 'CREATE',
      payload: { orderId: paidOrder.id, amount: '1500.00', method: 'CASH' }, status: 'REJECTED',
      errorMessage: 'This order is already fully paid', clientTimestamp: at, serverTimestamp: minutes(at, 4),
    });
  }
  await prisma.syncOperation.createMany({ data: rows });

  // Conflict 1: the tablet changed a VIP customer's address and notes while the counter changed the same customer.
  const vip = customers[1];
  const base = vip.version;
  const serverNotes = 'Collar size 16. Prefers delivery after 6 pm.';
  await prisma.customer.update({ where: { id: vip.id }, data: { notes: serverNotes, version: { increment: 1 } } });
  const v1At = minutes(new Date(), -50);
  const editOp = randomUUID();
  const editPayload = { address: 'Bungalow 12, Khayaban-e-Shamsheer, DHA Phase 5', notes: 'Wants all kurtas with side pockets.' };
  await prisma.syncOperation.create({
    data: {
      id: editOp, deviceId: TABLET, userId, entityType: 'customer', entityId: vip.id, operation: 'UPDATE', baseVersion: base, payload: editPayload,
      status: 'CONFLICT', errorMessage: 'This customer was also changed on the server. Review which details to keep.', clientTimestamp: v1At, serverTimestamp: minutes(v1At, 6),
      conflicts: {
        create: {
          entityType: 'customer', entityId: vip.id, serverVersion: base + 1, clientVersion: base,
          serverData: { kind: 'VERSION', record: {
            id: vip.id, code: vip.code, version: base + 1, name: vip.name, mobile: vip.mobile, whatsapp: vip.whatsapp, email: vip.email, city: vip.city,
            address: vip.addresses[0]?.addressLine ?? null, customerType: vip.customerType, notes: serverNotes,
          } },
          clientData: editPayload,
        },
      },
    },
  });

  // Conflict 2: the tablet registered a walk-in whose mobile number already belongs to a demo customer.
  const existing = customers[2];
  const dupAt = minutes(new Date(), -20);
  const dupPayload = { name: `${existing.name.split(' ')[0]} Bhai`, mobile: existing.mobile, city: 'Karachi', address: 'Bolton Market, Karachi', customerType: 'WALK_IN' };
  await prisma.syncOperation.create({
    data: {
      id: randomUUID(), deviceId: TABLET, userId, entityType: 'customer', entityId: randomUUID(), operation: 'CREATE', payload: dupPayload,
      status: 'CONFLICT', errorMessage: `A customer with this phone number already exists: ${existing.name} (${existing.code}). Review before saving.`,
      clientTimestamp: dupAt, serverTimestamp: minutes(dupAt, 2),
      conflicts: {
        create: {
          entityType: 'customer', entityId: existing.id, serverVersion: existing.version, clientVersion: null,
          serverData: { kind: 'DUPLICATE', record: {
            id: existing.id, code: existing.code, version: existing.version, name: existing.name, mobile: existing.mobile, whatsapp: existing.whatsapp,
            email: existing.email, city: existing.city, address: existing.addresses[0]?.addressLine ?? null, customerType: existing.customerType, notes: existing.notes,
          } },
          clientData: dupPayload,
        },
      },
    },
  });
  return rows.length + 2;
}
