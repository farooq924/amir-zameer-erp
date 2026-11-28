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
import { DataTable, type DataColumn } from '@/components/data-table/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomerStatusBadge, CustomerTypeBadge } from '@/features/customers/badges';
import { CustomerFormDialog } from '@/features/customers/CustomerFormDialog';
import { StatCard } from '@/features/dashboard/StatCard';
import { CustomerMeasurements } from '@/features/measurements/CustomerMeasurements';
import { StageBadge } from '@/features/orders/badges';
import { SendWhatsAppDialog } from '@/features/whatsapp/SendWhatsAppDialog';
import { WaChannelBadge, WaStatusBadge, purposeLabel } from '@/features/whatsapp/shared';
import { Switch } from '@/components/ui/switch';
import type { WaMessage } from '@/types/whatsapp';
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

function OrdersTab({ id, status, name }: { id: string; status: CustomerStatus; name: string }) {
  const can = useCan();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['customer', id, 'orders'], queryFn: () => api.get<Paginated<OrderRow>>(`/customers/${id}/orders`, { pageSize: 200 }) });
  const columns: DataColumn<OrderRow>[] = [
    { id: 'order', header: 'Order', value: (o) => o.orderNumber, cell: (o) => <span className="whitespace-nowrap font-semibold text-primary">{o.orderNumber}</span> },
    { id: 'date', header: 'Date', value: (o) => o.orderDate, text: (o) => formatDate(o.orderDate), className: 'whitespace-nowrap' },
    { id: 'delivery', header: 'Delivery', value: (o) => o.expectedDeliveryDate, text: (o) => formatDate(o.expectedDeliveryDate), className: 'hidden sm:table-cell' },
    { id: 'status', header: 'Status', value: (o) => o.stage?.name ?? humanize(o.lifecycle), cell: (o) => (o.stage ? <StageBadge stage={o.stage} /> : <Badge variant="outline">{humanize(o.lifecycle)}</Badge>) },
    { id: 'total', header: 'Total', type: 'money', value: (o) => Number(o.totalAmount), cell: (o) => formatPKR(o.totalAmount) },
    { id: 'balance', header: 'Balance', type: 'money', value: (o) => Number(o.balanceAmount), cell: (o) => formatPKR(o.balanceAmount) },
  ];
  return (
    <DataTable title={`${name} - orders`} module="orders" noun="order" rows={q.data?.data} columns={columns} getRowId={(o) => o.id}
      loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
      onRowClick={(o) => navigate(`/orders/${o.id}`)} onView={(o) => navigate(`/orders/${o.id}`)}
      onEdit={can('orders', 'EDIT') ? (o) => navigate(`/orders/${o.id}/edit`) : undefined}
      onDuplicate={can('orders', 'CREATE') && status !== 'BLOCKED' ? (o) => navigate(`/orders/new?from=${o.id}`) : undefined}
      canRow={(a, o) => a !== 'edit' || o.lifecycle === 'OPEN' || o.lifecycle === 'PARTIALLY_DELIVERED'}
      footer={(rows) => ({ order: 'Total', total: formatPKR(rows.reduce((t, o) => t + Number(o.totalAmount), 0)), balance: formatPKR(rows.reduce((t, o) => t + Number(o.balanceAmount), 0)) })}
      empty={<EmptyState icon={<ClipboardList />} title="No orders yet" description="Orders booked for this customer will appear here."
        action={can('orders', 'CREATE') && status !== 'BLOCKED' ? <Button onClick={() => navigate(`/orders/new?customerId=${id}`)}><Plus /> New order</Button> : undefined} />} />
  );
}

function PaymentsTab({ id, name }: { id: string; name: string }) {
  const q = useQuery({ queryKey: ['customer', id, 'payments'], queryFn: () => api.get<Paginated<PaymentRow>>(`/customers/${id}/payments`, { pageSize: 200 }) });
  const columns: DataColumn<PaymentRow>[] = [
    { id: 'receipt', header: 'Receipt', value: (p) => p.receiptNo, cell: (p) => <span className="whitespace-nowrap font-mono text-xs">{p.receiptNo}</span> },
    { id: 'date', header: 'Date', value: (p) => p.paymentDate, text: (p) => formatDate(p.paymentDate), className: 'whitespace-nowrap' },
    { id: 'order', header: 'Order', value: (p) => p.order?.orderNumber ?? '-', className: 'hidden sm:table-cell' },
    { id: 'method', header: 'Method', value: (p) => humanize(p.method) },
    { id: 'status', header: 'Status', value: (p) => humanize(p.status), className: 'hidden md:table-cell' },
    { id: 'amount', header: 'Amount', type: 'money', value: (p) => Number(p.amount), cell: (p) => formatPKR(p.amount) },
  ];
  return (
    <DataTable title={`${name} - payments`} module="payments" noun="payment" rows={q.data?.data} columns={columns} getRowId={(p) => p.id}
      loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
      footer={(rows) => ({ receipt: 'Total', amount: formatPKR(rows.reduce((t, p) => t + Number(p.amount), 0)) })}
      empty={<EmptyState title="No payments yet" description="Advance and order payments appear here with their receipt numbers." />} />
  );
}

type LedgerRow = LedgerResponse['entries'][number];

