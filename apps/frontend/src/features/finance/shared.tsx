import { EXPENSE_STATUSES, PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from '@az/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));
export const FREQ_LABEL: Record<string, string> = Object.fromEntries(RECURRENCE_FREQUENCIES.map((f) => [f.key, f.label]));
const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s.key, s.label]));

export function ExpenseStatusBadge({ status }: { status: string }) {
  const v = status === 'APPROVED' ? 'success' : status === 'PENDING_APPROVAL' ? 'warning' : status === 'REJECTED' ? 'danger' : 'secondary';
  return <Badge variant={v}>{EXPENSE_LABEL[status] ?? status}</Badge>;
}

export function ReceiptStatusBadge({ status, type }: { status: string; type: string }) {
  if (status === 'REVERSED') return <Badge variant="secondary">Reversed</Badge>;
  if (type === 'REFUND') return <Badge variant="info">Refund</Badge>;
  return <Badge variant="success">Received</Badge>;
}

export function PeriodBadge({ status }: { status: string }) {
  if (status === 'LOCKED') return <Badge variant="danger">Locked</Badge>;
  if (status === 'CLOSED') return <Badge variant="warning">Closed</Badge>;
  return <Badge variant="success">Open</Badge>;
}

/** Karachi today and first of this month as YYYY-MM-DD. */
export function todayPK(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
}
export function monthStartPK(): string {
  return `${todayPK().slice(0, 7)}-01`;
}

export function DateRange({ from, to, onChange, idPrefix }: { from: string; to: string; onChange: (from: string, to: string) => void; idPrefix: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1"><Label htmlFor={`${idPrefix}-from`} className="text-xs">From</Label>
        <Input id={`${idPrefix}-from`} type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} /></div>
      <div className="space-y-1"><Label htmlFor={`${idPrefix}-to`} className="text-xs">To</Label>
        <Input id={`${idPrefix}-to`} type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} /></div>
    </div>
  );
}
