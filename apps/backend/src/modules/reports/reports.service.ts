import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  REPORTS, REPORT_FILTERS, STOCK_STATUSES, type ReportDefinition, type ReportFilterKey, type ReportResult, type ReportRow, type SavedReportFilter,
  DATE_RANGE_PRESETS, findReport, permissionCode, MOVEMENT_TYPES, PAYMENT_METHODS, EXPENSE_STATUSES,
} from '@az/shared';
import type { DateRangePreset } from '@az/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { isValidIsoDate, karachiToday, resolveDateRange } from '../../common/utils/date-range';
import { dec } from '../../common/utils/money';
import { AccountingService } from '../accounting/accounting.service';
import { PostingService } from '../accounting/posting.service';
import { SettingsService } from '../settings/settings.service';
import { BUILDERS } from './builders';
import { BuiltReport, MAX_ROWS } from './report-kit';

export interface ReportQuery {
  preset?: string;
  from?: string;
  to?: string;
  asOf?: string;
  search?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  columns?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Filters whose value is a record id. */
const ID_FILTERS = new Set<ReportFilterKey>(['customer', 'employee', 'supplier', 'garment', 'stage', 'expenseCategory', 'fabricCategory', 'fabric', 'account', 'user']);
const ENUM_FILTERS: Partial<Record<ReportFilterKey, readonly string[]>> = {
  paymentStatus: ['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'],
  paymentMethod: PAYMENT_METHODS.map((x) => x.key),
  expenseStatus: EXPENSE_STATUSES.map((x) => x.key),
  movementType: MOVEMENT_TYPES.map((x) => x.key),
  stockStatus: STOCK_STATUSES.map((x) => x.key),
};
const SAVED_KEY = (userId: string) => `reports.saved_filters.${userId}`;
const MAX_SAVED = 50;

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly posting: PostingService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- access

  canOpen(user: AuthUser, def: ReportDefinition) {
    if (user.isOwner) return true;
    return user.permissions.includes(permissionCode('reports', 'VIEW')) && user.permissions.includes(permissionCode(def.module, 'VIEW'));
  }

  private def(key: string, user: AuthUser) {
    const def = findReport(key);
    if (!def) throw new NotFoundException('Report not found');
    if (!this.canOpen(user, def)) throw new ForbiddenException(`You do not have access to the ${def.title}. It needs the ${def.module.replace('_', ' ')} view permission.`);
    return def;
  }

  catalog(user: AuthUser) {
    return REPORTS.map((r) => ({ ...r, allowed: this.canOpen(user, r) }));
  }

  // ---------------------------------------------------------------- run

