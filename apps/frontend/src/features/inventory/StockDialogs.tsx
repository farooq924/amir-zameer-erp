import { ADJUSTMENT_REASONS, unitShort } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, FolderTree, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import { newId } from '@/utils/id';
import type { Fabric, FabricCategory } from '@/types';
import { cn } from '@/utils/cn';
import { useFabricCategories } from './FabricFormDialog';
import { MONEY_RE, QTY_RE, formatQty } from './shared';

/** Add or remove stock with a reason. Saved as a new ledger row; nothing is ever overwritten. */
export function AdjustStockDialog({ open, onOpenChange, fabric }: { open: boolean; onOpenChange: (o: boolean) => void; fabric: Fabric | null }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDirection('IN'); setQuantity(''); setUnitCost(''); setReason(ADJUSTMENT_REASONS[0]); setDetails(''); setTouched(false); setKey(newId());
  }, [open]);
  const u = unitShort(fabric?.unit);
  const qty = Number(quantity || 0);
  const free = Number(fabric?.availableStock ?? 0);
  const errors = {
    quantity: !QTY_RE.test(quantity.trim()) || qty <= 0 ? `Enter the quantity in ${u}` : direction === 'OUT' && qty > free ? `Only ${formatQty(free, fabric?.unit)} is free to remove` : undefined,
    unitCost: unitCost && !MONEY_RE.test(unitCost.trim()) ? 'Enter an amount like 850' : undefined,
    reason: reason === 'Other' && details.trim().length < 3 ? 'Write the reason' : undefined,
  };
  const save = useMutation({
    mutationFn: () => api.post(`/inventory/fabrics/${fabric!.id}/adjust`, {
      direction, quantity: quantity.trim(), unitCost: direction === 'IN' && unitCost.trim() ? unitCost.trim() : undefined,
      reason: [reason === 'Other' ? '' : reason, details.trim()].filter(Boolean).join(': '), idempotencyKey: key,
    }),
    onSuccess: () => {
      toast.success(direction === 'IN' ? `${formatQty(quantity, fabric?.unit)} added to ${fabric?.name}` : `${formatQty(quantity, fabric?.unit)} removed from ${fabric?.name}`);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const after = direction === 'IN' ? Number(fabric?.currentStock ?? 0) + qty : Number(fabric?.currentStock ?? 0) - qty;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><SlidersHorizontal className="h-5 w-5 text-primary" /> Adjust stock</DialogTitle>
          <DialogDescription>{fabric?.name} ({fabric?.code}) · in stock {formatQty(fabric?.currentStock, fabric?.unit)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Add or remove">
            {(['IN', 'OUT'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}
                className={cn('flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors',
                  direction === d ? (d === 'IN' ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300') : 'bg-card text-muted-foreground hover:border-primary')}>
                {d === 'IN' ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}{d === 'IN' ? 'Add stock' : 'Remove stock'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="a-qty" required>Quantity ({u})</Label>
              <Input id="a-qty" autoFocus inputMode="decimal" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!err('quantity')} /><FieldError message={err('quantity')} /></div>
            {direction === 'IN' ? (
              <div className="space-y-1.5"><Label htmlFor="a-cost">Cost (Rs per {u})</Label>
                <Input id="a-cost" inputMode="decimal" placeholder={`Avg ${Number(fabric?.averageCost ?? 0)}`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} aria-invalid={!!err('unitCost')} /><FieldError message={err('unitCost')} /></div>
            ) : (
              <div className="space-y-1.5"><Label>Free to remove</Label><p className="flex h-10 items-center text-sm font-semibold">{formatQty(free, fabric?.unit)}</p></div>
            )}
          </div>
          <div className="space-y-1.5"><Label htmlFor="a-reason" required>Reason</Label>
            <NativeSelect id="a-reason" value={reason} onChange={(e) => setReason(e.target.value)}>{ADJUSTMENT_REASONS.map((r) => <option key={r}>{r}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="a-details" required={reason === 'Other'}>Details</Label>
            <Textarea id="a-details" rows={2} maxLength={250} placeholder="e.g. Counted 42 m on the rack" value={details} onChange={(e) => setDetails(e.target.value)} aria-invalid={!!err('reason')} /><FieldError message={err('reason')} /></div>
          {qty > 0 && <p className="rounded-lg bg-muted p-2.5 text-sm">Stock after this change: <span className="font-semibold">{formatQty(Math.max(after, 0), fabric?.unit)}</span></p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} variant={direction === 'OUT' ? 'destructive' : 'default'}>{direction === 'IN' ? 'Add stock' : 'Remove stock'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fabric categories: add, rename, hide. */
export function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const q = useFabricCategories();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<FabricCategory | null>(null);
  const [editName, setEditName] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['inventory', 'categories'] });
  const add = useMutation({
    mutationFn: () => api.post('/inventory/categories', { name: name.trim() }),
    onSuccess: () => { toast.success('Category added'); setName(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api.patch(`/inventory/categories/${v.id}`, v.body),
    onSuccess: () => { setEditing(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><FolderTree className="h-5 w-5 text-primary" /> Fabric categories</DialogTitle>
          <DialogDescription>Group fabrics, e.g. Wash & Wear, Cotton, Boski.</DialogDescription>
        </DialogHeader>
        {can('inventory', 'CREATE') && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) add.mutate(); }}>
            <Input placeholder="New category name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="New category name" />
            <Button type="submit" loading={add.isPending} disabled={name.trim().length < 2}><Plus /> Add</Button>
          </form>
        )}
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border">
          {q.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editing?.id === c.id ? (
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (editName.trim().length >= 2) update.mutate({ id: c.id, body: { name: editName.trim() } }); }}>
                  <Input autoFocus className="h-8" value={editName} maxLength={80} onChange={(e) => setEditName(e.target.value)} aria-label="Category name" />
                  <Button size="sm" type="submit" loading={update.isPending}>Save</Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <span className={cn('flex-1 text-sm font-medium', !c.isActive && 'text-muted-foreground line-through')}>{c.name}</span>
                  <Badge variant="outline">{c.fabrics} fabric{c.fabrics === 1 ? '' : 's'}</Badge>
                  {can('inventory', 'EDIT') && (
                    <>
                      <Switch checked={c.isActive} aria-label={`${c.name} active`} onCheckedChange={(v) => update.mutate({ id: c.id, body: { isActive: v } })} />
                      <Button size="icon" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => { setEditing(c); setEditName(c.name); }}><Pencil /></Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
