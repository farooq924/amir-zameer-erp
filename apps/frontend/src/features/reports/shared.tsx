import { type ReportColumn, type ReportRow, reportStatusTone } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';

export interface Option { value: string; label: string; hint?: string }
export type ReportOptions = Record<string, Option[]>;

export const isNumeric = (c: ReportColumn) => ['money', 'qty', 'number', 'percent'].includes(c.type);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Plain text of a cell (used on screen, in print and in mobile cards). */
export function cellText(c: ReportColumn, v: ReportRow[string]): string {
  if (v === '') return '';
  if (v === null || v === undefined) return c.type === 'money' ? '' : '-';
  const s = String(v);
  switch (c.type) {
    case 'money': return formatPKR(s);
    case 'qty': return Number(s).toLocaleString('en-PK', { minimumFractionDigits: s.includes('.') ? Math.min(3, s.split('.')[1].length) : 0, maximumFractionDigits: 3 });
    case 'number': return Number(s).toLocaleString('en-PK');
    case 'percent': return `${s}%`;
    case 'date': return formatDate(s.slice(0, 10));
    case 'datetime': return formatDateTime(s);
    case 'month': { const [y, m] = s.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; }
    default: return s;
  }
}

/** A cell with badge for statuses and red for minus money. */
export function Cell({ c, v, bold }: { c: ReportColumn; v: ReportRow[string]; bold?: boolean }) {
  if (c.type === 'status' && v) return <Badge variant={reportStatusTone(String(v))}>{String(v)}</Badge>;
  const text = cellText(c, v);
  const negative = (c.type === 'money' || c.type === 'number') && Number(v) < 0;
  return <span className={cn(isNumeric(c) && 'tabular-nums', negative && 'text-rose-700 dark:text-rose-400', bold && 'font-semibold')}>{text}</span>;
}

export function summaryText(type: string, value: string) {
  if (type === 'money') return formatPKR(value);
  if (type === 'number') return Number(value).toLocaleString('en-PK');
  return value;
}

/** Customer search box for the Customer filter (searches by name, code or mobile). */
export function CustomerFilter({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(text), 250); return () => clearTimeout(t); }, [text]);
  const selected = useQuery({
    queryKey: ['reports', 'customer', value], enabled: !!value,
    queryFn: () => api.get<Option[]>('/reports/options/customers', { id: value }), staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: ['reports', 'customers', debounced], enabled: open,
    queryFn: () => api.get<Option[]>('/reports/options/customers', { q: debounced }), staleTime: 30_000,
  });
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-primary/50 bg-gold-soft/40 px-3 text-sm">
        <span className="truncate font-medium">{selected.data?.[0]?.label ?? 'Loading...'}</span>
        <button type="button" aria-label="Clear customer" className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onChange('')}><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative" ref={box}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input id={id} className="pl-9" placeholder="All customers (type to search)" value={text} onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} autoComplete="off" />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg" role="listbox">
          {list.isLoading ? <p className="px-3 py-2 text-xs text-muted-foreground">Searching...</p> : !list.data?.length ? <p className="px-3 py-2 text-xs text-muted-foreground">No customer found</p> : list.data.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={false} className="flex w-full flex-col rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { onChange(o.value); setOpen(false); setText(''); }}>
              <span className="font-medium">{o.label}</span>{o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STORE = 'az.reports.columns.';
/** Visible columns per report, remembered on this device. */
export function loadColumns(key: string): string[] | null {
  try {
    const v = localStorage.getItem(STORE + key);
    return v ? (JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}
export function saveColumns(key: string, cols: string[] | null) {
  try {
    if (cols) localStorage.setItem(STORE + key, JSON.stringify(cols));
    else localStorage.removeItem(STORE + key);
  } catch {
    /* private mode: not remembered */
  }
}
