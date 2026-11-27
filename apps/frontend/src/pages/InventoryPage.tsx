import { MOVEMENT_TYPES } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Eye, FolderTree, History, Layers, PackageX, Plus, Search, ShoppingCart, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { FabricFormDialog, useFabricCategories } from '@/features/inventory/FabricFormDialog';
import { MovementBadge, SignedQty, StockLevelBadge, formatQty, useDebounced } from '@/features/inventory/shared';
import { CategoriesDialog } from '@/features/inventory/StockDialogs';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Fabric, InventorySummary, Paginated, StockMovement } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateTime, formatPKR } from '@/utils/format';

function Pager({ meta, page, setPage, noun }: { meta: Paginated<unknown>['meta']; page: number; setPage: (fn: (p: number) => number) => void; noun: string }) {
  if (!meta.total) return null;
  return (
    <div className="flex items-center justify-between border-t p-3 text-sm">
      <span className="text-muted-foreground">{meta.total} {noun} · page {meta.page} of {meta.totalPages}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}

function FabricsTab({ stock, setStock }: { stock: string; setStock: (s: string) => void }) {
  const can = useCan();
  const navigate = useNavigate();
  const categories = useFabricCategories();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('name:asc');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const q = useDebounced(search);
  const [sortBy, sortOrder] = sort.split(':');
  const list = useQuery({
    queryKey: ['inventory', 'fabrics', { q, categoryId, stock, status, sort, page }],
    queryFn: () => api.get<Paginated<Fabric>>('/inventory/fabrics', { search: q, categoryId, stock, status, sortBy, sortOrder, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || categoryId || stock !== 'all' || status !== 'active');

  return (
    <Card>
      <div className="grid grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
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
        <NativeSelect aria-label="Sort" className="sm:w-44" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name:asc">Name (A-Z)</option><option value="code:asc">Code</option><option value="currentStock:asc">Lowest stock first</option>
          <option value="currentStock:desc">Highest stock first</option><option value="createdAt:desc">Newest first</option>
        </NativeSelect>
        {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setCategoryId(''); setStock('all'); setStatus('active'); reset(); }}>Clear filters</Button>}
      </div>
      {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !list.data!.data.length ? (
        <EmptyState icon={<Layers />} title={filtered ? 'No fabrics match these filters' : 'No fabrics yet'}
          description={filtered ? 'Try another search or clear the filters.' : 'Add the fabrics you keep in the shop, with the stock you have today.'}
          action={!filtered && can('inventory', 'CREATE') ? <Button onClick={() => setAddOpen(true)}><Plus /> Add fabric</Button> : undefined} />
      ) : (
        <>
          <ul className="divide-y sm:hidden">
            {list.data!.data.map((f) => (
              <li key={f.id}>
                <Link to={`/inventory/fabrics/${f.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/50">
                  <span className="icon-tile h-12 w-12 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Layers className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{f.code}{f.color ? ` · ${f.color}` : ''}{f.category ? ` · ${f.category.name}` : ''}</span>
                    <span className="block text-sm font-semibold tabular-nums">{formatQty(f.availableStock, f.unit)} <span className="text-xs font-normal text-muted-foreground">free</span></span>
                  </span>
                  <span className="flex flex-col items-end gap-1"><StockLevelBadge level={f.level} /><span className="text-xs text-muted-foreground">{formatPKR(f.salePrice)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Table>
              <THead><TR>
                <TH>Code</TH><TH>Fabric</TH><TH className="hidden lg:table-cell">Category</TH><TH className="text-right">In stock</TH>
                <TH className="hidden md:table-cell text-right">Reserved</TH><TH className="text-right">Free</TH><TH className="hidden lg:table-cell text-right">Sale price</TH>
                <TH className="hidden xl:table-cell text-right">Stock value</TH><TH>Status</TH><TH className="w-12"><span className="sr-only">Open</span></TH>
              </TR></THead>
              <TBody>
                {list.data!.data.map((f) => (
                  <TR key={f.id} className="cursor-pointer" onClick={() => navigate(`/inventory/fabrics/${f.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/inventory/fabrics/${f.id}`)}>
                    <TD className="whitespace-nowrap font-mono text-xs font-semibold">{f.code}</TD>
                    <TD><span className="font-medium">{f.name}</span><span className="block text-xs text-muted-foreground">{[f.brand, f.color, f.design].filter(Boolean).join(' · ') || '-'}</span></TD>
                    <TD className="hidden lg:table-cell">{f.category?.name ?? <span className="text-muted-foreground">-</span>}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatQty(f.currentStock, f.unit)}</TD>
                    <TD className="hidden whitespace-nowrap text-right tabular-nums md:table-cell">{Number(f.reservedStock) ? formatQty(f.reservedStock, f.unit) : '-'}</TD>
                    <TD className={cn('whitespace-nowrap text-right font-semibold tabular-nums', f.level === 'OUT' && 'text-rose-700 dark:text-rose-400', f.level === 'LOW' && 'text-amber-700 dark:text-amber-300')}>{formatQty(f.availableStock, f.unit)}</TD>
                    <TD className="hidden whitespace-nowrap text-right tabular-nums lg:table-cell">{formatPKR(f.salePrice)}</TD>
                    <TD className="hidden whitespace-nowrap text-right tabular-nums xl:table-cell">{formatPKR(f.stockValue)}</TD>
                    <TD><div className="flex flex-wrap gap-1"><StockLevelBadge level={f.level} />{!f.isActive && <Badge variant="secondary">Inactive</Badge>}</div></TD>
                    <TD><Button variant="ghost" size="icon" aria-label={`Open ${f.code}`} asChild><Link to={`/inventory/fabrics/${f.id}`} onClick={(e) => e.stopPropagation()}><Eye /></Link></Button></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
      {list.data && <Pager meta={list.data.meta} page={page} setPage={setPage} noun="fabrics" />}
      <FabricFormDialog open={addOpen} onOpenChange={setAddOpen} fabric={null} onSaved={(f) => navigate(`/inventory/fabrics/${f.id}`)} />
    </Card>
  );
}

export function MovementsTable({ rows, showFabric = true }: { rows: StockMovement[]; showFabric?: boolean }) {
  return (
    <>
      <ul className="divide-y sm:hidden">
        {rows.map((m) => (
          <li key={m.id} className="flex items-start gap-3 px-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5"><MovementBadge type={m.type} direction={m.direction} />{showFabric && <span className="truncate text-sm font-medium">{m.fabric.name}</span>}</span>
              {m.reason && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.reason}</span>}
              <span className="block text-[11px] text-muted-foreground">{m.movementNo} · {formatDateTime(m.movementDate)}</span>
            </span>
            <span className="text-right text-sm tabular-nums"><SignedQty direction={m.direction} quantity={m.quantity} unit={m.fabric.unit} />
              <span className="block text-[11px] text-muted-foreground">Balance {formatQty(m.balanceAfter, m.fabric.unit)}</span></span>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <THead><TR>
            <TH>Date</TH><TH>No.</TH>{showFabric && <TH>Fabric</TH>}<TH>Type</TH><TH className="hidden md:table-cell">Details</TH>
            <TH className="text-right">Quantity</TH><TH className="text-right">Balance</TH><TH className="hidden lg:table-cell text-right">Value</TH><TH className="hidden xl:table-cell">By</TH>
          </TR></THead>
          <TBody>
            {rows.map((m) => (
              <TR key={m.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(m.movementDate)}</TD>
                <TD className="whitespace-nowrap font-mono text-xs">{m.movementNo}</TD>
                {showFabric && <TD><Link className="font-medium hover:underline" to={`/inventory/fabrics/${m.fabric.id}`}>{m.fabric.name}</Link><span className="block font-mono text-[11px] text-muted-foreground">{m.fabric.code}</span></TD>}
                <TD><MovementBadge type={m.type} direction={m.direction} /></TD>
                <TD className="hidden max-w-[260px] truncate text-sm md:table-cell" title={m.reason ?? ''}>
                  {m.referenceType === 'ORDER' && m.referenceId ? <Link className="hover:underline" to={`/orders/${m.referenceId}`}>{m.reason}</Link>
                    : (m.referenceType === 'PURCHASE') && m.referenceId ? <Link className="hover:underline" to={`/purchases/${m.referenceId}`}>{m.reason}</Link> : m.reason ?? '-'}
                </TD>
                <TD className="whitespace-nowrap text-right tabular-nums"><SignedQty direction={m.direction} quantity={m.quantity} unit={m.fabric.unit} /></TD>
                <TD className="whitespace-nowrap text-right tabular-nums">{formatQty(m.balanceAfter, m.fabric.unit)}</TD>
                <TD className="hidden whitespace-nowrap text-right tabular-nums lg:table-cell">{formatPKR(m.totalCost)}</TD>
                <TD className="hidden text-xs xl:table-cell">{m.createdBy?.fullName ?? 'System'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

function LedgerTab() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const list = useQuery({
    queryKey: ['inventory', 'movements', { q, type, from, to, page }],
    queryFn: () => api.get<Paginated<StockMovement>>('/inventory/movements', { search: q, type, from, to, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  return (
    <Card>
      <div className="grid grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
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
      {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !list.data!.data.length ? (
        <EmptyState icon={<History />} title="No stock changes" description="Opening stock, purchases, orders and adjustments appear here." />
      ) : <MovementsTable rows={list.data!.data} />}
      {list.data && <Pager meta={list.data.meta} page={page} setPage={setPage} noun="entries" />}
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
