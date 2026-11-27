import { Badge } from '@/components/ui/badge';
import type { CustomerStatus, CustomerType } from '@/types';

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const v = status === 'ACTIVE' ? 'success' : status === 'BLOCKED' ? 'danger' : 'secondary';
  return <Badge variant={v}>{status === 'ACTIVE' ? 'Active' : status === 'BLOCKED' ? 'Blocked' : 'Inactive'}</Badge>;
}

const TYPE_LABEL: Record<CustomerType, string> = { WALK_IN: 'Walk-in', REGULAR: 'Regular', VIP: 'VIP', CORPORATE: 'Corporate' };
export function CustomerTypeBadge({ type }: { type: CustomerType }) {
  return <Badge variant={type === 'VIP' ? 'warning' : 'outline'}>{TYPE_LABEL[type]}</Badge>;
}
