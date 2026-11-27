import { ORDER_ADJUSTMENT_TYPES, PAYMENT_METHODS, toPaisa } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Banknote, PackageCheck, Receipt, Scale, UserCog, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { api, errorMessage } from '@/services/api';
import { newId } from '@/utils/id';
import type { EmployeeRef, OrderDetail, StageRef } from '@/types';
import { cn } from '@/utils/cn';
import { formatPKR } from '@/utils/format';
import { StageBadge } from './badges';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

function useOrderMutation<T>(order: OrderDetail, path: string, success: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api.post<OrderDetail>(`/orders/${order.id}/${path}`, body),
    onSuccess: (o) => {
      qc.setQueryData(['order', order.id], o);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['customer', order.customer.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(success);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

interface Base { order: OrderDetail; open: boolean; onOpenChange: (o: boolean) => void }

// ---------------------------------------------------------------- status

export function StageDialog({ order, open, onOpenChange, stages, itemId }: Base & { stages: StageRef[]; itemId?: string | null }) {
  const [stageId, setStageId] = useState('');
  const [notes, setNotes] = useState('');
  const item = order.items.find((i) => i.id === itemId);
  useEffect(() => { if (open) { setStageId(''); setNotes(''); } }, [open]);
  const m = useOrderMutation<{ stageId: string; itemIds?: string[]; notes?: string }>(order, 'stage', 'Status updated', () => onOpenChange(false));
  const current = item?.stage ?? order.stage;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Workflow className="h-5 w-5 text-primary" /> Update status</DialogTitle>
          <DialogDescription>{item ? `${item.garmentName} only` : 'All garments that are not delivered yet'} · now <StageBadge stage={current} /></DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="New status">
          {stages.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={stageId === s.id} disabled={s.id === current.id} onClick={() => setStageId(s.id)}
              className={cn('rounded-lg border p-2.5 text-left text-sm font-medium transition-colors disabled:opacity-40', stageId === s.id ? 'border-primary bg-gold-soft' : 'hover:border-primary')}>
              {s.name}{s.id === current.id && <span className="block text-[11px] font-normal text-muted-foreground">Current</span>}
            </button>
          ))}
        </div>
        <div className="space-y-1.5"><Label htmlFor="st-notes">Note (optional)</Label><Input id="st-notes" maxLength={500} placeholder="e.g. Given to Ustad Rafiq" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">To hand garments to the customer use <b>Deliver</b>. To cancel use <b>Cancel order</b>.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!stageId} loading={m.isPending} onClick={() => m.mutate({ stageId, itemIds: item ? [item.id] : undefined, notes: notes.trim() || undefined })}>Update status</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- payment

function PaymentFields({ amount, setAmount, method, setMethod, reference, setReference, max, error, idPrefix }: {
  amount: string; setAmount: (v: string) => void; method: string; setMethod: (v: string) => void; reference: string; setReference: (v: string) => void;
  max: string; error?: string; idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-amt`} required>Amount (Rs)</Label>
        <div className="flex gap-2"><Input id={`${idPrefix}-amt`} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error} />
          <Button type="button" variant="outline" onClick={() => setAmount(max)}>Full</Button></div>
        <FieldError message={error} /></div>
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-m`}>Method</Label>
        <NativeSelect id={`${idPrefix}-m`} value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
      {method !== 'CASH' && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idPrefix}-r`}>Reference / transaction id</Label>
        <Input id={`${idPrefix}-r`} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
    </div>
  );
}

export function PaymentDialog({ order, open, onOpenChange }: Base) {
  const balance = order.balanceAmount;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setAmount(Number(balance) > 0 ? balance : ''); setMethod('CASH'); setReference(''); setNotes(''); setTouched(false); setKey(newId()); } }, [open, balance]);
  const error = !MONEY.test(amount.trim()) || toPaisa(amount) <= 0 ? 'Enter an amount like 1500' : toPaisa(amount) > toPaisa(balance) ? `Balance is only ${formatPKR(balance)}` : undefined;
  const m = useOrderMutation<object>(order, 'payments', 'Payment received', () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Banknote className="h-5 w-5 text-primary" /> Receive payment</DialogTitle>
          <DialogDescription>{order.orderNumber} · balance <b>{formatPKR(balance)}</b>. A receipt number is created automatically.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!error) m.mutate({ amount: amount.trim(), method, reference: reference.trim() || undefined, notes: notes.trim() || undefined, idempotencyKey: key }); }}>
          <PaymentFields idPrefix="pay" amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} reference={reference} setReference={setReference} max={balance} error={touched ? error : undefined} />
          <div className="space-y-1.5"><Label htmlFor="pay-n">Note</Label><Input id="pay-n" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={m.isPending}><Receipt /> Save payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- delivery

export function DeliverDialog({ order, open, onOpenChange, canPay }: Base & { canPay: boolean }) {
  const pending = order.items.filter((i) => i.deliveredQuantity < i.quantity);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [collect, setCollect] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setQty(Object.fromEntries(pending.map((i) => [i.id, i.quantity - i.deliveredQuantity])));
    setReceivedBy(''); setNotes(''); setCollect(canPay && Number(order.balanceAmount) > 0); setAmount(Number(order.balanceAmount) > 0 ? order.balanceAmount : ''); setMethod('CASH'); setReference(''); setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const lines = pending.map((i) => ({ orderItemId: i.id, quantity: qty[i.id] ?? 0 })).filter((l) => l.quantity > 0);
  const payError = !collect ? undefined : !MONEY.test(amount.trim()) || toPaisa(amount) <= 0 ? 'Enter an amount' : toPaisa(amount) > toPaisa(order.balanceAmount) ? `Balance is only ${formatPKR(order.balanceAmount)}` : undefined;
  const all = pending.every((i) => (qty[i.id] ?? 0) === i.quantity - i.deliveredQuantity);
  const m = useOrderMutation<object>(order, 'deliveries', all ? 'Order delivered' : 'Part delivery saved', () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><PackageCheck className="h-5 w-5 text-primary" /> Deliver garments</DialogTitle>
          <DialogDescription>Choose how many pieces the customer is taking now. You can deliver the rest later.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault(); setTouched(true);
          if (!lines.length || payError) return;
          m.mutate({ items: lines, receivedBy: receivedBy.trim() || undefined, notes: notes.trim() || undefined, payment: collect ? { amount: amount.trim(), method, reference: reference.trim() || undefined } : undefined });
        }}>
          <ul className="divide-y rounded-lg border">
            {pending.map((i) => {
              const left = i.quantity - i.deliveredQuantity;
              return (
                <li key={i.id} className="flex items-center gap-3 p-2.5">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{i.garmentName}</span><span className="text-xs text-muted-foreground">{left} of {i.quantity} left · <StageBadge stage={i.stage} /></span></span>
                  <NativeSelect className="h-9 w-20" aria-label={`Pieces of ${i.garmentName}`} value={qty[i.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))}>
                    {Array.from({ length: left + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                  </NativeSelect>
                </li>
              );
            })}
          </ul>
          {touched && !lines.length && <FieldError message="Choose at least one piece" />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="dl-by">Collected by</Label><Input id="dl-by" maxLength={120} placeholder="Customer / brother / driver" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="dl-n">Note</Label><Input id="dl-n" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          {canPay && Number(order.balanceAmount) > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={collect} onChange={(e) => setCollect(e.target.checked)} /> Collect payment now (balance {formatPKR(order.balanceAmount)})</label>
              {collect && <PaymentFields idPrefix="dl" amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} reference={reference} setReference={setReference} max={order.balanceAmount} error={touched ? payError : undefined} />}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={m.isPending}><PackageCheck /> {all ? 'Deliver all' : 'Save part delivery'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- cancel

export function CancelOrderDialog({ order, open, onOpenChange }: Base) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setReason(''); setTouched(false); } }, [open]);
  const m = useOrderMutation<{ reason: string }>(order, 'cancel', 'Order cancelled', () => onOpenChange(false));
  const error = reason.trim().length < 3 ? 'Write the reason (at least 3 letters)' : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <div className="icon-tile mx-auto mt-2 h-14 w-14 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15"><Ban className="h-6 w-6" /></div>
        <div className="space-y-1.5">
          <DialogTitle className="justify-center text-lg">Cancel order {order.orderNumber}?</DialogTitle>
          <DialogDescription>
            The order stays in records as Cancelled. This cannot be undone.
            {Number(order.paidAmount) > 0 && ` ${formatPKR(order.paidAmount)} already paid stays as customer credit.`}
          </DialogDescription>
        </div>
        <div className="space-y-1.5 text-left"><Label htmlFor="cx-r" required>Reason</Label>
          <Textarea id="cx-r" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={touched && !!error} />
          <FieldError message={touched ? error : undefined} /></div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep order</Button>
          <Button variant="destructive" loading={m.isPending} onClick={() => { setTouched(true); if (!error) m.mutate({ reason: reason.trim() }); }}>Cancel order</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- adjustment

export function AdjustmentDialog({ order, open, onOpenChange }: Base) {
  const [type, setType] = useState('ALTERATION_CHARGE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setType('ALTERATION_CHARGE'); setAmount(''); setReason(''); setTouched(false); } }, [open]);
  const def = ORDER_ADJUSTMENT_TYPES.find((a) => a.key === type)!;
  const errors = {
    amount: !MONEY.test(amount.trim()) || toPaisa(amount) <= 0 ? 'Enter an amount like 500' : def.sign < 0 && toPaisa(amount) > toPaisa(order.effectiveTotal) ? `Cannot reduce more than ${formatPKR(order.effectiveTotal)}` : undefined,
    reason: reason.trim().length < 3 ? 'Write the reason' : undefined,
  };
  const m = useOrderMutation<object>(order, 'adjustments', 'Adjustment saved', () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Scale className="h-5 w-5 text-primary" /> Price adjustment</DialogTitle>
          <DialogDescription>Authorised change to what the customer owes. It is saved permanently in the order history and ledger.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!errors.amount && !errors.reason) m.mutate({ type, amount: amount.trim(), reason: reason.trim() }); }}>
          <div className="space-y-1.5"><Label htmlFor="adj-t">Type</Label>
            <NativeSelect id="adj-t" value={type} onChange={(e) => setType(e.target.value)}>
              {ORDER_ADJUSTMENT_TYPES.map((a) => <option key={a.key} value={a.key}>{a.label} ({a.sign > 0 ? 'customer pays more' : 'customer pays less'})</option>)}
            </NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="adj-a" required>Amount (Rs)</Label>
            <Input id="adj-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={touched && !!errors.amount} /><FieldError message={touched ? errors.amount : undefined} /></div>
          <div className="space-y-1.5"><Label htmlFor="adj-r" required>Reason</Label>
            <Input id="adj-r" maxLength={500} placeholder="e.g. Sleeves shortened after delivery" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={touched && !!errors.reason} /><FieldError message={touched ? errors.reason : undefined} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={m.isPending}>Save adjustment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- assignment

export function AssignDialog({ order, open, onOpenChange, employees, itemId }: Base & { employees: EmployeeRef[]; itemId?: string | null }) {
  const item = order.items.find((i) => i.id === itemId);
  const [employeeId, setEmployeeId] = useState('');
  useEffect(() => { if (open) setEmployeeId((item?.assignedEmployee ?? order.assignedEmployee)?.id ?? ''); }, [open, item, order.assignedEmployee]);
  const m = useOrderMutation<object>(order, 'assign', 'Assignment saved', () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><UserCog className="h-5 w-5 text-primary" /> Assign tailor</DialogTitle>
          <DialogDescription>{item ? item.garmentName : 'All garments on this order'}</DialogDescription>
        </DialogHeader>
        {employees.length ? (
          <NativeSelect aria-label="Employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Not assigned</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` (${e.designation})` : ''}</option>)}
          </NativeSelect>
        ) : <p className="rounded-md bg-muted p-3 text-sm">No employees yet. Employees are added in the Employees module (Phase 5); after that you can assign work here.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!employees.length} loading={m.isPending} onClick={() => m.mutate({ employeeId: employeeId || null, itemIds: item ? [item.id] : undefined })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
