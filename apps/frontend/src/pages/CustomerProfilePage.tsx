import { formatPhone, whatsappLink } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Banknote, ClipboardList, Receipt, Wallet, CheckCircle2, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomerStatusBadge, CustomerTypeBadge } from '@/features/customers/badges';
import { CustomerFormDialog } from '@/features/customers/CustomerFormDialog';
import { StatCard } from '@/features/dashboard/StatCard';
import { CustomerMeasurements } from '@/features/measurements/CustomerMeasurements';
import { StageBadge } from '@/features/orders/badges';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { CustomerProfile, CustomerStatus, LedgerResponse, Paginated } from '@/types';
import { formatDate, formatDateTime, formatPKR, humanize } from '@/utils/format';

interface OrderRow {
  id: string; orderNumber: string; orderDate: string; expectedDeliveryDate: string | null; lifecycle: string; paymentStatus: string;
  totalAmount: string; paidAmount: string; balanceAmount: string; stage: { code: string; name: string } | null; _count: { items: number };
}
interface PaymentRow { id: string; receiptNo: string; paymentDate: string; amount: string; method: string; type: string; status: string; reference: string | null; order: { orderNumber: string } | null }
interface NoteRow { id: string; note: string; createdAt: string }

function Loading() {
  return <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
}

function OrdersTab({ id, status }: { id: string; status: CustomerStatus }) {
  const can = useCan();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['customer', id, 'orders'], queryFn: () => api.get<Paginated<OrderRow>>(`/customers/${id}/orders`, { pageSize: 50 }) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Loading />;
  if (!q.data!.data.length) {
    return <EmptyState icon={<ClipboardList />} title="No orders yet" description="Orders booked for this customer will appear here."
      action={can('orders', 'CREATE') && status !== 'BLOCKED' ? <Button onClick={() => navigate(`/orders/new?customerId=${id}`)}><Plus /> New order</Button> : undefined} />;
  }
  return (
    <Table>
      <THead><TR><TH>Order</TH><TH>Date</TH><TH className="hidden sm:table-cell">Delivery</TH><TH>Status</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH></TR></THead>
      <TBody>{q.data!.data.map((o) => (
        <TR key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
          <TD className="whitespace-nowrap font-semibold"><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.orderNumber}</Link></TD><TD className="whitespace-nowrap">{formatDate(o.orderDate)}</TD>
          <TD className="hidden sm:table-cell">{formatDate(o.expectedDeliveryDate)}</TD>
          <TD>{o.stage ? <StageBadge stage={o.stage} /> : <Badge variant="outline">{humanize(o.lifecycle)}</Badge>}</TD>
          <TD className="text-right tabular-nums">{formatPKR(o.totalAmount)}</TD><TD className="text-right tabular-nums">{formatPKR(o.balanceAmount)}</TD>
        </TR>
      ))}</TBody>
    </Table>
  );
}

function PaymentsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['customer', id, 'payments'], queryFn: () => api.get<Paginated<PaymentRow>>(`/customers/${id}/payments`, { pageSize: 50 }) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Loading />;
  if (!q.data!.data.length) return <EmptyState title="No payments yet" description="Advance and order payments appear here with their receipt numbers." />;
  return (
    <Table>
      <THead><TR><TH>Receipt</TH><TH>Date</TH><TH className="hidden sm:table-cell">Order</TH><TH>Method</TH><TH className="text-right">Amount</TH></TR></THead>
      <TBody>{q.data!.data.map((p) => (
        <TR key={p.id}>
          <TD className="font-mono text-xs">{p.receiptNo}</TD><TD>{formatDate(p.paymentDate)}</TD>
          <TD className="hidden sm:table-cell">{p.order?.orderNumber ?? '-'}</TD><TD>{humanize(p.method)}</TD>
          <TD className="text-right tabular-nums">{formatPKR(p.amount)}</TD>
        </TR>
      ))}</TBody>
    </Table>
  );
}

function LedgerTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['customer', id, 'ledger'], queryFn: () => api.get<LedgerResponse>(`/customers/${id}/ledger`) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Loading />;
  const d = q.data!;
  if (!d.entries.length) return <EmptyState title="No ledger entries" description="Opening balance, invoices and payments are recorded here automatically." />;
  return (
    <Table>
      <THead><TR><TH>Date</TH><TH>Entry</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></TR></THead>
      <TBody>
        {d.entries.map((e) => (
          <TR key={e.id}>
            <TD className="whitespace-nowrap">{formatDate(e.date)}</TD>
            <TD><span className="font-medium">{humanize(e.entryType)}</span>{e.description && <span className="block text-xs text-muted-foreground">{e.description}</span>}</TD>
            <TD className="text-right tabular-nums">{Number(e.debit) ? formatPKR(e.debit) : '-'}</TD>
            <TD className="text-right tabular-nums">{Number(e.credit) ? formatPKR(e.credit) : '-'}</TD>
            <TD className="text-right font-medium tabular-nums">{formatPKR(e.balance)}</TD>
          </TR>
        ))}
        <TR className="bg-muted/50 font-semibold">
          <TD colSpan={2}>Total</TD><TD className="text-right tabular-nums">{formatPKR(d.totals.debit)}</TD>
          <TD className="text-right tabular-nums">{formatPKR(d.totals.credit)}</TD><TD className="text-right tabular-nums">{formatPKR(d.totals.balance)}</TD>
        </TR>
      </TBody>
    </Table>
  );
}

