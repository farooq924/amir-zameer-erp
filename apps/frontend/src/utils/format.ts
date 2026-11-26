const TZ = 'Asia/Karachi';

const pkr = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-PK', { notation: 'compact', maximumFractionDigits: 1 });

/** Money arrives from the API as fixed-decimal strings; display only, never used for calculation. */
export function formatPKR(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return pkr.format(Number.isFinite(n) ? n : 0).replace('PKR', 'Rs').replace(/ /g, ' ');
}

export function formatCompact(value: string | number): string {
  return compact.format(Number(value) || 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:00`) : new Date(value);
  return d.toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function humanize(code: string): string {
  return code.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
