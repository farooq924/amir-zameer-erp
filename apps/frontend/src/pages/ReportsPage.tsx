import { REPORT_CATEGORIES, type ReportDefinition } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, ChevronRight, ClipboardList, IdCard, Layers, Lock, Receipt, Search, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/services/api';
import { cn } from '@/utils/cn';

const ICON: Record<string, LucideIcon> = { ClipboardList, Users, Layers, IdCard, Receipt, BookOpen, ShieldCheck };
type CatalogItem = ReportDefinition & { allowed: boolean };

/** Reports home: the 30 reports grouped by area. */
export function ReportsPage() {
  const q = useQuery({ queryKey: ['reports', 'catalog'], queryFn: () => api.get<CatalogItem[]>('/reports') });
  const [search, setSearch] = useState('');
  const s = search.trim().toLowerCase();
  const list = (q.data ?? []).filter((r) => !s || r.title.toLowerCase().includes(s) || r.description.toLowerCase().includes(s));
  const allowed = (q.data ?? []).filter((r) => r.allowed).length;
  return (
    <div>
      <PageHeader title="Reports" description={`${allowed} of 30 business reports available to you. Every report can be filtered, sorted, exported to Excel, CSV or PDF, and printed.`} />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Find a report..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a report" />
      </div>
      {q.isError ? <Card><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></Card> : q.isLoading ? <Card><LoadingState /></Card> : !list.length ? (
        <Card><EmptyState icon={<BarChart3 />} title="No report matches" description="Try another word, e.g. sales, stock, salary or ledger." /></Card>
      ) : (
        <div className="space-y-6">
          {REPORT_CATEGORIES.map((cat) => {
            const items = list.filter((r) => r.category === cat.key);
            if (!items.length) return null;
            const Icon = ICON[cat.icon] ?? BarChart3;
            return (
              <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
                <h2 id={`cat-${cat.key}`} className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="icon-tile h-7 w-7 rounded-lg bg-gold-soft text-primary [&_svg]:h-4 [&_svg]:w-4"><Icon /></span>{cat.label}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((r) => {
                    const body = (
                      <>
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold', r.allowed ? 'bg-navy text-gold' : 'bg-muted text-muted-foreground')}>{r.no}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-tight">{r.title}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.allowed ? r.description : 'You do not have access to this report.'}</span>
                        </span>
                        {r.allowed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </>
                    );
                    return r.allowed ? (
                      <Link key={r.key} to={`/reports/${r.key}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/60 hover:bg-gold-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link>
                    ) : (
                      <div key={r.key} className="flex items-center gap-3 rounded-xl border border-dashed bg-card/60 p-3 opacity-70" aria-disabled>{body}</div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
