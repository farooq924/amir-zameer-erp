import { PAYMENT_METHODS } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Banknote, HandCoins, MessageCircle, Printer, Search, Undo2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { DateRange, METHOD_LABEL, ReceiptStatusBadge, monthStartPK, todayPK } from '@/features/finance/shared';
import { SendWhatsAppDialog } from '@/features/whatsapp/SendWhatsAppDialog';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Paginated } from '@/types';
import type { CustomerPayment, OutgoingList, PaymentList, PaymentSummary, RefundableOrder, SalaryPaymentRow, SupplierPaymentRow } from '@/types/finance';
import { formatDate, formatDateTime, formatPKR, formatMonth } from '@/utils/format';
import { newId } from '@/utils/id';

interface OrderOption { id: string; orderNumber: string; customer: { id: string; name: string; mobile: string }; totalAmount: string; paidAmount: string; balanceAmount: string; garments: string }

function Pager({ meta, page, setPage }: { meta?: { page: number; totalPages: number; total: number }; page: number; setPage: (p: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>{meta.total} record(s)</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="self-center">Page {page} of {meta.totalPages}</span>
        <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

/** Receive money against any open order: search, pick, enter amount. */
function ReceivePaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<OrderOption | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [key, setKey] = useState(newId);
  useEffect(() => { if (open) { setSearch(''); setOrder(null); setAmount(''); setMethod('CASH'); setReference(''); setKey(newId()); } }, [open]);
  const orders = useQuery({
    queryKey: ['payments', 'open-orders', search],
    queryFn: () => api.get<Paginated<OrderOption>>('/orders', { search: search.trim() || undefined, lifecycle: 'ACTIVE', pageSize: 20 }),
    enabled: open && !order,
  });
  const withBalance = (orders.data?.data ?? []).filter((o) => Number(o.balanceAmount) > 0);
  const pay = useMutation({
    mutationFn: () => api.post<{ payments: { id: string; amount: string; receiptNo: string }[] }>(`/orders/${order!.id}/payments`, { amount, method, reference: reference.trim() || undefined, idempotencyKey: key }),
    onSuccess: (o) => {
      const p = o.payments[o.payments.length - 1];
      toast.success(`Payment received (${p?.receiptNo ?? ''})`, {
        action: p ? { label: 'Print receipt', onClick: () => window.open(`/print/orders/${order!.id}?receipt=${p.id}`, '_blank') } : undefined,
      });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const over = order && Number(amount) > Number(order.balanceAmount);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Banknote className="h-5 w-5 text-primary" /> Receive payment</DialogTitle>
          <DialogDescription>Find the order by order number, customer name or mobile, then enter the amount received.</DialogDescription>
        </DialogHeader>
        {!order ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search orders" autoFocus className="pl-9" placeholder="AZ-2026-00012, name or 0300..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              {orders.isLoading ? <LoadingState /> : !withBalance.length ? <p className="p-4 text-center text-sm text-muted-foreground">No open orders with a balance found.</p> : (
                <ul className="divide-y">
                  {withBalance.map((o) => (
                    <li key={o.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted" onClick={() => { setOrder(o); setAmount(String(Number(o.balanceAmount))); }}>
                        <span className="min-w-0"><span className="block font-mono text-xs font-semibold">{o.orderNumber}</span>
                          <span className="block truncate text-sm font-medium">{o.customer.name}</span><span className="block truncate text-xs text-muted-foreground">{o.garments}</span></span>
                        <span className="shrink-0 text-right"><span className="block text-xs text-muted-foreground">Balance</span><span className="font-semibold tabular-nums text-rose-700 dark:text-rose-400">{formatPKR(o.balanceAmount)}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!over) pay.mutate(); }}>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3 text-sm">
              <div><p className="font-mono text-xs font-semibold">{order.orderNumber}</p><p className="font-medium">{order.customer.name}</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">Balance</p><p className="font-semibold tabular-nums">{formatPKR(order.balanceAmount)}</p></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="rp-amount" required>Amount (Rs)</Label>
                <Input id="rp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                {over && <p className="text-xs text-destructive">More than the balance.</p>}</div>
              <div className="space-y-1.5"><Label htmlFor="rp-method" required>Method</Label>
                <NativeSelect id="rp-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="rp-ref">Reference</Label><Input id="rp-ref" maxLength={100} placeholder="Transaction ID or cheque no." value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOrder(null)}>Back</Button>
              <Button type="submit" loading={pay.isPending} disabled={!Number(amount) || !!over}>Receive {Number(amount) ? formatPKR(amount) : ''}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ order, onOpenChange }: { order: RefundableOrder | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(newId);
  useEffect(() => { if (order) { setAmount(String(Number(order.refundable))); setMethod('CASH'); setReason(order.lifecycle === 'CANCELLED' ? 'Order cancelled' : ''); setKey(newId()); } }, [order]);
  const refund = useMutation({
    mutationFn: () => api.post<CustomerPayment>('/payments/refunds', { orderId: order!.id, amount, method, reason: reason.trim(), idempotencyKey: key }),
    onSuccess: (p) => {
      toast.success(`Refund ${p.receiptNo} recorded`, { action: { label: 'Print', onClick: () => window.open(`/print/orders/${order!.id}?receipt=${p.id}`, '_blank') } });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const over = order && Number(amount) > Number(order.refundable);
  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Undo2 className="h-5 w-5 text-primary" /> Refund customer</DialogTitle>
          <DialogDescription>{order ? `${order.customer.name} paid ${formatPKR(order.paidAmount)} on ${order.orderNumber}, which is now worth ${formatPKR(order.effectiveTotal)}.` : ''}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!over) refund.mutate(); }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="rf-amount" required>Amount (Rs)</Label>
              <Input id="rf-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              {over && <p className="text-xs text-destructive">At most {formatPKR(order?.refundable)}.</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="rf-method" required>Paid back by</Label>
              <NativeSelect id="rf-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rf-reason" required>Reason</Label><Textarea id="rf-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={refund.isPending} disabled={!Number(amount) || !!over || reason.trim().length < 3}>Refund</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReverseDialog({ payment, onOpenChange }: { payment: CustomerPayment | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  useEffect(() => { if (payment) setReason(''); }, [payment]);
  const reverse = useMutation({
    mutationFn: () => api.post(`/payments/${payment!.id}/reverse`, { reason: reason.trim() }),
    onSuccess: () => { toast.success(`Receipt ${payment!.receiptNo} reversed`); void qc.invalidateQueries({ queryKey: ['payments'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!payment} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Undo2 className="h-5 w-5 text-destructive" /> Reverse receipt {payment?.receiptNo}</DialogTitle>
          <DialogDescription>Use this only for a receipt entered by mistake. The order will owe {formatPKR(payment?.amount)} again and the cash is taken out of the books.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); reverse.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="rv-reason" required>Reason</Label><Textarea id="rv-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" loading={reverse.isPending} disabled={reason.trim().length < 3}>Reverse receipt</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptsTab() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [kind, setKind] = useState('ALL');
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const [page, setPage] = useState(1);
  const [reverse, setReverse] = useState<CustomerPayment | null>(null);
  const [wa, setWa] = useState<CustomerPayment | null>(null);
  useEffect(() => setPage(1), [search, method, kind, from, to]);
  const q = useQuery({
    queryKey: ['payments', 'list', { search, method, kind, from, to, page }],
    queryFn: () => api.get<PaymentList>('/payments', { search: search.trim() || undefined, method: method || undefined, kind, from: from || undefined, to: to || undefined, page, pageSize: 25 }),
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search receipts" className="pl-9" placeholder="Receipt, order, customer or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <NativeSelect aria-label="Type" className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="ALL">All</option><option value="RECEIPT">Received</option><option value="REFUND">Refunds</option>
        </NativeSelect>
        <NativeSelect aria-label="Method" className="w-44" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </NativeSelect>
        <DateRange idPrefix="rc" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </Card>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.data.length ? (
          <EmptyState icon={<Wallet />} title="No receipts" description="Advance and balance payments from orders appear here with their receipt numbers." />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Receipt</TH><TH>Customer</TH><TH className="hidden md:table-cell">Order</TH><TH className="hidden sm:table-cell">Method</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH className="w-28"><span className="sr-only">Actions</span></TH></TR></THead>
              <TBody>
                {q.data!.data.map((p) => (
                  <TR key={p.id} className={p.status === 'REVERSED' ? 'opacity-60' : undefined}>
                    <TD><span className="font-mono text-xs font-semibold">{p.receiptNo}</span><span className="block whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(p.paymentDate)}</span></TD>
                    <TD><Link to={`/customers/${p.customer.id}`} className="font-medium hover:text-primary">{p.customer.name}</Link><span className="block text-xs text-muted-foreground">{p.customer.code}</span></TD>
                    <TD className="hidden md:table-cell">{p.order ? <Link to={`/orders/${p.order.id}`} className="font-mono text-xs hover:text-primary">{p.order.orderNumber}</Link> : '-'}</TD>
                    <TD className="hidden sm:table-cell">{METHOD_LABEL[p.method] ?? p.method}{p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}</TD>
                    <TD className={`text-right font-semibold tabular-nums ${p.type === 'REFUND' ? 'text-rose-700 dark:text-rose-400' : ''}`}>{p.type === 'REFUND' ? '-' : ''}{formatPKR(p.amount)}</TD>
                    <TD><ReceiptStatusBadge status={p.status} type={p.type} /></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {p.status === 'POSTED' && can('whatsapp', 'CREATE') && <Button variant="ghost" size="icon" aria-label={`WhatsApp ${p.receiptNo}`} onClick={() => setWa(p)}><MessageCircle className="text-emerald-600" /></Button>}
                        {p.order && can('orders', 'PRINT') && <Button variant="ghost" size="icon" asChild aria-label={`Print ${p.receiptNo}`}><Link to={`/print/orders/${p.order.id}?receipt=${p.id}`} target="_blank"><Printer /></Link></Button>}
                        {p.status === 'POSTED' && p.type !== 'REFUND' && can('payments', 'APPROVE') && <Button variant="ghost" size="icon" aria-label={`Reverse ${p.receiptNo}`} onClick={() => setReverse(p)}><Undo2 /></Button>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t bg-muted/50 px-4 py-3 text-sm font-semibold">
              <span>Received <span className="tabular-nums">{formatPKR(q.data!.totals.received)}</span></span>
              <span>Refunded <span className="tabular-nums text-rose-700 dark:text-rose-400">{formatPKR(q.data!.totals.refunded)}</span></span>
            </div>
            <Pager meta={q.data!.meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>
      <ReverseDialog payment={reverse} onOpenChange={(o) => !o && setReverse(null)} />
      {wa && <SendWhatsAppDialog open={!!wa} onOpenChange={(o) => !o && setWa(null)} context={{ type: 'PAYMENT', id: wa.id }} purpose="PAYMENT_RECEIVED" title={`Send receipt ${wa.receiptNo} on WhatsApp`} />}
    </div>
  );
}

function RefundsTab() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<RefundableOrder | null>(null);
  const q = useQuery({ queryKey: ['payments', 'refundable', search], queryFn: () => api.get<RefundableOrder[]>('/payments/refundable', { search: search.trim() || undefined }) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search refundable orders" className="pl-9" placeholder="Order, customer or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">Orders where the customer paid more than the order is now worth (cancelled or reduced).</p>
      </div>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.length ? (
          <EmptyState icon={<Undo2 />} title="Nothing to refund" description="When an order is cancelled or reduced after payment, the extra money shows here." />
        ) : (
          <Table>
            <THead><TR><TH>Order</TH><TH>Customer</TH><TH className="hidden sm:table-cell text-right">Order worth</TH><TH className="hidden sm:table-cell text-right">Paid</TH><TH className="text-right">Can refund</TH><TH className="w-28"><span className="sr-only">Refund</span></TH></TR></THead>
            <TBody>
              {q.data!.map((o) => (
                <TR key={o.id}>
                  <TD><Link to={`/orders/${o.id}`} className="font-mono text-xs font-semibold hover:text-primary">{o.orderNumber}</Link>{o.lifecycle === 'CANCELLED' && <span className="block text-xs text-muted-foreground">Cancelled</span>}</TD>
                  <TD className="font-medium">{o.customer.name}</TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{formatPKR(o.effectiveTotal)}</TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{formatPKR(o.paidAmount)}</TD>
                  <TD className="text-right font-semibold tabular-nums text-blue-700 dark:text-blue-300">{formatPKR(o.refundable)}</TD>
                  <TD className="text-right">{can('payments', 'APPROVE') && <Button size="sm" variant="gold" onClick={() => setOrder(o)}><Undo2 /> Refund</Button>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <RefundDialog order={order} onOpenChange={(o) => !o && setOrder(null)} />
    </div>
  );
}

function OutgoingTab({ kind }: { kind: 'supplier' | 'salary' }) {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, from, to]);
  const path = kind === 'supplier' ? '/payments/supplier-payments' : '/payments/salary-payments';
  const q = useQuery({
    queryKey: ['payments', kind, { search, from, to, page }],
    queryFn: () => api.get<OutgoingList<SupplierPaymentRow | SalaryPaymentRow>>(path, { search: search.trim() || undefined, from: from || undefined, to: to || undefined, page, pageSize: 25 }),
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search payments" className="pl-9" placeholder={kind === 'supplier' ? 'Payment no. or supplier' : 'Payment no. or employee'} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <DateRange idPrefix={kind} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </Card>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.data.length ? (
          <EmptyState icon={<ArrowUpRight />} title="No payments" description={kind === 'supplier' ? 'Pay suppliers from the supplier page or when recording a purchase.' : 'Pay salaries from the payroll page.'} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Payment</TH><TH>{kind === 'supplier' ? 'Supplier' : 'Employee'}</TH><TH className="hidden sm:table-cell">{kind === 'supplier' ? 'Purchase' : 'Month'}</TH><TH className="hidden sm:table-cell">Method</TH><TH className="text-right">Amount</TH></TR></THead>
              <TBody>
                {q.data!.data.map((p) => {
                  const s = p as SupplierPaymentRow;
                  const e = p as SalaryPaymentRow;
                  return (
                    <TR key={p.id}>
                      <TD><span className="font-mono text-xs font-semibold">{p.paymentNo}</span><span className="block text-xs text-muted-foreground">{formatDate(p.paymentDate)}</span></TD>
                      <TD>{kind === 'supplier'
                        ? <Link to={`/suppliers/${s.supplier.id}`} className="font-medium hover:text-primary">{s.supplier.name}</Link>
                        : <Link to={`/employees/${e.employee.id}`} className="font-medium hover:text-primary">{e.employee.name}</Link>}</TD>
                      <TD className="hidden sm:table-cell">{kind === 'supplier'
                        ? (s.purchase ? <Link to={`/purchases/${s.purchase.id}`} className="font-mono text-xs hover:text-primary">{s.purchase.purchaseNo}</Link> : 'Oldest bills')
                        : <Link to={`/payroll/${e.payrollId}`} className="hover:text-primary">{formatMonth(e.periodKey)}</Link>}</TD>
                      <TD className="hidden sm:table-cell">{METHOD_LABEL[p.method] ?? p.method}{p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatPKR(p.amount)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="flex justify-end border-t bg-muted/50 px-4 py-3 text-sm font-semibold">Total <span className="ml-2 tabular-nums">{formatPKR(q.data!.totalAmount)}</span></div>
            <Pager meta={q.data!.meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

export function PaymentsPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'receipts';
  const [receive, setReceive] = useState(false);
  const s = useQuery({ queryKey: ['payments', 'summary'], queryFn: () => api.get<PaymentSummary>('/payments/summary') });
  const m = s.data?.month;
  return (
    <div>
      <PageHeader title="Payments" description="Money received from customers, refunds, and money paid to suppliers and staff."
        actions={can('payments', 'CREATE') && <Button onClick={() => setReceive(true)}><Banknote /> Receive payment</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Received today" value={formatPKR(s.data?.today.received)} icon={HandCoins} loading={s.isLoading} hint={`${s.data?.today.receipts ?? 0} receipt(s)`} />
        <StatCard label="Received this month" value={formatPKR(m?.received)} icon={ArrowDownLeft} tile="green" loading={s.isLoading} hint={s.data?.byMethod.map((x) => `${METHOD_LABEL[x.method] ?? x.method} ${formatPKR(x.amount)}`).join(' · ') || 'No receipts yet'} />
        <StatCard label="Paid out this month" value={formatPKR(m?.moneyOut)} icon={ArrowUpRight} tile="rose" loading={s.isLoading} hint={m ? `Suppliers ${formatPKR(m.supplierPaid)} · Salaries ${formatPKR(m.salariesPaid)} · Expenses ${formatPKR(m.expenses)}` : undefined} />
        <StatCard label="Net cash this month" value={formatPKR(m?.net)} icon={Wallet} tile="blue" tone={m && Number(m.net) < 0 ? 'negative' : undefined} loading={s.isLoading} hint={m ? `Refunds ${formatPKR(m.refunded)}` : undefined} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'receipts' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="receipts">Customer receipts</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="suppliers">Supplier payments</TabsTrigger>
          <TabsTrigger value="salaries">Salary payments</TabsTrigger>
        </TabsList>
        <TabsContent value="receipts"><ReceiptsTab /></TabsContent>
        <TabsContent value="refunds"><RefundsTab /></TabsContent>
        <TabsContent value="suppliers"><OutgoingTab kind="supplier" /></TabsContent>
        <TabsContent value="salaries"><OutgoingTab kind="salary" /></TabsContent>
      </Tabs>
      <ReceivePaymentDialog open={receive} onOpenChange={setReceive} />
    </div>
  );
}
