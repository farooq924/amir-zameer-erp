import { PAYMENT_METHODS, formatPhone } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/services/api';
import type { Supplier, SupplierDetail } from '@/types';
import { formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';
import { MONEY_RE } from './shared';

const EMPTY = { name: '', contactNumber: '', whatsapp: '', city: '', address: '', notes: '', openingBalance: '', active: true };
const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

export function SupplierFormDialog({ open, onOpenChange, supplier, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; supplier: Supplier | null; onSaved?: (s: SupplierDetail) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setF(supplier ? {
      name: supplier.name, contactNumber: supplier.contactNumber ? formatPhone(supplier.contactNumber) : '', whatsapp: supplier.whatsapp ? formatPhone(supplier.whatsapp) : '',
      city: supplier.city ?? '', address: supplier.address ?? '', notes: supplier.notes ?? '', openingBalance: '', active: supplier.status === 'ACTIVE',
    } : EMPTY);
  }, [open, supplier]);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const errors: Record<string, string | undefined> = {
    name: f.name.trim().length < 2 ? 'Enter the supplier name' : undefined,
    contactNumber: f.contactNumber.trim() && !PHONE_RE.test(f.contactNumber.trim()) ? 'Enter a number like 0300-1234567' : undefined,
    whatsapp: f.whatsapp.trim() && !PHONE_RE.test(f.whatsapp.trim()) ? 'Enter a number like 0300-1234567' : undefined,
    openingBalance: f.openingBalance.trim() && !MONEY_RE.test(f.openingBalance.trim()) ? 'Enter an amount like 25000' : undefined,
  };
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: f.name.trim(), contactNumber: f.contactNumber, whatsapp: f.whatsapp, city: f.city, address: f.address, notes: f.notes };
      if (supplier) return api.patch<SupplierDetail>(`/suppliers/${supplier.id}`, { ...body, status: f.active ? 'ACTIVE' : 'INACTIVE' });
      return api.post<SupplierDetail>('/suppliers', { ...body, openingBalance: f.openingBalance.trim() || undefined });
    },
    onSuccess: (s) => {
      toast.success(supplier ? 'Supplier updated' : `${s.name} added as ${s.code}`);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      onSaved?.(s);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: string) => (touched ? errors[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Truck className="h-5 w-5 text-primary" /> {supplier ? `Edit ${supplier.code}` : 'Add supplier'}</DialogTitle>
          <DialogDescription>People and companies you buy fabric from.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="s-name" required>Supplier name</Label>
            <Input id="s-name" autoFocus maxLength={120} placeholder="e.g. Gul Ahmed Textiles" value={f.name} onChange={set('name')} aria-invalid={!!err('name')} /><FieldError message={err('name')} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-phone">Phone</Label>
            <Input id="s-phone" inputMode="tel" placeholder="0300-1234567" value={f.contactNumber} onChange={set('contactNumber')} aria-invalid={!!err('contactNumber')} /><FieldError message={err('contactNumber')} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-wa">WhatsApp</Label>
            <Input id="s-wa" inputMode="tel" placeholder="Same as phone" value={f.whatsapp} onChange={set('whatsapp')} aria-invalid={!!err('whatsapp')} /><FieldError message={err('whatsapp')} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-city">City</Label><Input id="s-city" maxLength={80} placeholder="e.g. Faisalabad" value={f.city} onChange={set('city')} /></div>
          {!supplier ? (
            <div className="space-y-1.5"><Label htmlFor="s-open">Amount you owe now (Rs)</Label>
              <Input id="s-open" inputMode="decimal" placeholder="0" value={f.openingBalance} onChange={set('openingBalance')} aria-invalid={!!err('openingBalance')} /><FieldError message={err('openingBalance')} />
              <p className="text-[11px] text-muted-foreground">Opening balance from before the ERP.</p></div>
          ) : (
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} aria-label="Active" /> Active</label>
          )}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="s-addr">Address</Label><Input id="s-addr" maxLength={300} value={f.address} onChange={set('address')} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="s-notes">Notes</Label><Textarea id="s-notes" rows={2} maxLength={2000} value={f.notes} onChange={set('notes')} /></div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{supplier ? 'Save changes' : 'Add supplier'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pay a supplier. Applied to one bill, or to the oldest unpaid bills first. */
export function SupplierPaymentDialog({ open, onOpenChange, supplier, purchase }: {
  open: boolean; onOpenChange: (o: boolean) => void; supplier: { id: string; name: string; balance: string } | null;
  purchase?: { id: string; purchaseNo: string; balanceAmount: string } | null;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  const due = purchase ? purchase.balanceAmount : supplier?.balance ?? '0';
  useEffect(() => {
    if (!open) return;
    setAmount(Number(due) > 0 ? String(Number(due)) : ''); setMethod('CASH'); setReference(''); setNotes(''); setTouched(false); setKey(newId());
  }, [open, due]);
  const errors = {
    amount: !MONEY_RE.test(amount.trim()) || Number(amount) <= 0 ? 'Enter the amount paid' : purchase && Number(amount) > Number(purchase.balanceAmount) ? `This bill has only ${formatPKR(purchase.balanceAmount)} due` : undefined,
  };
  const save = useMutation({
    mutationFn: () => api.post(`/suppliers/${supplier!.id}/payments`, {
      amount: amount.trim(), method, purchaseId: purchase?.id, reference: reference.trim() || undefined, notes: notes.trim() || undefined, idempotencyKey: key,
    }),
    onSuccess: () => {
      toast.success(`Payment of ${formatPKR(amount)} saved`);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Banknote className="h-5 w-5 text-primary" /> Pay supplier</DialogTitle>
          <DialogDescription>{supplier?.name}{purchase ? ` · ${purchase.purchaseNo}` : ''} · due {formatPKR(due)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="sp-amount" required>Amount (Rs)</Label>
              <Input id="sp-amount" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={touched && !!errors.amount} /><FieldError message={touched ? errors.amount : undefined} /></div>
            <div className="space-y-1.5"><Label htmlFor="sp-method">Method</Label>
              <NativeSelect id="sp-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sp-ref">Reference</Label><Input id="sp-ref" maxLength={100} placeholder="Cheque no. or transaction id" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="sp-notes">Notes</Label><Textarea id="sp-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {!purchase && Number(amount) > Number(due) && Number(due) >= 0 && <p className="rounded-lg bg-blue-50 p-2.5 text-xs text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">The extra {formatPKR(Number(amount) - Math.max(Number(due), 0))} is kept as an advance with this supplier.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
