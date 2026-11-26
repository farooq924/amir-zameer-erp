import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/common';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatPKR } from '@/utils/format';

// Validated categorical slots (light): blue, orange.
const S1 = 'var(--series-1)';
const S2 = 'var(--series-2)';
const GRID = 'var(--chart-grid)';
const AXIS = { fontSize: 11, fill: 'hsl(215 16% 42%)' };

export function ChartCard({ title, description, loading, empty, children }: {
  title: string; description?: string; loading?: boolean; empty?: boolean; children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-56 w-full" /> : empty ? (
          <div className="h-56"><EmptyState title="No data for this period" description="Figures appear here as soon as records are saved." /></div>
        ) : <div className="h-56">{children}</div>}
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
        <Tooltip cursor={{ fill: 'hsl(210 40% 96%)' }} content={<MoneyTooltip labelFormatter={xFormat} />} />
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
        <ReferenceLine y={0} stroke="hsl(215 16% 70%)" />
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
