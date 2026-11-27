import { SYNC_CUSTOMER_FIELDS, changedFields, formatPhone } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Server, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSync } from '@/offline/sync';
import { api, errorMessage } from '@/services/api';
import type { SyncConflictRow } from '@/types/sync';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';

const LABEL: Record<string, string> = Object.fromEntries(SYNC_CUSTOMER_FIELDS.map((f) => [f.key, f.label]));
const KEYS = SYNC_CUSTOMER_FIELDS.map((f) => f.key);

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  if ((key === 'mobile' || key === 'whatsapp') && typeof v === 'string') return formatPhone(v);
  return String(v);
}

/** Side-by-side review of one sync conflict: server copy vs device copy, with field-by-field merge. */
export function ConflictReviewDialog({ conflict, onOpenChange }: { conflict: SyncConflictRow | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const syncNow = useSync((s) => s.syncNow);
  const [picks, setPicks] = useState<Record<string, 'server' | 'device'>>({});
  const [notes, setNotes] = useState('');
  const fields = conflict
    ? conflict.kind === 'VERSION'
      ? KEYS.filter((k) => k in conflict.device)
      : KEYS.filter((k) => conflict.device[k] !== undefined || conflict.server[k] !== null)
    : [];
  const differs = conflict ? changedFields(conflict.server, conflict.device, fields) : [];
  useEffect(() => {
    if (conflict) { setPicks(Object.fromEntries(differs.map((k) => [k, 'device']))); setNotes(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict?.id]);

  const resolve = useMutation({
    mutationFn: (resolution: string) => api.post(`/sync/conflicts/${conflict!.id}/resolve`, { resolution, fields: resolution === 'MERGED' ? picks : undefined, notes: notes.trim() || undefined }),
    onSuccess: () => {
      toast.success('Conflict resolved');
      void qc.invalidateQueries({ queryKey: ['sync'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void syncNow({ quiet: true });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!conflict) return null;
  const isDup = conflict.kind === 'DUPLICATE';
  const can = (r: string) => conflict.allowed.includes(r) && conflict.resolution === 'PENDING';

  return (
    <Dialog open={!!conflict} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><GitMerge className="h-5 w-5 text-primary" /> {conflict.kindLabel}</DialogTitle>
          <DialogDescription>
            {isDup
              ? 'A customer with the same phone number is already on the server. Use the existing customer (orders and measurements from the device move to it), or save the device entry as a separate customer.'
              : 'This customer was changed on the server after the device copy was taken. Choose which value to keep for each field.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Device {conflict.operation.deviceId}</Badge>
          <span>Saved by {conflict.operation.user?.fullName ?? 'unknown'} on {formatDateTime(conflict.operation.clientTimestamp)}</span>
          {!isDup && <span>· server version {conflict.serverVersion}, device edited version {conflict.clientVersion ?? '-'}</span>}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-navy text-left text-xs text-white">
              <tr>
                <th className="px-3 py-2 font-semibold">Field</th>
                <th className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1"><Server className="h-3.5 w-3.5" /> {isDup ? `Existing (${String(conflict.server.code ?? '')})` : 'On server'}</span></th>
                <th className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> On device</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fields.map((k) => {
                const diff = differs.includes(k);
                const merge = !isDup && diff && can('MERGED');
                return (
                  <tr key={k} className={cn(diff && 'bg-amber-50/70 dark:bg-amber-500/5')}>
                    <td className="px-3 py-2 font-medium">{LABEL[k] ?? k}{diff && <span className="ml-1 text-amber-600">*</span>}</td>
                    {(['server', 'device'] as const).map((side) => (
                      <td key={side} className="px-3 py-2">
                        {merge ? (
                          <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5', picks[k] === side ? 'border-primary bg-gold-soft/60 dark:bg-gold-soft/10' : 'border-transparent')}>
                            <input type="radio" name={`pick-${k}`} className="mt-1 accent-[hsl(var(--primary))]" checked={picks[k] === side} onChange={() => setPicks((p) => ({ ...p, [k]: side }))} />
                            <span className="break-words">{show(k, side === 'server' ? conflict.server[k] : conflict.device[k])}</span>
                          </label>
                        ) : <span className="break-words">{show(k, side === 'server' ? conflict.server[k] : conflict.device[k])}</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {conflict.resolution === 'PENDING' ? (
          <>
            <div className="space-y-1.5"><Label htmlFor="cf-notes">Note (optional)</Label><Input id="cf-notes" maxLength={500} placeholder="Why this choice" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <DialogFooter className="flex-wrap gap-2">
              {isDup ? (
                <>
                  <Button variant="outline" loading={resolve.isPending && resolve.variables === 'KEEP_BOTH'} disabled={!can('KEEP_BOTH')} onClick={() => resolve.mutate('KEEP_BOTH')}>Save as a separate customer</Button>
                  <Button loading={resolve.isPending && resolve.variables === 'KEEP_SERVER'} disabled={!can('KEEP_SERVER')} onClick={() => resolve.mutate('KEEP_SERVER')}>Use existing customer</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" loading={resolve.isPending && resolve.variables === 'KEEP_SERVER'} onClick={() => resolve.mutate('KEEP_SERVER')}>Keep server copy</Button>
                  <Button variant="navy" loading={resolve.isPending && resolve.variables === 'KEEP_CLIENT'} onClick={() => resolve.mutate('KEEP_CLIENT')}>Keep device copy</Button>
                  <Button loading={resolve.isPending && resolve.variables === 'MERGED'} onClick={() => resolve.mutate('MERGED')}>Save merged</Button>
                </>
              )}
            </DialogFooter>
          </>
        ) : (
          <p className="rounded-lg bg-muted/60 p-3 text-sm">Resolved as <b>{conflict.resolution.replace(/_/g, ' ').toLowerCase()}</b> by {conflict.resolvedBy ?? 'unknown'} on {formatDateTime(conflict.resolvedAt)}{conflict.notes ? `: ${conflict.notes}` : ''}.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
