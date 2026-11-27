import { PAYMENT_METHODS, unitShort } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Save, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { FabricFormDialog } from '@/features/inventory/FabricFormDialog';
import { FabricPicker, type PickedFabric } from '@/features/inventory/FabricPicker';
import { SupplierFormDialog } from '@/features/inventory/SupplierDialogs';
import { MONEY_RE, QTY_RE, formatQty } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { FabricDetail, PurchaseDetail } from '@/types';
import { formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';

interface Line { key: string; fabric: PickedFabric | null; quantity: string; rate: string }
const newLine = (): Line => ({ key: newId(), fabric: null, quantity: '', rate: '' });
const paisa = (v: string) => Math.round((Number(v) || 0) * 100);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

/** Enter a supplier bill: stock goes up and the supplier balance goes up. */
export function PurchaseFormPage() {
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clientId] = useState(() => newId());
  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '');
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [discount, setDiscount] = useState('');
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [touched, setTouched] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [fabricFor, setFabricFor] = useState<string | null>(null);

  const suppliers = useQuery({ queryKey: ['suppliers', 'options'], queryFn: () => api.get<{ id: string; code: string; name: string; city: string | null }[]>('/suppliers/options') });
  const preFabric = params.get('fabricId');
  const pre = useQuery({ queryKey: ['inventory', 'fabric', preFabric], enabled: !!preFabric, queryFn: () => api.get<FabricDetail>(`/inventory/fabrics/${preFabric}`) });
  useEffect(() => {
    if (!pre.data) return;
    setLines([{ key: newId(), fabric: pre.data, quantity: '', rate: Number(pre.data.purchasePrice) ? String(Number(pre.data.purchasePrice)) : '' }]);
    if (!supplierId && pre.data.supplier) setSupplierId(pre.data.supplier.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre.data]);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickFabric = (key: string, f: PickedFabric | null) => {
    if (f && lines.some((l) => l.key !== key && l.fabric?.id === f.id)) { toast.error(`${f.name} is already on this bill. Change the quantity on that line.`); return; }
    setLine(key, { fabric: f, rate: f && Number(f.purchasePrice) ? String(Number(f.purchasePrice)) : lines.find((l) => l.key === key)?.rate ?? '' });
  };

  const totals = useMemo(() => {
    const amounts = lines.map((l) => Math.round(paisa(l.rate) * Math.round((Number(l.quantity) || 0) * 1000) / 1000));
    const subtotal = amounts.reduce((a, b) => a + b, 0);
    const total = subtotal - paisa(discount) + paisa(other);
    return { amounts, subtotal, total, due: total - paisa(paid) };
  }, [lines, discount, other, paid]);

  const lineErrors = lines.map((l) => ({
    fabric: !l.fabric ? 'Select a fabric' : undefined,
    quantity: !QTY_RE.test(l.quantity.trim()) || Number(l.quantity) <= 0 ? 'Enter quantity' : undefined,
    rate: !MONEY_RE.test(l.rate.trim()) ? 'Enter rate' : undefined,
  }));
  const errors = {
    supplier: !supplierId ? 'Select the supplier' : undefined,
    date: !date || date > today() ? 'Date cannot be in the future' : undefined,
    discount: discount && !MONEY_RE.test(discount.trim()) ? 'Enter an amount' : paisa(discount) > totals.subtotal ? 'More than the bill amount' : undefined,
    other: other && !MONEY_RE.test(other.trim()) ? 'Enter an amount' : undefined,
    paid: paid && !MONEY_RE.test(paid.trim()) ? 'Enter an amount' : paisa(paid) > totals.total ? 'More than the bill total' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean) || lineErrors.some((e) => Object.values(e).some(Boolean));

  const save = useMutation({
    mutationFn: () => api.post<PurchaseDetail>('/purchases', {
      id: clientId, supplierId, supplierInvoiceNo: invoice.trim() || undefined, purchaseDate: date, notes: notes.trim() || undefined,
      discount: discount.trim() || undefined, otherCharges: other.trim() || undefined,
      items: lines.map((l) => ({ fabricId: l.fabric!.id, quantity: l.quantity.trim(), rate: l.rate.trim() })),
      payment: Number(paid) > 0 ? { amount: paid.trim(), method, reference: reference.trim() || undefined } : undefined,
    }),
    onSuccess: (p) => {
      toast.success(`${p.purchaseNo} saved. Stock updated.`);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      navigate(`/purchases/${p.id}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = () => { setTouched(true); if (hasErrors) { toast.error('Please fix the highlighted fields'); return; } save.mutate(); };
  const t = (m?: string) => (touched ? m : undefined);

  return (
    <div className="pb-24 lg:pb-0">
      <Link to="/purchases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Purchases</Link>
      <PageHeader title="New purchase" description="Enter the supplier's bill. Stock and the supplier balance update automatically." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Bill details</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="p-sup" required>Supplier</Label>
                <div className="flex gap-2">
                  <NativeSelect id="p-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-invalid={!!t(errors.supplier)}>
                    <option value="">Select supplier</option>
                    {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code}){s.city ? ` - ${s.city}` : ''}</option>)}
                  </NativeSelect>
                  {can('suppliers', 'CREATE') && <Button type="button" size="icon" className="h-10 w-10 shrink-0" aria-label="Add new supplier" onClick={() => setSupplierOpen(true)}><Plus /></Button>}
                </div>
                <FieldError message={t(errors.supplier)} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-inv">Supplier bill no.</Label><Input id="p-inv" maxLength={60} placeholder="e.g. INV-4471" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-date" required>Bill date</Label><Input id="p-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!t(errors.date)} /><FieldError message={t(errors.date)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Fabrics on this bill</CardTitle>
              <Button type="button" variant="gold" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus /> Add line</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.map((l, i) => (
                <div key={l.key} className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Line {i + 1}</span>
                    <div className="flex items-center gap-1">
                      {can('inventory', 'CREATE') && !l.fabric && <Button type="button" variant="ghost" size="sm" onClick={() => setFabricFor(l.key)}><Plus /> New fabric</Button>}
                      {lines.length > 1 && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button>}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_130px_120px]">
                    <div><FabricPicker value={l.fabric} onChange={(f) => pickFabric(l.key, f)} invalid={!!t(lineErrors[i].fabric)} /><FieldError message={t(lineErrors[i].fabric)} /></div>
                    <div className="space-y-1"><Input inputMode="decimal" placeholder={`Qty (${unitShort(l.fabric?.unit)})`} aria-label={`Quantity line ${i + 1}`} value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })} aria-invalid={!!t(lineErrors[i].quantity)} /><FieldError message={t(lineErrors[i].quantity)} /></div>
                    <div className="space-y-1"><Input inputMode="decimal" placeholder={`Rate per ${unitShort(l.fabric?.unit)}`} aria-label={`Rate line ${i + 1}`} value={l.rate}
                      onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-invalid={!!t(lineErrors[i].rate)} /><FieldError message={t(lineErrors[i].rate)} /></div>
                    <p className="flex h-10 items-center justify-end text-sm font-semibold tabular-nums">{formatPKR(totals.amounts[i] / 100)}</p>
                  </div>
                  {l.fabric && <p className="mt-1 text-[11px] text-muted-foreground">Stock now {formatQty(l.fabric.currentStock ?? l.fabric.availableStock, l.fabric.unit)}{Number(l.quantity) > 0 ? ` → after this bill ${formatQty(Number(l.fabric.currentStock ?? l.fabric.availableStock) + Number(l.quantity), l.fabric.unit)}` : ''}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent><Textarea rows={2} maxLength={1000} placeholder="Anything to remember about this bill" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" /></CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4 text-primary" /> Bill total</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Fabrics</span><span className="font-medium tabular-nums">{formatPKR(totals.subtotal / 100)}</span></div>
              <div className="grid grid-cols-2 items-center gap-2"><Label htmlFor="p-disc">Discount</Label>
                <Input id="p-disc" inputMode="decimal" className="h-9 text-right" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-invalid={!!t(errors.discount)} /></div>
              <FieldError message={t(errors.discount)} />
              <div className="grid grid-cols-2 items-center gap-2"><Label htmlFor="p-other">Freight / other</Label>
                <Input id="p-other" inputMode="decimal" className="h-9 text-right" placeholder="0" value={other} onChange={(e) => setOther(e.target.value)} aria-invalid={!!t(errors.other)} /></div>
              <div className="flex justify-between border-t pt-3 text-base font-bold"><span>Total</span><span className="tabular-nums">{formatPKR(totals.total / 100)}</span></div>
              <div className="space-y-2 rounded-xl bg-muted/60 p-3">
                <div className="grid grid-cols-2 items-center gap-2"><Label htmlFor="p-paid">Paid now</Label>
                  <Input id="p-paid" inputMode="decimal" className="h-9 text-right" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} aria-invalid={!!t(errors.paid)} /></div>
                <FieldError message={t(errors.paid)} />
                {Number(paid) > 0 && (
                  <>
                    <NativeSelect aria-label="Payment method" className="h-9" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect>
                    <Input className="h-9" maxLength={100} placeholder="Reference (optional)" aria-label="Payment reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </>
                )}
                <div className="flex justify-between font-semibold"><span>Balance to pay</span><span className="tabular-nums text-rose-700 dark:text-rose-400">{formatPKR(Math.max(totals.due, 0) / 100)}</span></div>
              </div>
              <Button className="hidden w-full lg:flex" onClick={submit} loading={save.isPending}><Save /> Save purchase</Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-[68px] z-20 border-t bg-card p-3 shadow-[0_-4px_16px_rgba(16,31,61,0.08)] lg:hidden">
        <Button className="w-full" onClick={submit} loading={save.isPending}><Save /> Save purchase · {formatPKR(totals.total / 100)}</Button>
      </div>
      <SupplierFormDialog open={supplierOpen} onOpenChange={setSupplierOpen} supplier={null} onSaved={(s) => { void qc.invalidateQueries({ queryKey: ['suppliers', 'options'] }); setSupplierId(s.id); }} />
      <FabricFormDialog open={!!fabricFor} onOpenChange={(o) => !o && setFabricFor(null)} fabric={null} hideOpening
        onSaved={(f) => { if (fabricFor) setLine(fabricFor, { fabric: f, rate: Number(f.purchasePrice) ? String(Number(f.purchasePrice)) : '' }); }} />
    </div>
  );
}
