import { PAYMENT_METHODS } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Printer, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { DataTable } from '@/components/data-table/DataTable';
import { SupplierPaymentDialog } from '@/features/inventory/SupplierDialogs';
import { PurchasePaymentBadge, QTY_RE, formatQty } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { PurchaseDetail } from '@/types';
import { formatDate, formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));

function ReturnDialog({ open, onOpenChange, purchase }: { open: boolean; onOpenChange: (o: boolean) => void; purchase: PurchaseDetail }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [id, setId] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setQty({}); setReason(''); setTouched(false); setId(newId()); } }, [open]);
  const items = purchase.items.filter((i) => Number(i.returnableQuantity) > 0);
  const lineErr = (fabricId: string, max: string) => {
    const v = (qty[fabricId] ?? '').trim();
    if (!v) return undefined;
    if (!QTY_RE.test(v)) return 'Enter a number';
    if (Number(v) > Number(max)) return `Max ${formatQty(max)}`;
    return undefined;
  };
  const chosen = items.filter((i) => Number(qty[i.fabric.id] || 0) > 0);
  const amount = chosen.reduce((a, i) => a + Number(qty[i.fabric.id]) * Number(i.rate) * (Number(purchase.subtotal) ? Number(purchase.totalAmount) / Number(purchase.subtotal) : 1), 0);
  const errors = { lines: items.some((i) => lineErr(i.fabric.id, i.returnableQuantity)) || !chosen.length, reason: reason.trim().length < 3 };
  const save = useMutation({
    mutationFn: () => api.post<PurchaseDetail>(`/purchases/${purchase.id}/returns`, { id, reason: reason.trim(), items: chosen.map((i) => ({ fabricId: i.fabric.id, quantity: qty[i.fabric.id].trim() })) }),
    onSuccess: () => {
      toast.success('Return saved. Stock and supplier balance updated.');
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Undo2 className="h-5 w-5 text-primary" /> Return to supplier</DialogTitle>
          <DialogDescription>{purchase.purchaseNo} · {purchase.supplier.name}. Stock goes down and you owe the supplier less.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!errors.lines && !errors.reason) save.mutate(); }}>
          <ul className="divide-y rounded-xl border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.fabric.name}</span>
                  <span className="block text-[11px] text-muted-foreground">Can return {formatQty(i.returnableQuantity, i.fabric.unit)} @ {formatPKR(i.rate)}</span></span>
                <div className="w-28"><Input inputMode="decimal" className="h-9 text-right" placeholder="0" aria-label={`Return quantity ${i.fabric.name}`} value={qty[i.fabric.id] ?? ''}
                  onChange={(e) => setQty({ ...qty, [i.fabric.id]: e.target.value })} aria-invalid={!!lineErr(i.fabric.id, i.returnableQuantity)} />
                  <FieldError message={lineErr(i.fabric.id, i.returnableQuantity)} /></div>
              </li>
            ))}
          </ul>
          {touched && !chosen.length && <FieldError message="Enter the quantity to return" />}
          <div className="space-y-1.5"><Label htmlFor="r-reason" required>Reason</Label>
            <Textarea id="r-reason" rows={2} maxLength={500} placeholder="e.g. Colour does not match the sample" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={touched && errors.reason} />
            <FieldError message={touched && errors.reason ? 'Write why the fabric is returned' : undefined} /></div>
          {amount > 0 && <p className="rounded-lg bg-muted p-2.5 text-sm">Return value about <span className="font-semibold">{formatPKR(amount)}</span></p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save return</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseDetailPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const can = useCan();
  const [returnOpen, setReturnOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const q = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: () => api.get<PurchaseDetail>(`/purchases/${id}`) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState label="Loading purchase..." />;
  const p = q.data!;
  const canReturn = can('purchases', 'EDIT') && p.items.some((i) => Number(i.returnableQuantity) > 0);

  return (
    <div className="space-y-4">
      <div className="no-print">
        <Link to="/purchases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Purchases</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{p.purchaseNo} <PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /></h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {can('suppliers', 'VIEW') ? <Link className="hover:underline" to={`/suppliers/${p.supplier.id}`}>{p.supplier.name}</Link> : p.supplier.name}
              {' · '}{formatDate(p.purchaseDate)}{p.supplierInvoiceNo ? ` · Bill ${p.supplierInvoiceNo}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Print</Button>
            {canReturn && <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}><Undo2 /> Return to supplier</Button>}
            {can('suppliers', 'EDIT') && Number(p.balanceAmount) > 0 && <Button size="sm" onClick={() => setPayOpen(true)}><Banknote /> Pay this bill</Button>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle className="text-base">Fabrics</CardTitle></CardHeader>
          <DataTable title={`${p.purchaseNo} - fabrics`} module="purchases" noun="fabric line" rows={p.items} getRowId={(i) => i.id}
            onView={(i) => navigate(`/inventory/fabrics/${i.fabric.id}`)}
            columns={[
              { id: 'fabric', header: 'Fabric', value: (i) => i.fabric.name, text: (i) => `${i.fabric.name} (${i.fabric.code})`,
                cell: (i) => <><Link className="font-medium hover:underline" to={`/inventory/fabrics/${i.fabric.id}`}>{i.fabric.name}</Link><span className="block font-mono text-[11px] text-muted-foreground">{i.fabric.code}{i.fabric.color ? ` · ${i.fabric.color}` : ''}</span></> },
              { id: 'qty', header: 'Quantity', type: 'number', value: (i) => Number(i.quantity), text: (i) => formatQty(i.quantity, i.fabric.unit), className: 'whitespace-nowrap' },
              { id: 'rate', header: 'Rate', type: 'money', value: (i) => Number(i.rate), cell: (i) => formatPKR(i.rate), className: 'whitespace-nowrap' },
              { id: 'amount', header: 'Amount', type: 'money', value: (i) => Number(i.amount), cell: (i) => <span className="font-medium">{formatPKR(i.amount)}</span>, text: (i) => formatPKR(i.amount), className: 'whitespace-nowrap' },
              { id: 'returned', header: 'Returned', type: 'number', value: (i) => Number(i.returnedQuantity), text: (i) => (Number(i.returnedQuantity) ? formatQty(i.returnedQuantity, i.fabric.unit) : '-'), className: 'hidden sm:table-cell whitespace-nowrap' },
            ]}
            footer={() => ({ fabric: 'Fabrics total', amount: formatPKR(p.subtotal) })} />
          {p.notes && <p className="m-4 rounded-md bg-muted p-3 text-sm"><span className="font-medium">Notes: </span>{p.notes}</p>}
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle className="text-base">Amount</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Fabrics</span><span className="tabular-nums">{formatPKR(p.subtotal)}</span></div>
            {Number(p.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{formatPKR(p.discount)}</span></div>}
            {Number(p.otherCharges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Freight / other</span><span className="tabular-nums">{formatPKR(p.otherCharges)}</span></div>}
            <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums">{formatPKR(p.totalAmount)}</span></div>
            {Number(p.returnsTotal) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Returned</span><span className="tabular-nums">-{formatPKR(p.returnsTotal)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">{formatPKR(p.paidAmount)}</span></div>
            <div className="flex justify-between rounded-lg bg-muted p-2 font-semibold"><span>Balance</span><span className="tabular-nums text-rose-700 dark:text-rose-400">{formatPKR(p.balanceAmount)}</span></div>
          </CardContent>
        </Card>
      </div>

      {!!p.payments.length && (
        <Card>
          <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
          <DataTable title={`${p.purchaseNo} - payments`} module="purchases" noun="payment" rows={p.payments} getRowId={(x) => x.id}
            columns={[
              { id: 'date', header: 'Date', value: (x) => x.paymentDate, text: (x) => formatDate(x.paymentDate), className: 'whitespace-nowrap' },
              { id: 'payment', header: 'Payment', value: (x) => x.paymentNo, text: (x) => `${x.paymentNo}${x.reference ? ` · ${x.reference}` : ''}`, cell: (x) => <span className="font-mono text-xs">{x.paymentNo}{x.reference ? ` · ${x.reference}` : ''}</span> },
              { id: 'method', header: 'Method', value: (x) => METHOD[x.method] ?? x.method },
              { id: 'amount', header: 'Amount', type: 'money', value: (x) => Number(x.amount), cell: (x) => formatPKR(x.amount) },
            ]}
            footer={(rows) => ({ date: 'Total', amount: formatPKR(rows.reduce((t, x) => t + Number(x.amount), 0)) })} />
        </Card>
      )}
      {!!p.returns.length && (
        <Card>
          <CardHeader><CardTitle className="text-base">Returns to supplier</CardTitle></CardHeader>
          <DataTable title={`${p.purchaseNo} - returns`} module="purchases" noun="return" rows={p.returns} getRowId={(r) => r.id}
            columns={[
              { id: 'date', header: 'Date', value: (r) => r.returnDate, text: (r) => formatDate(r.returnDate), className: 'whitespace-nowrap' },
              { id: 'return', header: 'Return', value: (r) => r.returnNo, text: (r) => r.returnNo, cell: (r) => <><span className="font-mono text-xs font-semibold">{r.returnNo}</span>{r.reason && <span className="block text-xs text-muted-foreground">{r.reason}</span>}</> },
              { id: 'fabrics', header: 'Fabrics', value: (r) => r.items.map((i) => `${formatQty(i.quantity, i.fabric.unit)} ${i.fabric.name}`).join(', '), className: 'text-sm' },
              { id: 'amount', header: 'Amount', type: 'money', value: (r) => Number(r.totalAmount), cell: (r) => formatPKR(r.totalAmount) },
            ]}
            footer={(rows) => ({ date: 'Total', amount: formatPKR(rows.reduce((t, r) => t + Number(r.totalAmount), 0)) })} />
        </Card>
      )}
      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} purchase={p} />
      <SupplierPaymentDialog open={payOpen} onOpenChange={setPayOpen} supplier={{ id: p.supplier.id, name: p.supplier.name, balance: p.balanceAmount }}
        purchase={{ id: p.id, purchaseNo: p.purchaseNo, balanceAmount: p.balanceAmount }} />
    </div>
  );
}
