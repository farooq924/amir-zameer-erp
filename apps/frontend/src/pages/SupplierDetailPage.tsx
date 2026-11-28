import { PAYMENT_METHODS, formatPhone, whatsappLink } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Layers, MessageCircle, Pencil, Phone, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataColumn } from '@/components/data-table/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { SupplierFormDialog, SupplierPaymentDialog } from '@/features/inventory/SupplierDialogs';
import { PurchasePaymentBadge, SupplierStatusBadge, formatQty } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { SupplierDetail, SupplierLedger } from '@/types';
import { formatDate, formatPKR, humanize } from '@/utils/format';

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm font-medium">{children || '-'}</dd></div>;
}

type LedgerRow = SupplierLedger['entries'][number];

function LedgerTab({ id, name }: { id: string; name: string }) {
  const q = useQuery({ queryKey: ['suppliers', id, 'ledger'], queryFn: () => api.get<SupplierLedger>(`/suppliers/${id}/ledger`) });
  const d = q.data;
  const columns: DataColumn<LedgerRow>[] = [
    { id: 'date', header: 'Date', value: (e) => e.date, text: (e) => formatDate(e.date), className: 'whitespace-nowrap', sortable: false },
    { id: 'entry', header: 'Entry', value: (e) => humanize(e.entryType), text: (e) => `${humanize(e.entryType)}${e.description ? ` - ${e.description}` : ''}`, sortable: false,
      cell: (e) => <><span className="font-medium">{humanize(e.entryType)}</span>{e.description && <span className="block text-xs text-muted-foreground">{e.description}</span>}</> },
    { id: 'debit', header: 'Paid / returned', type: 'money', value: (e) => Number(e.debit), text: (e) => (Number(e.debit) ? formatPKR(e.debit) : '-'), sortable: false },
    { id: 'credit', header: 'Bought', type: 'money', value: (e) => Number(e.credit), text: (e) => (Number(e.credit) ? formatPKR(e.credit) : '-'), sortable: false },
    { id: 'balance', header: 'You owe', type: 'money', value: (e) => Number(e.balance), cell: (e) => <span className="font-medium">{formatPKR(e.balance)}</span>, text: (e) => formatPKR(e.balance), sortable: false },
  ];
  return (
    <DataTable title={`${name} - ledger`} module="suppliers" noun="entry" rows={d?.entries} columns={columns} getRowId={(e) => e.id}
      loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} defaultPageSize={50}
      footer={() => (d ? { date: 'Total', debit: formatPKR(d.totals.debit), credit: formatPKR(d.totals.credit), balance: formatPKR(d.totals.balance) } : {})}
      empty={<EmptyState title="No ledger entries" description="Opening balance, purchases, returns and payments are recorded here automatically." />} />
  );
}

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const navigate = useNavigate();
  const [tab, setTab] = useState('purchases');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const q = useQuery({ queryKey: ['suppliers', 'detail', id], queryFn: () => api.get<SupplierDetail>(`/suppliers/${id}`) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState label="Loading supplier..." />;
  const s = q.data!;
  const wa = s.whatsapp || s.contactNumber ? whatsappLink(s.whatsapp ?? s.contactNumber!) : null;
  const totalPaid = s.payments.reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Suppliers</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{s.name} <SupplierStatusBadge status={s.status} /></h1>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{s.code}</span>{s.contactNumber ? ` · ${formatPhone(s.contactNumber)}` : ''}{s.city ? ` · ${s.city}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.contactNumber && <Button variant="outline" size="sm" asChild><a href={`tel:+${s.contactNumber}`}><Phone /> Call</a></Button>}
            {wa && <Button variant="outline" size="sm" asChild><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a></Button>}
            {can('purchases', 'CREATE') && s.status === 'ACTIVE' && <Button variant="gold" size="sm" onClick={() => navigate(`/purchases/new?supplierId=${s.id}`)}><ShoppingCart /> New purchase</Button>}
            {can('suppliers', 'EDIT') && <Button size="sm" onClick={() => setPayOpen(true)}><Banknote /> Pay supplier</Button>}
            {can('suppliers', 'EDIT') && <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard compact label="You owe" value={formatPKR(s.balance)} icon={Wallet} tile="rose" tone={Number(s.balance) > 0 ? 'negative' : undefined} hint={Number(s.balance) < 0 ? 'Advance with supplier' : undefined} />
        <StatCard compact label="Total purchased" value={formatPKR(s.totalPurchased)} icon={Receipt} tile="gold" hint={`${s.purchaseCount} bill(s)`} />
        <StatCard compact label="Recent payments" value={formatPKR(totalPaid)} icon={Banknote} tile="green" hint={`Last ${s.payments.length}`} />
        <StatCard compact label="Fabrics supplied" value={String(s.fabrics.length)} icon={Layers} tile="blue" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="fabrics">Fabrics</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="mt-4">
          <Card>
            <DataTable title={`${s.name} - purchases`} module="purchases" noun="purchase" rows={s.purchases} getRowId={(p) => p.id}
              onRowClick={(p) => navigate(`/purchases/${p.id}`)} onView={(p) => navigate(`/purchases/${p.id}`)}
              columns={[
                { id: 'date', header: 'Date', value: (p) => p.purchaseDate, text: (p) => formatDate(p.purchaseDate), className: 'whitespace-nowrap' },
                { id: 'purchase', header: 'Purchase', value: (p) => p.purchaseNo, text: (p) => p.purchaseNo, cell: (p) => <><span className="font-semibold">{p.purchaseNo}</span>{p.supplierInvoiceNo && <span className="block text-xs text-muted-foreground">Bill {p.supplierInvoiceNo}</span>}</> },
                { id: 'total', header: 'Total', type: 'money', value: (p) => Number(p.totalAmount), cell: (p) => formatPKR(p.totalAmount) },
                { id: 'paid', header: 'Paid', type: 'money', value: (p) => Number(p.paidAmount), cell: (p) => formatPKR(p.paidAmount), className: 'hidden sm:table-cell' },
                { id: 'due', header: 'Due', type: 'money', value: (p) => Number(p.balanceAmount), cell: (p) => formatPKR(p.balanceAmount) },
                { id: 'payment', header: 'Payment', value: (p) => (Number(p.balanceAmount) > 0 ? 'To pay' : 'Paid'), cell: (p) => <PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /> },
              ]}
              footer={(rows) => ({ date: 'Total', total: formatPKR(rows.reduce((t, p) => t + Number(p.totalAmount), 0)), paid: formatPKR(rows.reduce((t, p) => t + Number(p.paidAmount), 0)), due: formatPKR(rows.reduce((t, p) => t + Number(p.balanceAmount), 0)) })}
              empty={<EmptyState icon={<ShoppingCart />} title="No purchases yet" description="Supplier bills you enter appear here." />} />
          </Card>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <Card>
            <DataTable title={`${s.name} - payments`} module="suppliers" noun="payment" rows={s.payments} getRowId={(p) => p.id}
              columns={[
                { id: 'date', header: 'Date', value: (p) => p.paymentDate, text: (p) => formatDate(p.paymentDate), className: 'whitespace-nowrap' },
                { id: 'payment', header: 'Payment', value: (p) => p.paymentNo, text: (p) => p.paymentNo, cell: (p) => <><span className="font-mono text-xs font-semibold">{p.paymentNo}</span>{p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}</> },
                { id: 'method', header: 'Method', value: (p) => METHOD[p.method] ?? p.method },
                { id: 'bill', header: 'For bill', value: (p) => p.purchaseNo ?? 'Oldest bills first', className: 'hidden sm:table-cell' },
                { id: 'amount', header: 'Amount', type: 'money', value: (p) => Number(p.amount), cell: (p) => <span className="font-semibold">{formatPKR(p.amount)}</span>, text: (p) => formatPKR(p.amount) },
              ]}
              footer={(rows) => ({ date: 'Total', amount: formatPKR(rows.reduce((t, p) => t + Number(p.amount), 0)) })}
              empty={<EmptyState icon={<Banknote />} title="No payments yet" description="Payments you make to this supplier appear here." />} />
          </Card>
        </TabsContent>
        <TabsContent value="ledger" className="mt-4"><Card><LedgerTab id={s.id} name={s.name} /></Card></TabsContent>
        <TabsContent value="fabrics" className="mt-4">
          <Card>
            {!s.fabrics.length ? <EmptyState icon={<Layers />} title="No fabrics linked" description="Fabrics bought from this supplier are linked automatically." /> : (
              <ul className="divide-y">
                {s.fabrics.map((f) => (
                  <li key={f.id}><Link to={`/inventory/fabrics/${f.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50">
                    <span><span className="font-medium">{f.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{f.code}</span></span>
                    <span className="text-sm tabular-nums">{formatQty(f.currentStock, f.unit)}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Supplier details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Phone">{s.contactNumber ? formatPhone(s.contactNumber) : null}</Detail>
                <Detail label="WhatsApp">{s.whatsapp ? formatPhone(s.whatsapp) : null}</Detail>
                <Detail label="City">{s.city}</Detail>
                <Detail label="Address">{s.address}</Detail>
                <Detail label="Opening balance">{formatPKR(s.openingBalance)}</Detail>
              </dl>
              {s.notes && <p className="mt-4 rounded-md bg-muted p-3 text-sm"><span className="font-medium">Notes: </span>{s.notes}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={{ ...s, fabrics: s.fabrics.length }} />
      <SupplierPaymentDialog open={payOpen} onOpenChange={setPayOpen} supplier={s} />
    </div>
  );
}
