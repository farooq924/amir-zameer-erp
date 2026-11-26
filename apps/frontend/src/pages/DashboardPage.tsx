import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, CheckCircle2, ClipboardList, Clock, Layers, PackageCheck, Receipt, Scissors, ShoppingBag, TrendingUp, Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { ErrorState, PageHeader } from '@/components/common';
import { ChartCard, MoneyBars, MoneyLine, RankedBars } from '@/features/dashboard/charts';
import { DateRangeFilter, type RangeValue } from '@/features/dashboard/DateRangeFilter';
import { StatCard } from '@/features/dashboard/StatCard';
import { api, errorMessage } from '@/services/api';
import type { DashboardCharts, DashboardSummary } from '@/types';
import { formatDate, formatMonth, formatPKR } from '@/utils/format';

const sumOf = (rows: Record<string, string | number>[], key: string) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);

export function DashboardPage() {
  const [range, setRange] = useState<RangeValue>({ preset: 'today' });
  const ready = range.preset !== 'custom' || (!!range.from && !!range.to && range.from <= range.to);
  const params = { preset: range.preset, from: range.preset === 'custom' ? range.from : undefined, to: range.preset === 'custom' ? range.to : undefined };

  const summary = useQuery({ queryKey: ['dashboard', 'summary', params], queryFn: () => api.get<DashboardSummary>('/dashboard/summary', params), enabled: ready });
  const charts = useQuery({ queryKey: ['dashboard', 'charts', params], queryFn: () => api.get<DashboardCharts>('/dashboard/charts', params), enabled: ready });

  const c = summary.data?.cards;
  const l = summary.isLoading;
  const ch = charts.data;
  const profit = Number(c?.netProfit ?? 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={summary.data ? `${formatDate(summary.data.range.from)} - ${formatDate(summary.data.range.to)}` : 'Business overview'}
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />
      {summary.isError ? <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total Sales" value={formatPKR(c?.totalSales)} icon={ShoppingBag} loading={l} hint="Order value in period" />
          <StatCard label="Stitching Revenue" value={formatPKR(c?.stitchingRevenue)} icon={Scissors} loading={l} />
          <StatCard label="Fabric Sales" value={formatPKR(c?.fabricSales)} icon={Layers} loading={l} />
          <StatCard label="Cash Received" value={formatPKR(c?.cashReceived)} icon={Banknote} loading={l} hint="Payments minus refunds" />
          <StatCard label="Total Expenses" value={formatPKR(c?.totalExpenses)} icon={Receipt} loading={l} hint="Approved expenses" />
          <StatCard label="Net Profit" value={formatPKR(c?.netProfit)} icon={TrendingUp} loading={l} tone={profit < 0 ? 'negative' : undefined} hint="From posted accounts" />
          <StatCard label="Total Orders" value={String(c?.totalOrders ?? 0)} icon={ClipboardList} loading={l} hint={c?.cancelledOrders ? `${c.cancelledOrders} cancelled` : 'Booked in period'} />
          <StatCard label="Pending Orders" value={String(c?.pendingOrders ?? 0)} icon={Clock} loading={l} hint="Currently open" />
          <StatCard label="Completed Orders" value={String(c?.completedOrders ?? 0)} icon={CheckCircle2} loading={l} hint="Ready for delivery" />
          <StatCard label="Delivered Orders" value={String(c?.deliveredOrders ?? 0)} icon={PackageCheck} loading={l} hint="Delivered in period" />
          <StatCard label="Customer Outstanding" value={formatPKR(c?.customerOutstanding)} icon={Wallet} loading={l} hint="All open balances" />
          <StatCard label="Fabric Stock Value" value={formatPKR(c?.fabricStockValue)} icon={c?.lowStockItems ? AlertTriangle : Layers} loading={l}
            hint={c?.lowStockItems ? `${c.lowStockItems} low stock items` : 'At average cost'} />
        </div>
      )}

      {charts.isError ? <ErrorState message={errorMessage(charts.error)} onRetry={() => charts.refetch()} /> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Daily Sales" description="Order value per day in the selected period" loading={charts.isLoading}
            empty={!ch || sumOf(ch.dailySales, 'total') === 0}>
            {ch && <MoneyBars data={ch.dailySales} xKey="date" series={[{ key: 'total', name: 'Sales' }]} xFormat={(d) => d.slice(8, 10) + '/' + d.slice(5, 7)} />}
          </ChartCard>
          <ChartCard title="Monthly Revenue" description="Last 12 months" loading={charts.isLoading} empty={!ch || sumOf(ch.monthlyRevenue, 'total') === 0}>
            {ch && <MoneyLine data={ch.monthlyRevenue} xKey="month" yKey="total" name="Revenue" xFormat={formatMonth} />}
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
          <ChartCard title="Order Status" description="Orders booked in the period, by current stage" loading={charts.isLoading}
            empty={!ch || ch.orderStatus.every((s) => s.count === 0)}>
            {ch && <RankedBars unit="orders" rows={ch.orderStatus.map((s) => ({ label: s.name, value: s.count }))} />}
          </ChartCard>
          <ChartCard title="Employee Production" description="Completed pieces in the period (top 10)" loading={charts.isLoading}
            empty={!ch || ch.employeeProduction.length === 0}>
            {ch && <RankedBars unit="pieces" rows={ch.employeeProduction.map((e) => ({ label: e.name, value: e.completed, sub: e.rejected ? `${e.rejected} rejected` : undefined }))} />}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
