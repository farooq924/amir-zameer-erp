import { MOVEMENT_TYPES } from '@az/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, FolderTree, History, Layers, PackageX, Plus, Search, ShoppingCart, Wallet } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, type ServerPagination, type SortState, fetchAllPages } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { FabricFormDialog, useFabricCategories } from '@/features/inventory/FabricFormDialog';
import { MovementBadge, SignedQty, StockLevelBadge, formatQty, useDebounced } from '@/features/inventory/shared';
import { CategoriesDialog } from '@/features/inventory/StockDialogs';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
import type { Fabric, InventorySummary, Paginated, StockMovement } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateTime, formatPKR } from '@/utils/format';

function FabricsTab({ stock, setStock }: { stock: string; setStock: (s: string) => void }) {
  const can = useCan();
  const navigate = useNavigate();
  const categories = useFabricCategories();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);
  const qc = useQueryClient();
  const q = useDebounced(search);
  const sortBy = sort?.id ?? 'name';
  const sortOrder = sort?.desc ? 'desc' : 'asc';
  const listParams = { search: q, categoryId, stock, status, sortBy, sortOrder };
  const list = useQuery({
    queryKey: ['inventory', 'fabrics', { q, categoryId, stock, status, sortBy, sortOrder, page, pageSize }],
    queryFn: () => api.get<Paginated<Fabric>>('/inventory/fabrics', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || categoryId || stock !== 'all' || status !== 'active');

  const columns: DataColumn<Fabric>[] = [
    { id: 'code', header: 'Code', sortKey: 'code', value: (f) => f.code, cell: (f) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{f.code}</span> },
    { id: 'name', header: 'Fabric', sortKey: 'name', value: (f) => f.name, text: (f) => [f.name, f.brand, f.color, f.design].filter(Boolean).join(' · '),
      cell: (f) => <><span className="font-medium">{f.name}</span><span className="block text-xs text-muted-foreground">{[f.brand, f.color, f.design].filter(Boolean).join(' · ') || '-'}</span></> },
    { id: 'category', header: 'Category', value: (f) => f.category?.name, className: 'hidden lg:table-cell' },
    { id: 'currentStock', header: 'In stock', type: 'number', sortKey: 'currentStock', value: (f) => f.currentStock, text: (f) => formatQty(f.currentStock, f.unit), cell: (f) => formatQty(f.currentStock, f.unit) },
    { id: 'reserved', header: 'Reserved', type: 'number', value: (f) => f.reservedStock, text: (f) => formatQty(f.reservedStock, f.unit), cell: (f) => (Number(f.reservedStock) ? formatQty(f.reservedStock, f.unit) : '-'), className: 'hidden md:table-cell' },
    { id: 'free', header: 'Free', type: 'number', value: (f) => f.availableStock, text: (f) => formatQty(f.availableStock, f.unit),
      cell: (f) => <span className={cn('font-semibold', f.level === 'OUT' && 'text-rose-700 dark:text-rose-400', f.level === 'LOW' && 'text-amber-700 dark:text-amber-300')}>{formatQty(f.availableStock, f.unit)}</span> },
    { id: 'salePrice', header: 'Sale price', type: 'money', value: (f) => f.salePrice, cell: (f) => formatPKR(f.salePrice), className: 'hidden lg:table-cell' },
    { id: 'stockValue', header: 'Stock value', type: 'money', value: (f) => f.stockValue, cell: (f) => formatPKR(f.stockValue), className: 'hidden xl:table-cell' },
    { id: 'status', header: 'Status', value: (f) => `${f.level}${f.isActive ? '' : ' / Inactive'}`, cell: (f) => <div className="flex flex-wrap gap-1"><StockLevelBadge level={f.level} />{!f.isActive && <Badge variant="secondary">Inactive</Badge>}</div> },
  ];
  const open = (f: Fabric) => navigate(`/inventory/fabrics/${f.id}`);

  return (
    <Card>
        <DataTable
          title="Fabrics"
          module="inventory"
          noun="fabric"
          rows={list.data?.data}
          columns={columns}
          getRowId={(f) => f.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          sort={sort}
          onSortChange={(st) => { setSort(st); setPage(1); }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<Fabric>>('/inventory/fabrics', { ...listParams, page: pg, pageSize: size }))}
          onRowClick={open}
          onView={open}
          onEdit={can('inventory', 'EDIT') ? (f) => { setEditing(f); setAddOpen(true); } : undefined}
          duplicateRow={can('inventory', 'CREATE') ? (f) => api.post('/inventory/fabrics', {
            name: `${f.name} (Copy)`, brand: f.brand ?? '', categoryId: f.category?.id ?? null, color: f.color ?? '', design: f.design ?? '', quality: f.quality ?? '',
            supplierId: f.supplier?.id ?? null, purchasePrice: f.purchasePrice, salePrice: f.salePrice, unit: f.unit, minimumStock: f.minimumStock, location: f.location ?? '', isActive: f.isActive,
          }) : undefined}
          deleteRow={can('inventory', 'DELETE') ? (f) => api.delete(`/inventory/fabrics/${f.id}`) : undefined}
          deleteWarning="Only fabrics with no stock and no history can be deleted; otherwise mark them inactive."
          onChanged={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
          importer={can('inventory', 'CREATE') ? {
            fields: [
              { key: 'name', label: 'Name', required: true, example: 'Wash & Wear White' },
              { key: 'brand', label: 'Brand' }, { key: 'color', label: 'Colour', aliases: ['color'] }, { key: 'design', label: 'Design' }, { key: 'quality', label: 'Quality' },
              { key: 'unit', label: 'Unit', example: 'METER' },
              { key: 'purchasePrice', label: 'Purchase price', example: '850' }, { key: 'salePrice', label: 'Sale price', example: '1200' },
              { key: 'minimumStock', label: 'Minimum stock', example: '20' }, { key: 'openingStock', label: 'Opening stock', example: '50' },
              { key: 'location', label: 'Location' },
            ],
            note: 'Unit: METER, YARD, PIECE or SUIT (default METER). Opening stock is added at the purchase price.',
            createRow: (d) => api.post('/inventory/fabrics', {
              name: d.name, brand: d.brand, color: d.color, design: d.design, quality: d.quality, location: d.location,
              unit: (d.unit || 'METER').toUpperCase(), purchasePrice: d.purchasePrice || '0', salePrice: d.salePrice || '0', minimumStock: d.minimumStock || '0',
              openingStock: d.openingStock && Number(d.openingStock) > 0 ? d.openingStock : undefined,
              openingCost: d.openingStock && Number(d.openingStock) > 0 ? d.purchasePrice || undefined : undefined,
            }),
          } : undefined}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <div className="relative col-span-2 w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Code, name, brand or colour" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search fabrics" />
        </div>
        <NativeSelect aria-label="Category" className="sm:w-44" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); reset(); }}>
          <option value="">All categories</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Stock level" className="sm:w-40" value={stock} onChange={(e) => { setStock(e.target.value); reset(); }}>
          <option value="all">Any stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
        </NativeSelect>
        <NativeSelect aria-label="Status" className="sm:w-36" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
        </NativeSelect>
        {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setCategoryId(''); setStock('all'); setStatus('active'); reset(); }}>Clear filters</Button>}
            </div>
          }
          empty={
            <EmptyState icon={<Layers />} title={filtered ? 'No fabrics match these filters' : 'No fabrics yet'}
          description={filtered ? 'Try another search or clear the filters.' : 'Add the fabrics you keep in the shop, with the stock you have today.'}
          action={!filtered && can('inventory', 'CREATE') ? <Button onClick={() => { setEditing(null); setAddOpen(true); }}><Plus /> Add fabric</Button> : undefined} />
          }
          mobileCard={(f) => (
            <Link to={`/inventory/fabrics/${f.id}`} className="flex items-center gap-3 px-1 py-3">
                  <span className="icon-tile h-12 w-12 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Layers className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{f.code}{f.color ? ` · ${f.color}` : ''}{f.category ? ` · ${f.category.name}` : ''}</span>
                    <span className="block text-sm font-semibold tabular-nums">{formatQty(f.availableStock, f.unit)} <span className="text-xs font-normal text-muted-foreground">free</span></span>
                  </span>
                  <span className="flex flex-col items-end gap-1"><StockLevelBadge level={f.level} /><span className="text-xs text-muted-foreground">{formatPKR(f.salePrice)}</span></span>
                </Link>
          )}
        />
        <FabricFormDialog open={addOpen} onOpenChange={setAddOpen} fabric={editing} onSaved={(f) => { if (!editing) navigate(`/inventory/fabrics/${f.id}`); }} />
    </Card>
  );
}

