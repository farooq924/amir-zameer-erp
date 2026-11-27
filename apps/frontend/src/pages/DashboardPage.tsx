import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, CheckCircle2, ClipboardList, Clock, FileText, Layers, PackageCheck, PackagePlus, Plus, Receipt, Ruler, Scissors,
  Shirt, TrendingUp, UserPlus, Wallet, type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SuitArt } from '@/components/brand';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCan } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { useState } from 'react';
import { ErrorState } from '@/components/common';
import { ChartCard, MoneyBars, MoneyLine, RankedBars, StatusDonut, TrendArea } from '@/features/dashboard/charts';
import { DateRangeFilter, type RangeValue } from '@/features/dashboard/DateRangeFilter';
import { StatCard } from '@/features/dashboard/StatCard';
import { api, errorMessage } from '@/services/api';
import type { DashboardCharts, DashboardSummary } from '@/types';
import { formatDate, formatMonth, formatPKR } from '@/utils/format';

const sumOf = (rows: Record<string, string | number>[], key: string) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);

/** Stages grouped into the five states owners talk about. */
const STATUS_GROUPS: { label: string; color: string; codes: string[] }[] = [
  { label: 'Pending', color: '#b8892a', codes: ['NEW', 'MEASUREMENT_DONE', 'FABRIC_ALLOCATED'] },
  { label: 'In Production', color: '#2c4f9a', codes: ['CUTTING', 'STITCHING', 'QUALITY_CHECK', 'TRIAL', 'ALTERATION'] },
  { label: 'Ready', color: '#13996b', codes: ['READY'] },
  { label: 'Delivered', color: '#8b5cf6', codes: ['DELIVERED'] },
  { label: 'Cancelled', color: '#8b95a7', codes: ['CANCELLED'] },
];

function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Karachi' }));
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

function QuickAction({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <Link to={to} className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-center text-xs font-medium transition-colors hover:border-primary hover:bg-accent">
      <Icon className="h-6 w-6 text-primary" />{label}
    </Link>
  );
}