function NotesTab({ id }: { id: string }) {
  const can = useCan();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['customer', id, 'notes'], queryFn: () => api.get<NoteRow[]>(`/customers/${id}/notes`) });
  const add = useMutation({
    mutationFn: () => api.post<NoteRow>(`/customers/${id}/notes`, { note: text.trim() }),
    onSuccess: () => { setText(''); toast.success('Note added'); void qc.invalidateQueries({ queryKey: ['customer', id, 'notes'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4 p-4">
      {can('customers', 'EDIT') && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
          <Textarea aria-label="New note" rows={3} placeholder="e.g. Prefers loose fitting. Call before delivery." value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <div className="flex justify-end"><Button type="submit" size="sm" loading={add.isPending} disabled={!text.trim()}>Add note</Button></div>
        </form>
      )}
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <Loading /> : !q.data!.length ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">{q.data!.map((n) => (
          <li key={n.id} className="rounded-md border p-3">
            <p className="whitespace-pre-wrap text-sm">{n.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{children || '-'}</dd></div>;
}

export function CustomerProfilePage() {
  const { id = '' } = useParams();
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'status'; status: CustomerStatus } | { kind: 'delete' }>(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const setTab = (v: string) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true });

  const profile = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerProfile>(`/customers/${id}`) });
  const c = profile.data;

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['customer', id] }); void qc.invalidateQueries({ queryKey: ['customers'] }); };
  const setStatus = useMutation({
    mutationFn: (status: CustomerStatus) => api.patch(`/customers/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); setConfirm(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/customers/${id}`),
    onSuccess: () => { toast.success('Customer deleted'); void qc.invalidateQueries({ queryKey: ['customers'] }); navigate('/customers'); },
    onError: (e) => { toast.error(errorMessage(e)); setConfirm(null); },
  });

  if (profile.isError) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;
  if (!c) return <div className="space-y-4"><Skeleton className="h-16 w-full" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>;

  const wa = whatsappLink(c.whatsapp ?? c.mobile, `Assalam o Alaikum ${c.name},`);
  const s = c.stats;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Customers</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {c.name} <CustomerStatusBadge status={c.status} /> <CustomerTypeBadge type={c.customerType} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{c.code}</span> · {formatPhone(c.mobile)}{c.city ? ` · ${c.city}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><a href={`tel:+${c.mobile}`}><Phone /> Call</a></Button>
            {wa && <Button variant="outline" size="sm" asChild><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a></Button>}
            {can('orders', 'CREATE') && c.status !== 'BLOCKED' && <Button size="sm" onClick={() => navigate(`/orders/new?customerId=${c.id}`)}><Plus /> New order</Button>}
            {can('customers', 'EDIT') && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {(can('customers', 'EDIT') || can('customers', 'DELETE')) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {can('customers', 'EDIT') && c.status !== 'ACTIVE' && <DropdownMenuItem onSelect={() => setConfirm({ kind: 'status', status: 'ACTIVE' })}><CheckCircle2 /> Mark active</DropdownMenuItem>}
                  {can('customers', 'EDIT') && c.status !== 'INACTIVE' && <DropdownMenuItem onSelect={() => setConfirm({ kind: 'status', status: 'INACTIVE' })}><UserX /> Mark inactive</DropdownMenuItem>}
                  {can('customers', 'EDIT') && c.status !== 'BLOCKED' && <DropdownMenuItem onSelect={() => setConfirm({ kind: 'status', status: 'BLOCKED' })}><Ban /> Block customer</DropdownMenuItem>}
                  {can('customers', 'DELETE') && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => setConfirm({ kind: 'delete' })}><Trash2 /> Delete customer</DropdownMenuItem></>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard compact label="Total orders" value={String(s.totalOrders)} hint={s.openOrders ? `${s.openOrders} open` : undefined} icon={ClipboardList} tile="green" />
        <StatCard compact label="Total billed" value={formatPKR(s.totalBilled)} icon={Receipt} tile="gold" />
        <StatCard compact label="Total paid" value={formatPKR(s.totalPaid)} icon={Wallet} tile="blue" />
        <StatCard compact label="Outstanding" value={formatPKR(s.outstanding)} icon={Banknote} tile="rose" tone={Number(s.outstanding) > 0 ? 'negative' : undefined} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="measurements">Measurements{s.measurementVersions ? ` (${s.measurementVersions})` : ''}</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Customer details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Mobile">{formatPhone(c.mobile)}</Detail>
                <Detail label="WhatsApp">{c.whatsapp ? formatPhone(c.whatsapp) : 'Same as mobile'}</Detail>
                <Detail label="WhatsApp updates">{c.whatsappOptIn ? 'Customer agreed' : 'Not agreed'}</Detail>
                <Detail label="Email">{c.email}</Detail>
                <Detail label="City">{c.city}</Detail>
                <Detail label="Address">{c.address}</Detail>
                <Detail label="Registered on">{formatDate(c.registrationDate)}</Detail>
                <Detail label="Opening balance">{formatPKR(c.openingBalance)}</Detail>
                <Detail label="Last order">{formatDate(s.lastOrderDate)}</Detail>
                <Detail label="Last measured">{formatDateTime(s.lastMeasurementAt)}</Detail>
              </dl>
              {c.notes && <p className="mt-4 rounded-md bg-muted p-3 text-sm"><span className="font-medium">Notes: </span>{c.notes}</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="measurements" className="mt-4">
          {can('measurements', 'VIEW') ? <CustomerMeasurements customerId={c.id} /> : <Card><EmptyState title="No access" description="You do not have permission to view measurements." /></Card>}
        </TabsContent>
        <TabsContent value="orders" className="mt-4"><Card><OrdersTab id={c.id} status={c.status} /></Card></TabsContent>
        <TabsContent value="payments" className="mt-4"><Card><PaymentsTab id={c.id} /></Card></TabsContent>
        <TabsContent value="ledger" className="mt-4"><Card><LedgerTab id={c.id} /></Card></TabsContent>
        <TabsContent value="notes" className="mt-4"><Card><NotesTab id={c.id} /></Card></TabsContent>
      </Tabs>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={c} onSaved={refresh} />
      <ConfirmDialog
        open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'delete' ? 'Delete this customer?' : `Change status to ${confirm?.kind === 'status' ? humanize(confirm.status) : ''}?`}
        description={confirm?.kind === 'delete'
          ? 'The customer is hidden from lists. Customers with orders, payments or ledger entries cannot be deleted; mark them inactive instead.'
          : confirm?.kind === 'status' && confirm.status === 'BLOCKED' ? 'Blocked customers stay in records but should not receive new orders.' : 'You can change the status again at any time.'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Change status'}
        destructive={confirm?.kind === 'delete' || (confirm?.kind === 'status' && confirm.status === 'BLOCKED')}
        loading={setStatus.isPending || remove.isPending}
        onConfirm={() => { if (!confirm) return; if (confirm.kind === 'delete') remove.mutate(); else setStatus.mutate(confirm.status); }}
      />
    </div>
  );
}
