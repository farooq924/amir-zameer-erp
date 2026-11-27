import { MOVEMENT_TYPES, unitShort } from '@az/shared';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StockLevel } from '@/types';

export const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/;
export const QTY_RE = /^\d{1,8}(\.\d{1,3})?$/;

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** "12.500" -> "12.5 m" */
export function formatQty(value: string | number | null | undefined, unit?: string | null): string {
  const n = Number(value ?? 0);
  const text = (Number.isFinite(n) ? n : 0).toLocaleString('en-PK', { maximumFractionDigits: 3 });
  return unit === undefined ? text : `${text} ${unitShort(unit)}`;
}

export function StockLevelBadge({ level }: { level: StockLevel }) {
  if (level === 'OUT') return <Badge variant="danger">Out of stock</Badge>;
  if (level === 'LOW') return <Badge variant="warning">Low stock</Badge>;
  return <Badge variant="success">In stock</Badge>;
}

const MOVEMENT_LABEL: Record<string, string> = Object.fromEntries(MOVEMENT_TYPES.map((m) => [m.key, m.label]));

export function MovementBadge({ type, direction }: { type: string; direction: 'IN' | 'OUT' }) {
  const variant = type === 'ORDER_CONSUMPTION' ? 'gold' : type.startsWith('ADJUSTMENT') ? 'info' : direction === 'IN' ? 'success' : 'danger';
  return <Badge variant={variant}>{MOVEMENT_LABEL[type] ?? type}</Badge>;
}

export function SupplierStatusBadge({ status }: { status: string }) {
  return status === 'ACTIVE' ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>;
}

export function PurchasePaymentBadge({ total, balance }: { total: string; balance: string }) {
  const b = Number(balance);
  if (b <= 0) return <Badge variant="success">Paid</Badge>;
  if (b < Number(total)) return <Badge variant="warning">Partly paid</Badge>;
  return <Badge variant="danger">Unpaid</Badge>;
}

/** Signed quantity for ledger tables: +5 m / -2.5 m */
export function SignedQty({ direction, quantity, unit }: { direction: 'IN' | 'OUT'; quantity: string; unit: string }) {
  return (
    <span className={direction === 'IN' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-rose-700 dark:text-rose-400'}>
      {direction === 'IN' ? '+' : '-'}{formatQty(quantity, unit)}
    </span>
  );
}