export function DashboardPage() {
  const user = useAuth((s) => s.user);
  const can = useCan();
  const [range, setRange] = useState<RangeValue>({ preset: 'today' });
  const ready = range.preset !== 'custom' || (!!range.from && !!range.to && range.from <= range.to);
  const params = { preset: range.preset, from: range.preset === 'custom' ? range.from : undefined, to: range.preset === 'custom' ? range.to : undefined };

  const summary = useQuery({ queryKey: ['dashboard', 'summary', params], queryFn: () => api.get<DashboardSummary>('/dashboard/summary', params), enabled: ready });
  const charts = useQuery({ queryKey: ['dashboard', 'charts', params], queryFn: () => api.get<DashboardCharts>('/dashboard/charts', params), enabled: ready });

  const c = summary.data?.cards;
  const l = summary.isLoading;
  const ch = charts.data;
  const profit = Number(c?.netProfit ?? 0);
  const statusRows = STATUS_GROUPS.map((g) => ({ label: g.label, color: g.color, value: (ch?.orderStatus ?? []).filter((s) => g.codes.includes(s.code)).reduce((a, s) => a + s.count, 0) }));
  const otherStages = (ch?.orderStatus ?? []).filter((s) => !STATUS_GROUPS.some((g) => g.codes.includes(s.code))).reduce((a, s) => a + s.count, 0);
  if (otherStages) statusRows.push({ label: 'Other', color: '#5b6b8c', value: otherStages });

  const actions = [
    can('orders', 'CREATE') && { to: '/orders/new', label: 'New Order', icon: Plus },
    can('customers', 'CREATE') && { to: '/customers?new=1', label: 'Add Customer', icon: UserPlus },
    can('measurements', 'VIEW') && { to: '/measurements', label: 'Measurements', icon: Ruler },
    can('purchases', 'CREATE') && { to: '/purchases/new', label: 'Receive Fabric', icon: PackagePlus },
    can('production', 'VIEW') && { to: '/production', label: 'Production', icon: Scissors },
    can('payments', 'CREATE') && { to: '/payments', label: 'Receive Payment', icon: FileText },
  ].filter(Boolean) as { to: string; label: string; icon: LucideIcon }[];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <SuitArt className="hidden h-20 w-16 shrink-0 sm:block" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{greeting()}, {user?.fullName.split(' ')[0] ?? ''}</h1>
            <p className="text-sm text-muted-foreground">
              Here&apos;s what&apos;s happening in your tailoring business{summary.data ? ` (${formatDate(summary.data.range.from)} - ${formatDate(summary.data.range.to)})` : ''}.
            </p>
          </div>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {summary.isError ? <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard className="col-span-2 lg:col-span-1" featured label="Total Sales" value={formatPKR(c?.totalSales)} icon={Shirt} loading={l} hint="Order value in period" />
            <StatCard label="Stitching Revenue" value={formatPKR(c?.stitchingRevenue)} icon={Scissors} tile="gold" loading={l} />
            <StatCard label="Fabric Sales" value={formatPKR(c?.fabricSales)} icon={Layers} tile="purple" loading={l} />
            <StatCard label="Total Orders" value={String(c?.totalOrders ?? 0)} icon={ClipboardList} tile="green" loading={l} hint={c?.cancelledOrders ? `${c.cancelledOrders} cancelled` : 'Booked in period'} />
            <StatCard label="Net Profit" value={formatPKR(c?.netProfit)} icon={TrendingUp} tile="gold" loading={l} tone={profit < 0 ? 'negative' : undefined} hint="From posted accounts" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
            <StatCard compact label="Cash Received" value={formatPKR(c?.cashReceived)} icon={Banknote} tile="green" loading={l} />
            <StatCard compact label="Expenses" value={formatPKR(c?.totalExpenses)} icon={Receipt} tile="rose" loading={l} />
            <StatCard compact label="Pending Orders" value={String(c?.pendingOrders ?? 0)} icon={Clock} tile="gold" loading={l} />
            <StatCard compact label="Ready Orders" value={String(c?.completedOrders ?? 0)} icon={CheckCircle2} tile="blue" loading={l} />
            <StatCard compact label="Delivered" value={String(c?.deliveredOrders ?? 0)} icon={PackageCheck} tile="purple" loading={l} />
            <StatCard compact label="Outstanding" value={formatPKR(c?.customerOutstanding)} icon={Wallet} tile="rose" loading={l} />
            {can('inventory', 'VIEW') ? (
              <Link to={c?.lowStockItems ? '/inventory?stock=low' : '/inventory'} className="block">
                <StatCard compact label="Fabric Stock" value={formatPKR(c?.fabricStockValue)} icon={c?.lowStockItems ? AlertTriangle : Layers} tile={c?.lowStockItems ? 'rose' : 'slate'} loading={l}
                  hint={c?.lowStockItems ? `${c.lowStockItems} low stock` : undefined} className="h-full hover:border-primary" />
              </Link>
            ) : (
              <StatCard compact label="Fabric Stock" value={formatPKR(c?.fabricStockValue)} icon={c?.lowStockItems ? AlertTriangle : Layers} tile="slate" loading={l}
                hint={c?.lowStockItems ? `${c.lowStockItems} low stock` : undefined} />
            )}
          </div>
        </>
      )}

      {charts.isError ? <ErrorState message={errorMessage(charts.error)} onRetry={() => charts.refetch()} /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Sales & Revenue Trend" description="Last 12 months" loading={charts.isLoading} empty={!ch || sumOf(ch.monthlyRevenue, 'total') === 0}>
              {ch && <TrendArea data={ch.monthlyRevenue} xKey="month" xFormat={formatMonth} series={[{ key: 'total', name: 'Total Sales' }, { key: 'stitching', name: 'Stitching Revenue' }]} />}
            </ChartCard>
            <ChartCard title="Orders by Status" description="Orders booked in the period" loading={charts.isLoading} empty={!ch || statusRows.every((r) => r.value === 0)}>
              <StatusDonut rows={statusRows} totalLabel="Total Orders" />
            </ChartCard>
            <Card>
              <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                {actions.map((a) => <QuickAction key={a.label} {...a} />)}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Daily Sales" description="Order value per day in the selected period" loading={charts.isLoading}
              empty={!ch || sumOf(ch.dailySales, 'total') === 0}>
              {ch && <MoneyBars data={ch.dailySales} xKey="date" series={[{ key: 'total', name: 'Sales' }]} xFormat={(d) => d.slice(8, 10) + '/' + d.slice(5, 7)} />}
            </ChartCard>
            <ChartCard title="Stitching vs Fabric Sales" description="Last 12 months" loading={charts.isLoading} empty={!ch || sumOf(ch.monthlyRevenue, 'total') === 0}>
              {ch && <MoneyBars data={ch.monthlyRevenue} xKey="month" stacked xFormat={formatMonth}
                series={[{ key: 'stitching', name: 'Stitching' }, { key: 'fabric', name: 'Fabric' }]} />}
            </ChartCard>
            <ChartCard title="Monthly Expenses" description="Last 12 months, approved only" loading={charts.isLoading} empty={!ch || sumOf(ch.monthlyExpenses, 'total') === 0}>
              {ch && <MoneyBars data={ch.monthlyExpenses} xKey="month" series={[{ key: 'total', name: 'Expenses' }]} xFormat={formatMonth} />}
            </ChartCard>
            <ChartCard title="Profit Trend" description="Income minus expenses from posted accounting entries" loading={charts.isLoading}
              empty={!ch || ch.profitTrend.every((r) => Number(r.income) === 0 && Number(r.expense) === 0)}>
              {ch && <MoneyLine data={ch.profitTrend} xKey="month" yKey="profit" name="Net profit" xFormat={formatMonth} />}
            </ChartCard>
            <ChartCard title="Employee Production" description="Completed pieces in the period (top 10)" loading={charts.isLoading}
              empty={!ch || ch.employeeProduction.length === 0}>
              {ch && <RankedBars unit="pieces" rows={ch.employeeProduction.map((e) => ({ label: e.name, value: e.completed, sub: e.rejected ? `${e.rejected} rejected` : undefined }))} />}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
