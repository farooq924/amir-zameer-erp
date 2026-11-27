import { Prisma } from '@prisma/client';
import type { ReportColumn, ReportColumnType, ReportDefinition, ReportFilterKey, ReportRow, ReportSummaryItem } from '@az/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ResolvedRange } from '../../common/utils/date-range';
import { dec, moneyString } from '../../common/utils/money';
import { AccountingService } from '../accounting/accounting.service';

/** Most rows one report run may read (protects the server on very wide date ranges). */
export const MAX_ROWS = 20_000;

export interface ReportInput {
  def: ReportDefinition;
  /** Set for dateMode "range". */
  range: ResolvedRange | null;
  /** Set for dateMode "asOf" (YYYY-MM-DD). */
  asOf: string | null;
  today: string;
  f: Partial<Record<ReportFilterKey, string>>;
  prisma: PrismaService;
  accounting: AccountingService;
}

export interface BuiltReport {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: ReportSummaryItem[];
  note?: string | null;
  /** Running-balance reports keep their order (no sorting). */
  sortable?: boolean;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  truncated?: boolean;
}

export type ReportBuilder = (input: ReportInput) => Promise<BuiltReport>;

// ------------------------------------------------------------------ column helpers
export const col = (key: string, label: string, type: ReportColumnType = 'text', extra: Partial<ReportColumn> = {}): ReportColumn => ({ key, label, type, ...extra });
export const money = (key: string, label: string, extra: Partial<ReportColumn> = {}) => col(key, label, 'money', { total: true, ...extra });
export const num = (key: string, label: string, extra: Partial<ReportColumn> = {}) => col(key, label, 'number', { total: true, ...extra });
export const qty = (key: string, label: string, extra: Partial<ReportColumn> = {}) => col(key, label, 'qty', { total: true, ...extra });

// ------------------------------------------------------------------ value helpers
export const m = (v: Prisma.Decimal | number | string | null | undefined) => moneyString(v);
export const q3 = (v: Prisma.Decimal | number | string | null | undefined) => dec(v).toDecimalPlaces(3).toFixed(3);
export const pct = (part: Prisma.Decimal | number | string, whole: Prisma.Decimal | number | string) => {
  const w = dec(whole);
  return w.eq(0) ? '0.0' : dec(part).div(w).times(100).toDecimalPlaces(1).toFixed(1);
};
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const sumOf = <T>(rows: T[], pick: (r: T) => Prisma.Decimal | string | number | null | undefined) => rows.reduce((t, r) => t.plus(dec(pick(r))), dec(0));

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Prisma filter for @db.Date columns from the resolved range. */
export function dateIn(input: ReportInput) {
  const r = input.range!;
  return { gte: new Date(`${r.fromDate}T00:00:00Z`), lte: new Date(`${r.toDate}T00:00:00Z`) };
}
/** Prisma filter for timestamp columns. */
export function timeIn(input: ReportInput) {
  const r = input.range!;
  return { gte: r.start, lt: r.endExclusive };
}

export function summary(label: string, value: string | number, type: ReportColumnType = 'money', hint?: string): ReportSummaryItem {
  return { label, value: String(value), type, hint };
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: 'Unpaid', PARTIAL: 'Partly paid', PAID: 'Paid', OVERPAID: 'Credit' };
export const label = (list: readonly { key: string; label: string }[]) => Object.fromEntries(list.map((x) => [x.key, x.label])) as Record<string, string>;
export const humanize = (code: string) => code.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** "Rs 12,500" for hints and notes (plain text). */
export const rs = (v: Prisma.Decimal | number | string | null | undefined) => `Rs ${Number(dec(v).toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
