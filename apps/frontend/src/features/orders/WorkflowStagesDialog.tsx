import { STAGE_COLORS } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Lock, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/services/api';
import type { WorkflowStage } from '@/types';
import { humanize } from '@/utils/format';
import { StageBadge } from './badges';

/** Owner/manager screen to rename, colour, switch off, reorder and add production stages. */
export function WorkflowStagesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const stages = useQuery({ queryKey: ['workflow-stages'], queryFn: () => api.get<WorkflowStage[]>('/orders/workflow-stages'), enabled: open });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['workflow-stages'] }); void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['order-form-options'] }); };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/orders/workflow-stages/${id}`, body),
    onSuccess: () => { toast.success('Stage updated'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const create = useMutation({
    mutationFn: () => api.post('/orders/workflow-stages', { name: newName.trim(), color: 'violet' }),
    onSuccess: () => { toast.success('Stage added before "Delivered"'); setNewName(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.put('/orders/workflow-stages/order', { stageIds: ids }),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const list = stages.data ?? [];
  const movable = list.filter((s) => !s.isTerminal);
  const move = (id: string, dir: -1 | 1) => {
    const ids = movable.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 1 || j >= ids.length || i < 1) return; // "New Order" stays first
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><Workflow className="h-5 w-5 text-primary" /> Workflow stages</DialogTitle>
          <DialogDescription>The steps every garment goes through. Delivered and Cancelled are fixed final stages.</DialogDescription>
        </DialogHeader>
        {stages.isError ? <ErrorState message={errorMessage(stages.error)} onRetry={() => stages.refetch()} /> : stages.isLoading ? <LoadingState /> : (
          <ul className="divide-y rounded-lg border">
            {list.map((s) => {
              const idx = movable.findIndex((m) => m.id === s.id);
              const name = edits[s.id] ?? s.name;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 p-2.5">
                  <div className="flex w-14 shrink-0 gap-0.5">
                    {!s.isTerminal && s.code !== 'NEW' ? (<>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${s.name} up`} disabled={idx <= 1 || reorder.isPending} onClick={() => move(s.id, -1)}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${s.name} down`} disabled={idx >= movable.length - 1 || reorder.isPending} onClick={() => move(s.id, 1)}><ArrowDown /></Button>
                    </>) : <Lock className="m-1.5 h-4 w-4 text-muted-foreground" aria-label="Fixed position" />}
                  </div>
                  <Input className="h-9 min-w-[140px] flex-1" aria-label={`Name of ${s.name}`} value={name} maxLength={60}
                    onChange={(e) => setEdits((x) => ({ ...x, [s.id]: e.target.value }))}
                    onBlur={() => { if (name.trim() && name.trim() !== s.name) update.mutate({ id: s.id, body: { name: name.trim() } }); }} />
                  <NativeSelect className="h-9 w-28" aria-label={`Colour of ${s.name}`} value={s.color} onChange={(e) => update.mutate({ id: s.id, body: { color: e.target.value } })}>
                    {STAGE_COLORS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                  </NativeSelect>
                  <StageBadge stage={{ code: s.code, name }} className="hidden sm:inline-flex" />
                  <span className="w-16 text-right text-xs text-muted-foreground tabular-nums" title="Open garments in this stage">{s.openItems} open</span>
                  <Switch checked={s.isActive} aria-label={`${s.name} active`} disabled={s.isSystem && ['NEW', 'DELIVERED', 'CANCELLED'].includes(s.code)}
                    onCheckedChange={(v) => update.mutate({ id: s.id, body: { isActive: v } })} />
                </li>
              );
            })}
          </ul>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim().length >= 2) create.mutate(); }}>
          <Input placeholder="New stage, e.g. Embroidery" aria-label="New stage name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
          <Button type="submit" variant="gold" loading={create.isPending} disabled={newName.trim().length < 2}><Plus /> Add</Button>
        </form>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