  async run(key: string, q: ReportQuery, user: AuthUser, opts: { all?: boolean } = {}): Promise<ReportResult> {
    const def = this.def(key, user);
    const today = karachiToday();
    let range = null;
    let asOf: string | null = null;
    if (def.dateMode === 'range') {
      const preset = (q.preset || def.defaultPreset || 'this_month') as DateRangePreset;
      if (!DATE_RANGE_PRESETS.some((p) => p.key === preset)) throw new BadRequestException('Unknown date range');
      try {
        range = resolveDateRange(preset, q.from, q.to);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    } else if (def.dateMode === 'asOf') {
      asOf = q.asOf || today;
      if (!isValidIsoDate(asOf)) throw new BadRequestException('"As on" date must be like 2026-11-27');
    }
    const f: Partial<Record<ReportFilterKey, string>> = {};
    for (const k of def.filters) {
      const v = (q as Record<string, unknown>)[k];
      if (v === undefined || v === null || v === '') continue;
      const s = String(v);
      if (ID_FILTERS.has(k) && !UUID_RE.test(s)) throw new BadRequestException(`${REPORT_FILTERS[k]} is not valid`);
      const allowed = ENUM_FILTERS[k];
      if (allowed && !allowed.includes(s)) throw new BadRequestException(`${REPORT_FILTERS[k]} is not valid`);
      if (k === 'auditModule' && !/^[a-z_]{2,40}$/.test(s)) throw new BadRequestException('Module is not valid');
      f[k] = s;
    }
    if (def.category === 'accounts' || def.key === 'daily-sales' || def.key === 'monthly-sales') await this.posting.syncQuietly();

    const built: BuiltReport = await BUILDERS[def.key]({ def, range, asOf, today, f, prisma: this.prisma, accounting: this.accounting });
    const statement = !!def.statement;
    const sortable = !statement && built.sortable !== false;
    let rows = built.rows;

    // Search: any visible text in the row.
    const search = (q.search ?? '').toString().trim().toLowerCase();
    if (search && !statement) {
      const keys = built.columns.map((c) => c.key);
      rows = rows.filter((r) => r._kind === 'section' || keys.some((k) => String(r[k] ?? '').toLowerCase().includes(search)));
    }
    // Sorting.
    const sortKey = q.sort && built.columns.some((c) => c.key === q.sort) ? q.sort : built.defaultSort?.key;
    const dir = q.sort ? (q.dir === 'asc' ? 'asc' : 'desc') : (built.defaultSort?.dir ?? 'desc');
    if (sortable && sortKey) {
      const column = built.columns.find((c) => c.key === sortKey)!;
      const numeric = ['money', 'number', 'qty', 'percent'].includes(column.type);
      const s = dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const x = a[sortKey];
        const y = b[sortKey];
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        return (numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * s;
      });
    }
    // Totals over every matching row (not just this page).
    const totalCols = built.columns.filter((c) => c.total);
    let totals: Record<string, string> | null = null;
    if (!statement && totalCols.length && rows.length) {
      totals = {};
      for (const c of totalCols) {
        const t = rows.filter((r) => !r._exclude).reduce((acc, r) => acc.plus(dec(r[c.key] as string | number | null)), dec(0));
        totals[c.key] = c.type === 'money' ? t.toFixed(2) : c.type === 'qty' ? t.toFixed(c.key.toLowerCase().includes('hour') || c.key === 'days' ? 1 : 3) : t.toString();
      }
    }
    const total = rows.length;
    const pageSize = opts.all || statement ? Math.max(total, 1) : Math.min(500, Math.max(1, Number(q.pageSize) || 25));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(q.page) || 1));
    const pageRows: ReportRow[] = rows.slice((page - 1) * pageSize, page * pageSize);

    const period = range ? (range.fromDate === range.toDate ? fmtDate(range.fromDate) : `${fmtDate(range.fromDate)} - ${fmtDate(range.toDate)}`)
      : asOf ? `As on ${fmtDate(asOf)}` : `Position on ${fmtDate(today)}`;
    return {
      key: def.key, title: def.title, period, columns: built.columns, rows: pageRows, totals, summary: built.summary ?? [], note: built.note ?? null, statement,
      meta: { page, pageSize, total, totalPages, truncated: !!built.truncated || total > MAX_ROWS }, generatedAt: new Date().toISOString(),
    };
  }

  async business() {
    const b = (await this.settings.getGroup('business')) as Record<string, string>;
    return { name: b.businessName || 'AMIR ZAMEER', line: [b.address, b.city].filter(Boolean).join(', '), phone: b.phone || '' };
  }

  async logExport(key: string, format: string, q: ReportQuery, rows: number, ctx: RequestContext) {
    await this.audit.log({ action: 'EXPORT', module: 'reports', recordId: key, newValues: { format, rows, preset: q.preset ?? null, from: q.from ?? null, to: q.to ?? null } }, ctx);
  }

  // ---------------------------------------------------------------- filter options

  async options(user: AuthUser) {
    const can = (m: string) => user.isOwner || user.permissions.includes(permissionCode(m, 'VIEW'));
    const [employees, suppliers, garments, stages, expenseCategories, fabricCategories, fabrics, accounts] = await Promise.all([
      this.prisma.employee.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.garmentType.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.workflowStage.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.expenseCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.fabricCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.fabric.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      can('accounting') ? this.prisma.chartOfAccount.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }) : Promise.resolve([]),
    ]);
    const audit = can('audit_logs');
    const [modules, users] = audit
      ? await Promise.all([
        this.prisma.auditLog.findMany({ distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }),
        this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, fullName: true, username: true }, orderBy: { fullName: 'asc' } }),
      ])
      : [[], []];
    const opt = (id: string, name: string, code?: string) => ({ value: id, label: code ? `${name} (${code})` : name });
    return {
      employee: employees.map((e) => opt(e.id, e.name, e.code)),
      supplier: suppliers.map((s) => opt(s.id, s.name, s.code)),
      garment: garments.map((g) => opt(g.id, g.name)),
      stage: stages.map((s) => opt(s.id, s.name)),
      expenseCategory: expenseCategories.map((c) => opt(c.id, c.name)),
      fabricCategory: fabricCategories.map((c) => opt(c.id, c.name)),
      fabric: fabrics.map((f) => ({ value: f.id, label: `${f.code} ${f.name}` })),
      account: accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
      auditModule: modules.map((x) => ({ value: x.module, label: x.module.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') })),
      user: users.map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
      paymentStatus: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PARTIAL', label: 'Partly paid' }, { value: 'PAID', label: 'Paid' }, { value: 'OVERPAID', label: 'Credit' }],
      paymentMethod: PAYMENT_METHODS.map((x) => ({ value: x.key, label: x.label })),
      expenseStatus: EXPENSE_STATUSES.map((x) => ({ value: x.key, label: x.label })),
      movementType: MOVEMENT_TYPES.map((x) => ({ value: x.key, label: x.label })),
      stockStatus: STOCK_STATUSES.map((x) => ({ value: x.key, label: x.label })),
    };
  }

  async customerOptions(search: string, id?: string) {
    if (id) {
      if (!UUID_RE.test(id)) return [];
      const c = await this.prisma.customer.findUnique({ where: { id }, select: { id: true, code: true, name: true, mobile: true } });
      return c ? [{ value: c.id, label: `${c.name} (${c.code})`, hint: c.mobile }] : [];
    }
    const s = search.trim();
    const digits = s.replace(/\D/g, '');
    const rows = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ mobile: { contains: digits.replace(/^0/, '') } }] : [])] } : {}),
      },
      select: { id: true, code: true, name: true, mobile: true }, orderBy: { name: 'asc' }, take: 20,
    });
    return rows.map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, hint: c.mobile }));
  }

  // ---------------------------------------------------------------- saved filters (per user)

  private async readSaved(userId: string): Promise<SavedReportFilter[]> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SAVED_KEY(userId) } });
    return Array.isArray(row?.value) ? (row!.value as unknown as SavedReportFilter[]) : [];
  }

  async savedFilters(userId: string, reportKey?: string) {
    const all = await this.readSaved(userId);
    return reportKey ? all.filter((s) => s.reportKey === reportKey) : all;
  }

  async saveFilter(user: AuthUser, dto: { reportKey: string; name: string; params: Record<string, string> }) {
    const def = this.def(dto.reportKey, user);
    const allowed = new Set<string>(['preset', 'from', 'to', 'asOf', 'search', 'sort', 'dir', 'pageSize', 'columns', ...def.filters]);
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(dto.params ?? {})) {
      if (!allowed.has(k) || v === undefined || v === null || v === '') continue;
      const s = String(v);
      if (s.length > 500) throw new BadRequestException(`Filter "${k}" is too long`);
      params[k] = s;
    }
    const all = await this.readSaved(user.id);
    const others = all.filter((s) => !(s.reportKey === def.key && s.name.toLowerCase() === dto.name.trim().toLowerCase()));
    if (others.length >= MAX_SAVED) throw new BadRequestException(`You can keep up to ${MAX_SAVED} saved filters. Delete one first.`);
    const item: SavedReportFilter = { id: randomUUID(), reportKey: def.key, name: dto.name.trim(), params, createdAt: new Date().toISOString() };
    const next = [...others, item];
    await this.prisma.systemSetting.upsert({
      where: { key: SAVED_KEY(user.id) },
      create: { key: SAVED_KEY(user.id), group: 'report_filters', value: next as unknown as object, description: 'Saved report filters', updatedById: user.id },
      update: { value: next as unknown as object, updatedById: user.id },
    });
    return item;
  }

  async deleteFilter(userId: string, id: string) {
    const all = await this.readSaved(userId);
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) throw new NotFoundException('Saved filter not found');
    await this.prisma.systemSetting.update({ where: { key: SAVED_KEY(userId) }, data: { value: next as unknown as object } });
    return { ok: true };
  }
}
