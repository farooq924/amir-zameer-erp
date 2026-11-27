import { unitShort } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Boxes, ClipboardList, History, Lock, Pencil, ShoppingCart, SlidersHorizontal, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
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

function FabricLedger({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['inventory', 'movements', { fabricId: id, page }],
    queryFn: () => api.get<Paginated<StockMovement>>('/inventory/movements', { fabricId: id, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState />;
  if (!q.data!.data.length) return <EmptyState icon={<History />} title="No stock changes yet" description="Purchases, orders and adjustments of this fabric appear here." />;
  return (
    <>
      <MovementsTable rows={q.data!.data} showFabric={false} />
      {q.data!.meta.totalPages > 1 && (
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= q.data!.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}

function FabricPurchases({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['purchases', 'list', { fabricId: id }], queryFn: () => api.get<Paginated<PurchaseListRow>>('/purchases', { fabricId: id, pageSize: 50 }) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState />;
  if (!q.data!.data.length) return <EmptyState icon={<ShoppingCart />} title="No purchases yet" description="Supplier bills that include this fabric appear here." />;
  return (
    <Table>
      <THead><TR><TH>Date</TH><TH>Purchase</TH><TH>Supplier</TH><TH className="text-right">Bill total</TH><TH>Payment</TH></TR></THead>
      <TBody>
        {q.data!.data.map((p) => (
          <TR key={p.id}>
            <TD className="whitespace-nowrap">{formatDate(p.purchaseDate)}</TD>
            <TD><Link className="font-semibold hover:underline" to={`/purchases/${p.id}`}>{p.purchaseNo}</Link>{p.supplierInvoiceNo && <span className="block text-xs text-muted-foreground">Bill {p.supplierInvoiceNo}</span>}</TD>
            <TD>{p.supplier.name}</TD>
            <TD className="text-right tabular-nums">{formatPKR(p.totalAmount)}</TD>
            <TD><PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /></TD>
          </TR>
        ))}
      </TBody>
    </Table>
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
        <TabsContent value="ledger" className="mt-4"><Card><FabricLedger id={f.id} /></Card></TabsContent>
        <TabsContent value="reserved" className="mt-4">
          <Card>
            {!f.reservations.length ? <EmptyState icon={<Lock />} title="Nothing reserved" description="When an order uses this fabric from stock, it is reserved here until the garment is delivered." /> : (
              <Table>
                <THead><TR><TH>Order</TH><TH>Customer</TH><TH className="hidden sm:table-cell">Garment</TH><TH className="hidden md:table-cell">Delivery</TH><TH className="text-right">Reserved</TH><TH className="text-right">Issued</TH></TR></THead>
                <TBody>
                  {f.reservations.map((r) => (
                    <TR key={r.id}>
                      <TD><Link className="font-semibold hover:underline" to={`/orders/${r.orderId}`}>{r.orderNumber}</Link></TD>
                      <TD>{r.customerName}</TD>
                      <TD className="hidden sm:table-cell">{r.garment}</TD>
                      <TD className="hidden md:table-cell">{formatDate(r.expectedDeliveryDate)}</TD>
                      <TD className="text-right tabular-nums">{formatQty(r.remaining, f.unit)}</TD>
                      <TD className="text-right tabular-nums">{Number(r.consumed) ? formatQty(r.consumed, f.unit) : '-'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>
        {can('purchases', 'VIEW') && <TabsContent value="purchases" className="mt-4"><Card><FabricPurchases id={f.id} /></Card></TabsContent>}
      </Tabs>
      <FabricFormDialog open={editOpen} onOpenChange={setEditOpen} fabric={f} />
      <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} fabric={f} />
    </div>
  );
}
