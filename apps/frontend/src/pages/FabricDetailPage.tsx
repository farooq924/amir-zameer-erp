import { unitShort } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Boxes, ClipboardList, History, Lock, Pencil, ShoppingCart, SlidersHorizontal, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { FabricFormDialog } from '@/features/inventory/FabricFormDialog';
import { PurchasePaymentBadge, StockLevelBadge, formatQty } from '@/features/inventory/shared';
import { AdjustStockDialog } from '@/features/inventory/StockDialogs';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { FabricDetail, Paginated, PurchaseListRow, StockMovement } from '@/types';
import { formatDate, formatPKR } from '@/utils/format';
import { MovementsTable } from './InventoryPage';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm font-medium">{children || '-'}</dd></div>;
}

function FabricLedger({ id, name }: { id: string; name: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const q = useQuery({
    queryKey: ['inventory', 'movements', { fabricId: id, page, pageSize }],
    queryFn: () => api.get<Paginated<StockMovement>>('/inventory/movements', { fabricId: id, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  return (
    <MovementsTable rows={q.data?.data} showFabric={false} title={`${name} - stock ledger`} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
      pagination={{ page, pageSize, total: q.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
      fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<StockMovement>>('/inventory/movements', { fabricId: id, page: pg, pageSize: size }))}
      empty={<EmptyState icon={<History />} title="No stock changes yet" description="Purchases, orders and adjustments of this fabric appear here." />} />
  );
}

function FabricPurchases({ id, name }: { id: string; name: string }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['purchases', 'list', { fabricId: id }], queryFn: () => api.get<Paginated<PurchaseListRow>>('/purchases', { fabricId: id, pageSize: 200 }) });
  const columns: DataColumn<PurchaseListRow>[] = [
    { id: 'date', header: 'Date', value: (p) => p.purchaseDate, text: (p) => formatDate(p.purchaseDate), className: 'whitespace-nowrap' },
    { id: 'purchase', header: 'Purchase', value: (p) => p.purchaseNo, cell: (p) => <><span className="font-semibold">{p.purchaseNo}</span>{p.supplierInvoiceNo && <span className="block text-xs text-muted-foreground">Bill {p.supplierInvoiceNo}</span>}</> },
    { id: 'supplier', header: 'Supplier', value: (p) => p.supplier.name },
    { id: 'total', header: 'Bill total', type: 'money', value: (p) => p.totalAmount, cell: (p) => formatPKR(p.totalAmount) },
    { id: 'payment', header: 'Payment', value: (p) => (Number(p.balanceAmount) > 0 ? 'To pay' : 'Paid'), cell: (p) => <PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /> },
  ];
  return (
    <DataTable title={`${name} - purchases`} module="purchases" noun="purchase" rows={q.data?.data} columns={columns} getRowId={(p) => p.id}
      loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} onRowClick={(p) => navigate(`/purchases/${p.id}`)} onView={(p) => navigate(`/purchases/${p.id}`)}
      empty={<EmptyState icon={<ShoppingCart />} title="No purchases yet" description="Supplier bills that include this fabric appear here." />} />
  );
}

export function FabricDetailPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [tab, setTab] = useState('details');
  const q = useQuery({ queryKey: ['inventory', 'fabric', id], queryFn: () => api.get<FabricDetail>(`/inventory/fabrics/${id}`) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState label="Loading fabric..." />;
  const f = q.data!;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Fabric Inventory</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{f.name} <StockLevelBadge level={f.level} />{!f.isActive && <Badge variant="secondary">Inactive</Badge>}</h1>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{f.code}</span>{f.category ? ` · ${f.category.name}` : ''}{f.color ? ` · ${f.color}` : ''}{f.location ? ` · ${f.location}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('purchases', 'CREATE') && <Button variant="gold" size="sm" onClick={() => navigate(`/purchases/new?fabricId=${f.id}`)}><ShoppingCart /> Buy more</Button>}
            {can('inventory', 'APPROVE') && <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}><SlidersHorizontal /> Adjust stock</Button>}
            {can('inventory', 'EDIT') && <Button size="sm" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard compact label="In stock" value={formatQty(f.currentStock, f.unit)} icon={Boxes} tile="blue" />
        <StatCard compact label="Reserved for orders" value={formatQty(f.reservedStock, f.unit)} icon={Lock} tile="purple" hint={f.reservations.length ? `${f.reservations.length} order(s)` : undefined} />
        <StatCard compact label="Free to use" value={formatQty(f.availableStock, f.unit)} icon={ClipboardList} tile={f.level === 'OK' ? 'green' : 'rose'} tone={f.level === 'OK' ? undefined : 'negative'} hint={Number(f.minimumStock) ? `Minimum ${formatQty(f.minimumStock, f.unit)}` : undefined} />
        <StatCard compact label="Stock value" value={formatPKR(f.stockValue)} icon={Wallet} tile="gold" hint={`Avg cost ${formatPKR(f.averageCost)}`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="ledger">Stock ledger</TabsTrigger>
          <TabsTrigger value="reserved">Reserved{f.reservations.length ? ` (${f.reservations.length})` : ''}</TabsTrigger>
          {can('purchases', 'VIEW') && <TabsTrigger value="purchases">Purchases</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Fabric details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Brand">{f.brand}</Detail>
                <Detail label="Colour">{f.color}</Detail>
                <Detail label="Design">{f.design}</Detail>
                <Detail label="Quality">{f.quality}</Detail>
                <Detail label="Sale price">{formatPKR(f.salePrice)} per {unitShort(f.unit)}</Detail>
                <Detail label="Purchase price">{formatPKR(f.purchasePrice)}</Detail>
                <Detail label="Average cost">{formatPKR(f.averageCost)}</Detail>
                <Detail label="Minimum stock">{formatQty(f.minimumStock, f.unit)}</Detail>
                <Detail label="Usual supplier">{f.supplier ? (can('suppliers', 'VIEW') ? <Link className="hover:underline" to={`/suppliers/${f.supplier.id}`}>{f.supplier.name}</Link> : f.supplier.name) : null}</Detail>
                <Detail label="Location">{f.location}</Detail>
                <Detail label="Last purchase">{f.lastPurchase ? <>{formatDate(f.lastPurchase.date)} · {formatQty(f.lastPurchase.quantity, f.unit)} @ {formatPKR(f.lastPurchase.rate)}</> : null}</Detail>
                <Detail label="Added on">{formatDate(f.createdAt)}</Detail>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ledger" className="mt-4"><Card><FabricLedger id={f.id} name={f.name} /></Card></TabsContent>
        <TabsContent value="reserved" className="mt-4">
          <Card>
            <DataTable title={`${f.name} - reserved`} module="inventory" noun="reservation" rows={f.reservations} getRowId={(r) => r.id}
              onRowClick={(r) => navigate(`/orders/${r.orderId}`)} onView={(r) => navigate(`/orders/${r.orderId}`)}
              columns={[
                { id: 'order', header: 'Order', value: (r) => r.orderNumber, cell: (r) => <span className="font-semibold">{r.orderNumber}</span> },
                { id: 'customer', header: 'Customer', value: (r) => r.customerName },
                { id: 'garment', header: 'Garment', value: (r) => r.garment, className: 'hidden sm:table-cell' },
                { id: 'delivery', header: 'Delivery', value: (r) => r.expectedDeliveryDate, text: (r) => formatDate(r.expectedDeliveryDate), className: 'hidden md:table-cell' },
                { id: 'reserved', header: 'Reserved', type: 'number', value: (r) => r.remaining, text: (r) => formatQty(r.remaining, f.unit) },
                { id: 'issued', header: 'Issued', type: 'number', value: (r) => r.consumed, text: (r) => (Number(r.consumed) ? formatQty(r.consumed, f.unit) : '-') },
              ]}
              empty={<EmptyState icon={<Lock />} title="Nothing reserved" description="When an order uses this fabric from stock, it is reserved here until the garment is delivered." />} />
          </Card>
        </TabsContent>
        {can('purchases', 'VIEW') && <TabsContent value="purchases" className="mt-4"><Card><FabricPurchases id={f.id} name={f.name} /></Card></TabsContent>}
      </Tabs>
      <FabricFormDialog open={editOpen} onOpenChange={setEditOpen} fabric={f} />
      <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} fabric={f} />
    </div>
  );
}