export function MovementsTable({ rows, showFabric = true, title = 'Stock ledger', pagination, fetchAll, loading, error, onRetry, toolbar, empty }: {
  rows: StockMovement[] | undefined; showFabric?: boolean; title?: string; pagination?: ServerPagination; fetchAll?: () => Promise<StockMovement[]>;
  loading?: boolean; error?: unknown; onRetry?: () => void; toolbar?: ReactNode; empty?: ReactNode;
}) {
  const columns: DataColumn<StockMovement>[] = [
    { id: 'date', header: 'Date', value: (m) => m.movementDate, text: (m) => formatDateTime(m.movementDate), cell: (m) => <span className="whitespace-nowrap text-xs">{formatDateTime(m.movementDate)}</span> },
    { id: 'no', header: 'No.', value: (m) => m.movementNo, cell: (m) => <span className="whitespace-nowrap font-mono text-xs">{m.movementNo}</span> },
    ...(showFabric ? [{ id: 'fabric', header: 'Fabric', value: (m: StockMovement) => m.fabric.name, text: (m: StockMovement) => `${m.fabric.name} (${m.fabric.code})`,
      cell: (m: StockMovement) => <><Link className="font-medium hover:underline" to={`/inventory/fabrics/${m.fabric.id}`} onClick={(e) => e.stopPropagation()}>{m.fabric.name}</Link><span className="block font-mono text-[11px] text-muted-foreground">{m.fabric.code}</span></> }] : []),
    { id: 'type', header: 'Type', value: (m) => m.type, cell: (m) => <MovementBadge type={m.type} direction={m.direction} /> },
    { id: 'details', header: 'Details', value: (m) => m.reason, className: 'hidden md:table-cell',
      cell: (m) => <span className="block max-w-[260px] truncate text-sm" title={m.reason ?? ''}>
        {m.referenceType === 'ORDER' && m.referenceId ? <Link className="hover:underline" to={`/orders/${m.referenceId}`}>{m.reason}</Link>
          : (m.referenceType === 'PURCHASE') && m.referenceId ? <Link className="hover:underline" to={`/purchases/${m.referenceId}`}>{m.reason}</Link> : m.reason ?? '-'}</span> },
    { id: 'qty', header: 'Quantity', type: 'number', value: (m) => (m.direction === 'OUT' ? -Number(m.quantity) : Number(m.quantity)),
      text: (m) => `${m.direction === 'OUT' ? '-' : '+'}${formatQty(m.quantity, m.fabric.unit)}`, cell: (m) => <SignedQty direction={m.direction} quantity={m.quantity} unit={m.fabric.unit} /> },
    { id: 'balance', header: 'Balance', type: 'number', value: (m) => m.balanceAfter, text: (m) => formatQty(m.balanceAfter, m.fabric.unit), cell: (m) => formatQty(m.balanceAfter, m.fabric.unit) },
    { id: 'value', header: 'Value', type: 'money', value: (m) => m.totalCost, cell: (m) => formatPKR(m.totalCost), className: 'hidden lg:table-cell' },
    { id: 'by', header: 'By', value: (m) => m.createdBy?.fullName ?? 'System', className: 'hidden text-xs xl:table-cell' },
  ];
  return (
    <DataTable
      title={title}
      module="inventory"
      noun="entry"
      rows={rows}
      columns={columns}
      getRowId={(m) => m.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      pagination={pagination}
      fetchAll={fetchAll}
      toolbar={toolbar}
      empty={empty}
      mobileCard={(m) => (
        <div className="flex items-start gap-3 px-1 py-3">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5"><MovementBadge type={m.type} direction={m.direction} />{showFabric && <span className="truncate text-sm font-medium">{m.fabric.name}</span>}</span>
            {m.reason && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.reason}</span>}
            <span className="block text-[11px] text-muted-foreground">{m.movementNo} · {formatDateTime(m.movementDate)}</span>
          </span>
          <span className="text-right text-sm tabular-nums"><SignedQty direction={m.direction} quantity={m.quantity} unit={m.fabric.unit} />
            <span className="block text-[11px] text-muted-foreground">Balance {formatQty(m.balanceAfter, m.fabric.unit)}</span></span>
        </div>
      )}
    />
  );
}

