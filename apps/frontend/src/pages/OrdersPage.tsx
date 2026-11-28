import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, ClipboardList, Plus, Search, Settings2, Shirt, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, type SortState, fetchAllPages } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { StatCard } from '@/features/dashboard/StatCard';
import { LifecycleBadge, OverdueBadge, PaymentBadge, StageBadge } from '@/features/orders/badges';
import { WorkflowStagesDialog } from '@/features/orders/WorkflowStagesDialog';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
import type { OrderListRow, OrderSummary, Paginated } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Order list: stage chips, search, filters; table on desktop, cards on phones. */
export function OrdersPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('search') ?? '');
  const [stageId, setStageId] = useState('');
  const [lifecycle, setLifecycle] = useState(() => params.get('lifecycle') ?? 'ACTIVE');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [due, setDue] = useState(() => params.get('due') ?? '');
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const qc = useQueryClient();
  const [stagesOpen, setStagesOpen] = useState(false);
  useEffect(() => {
    if (params.get('search') !== null || params.get('due') !== null || params.get('lifecycle') !== null) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const q = useDebounced(search);
  const sortBy = sort?.id ?? 'createdAt';
  const sortOrder = sort ? (sort.desc ? 'desc' : 'asc') : 'desc';
  const listParams = { search: q, stageId, lifecycle: lifecycle === 'ALL' ? '' : lifecycle, paymentStatus, due, sortBy, sortOrder };

  const summary = useQuery({ queryKey: ['orders', 'summary'], queryFn: () => api.get<OrderSummary>('/orders/summary') });
  const orders = useQuery({
    queryKey: ['orders', 'list', { q, stageId, lifecycle, paymentStatus, due, sortBy, sortOrder, page, pageSize }],
    queryFn: () => api.get<Paginated<OrderListRow>>('/orders', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;
  const reset = () => setPage(1);
  const filtered = !!(q || stageId || paymentStatus || due || lifecycle !== 'ACTIVE');

  const columns: DataColumn<OrderListRow>[] = [
    { id: 'orderNumber', header: 'Order #', sortKey: 'orderNumber', value: (o) => o.orderNumber, cell: (o) => <span className="whitespace-nowrap font-semibold">{o.orderNumber}</span> },
    { id: 'orderDate', header: 'Date', sortKey: 'orderDate', value: (o) => o.orderDate, text: (o) => formatDate(o.orderDate), className: 'hidden whitespace-nowrap 2xl:table-cell' },
    { id: 'customer', header: 'Customer', value: (o) => o.customer.name, text: (o) => `${o.customer.name} (${formatPhone(o.customer.mobile)})`,
      cell: (o) => <><span className="whitespace-nowrap font-medium">{o.customer.name}</span><span className="block whitespace-nowrap text-xs text-muted-foreground">{formatPhone(o.customer.mobile)}</span></> },
    { id: 'garments', header: 'Garments', value: (o) => o.garments, cell: (o) => <span className="block max-w-[220px] truncate" title={o.garments}>{o.garments}</span>, className: 'hidden xl:table-cell' },
    { id: 'totalAmount', header: 'Amount', type: 'money', value: (o) => o.totalAmount, cell: (o) => formatPKR(o.totalAmount) },
    { id: 'balanceAmount', header: 'Balance', type: 'money', sortKey: 'balanceAmount', value: (o) => o.balanceAmount, className: 'hidden md:table-cell',
      cell: (o) => <span className={cn(Number(o.balanceAmount) > 0 && 'font-medium text-rose-700 dark:text-rose-400')}>{formatPKR(o.balanceAmount)}</span> },
    { id: 'status', header: 'Status', value: (o) => o.stage.name, text: (o) => `${o.stage.name} / ${o.lifecycle} / ${o.paymentStatus}`,
      cell: (o) => <div className="flex flex-wrap gap-1"><StageBadge stage={o.stage} /><LifecycleBadge lifecycle={o.lifecycle} />{o.lifecycle !== 'CANCELLED' && <PaymentBadge status={o.paymentStatus} />}</div> },
    { id: 'delivery', header: 'Delivery', sortKey: 'expectedDeliveryDate', value: (o) => o.expectedDeliveryDate, text: (o) => formatDate(o.expectedDeliveryDate),
      cell: (o) => <span className="whitespace-nowrap">{formatDate(o.expectedDeliveryDate)}{o.isOverdue && <span className="block"><OverdueBadge /></span>}</span> },
  ];
  const open = (o: OrderListRow) => navigate(`/orders/${o.id}`);

  const chip = (active: boolean, label: string, onClick: () => void, count?: number) => (
    <button key={label} type="button" onClick={onClick}
      className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary hover:text-foreground')}>
      {label}{count !== undefined && <span className={cn('tabular-nums', active ? 'opacity-90' : 'text-foreground/70')}>({count})</span>}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Track every order from booking to delivery."
        actions={<>
          {can('orders', 'MANAGE_SETTINGS') && <Button variant="outline" onClick={() => setStagesOpen(true)}><Settings2 /> Workflow stages</Button>}
          {can('orders', 'CREATE') && <Button onClick={() => navigate('/orders/new')}><Plus /> New order</Button>}
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Open orders" value={String(s?.openOrders ?? 0)} icon={ClipboardList} loading={summary.isLoading} hint="Booked, not yet delivered" />
        <button type="button" className="text-left" onClick={() => { setDue('overdue'); setLifecycle('ACTIVE'); reset(); }}>
          <StatCard label="Overdue" value={String(s?.overdue ?? 0)} icon={AlarmClock} tile="rose" loading={summary.isLoading} tone={s?.overdue ? 'negative' : undefined} hint="Past delivery date" className="h-full hover:border-primary" />
        </button>
        <button type="button" className="text-left" onClick={() => { setDue('today'); setLifecycle('ACTIVE'); reset(); }}>
          <StatCard label="Due today" value={String(s?.dueToday ?? 0)} icon={CalendarClock} tile="gold" loading={summary.isLoading} hint={s ? `${s.dueTomorrow} due tomorrow` : undefined} className="h-full hover:border-primary" />
        </button>
        <StatCard label="To collect" value={formatPKR(s?.outstanding)} icon={Wallet} tile="blue" loading={summary.isLoading} hint="Balance on orders" />
      </div>

      <Card>
        <div className="flex gap-2 overflow-x-auto border-b p-3" role="toolbar" aria-label="Filter by stage">
          {chip(!stageId, 'All open', () => { setStageId(''); reset(); }, s?.openOrders)}
          {s?.stages.filter((st) => st.count > 0 || st.code === 'NEW').map((st) => chip(stageId === st.id, st.name, () => { setStageId(st.id); setLifecycle('ACTIVE'); reset(); }, st.count))}
        </div>
        <DataTable
          title="Orders"
          module="orders"
          noun="order"
          rows={orders.data?.data}
          columns={columns}
          getRowId={(o) => o.id}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => orders.refetch()}
          pagination={{ page, pageSize, total: orders.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          sort={sort}
          onSortChange={(st) => { setSort(st); setPage(1); }}
          fetchAll={() => fetchAllPages((p, size) => api.get<Paginated<OrderListRow>>('/orders', { ...listParams, page: p, pageSize: size }))}
          onRowClick={open}
          onView={open}
          onEdit={can('orders', 'EDIT') ? (o) => navigate(`/orders/${o.id}/edit`) : undefined}
          onDuplicate={can('orders', 'CREATE') ? (o) => navigate(`/orders/new?from=${o.id}`) : undefined}
          deleteRow={can('orders', 'DELETE') ? (o) => api.post(`/orders/${o.id}/cancel`, { reason: 'Deleted from the order list' }) : undefined}
          canRow={(a, o) => (a === 'edit' ? ['OPEN', 'PARTIALLY_DELIVERED'].includes(o.lifecycle) : a === 'delete' ? o.lifecycle !== 'CANCELLED' && o.lifecycle !== 'DELIVERED' : true)}
          deleteWarning="Orders are never erased: they are marked Cancelled (kept in history), and fabric and accounts are reversed."
          onChanged={() => qc.invalidateQueries({ queryKey: ['orders'] })}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Order no., customer or mobile" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search orders" />
          </div>
          <NativeSelect aria-label="Order status" className="sm:w-40" value={lifecycle} onChange={(e) => { setLifecycle(e.target.value); reset(); }}>
            <option value="ACTIVE">Open orders</option><option value="ALL">All orders</option><option value="OPEN">Not delivered</option>
            <option value="PARTIALLY_DELIVERED">Part delivered</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option>
          </NativeSelect>
          <NativeSelect aria-label="Delivery due" className="sm:w-36" value={due} onChange={(e) => { setDue(e.target.value); reset(); }}>
            <option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="tomorrow">Due tomorrow</option><option value="week">Due in 7 days</option>
          </NativeSelect>
          <NativeSelect aria-label="Payment" className="sm:w-36" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); reset(); }}>
            <option value="">Any payment</option><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partly paid</option><option value="PAID">Paid</option><option value="OVERPAID">Credit</option>
          </NativeSelect>
          {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setStageId(''); setLifecycle('ACTIVE'); setPaymentStatus(''); setDue(''); reset(); }}>Clear filters</Button>}
            </div>
          }
          empty={
            <EmptyState icon={<ClipboardList />} title={filtered ? 'No orders match these filters' : 'No orders yet'}
              description={filtered ? 'Try another search or clear the filters.' : "You haven't booked any order yet. Tap the button below to add a new order."}
              action={can('orders', 'CREATE') && !filtered ? <Button onClick={() => navigate('/orders/new')}><Plus /> Add order</Button> : undefined} />
          }
          mobileCard={(o) => (
            <Link to={`/orders/${o.id}`} className="flex items-center gap-3 px-1 py-3">
              <span className="icon-tile h-12 w-12 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Shirt className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="font-semibold">{o.orderNumber}</span>{o.isOverdue && <OverdueBadge />}</span>
                <span className="block truncate text-sm text-muted-foreground">{o.customer.name}</span>
                <span className="block text-sm font-semibold tabular-nums">{formatPKR(o.totalAmount)}
                  {Number(o.balanceAmount) > 0 && <span className="ml-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">({formatPKR(o.balanceAmount)} due)</span>}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <StageBadge stage={o.stage} />
                <span className="text-[11px] text-muted-foreground">{formatDate(o.expectedDeliveryDate)}</span>
              </span>
            </Link>
          )}
        />
      </Card>
      <WorkflowStagesDialog open={stagesOpen} onOpenChange={setStagesOpen} />
    </div>
  );
}
