import { DateRangePreset } from '@az/shared';

/**
 * All business dates are calculated in Asia/Karachi (UTC+05:00, no daylight saving).
 * A resolved range gives both calendar dates (for @db.Date columns) and UTC instants
 * (for timestamp columns).
 */
export const PKT_OFFSET_MINUTES = 5 * 60;

export interface ResolvedRange {
  preset: DateRangePreset;
  /** Inclusive calendar date, YYYY-MM-DD (Karachi). */
  fromDate: string;
  /** Inclusive calendar date, YYYY-MM-DD (Karachi). */
  toDate: string;
  /** Inclusive start instant (UTC) = fromDate 00:00 PKT. */
  start: Date;
  /** Exclusive end instant (UTC) = (toDate + 1 day) 00:00 PKT. */
  endExclusive: Date;
}

/** Calendar date (Y, M 0-based, D) in Karachi for a given instant. */
export function karachiParts(now: Date): { y: number; m: number; d: number; dow: number } {
  const local = new Date(now.getTime() + PKT_OFFSET_MINUTES * 60_000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), dow: local.getUTCDay() };
}

function ymd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD (Karachi) -> UTC instant of local midnight. */
export function karachiMidnightUtc(date: string): Date {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - PKT_OFFSET_MINUTES * 60_000);
}

/** Today's date in Karachi as YYYY-MM-DD. */
export function karachiToday(now: Date = new Date()): string {
  const p = karachiParts(now);
  return ymd(p.y, p.m, p.d);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const dt = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === value;
}

export function resolveDateRange(
  preset: DateRangePreset = 'this_month',
  from?: string,
  to?: string,
  now: Date = new Date(),
): ResolvedRange {
  const { y, m, d, dow } = karachiParts(now);
  const today = ymd(y, m, d);
  // ISO weeks: Monday is the first day.
  const mondayOffset = (dow + 6) % 7;
  let fromDate: string;
  let toDate: string;

  switch (preset) {
    case 'today':
      fromDate = toDate = today;
      break;
    case 'yesterday':
      fromDate = toDate = addDays(today, -1);
      break;
    case 'this_week':
      fromDate = addDays(today, -mondayOffset);
      toDate = addDays(fromDate, 6);
      break;
    case 'last_week':
      fromDate = addDays(today, -mondayOffset - 7);
      toDate = addDays(fromDate, 6);
      break;
    case 'this_month':
      fromDate = ymd(y, m, 1);
      toDate = ymd(y, m + 1, 0);
      break;
    case 'last_month':
      fromDate = ymd(y, m - 1, 1);
      toDate = ymd(y, m, 0);
      break;
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3;
      fromDate = ymd(y, qStart, 1);
      toDate = ymd(y, qStart + 3, 0);
      break;
    }
    case 'this_year':
      fromDate = ymd(y, 0, 1);
      toDate = ymd(y, 11, 31);
      break;
    case 'custom': {
      if (!from || !to || !isValidIsoDate(from) || !isValidIsoDate(to)) {
        throw new RangeError('Custom range requires valid "from" and "to" dates (YYYY-MM-DD)');
      }
      if (from > to) throw new RangeError('"from" date must be on or before "to" date');
      fromDate = from;
      toDate = to;
      break;
    }
    default:
      throw new RangeError(`Unknown date range preset: ${String(preset)}`);
  }

  return {
    preset,
    fromDate,
    toDate,
    start: karachiMidnightUtc(fromDate),
    endExclusive: karachiMidnightUtc(addDays(toDate, 1)),
  };
}

/** Prisma filter for @db.Date columns. */
export function dateColumnFilter(range: ResolvedRange): { gte: Date; lte: Date } {
  return { gte: new Date(`${range.fromDate}T00:00:00Z`), lte: new Date(`${range.toDate}T00:00:00Z`) };
}

/** Prisma filter for timestamp columns. */
export function timestampFilter(range: ResolvedRange): { gte: Date; lt: Date } {
  return { gte: range.start, lt: range.endExclusive };
}