function LedgerTab() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const q = useDebounced(search);
  const listParams = { search: q, type, from, to };
  const list = useQuery({
    queryKey: ['inventory', 'movements', { q, type, from, to, page, pageSize }],
    queryFn: () => api.get<Paginated<StockMovement>>('/inventory/movements', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  return (
    <Card>
      <MovementsTable
        rows={list.data?.data}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
        fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<StockMovement>>('/inventory/movements', { ...listParams, page: pg, pageSize: size }))}
        empty={<EmptyState icon={<History />} title="No stock changes" description="Opening stock, purchases, orders and adjustments appear here." />}
        toolbar={
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <div className="relative col-span-2 w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Fabric, number or reason" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search stock ledger" />
            </div>
            <NativeSelect aria-label="Type" className="col-span-2 sm:w-48" value={type} onChange={(e) => { setType(e.target.value); reset(); }}>
              <option value="">All types</option>{MOVEMENT_TYPES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </NativeSelect>
            <Input type="date" aria-label="From date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
            <Input type="date" aria-label="To date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} />
          </div>
        }
      />
    </Card>
  );
}

export function InventoryPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'ledger' ? 'ledger' : 'fabrics';
  const [stock, setStock] = useState(() => params.get('stock') ?? 'all');
  const [catOpen, setCatOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const summary = useQuery({ queryKey: ['inventory', 'summary'], queryFn: () => api.get<InventorySummary>('/inventory/summary') });
  const s = summary.data;
  const showLevel = (level: string) => { setStock(level); setParams({}, { replace: true }); };

  return (
    <div>
      <PageHeader
        title="Fabric Inventory"
        description="Fabric stock, reservations for orders and every stock change."
        actions={<>
          <Button variant="outline" onClick={() => setCatOpen(true)}><FolderTree /> Categories</Button>
          {can('purchases', 'CREATE') && <Button variant="gold" onClick={() => navigate('/purchases/new')}><ShoppingCart /> New purchase</Button>}
          {can('inventory', 'CREATE') && <Button onClick={() => setAddOpen(true)}><Plus /> Add fabric</Button>}
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Stock value" value={formatPKR(s?.stockValue)} icon={Wallet} loading={summary.isLoading} hint="At average cost" />
        <StatCard label="Active fabrics" value={String(s?.activeFabrics ?? 0)} icon={Boxes} tile="blue" loading={summary.isLoading} hint={s && Number(s.reservedQuantity) ? `${formatQty(s.reservedQuantity)} reserved for orders` : 'Nothing reserved'} />
        <button type="button" className="text-left" onClick={() => showLevel('low')}>
          <StatCard label="Low stock" value={String(s?.lowStock ?? 0)} icon={AlertTriangle} tile="gold" loading={summary.isLoading} hint="At or below minimum" className="h-full hover:border-primary" />
        </button>
        <button type="button" className="text-left" onClick={() => showLevel('out')}>
          <StatCard label="Out of stock" value={String(s?.outOfStock ?? 0)} icon={PackageX} tile="rose" tone={s?.outOfStock ? 'negative' : undefined} loading={summary.isLoading} hint="Nothing free to use" className="h-full hover:border-primary" />
        </button>
      </div>
      {!!s?.lowStockItems.length && (
        <Card className="mb-4 border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> Reorder soon</p>
          <div className="flex flex-wrap gap-2">
            {s.lowStockItems.map((f) => (
              <Link key={f.id} to={`/inventory/fabrics/${f.id}`} className="rounded-full border border-amber-300 bg-card px-3 py-1 text-xs font-medium hover:border-primary dark:border-amber-500/40">
                {f.name} <span className="text-muted-foreground">· {formatQty(f.availableStock, f.unit)} left (min {formatQty(f.minimumStock)})</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'ledger' ? { tab: 'ledger' } : {}, { replace: true })}>
        <TabsList>
          <TabsTrigger value="fabrics">Fabrics</TabsTrigger>
          <TabsTrigger value="ledger">Stock ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="fabrics" className="mt-4"><FabricsTab stock={stock} setStock={setStock} /></TabsContent>
        <TabsContent value="ledger" className="mt-4"><LedgerTab /></TabsContent>
      </Tabs>
      <CategoriesDialog open={catOpen} onOpenChange={setCatOpen} />
      <FabricFormDialog open={addOpen} onOpenChange={setAddOpen} fabric={null} onSaved={(f) => navigate(`/inventory/fabrics/${f.id}`)} />
    </div>
  );
}
