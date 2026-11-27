import { WHATSAPP_CHANNEL_LABEL, WHATSAPP_PURPOSES, WHATSAPP_STATUS_LABEL } from '@az/shared';
import { Check, CheckCheck, Clock, X } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { WaChannel, WaStatus } from '@/types/whatsapp';

const TONE: Record<WaStatus, BadgeProps['variant']> = { QUEUED: 'warning', SENT: 'info', DELIVERED: 'success', READ: 'success', FAILED: 'danger' };
const ICON: Record<WaStatus, typeof Check> = { QUEUED: Clock, SENT: Check, DELIVERED: CheckCheck, READ: CheckCheck, FAILED: X };

export function WaStatusBadge({ status, channel }: { status: WaStatus; channel?: WaChannel }) {
  const Icon = ICON[status];
  const label = channel === 'MANUAL' && status === 'SENT' ? 'Opened in WhatsApp' : WHATSAPP_STATUS_LABEL[status];
  return <Badge variant={TONE[status]}><Icon className={status === 'READ' ? 'h-3 w-3 text-sky-600' : 'h-3 w-3'} aria-hidden />{label}</Badge>;
}

export function WaChannelBadge({ channel }: { channel: WaChannel }) {
  return <Badge variant={channel === 'CLOUD_API' ? 'gold' : 'outline'}>{channel === 'CLOUD_API' ? 'Cloud API' : 'Manual'}</Badge>;
}
export const channelLabel = (c: WaChannel) => WHATSAPP_CHANNEL_LABEL[c] ?? c;

export const purposeLabel = (key: string) => WHATSAPP_PURPOSES.find((p) => p.key === key)?.label ?? key;

export function MetaStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="secondary">Not checked</Badge>;
  const v: BadgeProps['variant'] = status === 'APPROVED' ? 'success' : status === 'PENDING' || status === 'IN_APPEAL' ? 'warning' : status === 'NOT_FOUND' ? 'secondary' : 'danger';
  return <Badge variant={v}>{status === 'NOT_FOUND' ? 'Not in Meta' : status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')}</Badge>;
}

/** WhatsApp brand-like glyph colour used on buttons. */
export const WA_GREEN = 'text-emerald-600 dark:text-emerald-400';