function LedgerTab({ id, name }: { id: string; name: string }) {
  const q = useQuery({ queryKey: ['customer', id, 'ledger'], queryFn: () => api.get<LedgerResponse>(`/customers/${id}/ledger`) });
  const d = q.data;
  const columns: DataColumn<LedgerRow>[] = [
    { id: 'date', header: 'Date', value: (e) => e.date, text: (e) => formatDate(e.date), className: 'whitespace-nowrap', sortable: false },
    { id: 'entry', header: 'Entry', value: (e) => humanize(e.entryType), text: (e) => `${humanize(e.entryType)}${e.description ? ` - ${e.description}` : ''}`, sortable: false,
      cell: (e) => <><span className="font-medium">{humanize(e.entryType)}</span>{e.description && <span className="block text-xs text-muted-foreground">{e.description}</span>}</> },
    { id: 'debit', header: 'Debit', type: 'money', value: (e) => Number(e.debit), text: (e) => (Number(e.debit) ? formatPKR(e.debit) : '-'), sortable: false },
    { id: 'credit', header: 'Credit', type: 'money', value: (e) => Number(e.credit), text: (e) => (Number(e.credit) ? formatPKR(e.credit) : '-'), sortable: false },
    { id: 'balance', header: 'Balance', type: 'money', value: (e) => Number(e.balance), cell: (e) => <span className="font-medium">{formatPKR(e.balance)}</span>, text: (e) => formatPKR(e.balance), sortable: false },
  ];
  return (
    <DataTable title={`${name} - ledger`} module="customers" noun="entry" rows={d?.entries} columns={columns} getRowId={(e) => e.id}
      loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} defaultPageSize={50}
      footer={() => (d ? { date: 'Total', debit: formatPKR(d.totals.debit), credit: formatPKR(d.totals.credit), balance: formatPKR(d.totals.balance) } : {})}
      empty={<EmptyState title="No ledger entries" description="Opening balance, invoices and payments are recorded here automatically." />} />
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
  const [waOpen, setWaOpen] = useState(false);
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
            {can('whatsapp', 'CREATE') ? <Button variant="outline" size="sm" onClick={() => setWaOpen(true)}><MessageCircle className="text-emerald-600" /> WhatsApp</Button>
              : wa && <Button variant="outline" size="sm" asChild><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a></Button>}
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
          {can('whatsapp', 'VIEW') && <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>}
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
        <TabsContent value="orders" className="mt-4"><Card><OrdersTab id={c.id} status={c.status} name={c.name} /></Card></TabsContent>
        <TabsContent value="payments" className="mt-4"><Card><PaymentsTab id={c.id} name={c.name} /></Card></TabsContent>
        <TabsContent value="ledger" className="mt-4"><Card><LedgerTab id={c.id} name={c.name} /></Card></TabsContent>
        <TabsContent value="notes" className="mt-4"><Card><NotesTab id={c.id} /></Card></TabsContent>
        {can('whatsapp', 'VIEW') && <TabsContent value="whatsapp" className="mt-4"><WhatsAppTab id={c.id} optIn={c.whatsappOptIn} optInAt={c.whatsappOptInAt ?? null} onChanged={refresh} canEdit={can('customers', 'EDIT')} /></TabsContent>}
      </Tabs>

      <SendWhatsAppDialog open={waOpen} onOpenChange={setWaOpen} context={{ type: 'CUSTOMER', id: c.id }} purpose="GENERAL" title={`WhatsApp ${c.name}`} />
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

function WhatsAppTab({ id, optIn, optInAt, onChanged, canEdit }: { id: string; optIn: boolean; optInAt: string | null; onChanged: () => void; canEdit: boolean }) {
  const q = useQuery({ queryKey: ['whatsapp', 'messages', { customerId: id }], queryFn: () => api.get<Paginated<WaMessage>>('/whatsapp/messages', { customerId: id, pageSize: 50 }) });
  const toggle = useMutation({
    mutationFn: (v: boolean) => api.put(`/whatsapp/customers/${id}/opt-in`, { optIn: v }),
    onSuccess: (_r, v) => { toast.success(v ? 'Customer agreed to WhatsApp messages' : 'WhatsApp messages stopped for this customer'); onChanged(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">Agrees to WhatsApp messages</p>
          <p className="text-sm text-muted-foreground">{optIn ? `Yes${optInAt ? `, since ${formatDate(optInAt)}` : ''}. Automatic order and payment updates are sent.` : 'No. Only manual messages from the WhatsApp app are possible.'}</p>
        </div>
        <Switch aria-label="Agrees to WhatsApp messages" checked={optIn} disabled={!canEdit || toggle.isPending} onCheckedChange={(v) => toggle.mutate(v)} />
      </Card>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <Skeleton className="m-4 h-24" /> : !q.data!.data.length ? (
          <EmptyState icon={<MessageCircle />} title="No WhatsApp messages yet" description="Messages sent to this customer appear here with their status." />
        ) : (
          <ul className="divide-y">
            {q.data!.data.map((m) => (
              <li key={m.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{m.template ? purposeLabel(m.template.purpose) : 'Typed message'} <span className="text-xs font-normal text-muted-foreground">· {formatDateTime(m.createdAt)}</span></span>
                  <span className="flex gap-1"><WaChannelBadge channel={m.channel} /><WaStatusBadge status={m.status} channel={m.channel} /></span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{m.body}</p>
                {m.status === 'FAILED' && m.errorMessage && <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">{m.errorMessage}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
