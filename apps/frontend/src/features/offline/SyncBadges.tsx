import { Badge } from '@/components/ui/badge';
import type { OutboxStatus } from '@/offline/db';

const OUTBOX: Record<OutboxStatus, { label: string; variant: 'warning' | 'info' | 'danger' | 'secondary' | 'gold' }> = {
  pending: { label: 'Waiting to sync', variant: 'warning' },
  waiting: { label: 'Waiting for earlier entry', variant: 'info' },
  retry: { label: 'Will retry', variant: 'warning' },
  conflict: { label: 'Needs review', variant: 'gold' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

export function OutboxStatusBadge({ status }: { status: OutboxStatus }) {
  const s = OUTBOX[status] ?? OUTBOX.pending;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const SERVER: Record<string, { label: string; variant: 'success' | 'info' | 'danger' | 'gold' | 'secondary' }> = {
  APPLIED: { label: 'Saved', variant: 'success' },
  DUPLICATE: { label: 'Already saved', variant: 'info' },
  CONFLICT: { label: 'Conflict', variant: 'gold' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  PENDING: { label: 'Pending', variant: 'secondary' },
};

export function SyncStatusBadge({ status }: { status: string }) {
  const s = SERVER[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
