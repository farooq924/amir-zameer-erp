import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/common';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatPKR } from '@/utils/format';

// Brand categorical slots, validated (light + dark): navy-blue, gold. Values live in index.css.
const S1 = 'var(--series-1)';
const S2 = 'var(--series-2)';
const GRID = 'var(--chart-grid)';
const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

export function ChartCard({ title, description, loading, empty, children, className, height = 'h-56' }: {
  title: string; description?: string; loading?: boolean; empty?: boolean; children: ReactNode; className?: string; height?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent>
        {loading ? <Skeleton className={`${height} w-full`} /> : empty ? (
          <div className={height}><EmptyState title="No data for this period" description="Figures appear here as soon as records are saved." /></div>
        ) : <div className={height}>{children}</div>}
      </CardContent>
    </Card>
  );
}

function MoneyTooltip({ active, payload, label, labelFormatter }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span><span className="ml-auto font-medium tabular-nums text-foreground">{formatPKR(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

type Row = Record<string, string | number>;

export function MoneyBars({ data, xKey, series, xFormat, stacked }: {
  data: Row[]; xKey: string; series: { key: string; name: string }[]; xFormat?: (v: string) => string; stacked?: boolean;
}) {
  const colors = [S1, S2];
  const rows = data.map((r) => ({ ...r, ...Object.fromEntries(series.map((s) => [s.key, Number(r[s.key])])) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFormat} minTickGap={12} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} width={48} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<MoneyTooltip labelFormatter={xFormat} />} />
        {series.length > 1 && <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: 'hsl(var(--foreground))' }}>{v}</span>} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={colors[i]} stackId={stacked ? 'a' : undefined}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            stroke={stacked ? 'hsl(var(--card))' : undefined} strokeWidth={stacked ? 1 : 0} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MoneyLine({ data, xKey, yKey, name, xFormat }: { data: Row[]; xKey: string; yKey: string; name: string; xFormat?: (v: string) => string }) {
  const rows = data.map((r) => ({ ...r, [yKey]: Number(r[yKey]) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFormat} minTickGap={12} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} width={48} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Tooltip content={<MoneyTooltip labelFormatter={xFormat} />} />
        <Line type="linear" dataKey={yKey} name={name} stroke={S1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal HTML bars: readable on phones, every value labelled. */
export function RankedBars({ rows, unit }: { rows: { label: string; value: number; sub?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '14rem' }}>
      {rows.map((r) => (
        <li key={r.label} className="text-xs" title={`${r.label}: ${r.value} ${unit}`}>
          <div className="mb-1 flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="tabular-nums font-medium">{r.value}{r.sub ? ` · ${r.sub}` : ''}</span></div>
          <div className="h-2 rounded-sm bg-muted"><div className="h-2 rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: S1 }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Two-series trend with a light area under each line (one shared money axis). */
export function TrendArea({ data, xKey, series, xFormat }: {
  data: Row[]; xKey: string; series: { key: string; name: string }[]; xFormat?: (v: string) => string;
}) {
  const colors = [S1, S2];
  const rows = data.map((r) => ({ ...r, ...Object.fromEntries(series.map((s) => [s.key, Number(r[s.key])])) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`az-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i]} stopOpacity={0.22} /><stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFormat} minTickGap={12} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} width={48} />
        <Tooltip content={<MoneyTooltip labelFormatter={xFormat} />} />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} formatter={(v) => <span style={{ color: 'hsl(var(--foreground))' }}>{v}</span>} />
        {series.map((s, i) => (
          <Area key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={colors[i]} strokeWidth={2} fill={`url(#az-fill-${s.key})`}
            dot={{ r: 4, fill: 'hsl(var(--card))', strokeWidth: 2 }} activeDot={{ r: 5 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut of counts with the total in the centre and a labelled legend (count and share). */
export function StatusDonut({ rows, totalLabel }: { rows: { label: string; value: number; color: string }[]; totalLabel: string }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const shown = rows.filter((r) => r.value > 0);
  return (
    <div className="flex h-full flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="100%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
              {shown.map((r) => <Cell key={r.label} fill={r.color} />)}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [`${v} (${Math.round((v / Math.max(total, 1)) * 100)}%)`, n]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{total}</span><span className="text-xs text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 overflow-y-auto text-sm" style={{ maxHeight: '11rem' }}>
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="tabular-nums font-medium">{r.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{total ? Math.round((r.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
