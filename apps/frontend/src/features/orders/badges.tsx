import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { OrderLifecycle, PaymentStatus, StageRef } from '@/types';

/** Stage -> badge colour, following the design system (pending = pink, production = amber, ready = blue, delivered = green, cancelled = grey). */
export function stageVariant(code: string): BadgeProps['variant'] {
  if (code === 'DELIVERED') return 'success';
  if (code === 'CANCELLED') return 'secondary';
  if (code === 'READY') return 'info';
  if (code === 'NEW' || code === 'MEASUREMENT_DONE') return 'danger';
  if (code === 'ALTERATION') return 'gold';
  return 'warning';
}

export function StageBadge({ stage, className }: { stage: Pick<StageRef, 'code' | 'name'>; className?: string }) {
  return <Badge variant={stageVariant(stage.code)} className={className}>{stage.name}</Badge>;
}

const PAY: Record<PaymentStatus, { label: string; v: BadgeProps['variant'] }> = {
  UNPAID: { label: 'Unpaid', v: 'danger' },
  PARTIAL: { label: 'Partly paid', v: 'warning' },
  PAID: { label: 'Paid', v: 'success' },
  OVERPAID: { label: 'Credit', v: 'info' },
};
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={PAY[status].v}>{PAY[status].label}</Badge>;
}

export function LifecycleBadge({ lifecycle }: { lifecycle: OrderLifecycle }) {
  if (lifecycle === 'PARTIALLY_DELIVERED') return <Badge variant="info">Part delivered</Badge>;
  if (lifecycle === 'CANCELLED') return <Badge variant="secondary">Cancelled</Badge>;
  if (lifecycle === 'DELIVERED') return <Badge variant="success">Delivered</Badge>;
  return null;
}

export function OverdueBadge() {
  return <Badge variant="danger" className="bg-rose-600 text-white dark:bg-rose-600 dark:text-white">Overdue</Badge>;
}

export const ORDER_TYPE_LABEL: Record<string, string> = {
  STITCHING: 'Stitching', STITCHING_WITH_FABRIC: 'Stitching + fabric', FABRIC_SALE: 'Fabric sale', ALTERATION: 'Alteration',
};
export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', MOBILE_WALLET: 'JazzCash / Easypaisa', CARD: 'Card', CHEQUE: 'Cheque', OTHER: 'Other',
};
