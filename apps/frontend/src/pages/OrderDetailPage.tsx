import { formatPhone, whatsappLink } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Ban, Banknote, Calendar, Check, ClipboardList, Copy, MessageCircle, MoreHorizontal, PackageCheck, Pencil, Phone, Printer, RefreshCw,
  Ruler, Scale, Scissors, UserCog, Wallet, Workflow,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { formatQty } from '@/features/inventory/shared';
import { LifecycleBadge, METHOD_LABEL, ORDER_TYPE_LABEL, OverdueBadge, PaymentBadge, StageBadge } from '@/features/orders/badges';
import { AdjustmentDialog, AssignDialog, CancelOrderDialog, DeliverDialog, PaymentDialog, StageDialog } from '@/features/orders/OrderActionDialogs';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { OrderDetail, OrderFormOptions } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatPKR, humanize } from '@/utils/format';

type DialogKind = null | 'stage' | 'pay' | 'deliver' | 'cancel' | 'adjust' | 'assign';

/** "Production progress" stepper from the mockup: done stages get a gold tick, the current one a ring. */
function ProductionProgress({ order, stages }: { order: OrderDetail; stages: { id: string; code: string; name: string; sortOrder: number; isTerminal: boolean }[] }) {
  const steps = stages.filter((s) => !s.isTerminal || s.code === 'DELIVERED');
  const cancelled = order.lifecycle === 'CANCELLED';
  const current = order.stage.sortOrder;
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start">
        {steps.map((s, i) => {
          const done = !cancelled && (s.sortOrder < current || order.lifecycle === 'DELIVERED');
          const now = !cancelled && s.id === order.stage.id && order.lifecycle !== 'DELIVERED';
          return (
            <li key={s.id} className="flex items-start">
              <div className="flex w-[84px] flex-col items-center text-center">
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border-2',
                  done ? 'border-primary bg-primary text-primary-foreground' : now ? 'border-navy bg-card ring-4 ring-gold-soft dark:border-gold' : 'border-border bg-card')}>
                  {done ? <Check className="h-4 w-4" /> : now ? <span className="h-2.5 w-2.5 rounded-full bg-navy dark:bg-gold" /> : null}
                </span>
                <span className={cn('mt-1.5 text-[11px] leading-tight', now ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>{s.name}</span>
              </div>
              {i < steps.length - 1 && <span className={cn('mt-3.5 h-0.5 w-6 shrink-0', done ? 'bg-primary' : 'bg-border')} />}
            </li>
          );
        })}
      </ol>
      {cancelled && <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-400">Cancelled{order.cancelReason ? `: ${order.cancelReason}` : ''}</p>}
    </div>
  );
}

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-baseline justify-between gap-3 py-1.5 sm:block', className)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-right text-sm font-medium sm:text-left">{children}</dd></div>;
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [tab, setTab] = useState('garments');
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });
  const options = useQuery({ queryKey: ['order-form-options'], queryFn: () => api.get<OrderFormOptions>('/orders/form-options'), staleTime: 60_000 });
  const refreshMeasurement = useMutation({
    mutationFn: (itemId: string) => api.post<OrderDetail>(`/orders/${id}/items/${itemId}/measurement`, {}),
    onSuccess: (o) => { qc.setQueryData(['order', id], o); toast.success('Latest measurement copied to the order'); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const o = q.data;
  if (!o) return <div className="space-y-4"><Skeleton className="h-16 w-full" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>;

  const open = o.lifecycle === 'OPEN' || o.lifecycle === 'PARTIALLY_DELIVERED';
  const stages = options.data?.stages ?? [];
  const workStages = stages.filter((s) => !s.isTerminal);
  const balance = Number(o.balanceAmount);
  const wa = whatsappLink(o.customer.whatsapp ?? o.customer.mobile,
    `Assalam o Alaikum ${o.customer.name}, your order ${o.orderNumber} is ${o.lifecycle === 'DELIVERED' ? 'delivered' : o.stage.name.toLowerCase()}.${balance > 0 ? ` Balance: Rs ${balance.toLocaleString('en-PK')}.` : ''} Thank you.`);
  const openDialog = (k: DialogKind, item: string | null = null) => { setItemId(item); setDialog(k); };
  const canPay = can('payments', 'CREATE') && o.lifecycle !== 'CANCELLED' && balance > 0;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Orders</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
              {o.orderNumber} <StageBadge stage={o.stage} /> <LifecycleBadge lifecycle={o.lifecycle} />{o.lifecycle !== 'CANCELLED' && <PaymentBadge status={o.paymentStatus} />}{o.isOverdue && <OverdueBadge />}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ORDER_TYPE_LABEL[o.orderType]} · booked {formatDate(o.orderDate)}{o.createdBy ? ` by ${o.createdBy.fullName}` : ''}
              {o.revisionNo > 0 && ` · revision ${o.revisionNo}`}
              {o.duplicatedFrom && <> · from <Link className="underline" to={`/orders/${o.duplicatedFrom.id}`}>{o.duplicatedFrom.orderNumber}</Link></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {open && can('orders', 'EDIT') && <Button variant="navy" onClick={() => openDialog('stage')}><Workflow /> Update status</Button>}
            {canPay && <Button onClick={() => openDialog('pay')}><Banknote /> Payment</Button>}
            {open && can('orders', 'EDIT') && <Button variant="outline" onClick={() => openDialog('deliver')}><PackageCheck /> Deliver</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('orders', 'PRINT') && <>
                  <DropdownMenuItem asChild><Link to={`/print/orders/${o.id}`} target="_blank"><Printer /> Print receipt</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to={`/print/orders/${o.id}?copy=workshop`} target="_blank"><Scissors /> Print job card (workshop)</Link></DropdownMenuItem>
                </>}
                {open && can('orders', 'EDIT') && <DropdownMenuItem onSelect={() => navigate(`/orders/${o.id}/edit`)}><Pencil /> Edit / revise order</DropdownMenuItem>}
                {open && can('orders', 'EDIT') && <DropdownMenuItem onSelect={() => openDialog('assign')}><UserCog /> Assign tailor</DropdownMenuItem>}
                {can('orders', 'CREATE') && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate(`/orders/new?from=${o.id}`)}><Copy /> Duplicate order</DropdownMenuItem>
                  {o.deliveredPieces > 0 && <DropdownMenuItem onSelect={() => navigate(`/orders/new?from=${o.id}&type=ALTERATION`)}><Scissors /> New alteration order</DropdownMenuItem>}
                </>}
                {o.lifecycle !== 'CANCELLED' && can('orders', 'APPROVE') && <DropdownMenuItem onSelect={() => openDialog('adjust')}><Scale /> Price adjustment</DropdownMenuItem>}
                {o.lifecycle === 'OPEN' && can('orders', 'DELETE') && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => openDialog('cancel')}><Ban /> Cancel order</DropdownMenuItem></>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Order total" value={formatPKR(o.effectiveTotal)} icon={ClipboardList} hint={Number(o.adjustmentsTotal) ? `incl. adjustments ${formatPKR(o.adjustmentsTotal)}` : `${o.totalPieces} piece(s)`} />
        <StatCard label="Paid" value={formatPKR(o.paidAmount)} icon={Wallet} tile="green" hint={`${o.payments.length} receipt(s)`} />
        <StatCard label={balance < 0 ? 'Customer credit' : 'Balance'} value={formatPKR(Math.abs(balance))} icon={Banknote} tile="rose" tone={balance > 0 ? 'negative' : undefined} />
        <StatCard label="Delivery" value={formatDate(o.actualDeliveryDate ?? o.expectedDeliveryDate)} icon={Calendar} tile="gold"
          hint={o.actualDeliveryDate ? 'Delivered' : `${o.deliveredPieces} of ${o.totalPieces} delivered`} tone={o.isOverdue ? 'negative' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <CardHeader><CardTitle>Production progress</CardTitle></CardHeader>
          <CardContent>{stages.length ? <ProductionProgress order={o} stages={stages} /> : <Skeleton className="h-12" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Customer</CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" asChild aria-label="Call customer"><a href={`tel:+${o.customer.mobile}`}><Phone className="text-emerald-600" /></a></Button>
              {wa && <Button variant="ghost" size="icon" asChild aria-label="WhatsApp customer"><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="text-emerald-600" /></a></Button>}
            </div>
          </CardHeader>
          <CardContent>
            <Link to={`/customers/${o.customer.id}`} className="font-semibold hover:underline">{o.customer.name}</Link>
            <p className="text-sm text-muted-foreground">{o.customer.code} · {formatPhone(o.customer.mobile)}{o.customer.city ? ` · ${o.customer.city}` : ''}</p>
            {o.assignedEmployee && <p className="mt-2 text-sm"><span className="text-muted-foreground">Tailor: </span>{o.assignedEmployee.name}</p>}
            {o.specialInstructions && <p className="mt-2 rounded-md bg-muted p-2 text-sm"><span className="font-medium">Instructions: </span>{o.specialInstructions}</p>}
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="garments">Garments ({o.items.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({o.payments.length})</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries ({o.deliveries.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="garments" className="mt-4 space-y-3">
          {o.items.map((i) => (
            <Card key={i.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2">{i.lineNo}. {i.garmentName} <span className="font-normal text-muted-foreground">x {i.quantity}</span> <StageBadge stage={i.stage} /></CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {i.fabricSource === 'SHOP' ? 'Shop fabric' : "Customer's fabric"}{i.fabricDescription ? `: ${i.fabricDescription}` : ''}
                    {Number(i.fabricQuantity) ? ` · ${formatQty(i.fabricQuantity, i.fabric?.unit ?? 'METER')}` : ''}
                    {i.stock && (
                      <span className="ml-1.5 inline-flex align-middle">
                        {i.stock.status === 'ACTIVE' && <Badge variant="info" title="Kept aside in stock for this garment">Reserved {formatQty(Number(i.stock.reserved) - Number(i.stock.issued), i.fabric?.unit ?? 'METER')}</Badge>}
                        {i.stock.status === 'CONSUMED' && <Badge variant="success" title="Taken from stock on delivery">Issued from stock</Badge>}
                        {i.stock.status === 'RELEASED' && <Badge variant="secondary" title="Given back to stock">Released</Badge>}
                      </span>
                    )}
                    {i.deliveredQuantity > 0 && ` · ${i.deliveredQuantity} delivered`}
                    {i.assignedEmployee && ` · Tailor: ${i.assignedEmployee.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatPKR(i.lineTotal)}</span>
                  {open && can('orders', 'EDIT') && i.deliveredQuantity < i.quantity && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${i.garmentName}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openDialog('stage', i.id)}><Workflow /> Update status of this garment</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openDialog('assign', i.id)}><UserCog /> Assign tailor</DropdownMenuItem>
                        {i.deliveredQuantity === 0 && <DropdownMenuItem onSelect={() => refreshMeasurement.mutate(i.id)}><RefreshCw /> Copy latest measurement</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-4">
                  <Info label="Stitching">{i.quantity} x {formatPKR(i.stitchingPrice)}</Info>
                  <Info label="Fabric">{formatPKR(i.fabricAmount)}</Info>
                  <Info label="Extra">{formatPKR(i.additionalCharges)}</Info>
                  <Info label="Line total">{formatPKR(i.lineTotal)}</Info>
                </dl>
                {i.notes && <p className="rounded-md bg-muted p-2 text-sm"><span className="font-medium">Tailor notes: </span>{i.notes}</p>}
                {i.measurement ? (
                  <div className="rounded-lg border">
                    <p className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm font-medium"><Ruler className="h-4 w-4 text-primary" /> {i.measurement.templateName} <Badge variant="outline">{i.measurement.unit === 'CM' ? 'cm' : 'inches'}</Badge><span className="text-xs font-normal text-muted-foreground">copied {formatDateTime(i.measurement.takenAt)}</span></p>
                    <dl className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
                      {i.measurement.values.map((v) => (
                        <div key={v.key} className="rounded-md bg-muted/60 px-2 py-1.5">
                          <dt className="text-[11px] text-muted-foreground">{v.label}</dt>
                          <dd className="font-semibold tabular-nums">{v.value != null ? Number(v.value) : ''}{v.text && <span className="block text-[11px] font-normal">{v.text}</span>}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : o.orderType !== 'FABRIC_SALE' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <Ruler className="h-4 w-4" /> No measurement on this garment yet.
                    {can('measurements', 'CREATE') && <Link className="font-medium underline" to={`/customers/${o.customer.id}?tab=measurements`}>Take measurement</Link>}
                    {open && can('orders', 'EDIT') && <Button size="sm" variant="outline" loading={refreshMeasurement.isPending} onClick={() => refreshMeasurement.mutate(i.id)}><RefreshCw /> Copy latest</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="pt-4">
              <dl className="ml-auto max-w-sm space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Stitching</dt><dd className="tabular-nums">{formatPKR(o.stitchingTotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Fabric</dt><dd className="tabular-nums">{formatPKR(o.fabricTotal)}</dd></div>
                {Number(o.additionalCharges) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Order extra charges</dt><dd className="tabular-nums">{formatPKR(o.additionalCharges)}</dd></div>}
                {Number(o.discount) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">- {formatPKR(o.discount)}</dd></div>}
                {Number(o.adjustmentsTotal) !== 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Adjustments</dt><dd className="tabular-nums">{formatPKR(o.adjustmentsTotal)}</dd></div>}
                <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatPKR(o.effectiveTotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd className="tabular-nums">{formatPKR(o.paidAmount)}</dd></div>
                <div className={cn('flex justify-between font-semibold', balance > 0 && 'text-rose-700 dark:text-rose-400')}><dt>{balance < 0 ? 'Credit' : 'Balance'}</dt><dd className="tabular-nums">{formatPKR(Math.abs(balance))}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            {!o.payments.length ? <EmptyState icon={<Wallet />} title="No payments yet" description="Advance and later payments for this order appear here with their receipt numbers."
              action={canPay ? <Button onClick={() => openDialog('pay')}><Banknote /> Receive payment</Button> : undefined} /> : (
              <Table>
                <THead><TR><TH>Receipt</TH><TH>Date</TH><TH>Method</TH><TH className="hidden sm:table-cell">Type</TH><TH className="text-right">Amount</TH><TH className="w-12"><span className="sr-only">Print</span></TH></TR></THead>
                <TBody>{o.payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.receiptNo}</TD><TD className="whitespace-nowrap">{formatDateTime(p.paymentDate)}</TD>
                    <TD>{METHOD_LABEL[p.method] ?? humanize(p.method)}{p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}</TD>
                    <TD className="hidden sm:table-cell">{p.status === 'REVERSED' ? 'Reversed' : humanize(p.type)}</TD><TD className="text-right font-medium tabular-nums">{formatPKR(p.amount)}</TD>
                    <TD>{can('orders', 'PRINT') && <Button variant="ghost" size="icon" asChild aria-label={`Print receipt ${p.receiptNo}`}><Link to={`/print/orders/${o.id}?receipt=${p.id}`} target="_blank"><Printer /></Link></Button>}</TD>
                  </TR>
                ))}</TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <Card>
            {!o.deliveries.length ? <EmptyState icon={<PackageCheck />} title="Nothing delivered yet" description="Each time the customer collects garments, a delivery is recorded here."
              action={open && can('orders', 'EDIT') ? <Button onClick={() => openDialog('deliver')}><PackageCheck /> Deliver</Button> : undefined} /> : (
              <ul className="divide-y">{o.deliveries.map((d) => (
                <li key={d.id} className="p-4">
                  <p className="font-semibold">Delivery {d.deliveryNo} <span className="font-normal text-muted-foreground">· {formatDateTime(d.deliveredAt)}{d.receivedBy ? ` · collected by ${d.receivedBy}` : ''}</span></p>
                  <p className="text-sm">{d.items.map((x) => `${x.quantity} x ${x.garmentName}`).join(', ')}</p>
                  {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                </li>
              ))}</ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {o.statusHistory.map((h) => (
                  <li key={h.id}>
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm"><StageBadge stage={h.toStage} />{h.item && <span className="ml-1.5 text-xs text-muted-foreground">{h.item.garmentName}</span>}</p>
                    {h.notes && <p className="text-sm">{h.notes}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(h.changedAt)}{h.changedBy ? ` · ${h.changedBy.fullName}` : ''}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {o.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="font-medium">{humanize(a.action)}</span>{a.note && <span className="text-muted-foreground"> · {a.note}</span>}
                    <span className="block text-xs text-muted-foreground">{formatDateTime(a.createdAt)}{a.user ? ` · ${a.user.fullName}` : ''}</span>
                  </li>
                ))}
                {o.adjustments.map((a) => (
                  <li key={a.id} className="rounded-md bg-muted p-2 text-sm"><Scale className="mr-1 inline h-3.5 w-3.5" /> {humanize(a.type)} {formatPKR(a.amount)} · {a.reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StageDialog order={o} open={dialog === 'stage'} onOpenChange={(v) => !v && setDialog(null)} stages={workStages} itemId={itemId} />
      <PaymentDialog order={o} open={dialog === 'pay'} onOpenChange={(v) => !v && setDialog(null)} />
      <DeliverDialog order={o} open={dialog === 'deliver'} onOpenChange={(v) => !v && setDialog(null)} canPay={can('payments', 'CREATE')} />
      <CancelOrderDialog order={o} open={dialog === 'cancel'} onOpenChange={(v) => !v && setDialog(null)} />
      <AdjustmentDialog order={o} open={dialog === 'adjust'} onOpenChange={(v) => !v && setDialog(null)} />
      <AssignDialog order={o} open={dialog === 'assign'} onOpenChange={(v) => !v && setDialog(null)} employees={options.data?.employees ?? []} itemId={itemId} />
    </div>
  );
}
