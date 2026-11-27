import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, ClipboardList, Eye, Plus, Search, Settings2, Shirt, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatCard } from '@/features/dashboard/StatCard';
import { LifecycleBadge, OverdueBadge, PaymentBadge, StageBadge } from '@/features/orders/badges';
import { WorkflowStagesDialog } from '@/features/orders/WorkflowStagesDialog';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
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
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [stagesOpen, setStagesOpen] = useState(false);
  useEffect(() => {
    if (params.get('search') !== null || params.get('due') !== null || params.get('lifecycle') !== null) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const q = useDebounced(search);
  const [sortBy, sortOrder] = sort.split(':');

  const summary = useQuery({ queryKey: ['orders', 'summary'], queryFn: () => api.get<OrderSummary>('/orders/summary') });
  const orders = useQuery({
    queryKey: ['orders', 'list', { q, stageId, lifecycle, paymentStatus, due, sort, page }],
    queryFn: () => api.get<Paginated<OrderListRow>>('/orders', { search: q, stageId, lifecycle: lifecycle === 'ALL' ? '' : lifecycle, paymentStatus, due, sortBy, sortOrder, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;
  const reset = () => setPage(1);
  const filtered = !!(q || stageId || paymentStatus || due || lifecycle !== 'ACTIVE');

  const chip = (active: boolean, label: string, onClick: () => void, count?: number) => (
    <button type="button" onClick={onClick}
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
        <div className="grid grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
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
          <NativeSelect aria-label="Sort" className="sm:w-44" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="createdAt:desc">Newest first</option><option value="expectedDeliveryDate:asc">Delivery date (soonest)</option>
            <option value="orderDate:asc">Oldest first</option><option value="balanceAmount:desc">Highest balance</option>
          </NativeSelect>
          {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setStageId(''); setLifecycle('ACTIVE'); setPaymentStatus(''); setDue(''); reset(); }}>Clear filters</Button>}
        </div>

        {orders.isError ? <ErrorState message={errorMessage(orders.error)} onRetry={() => orders.refetch()} /> : orders.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : orders.data!.data.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={filtered ? 'No orders match these filters' : 'No orders yet'}
            description={filtered ? 'Try another search or clear the filters.' : "You haven't booked any order yet. Tap the button below to add a new order."}
            action={can('orders', 'CREATE') && !filtered ? <Button onClick={() => navigate('/orders/new')}><Plus /> Add order</Button> : undefined} />
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y sm:hidden">
              {orders.data!.data.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/50">
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
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <THead><TR>
                  <TH>Order #</TH><TH>Customer</TH><TH className="hidden lg:table-cell">Garments</TH><TH className="text-right">Amount</TH>
                  <TH className="hidden md:table-cell text-right">Balance</TH><TH>Status</TH><TH>Delivery</TH><TH className="w-12"><span className="sr-only">Actions</span></TH>
                </TR></THead>
                <TBody>
                  {orders.data!.data.map((o) => (
                    <TR key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/orders/${o.id}`)}>
                      <TD className="whitespace-nowrap font-semibold">{o.orderNumber}</TD>
                      <TD><span className="font-medium">{o.customer.name}</span><span className="block text-xs text-muted-foreground">{formatPhone(o.customer.mobile)}</span></TD>
                      <TD className="hidden max-w-[220px] truncate lg:table-cell" title={o.garments}>{o.garments}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{formatPKR(o.totalAmount)}</TD>
                      <TD className={cn('hidden whitespace-nowrap text-right tabular-nums md:table-cell', Number(o.balanceAmount) > 0 && 'font-medium text-rose-700 dark:text-rose-400')}>{formatPKR(o.balanceAmount)}</TD>
                      <TD><div className="flex flex-wrap gap-1"><StageBadge stage={o.stage} /><LifecycleBadge lifecycle={o.lifecycle} />{o.lifecycle !== 'CANCELLED' && <PaymentBadge status={o.paymentStatus} />}</div></TD>
                      <TD className="whitespace-nowrap">{formatDate(o.expectedDeliveryDate)}{o.isOverdue && <span className="block"><OverdueBadge /></span>}</TD>
                      <TD><Button variant="ghost" size="icon" aria-label={`Open ${o.orderNumber}`} asChild><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}><Eye /></Link></Button></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
        {orders.data && orders.data.meta.total > 0 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">{orders.data.meta.total} orders · page {orders.data.meta.page} of {orders.data.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= orders.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <WorkflowStagesDialog open={stagesOpen} onOpenChange={setStagesOpen} />
    </div>
  );
}
