import {
  DATE_RANGE_PRESETS, REPORT_FILTERS, findReport, type ReportColumn, type ReportFilterKey, type ReportResult, type SavedReportFilter,
} from '@az/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, BarChart3, Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, Columns3, Download, FileSpreadsheet, FileText,
  Printer, RotateCcw, SlidersHorizontal, ChevronDown, ChevronUp, Search, Sheet, Trash2, TrendingUp, Wallet, Hash, Info,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatCard, type TileTone } from '@/features/dashboard/StatCard';
import { Cell, CustomerFilter, type ReportOptions, isNumeric, loadColumns, saveColumns, summaryText } from '@/features/reports/shared';
import { useCan } from '@/hooks/use-permission';
import { api, buildQuery, errorMessage } from '@/services/api';
import { cn } from '@/utils/cn';
import { NotFoundPage } from './StatusPages';

const TILES: TileTone[] = ['gold', 'green', 'blue', 'purple'];
const ICONS = [Wallet, TrendingUp, Hash, BarChart3];
const PAGE_SIZES = [25, 50, 100, 250];
const todayPK = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

/** Query parameters the backend understands, taken from the page URL. */
export function reportParams(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((v, k) => { if (v) out[k] = v; });
  return out;
}

export function ReportViewerPage() {
  const { key = '' } = useParams();
  const def = findReport(key);
  if (!def) return <NotFoundPage />;
  return <ReportViewer key={key} reportKey={key} />;
}

function ReportViewer({ reportKey }: { reportKey: string }) {
  const def = findReport(reportKey)!;
  const can = useCan();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') ?? '');
  const [visible, setVisible] = useState<string[] | null>(() => loadColumns(reportKey));
  const [saveOpen, setSaveOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const query = reportParams(params);

  const r = useQuery({
    queryKey: ['reports', 'run', reportKey, query],
    queryFn: () => api.get<ReportResult>(`/reports/${reportKey}`, query),
    placeholderData: keepPreviousData,
  });
  const options = useQuery({ queryKey: ['reports', 'options'], queryFn: () => api.get<ReportOptions>('/reports/options'), staleTime: 5 * 60_000, enabled: def.filters.length > 0 });
  const saved = useQuery({ queryKey: ['reports', 'saved', reportKey], queryFn: () => api.get<SavedReportFilter[]>('/reports/saved-filters', { reportKey }) });

  useEffect(() => { document.title = `${def.title} · Reports`; }, [def.title]);
  // Search box: update the URL shortly after typing stops.
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('search') ?? '') !== searchText) update({ search: searchText, page: '' }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function update(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  }

  const data = r.data;
  const columns: ReportColumn[] = data?.columns ?? [];
  const shown = useMemo(() => {
    const want = visible ?? columns.filter((c) => !c.optional).map((c) => c.key);
    const list = columns.filter((c) => want.includes(c.key));
    return list.length ? list : columns.filter((c) => !c.optional);
  }, [columns, visible]);
  const setCols = (keys: string[] | null) => { setVisible(keys); saveColumns(reportKey, keys); };
  const toggleCol = (k: string) => {
    const cur = shown.map((c) => c.key);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : columns.filter((c) => cur.includes(c.key) || c.key === k).map((c) => c.key);
    if (next.length) setCols(next);
  };

  const sort = params.get('sort');
  const dir = params.get('dir') ?? 'desc';
  const onSort = (c: ReportColumn) => {
    if (data?.statement) return;
    if (sort === c.key) update({ dir: dir === 'asc' ? 'desc' : 'asc', page: '' });
    else update({ sort: c.key, dir: isNumeric(c) || c.type === 'date' || c.type === 'datetime' ? 'desc' : 'asc', page: '' });
  };
  const sortable = !!data && !data.statement && !(data.rows.length && data.rows[0]._kind === 'section' && data.rows[0]._exclude);

  const exportAs = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(format);
    try {
      const res = await fetch(`/api/reports/${reportKey}/export${buildQuery({ ...query, format, columns: shown.map((c) => c.key).join(',') })}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `${reportKey}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`${name} downloaded`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  };
  const printUrl = `/print/reports/${reportKey}${buildQuery({ ...query, columns: shown.map((c) => c.key).join(',') })}`;

  const removeSaved = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/saved-filters/${id}`),
    onSuccess: () => { toast.success('Saved filter deleted'); void qc.invalidateQueries({ queryKey: ['reports', 'saved', reportKey] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const applySaved = (s: SavedReportFilter) => {
    const { columns: cols, ...rest } = s.params;
    setParams(new URLSearchParams(rest), { replace: true });
    setSearchText(rest.search ?? '');
    if (cols) setCols(cols.split(','));
    toast.info(`Filter "${s.name}" applied`);
  };
  const hasFilters = [...params.keys()].some((k) => k !== 'page' && k !== 'pageSize');

  const meta = data?.meta;
  const from = meta ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const to = meta ? Math.min(meta.total, meta.page * meta.pageSize) : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link to="/reports" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> All reports</Link>
          <h1 className="text-2xl font-bold tracking-tight">{def.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{data?.period ?? def.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Bookmark /> Saved{saved.data?.length ? ` (${saved.data.length})` : ''}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
              {!saved.data?.length && <p className="px-2.5 pb-2 text-xs text-muted-foreground">Nothing saved yet. Set the filters, then "Save current filters".</p>}
              {saved.data?.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <DropdownMenuItem className="flex-1" onSelect={() => applySaved(s)}><Bookmark />{s.name}</DropdownMenuItem>
                  <button type="button" aria-label={`Delete ${s.name}`} className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600" onClick={() => removeSaved.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSaveOpen(true)}><BookmarkPlus /> Save current filters</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!def.statement && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={!columns.length}><Columns3 /> Columns</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                {columns.map((c) => (
                  <DropdownMenuItem key={c.key} onSelect={(e) => { e.preventDefault(); toggleCol(c.key); }}>
                    <Checkbox checked={shown.some((s) => s.key === c.key)} aria-hidden tabIndex={-1} />{c.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCols(null)}><RotateCcw /> Default columns</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {can('reports', 'EXPORT') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="navy" size="sm" loading={!!exporting} disabled={!data}><Download /> Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportAs('xlsx')}><FileSpreadsheet className="text-emerald-600" /> Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('csv')}><Sheet className="text-blue-600" /> CSV (.csv)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('pdf')}><FileText className="text-rose-600" /> PDF (.pdf)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {can('reports', 'PRINT') && <Button size="sm" asChild><a href={printUrl} target="_blank" rel="noopener noreferrer"><Printer /> Print</a></Button>}
        </div>
      </div>

      {/* Filters (folded on phones) */}
      <Button variant="outline" className="mb-3 w-full justify-between sm:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
        <span className="inline-flex items-center gap-2"><SlidersHorizontal /> Filters{hasFilters ? ' (on)' : ''}</span>{filtersOpen ? <ChevronUp /> : <ChevronDown />}
      </Button>
      <Card className={cn('mb-4 p-3 sm:block sm:p-4', !filtersOpen && 'hidden')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {def.dateMode === 'range' && (
            <div className="space-y-1.5">
              <Label htmlFor="rp-preset" className="text-xs">Period</Label>
              <NativeSelect id="rp-preset" value={params.get('preset') ?? def.defaultPreset ?? 'this_month'}
                onChange={(e) => update(e.target.value === 'custom'
                  ? { preset: 'custom', from: params.get('from') || `${todayPK().slice(0, 7)}-01`, to: params.get('to') || todayPK(), page: '' }
                  : { preset: e.target.value, from: '', to: '', page: '' })}>
                {DATE_RANGE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </NativeSelect>
            </div>
          )}
          {def.dateMode === 'range' && params.get('preset') === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label htmlFor="rp-from" className="text-xs">From</Label>
                <Input id="rp-from" type="date" value={params.get('from') ?? ''} max={params.get('to') ?? undefined} onChange={(e) => update({ from: e.target.value, page: '' })} /></div>
              <div className="space-y-1.5"><Label htmlFor="rp-to" className="text-xs">To</Label>
                <Input id="rp-to" type="date" value={params.get('to') ?? ''} min={params.get('from') ?? undefined} onChange={(e) => update({ to: e.target.value, page: '' })} /></div>
            </div>
          )}
          {def.dateMode === 'asOf' && (
            <div className="space-y-1.5"><Label htmlFor="rp-asof" className="text-xs">As on date</Label>
              <Input id="rp-asof" type="date" value={params.get('asOf') ?? todayPK()} max={todayPK()} onChange={(e) => update({ asOf: e.target.value })} /></div>
          )}
          {def.filters.map((f: ReportFilterKey) => (
            <div key={f} className="space-y-1.5">
              <Label htmlFor={`rp-${f}`} className="text-xs">{REPORT_FILTERS[f]}</Label>
              {f === 'customer' ? (
                <CustomerFilter id={`rp-${f}`} value={params.get('customer') ?? ''} onChange={(v) => update({ customer: v, page: '' })} />
              ) : (
                <NativeSelect id={`rp-${f}`} value={params.get(f) ?? ''} onChange={(e) => update({ [f]: e.target.value, page: '' })}>
                  <option value="">All</option>
                  {(options.data?.[f] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              )}
            </div>
          ))}
          {!def.statement && (
            <div className="space-y-1.5">
              <Label htmlFor="rp-search" className="text-xs">Search in report</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="rp-search" className="pl-9" placeholder="Name, number, text..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setSearchText(''); }}><RotateCcw /> Reset filters</Button>
          </div>
        )}
      </Card>

      {/* Summary */}
      {!!data?.summary.length && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.summary.map((s, i) => (
            <StatCard key={s.label} featured={i === 0} label={s.label} value={summaryText(s.type, s.value)} hint={s.hint} icon={ICONS[i % 4]} tile={TILES[i % 4]} loading={r.isFetching && !r.data}
              tone={s.type === 'money' && Number(s.value) < 0 ? 'negative' : undefined} />
          ))}
        </div>
      )}
      {data?.note && <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />{data.note}</p>}
      {data?.meta.truncated && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">This period has a very large number of records. Only the first 20,000 are included: choose a shorter period.</p>}

      {/* Table */}
      <Card className={cn('overflow-hidden', r.isFetching && r.data && 'opacity-70 transition-opacity')}>
        {r.isError ? <ErrorState message={errorMessage(r.error)} onRetry={() => r.refetch()} /> : !data ? <LoadingState label="Preparing report..." /> : !data.rows.length ? (
          <EmptyState icon={<BarChart3 />} title="No records" description={params.get('search') ? 'Nothing matches your search. Clear the search box or change the filters.' : 'There is nothing for this period and filter. Try a longer period.'} />
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y sm:hidden">
              {data.rows.map((row, i) => {
                const [first, ...rest] = shown;
                const strong = row._kind === 'section' || row._kind === 'total' || row._kind === 'subtotal';
                return (
                  <li key={i} className={cn('px-3 py-2.5', row._kind === 'section' && 'bg-muted/60', row._kind === 'total' && 'bg-gold-soft/50', row._exclude && !strong && 'opacity-60')}>
                    {data.statement ? (
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={cn(strong && 'font-semibold')}>{String(row.account ?? row[first.key] ?? '')}</span>
                        {shown.filter((c) => isNumeric(c) || c.type === 'money').map((c) => <Cell key={c.key} c={c} v={row[c.key]} bold={strong} />)}
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold"><Cell c={first} v={row[first.key]} /></p>
                        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                          {rest.map((c) => (
                            <div key={c.key} className="flex min-w-0 justify-between gap-2"><dt className="truncate text-muted-foreground">{c.label}</dt><dd className="truncate text-right"><Cell c={c} v={row[c.key]} /></dd></div>
                          ))}
                        </dl>
                      </>
                    )}
                  </li>
                );
              })}
              {data.totals && (
                <li className="bg-gold-soft/60 px-3 py-2.5">
                  <p className="text-sm font-bold">Total</p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    {shown.filter((c) => data.totals![c.key] !== undefined).map((c) => (
                      <div key={c.key} className="flex justify-between gap-2"><dt className="text-muted-foreground">{c.label}</dt><dd className="font-semibold"><Cell c={c} v={data.totals![c.key]} /></dd></div>
                    ))}
                  </dl>
                </li>
              )}
            </ul>
            {/* Tablet / desktop: table */}
            <div className="hidden sm:block">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    {shown.map((c) => (
                      <TH key={c.key} className={cn('whitespace-nowrap', isNumeric(c) && 'text-right')} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {sortable ? (
                          <button type="button" onClick={() => onSort(c)} className={cn('inline-flex items-center gap-1 hover:text-primary', isNumeric(c) && 'flex-row-reverse')}>
                            {c.label}
                            {sort === c.key ? (dir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                          </button>
                        ) : c.label}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {data.rows.map((row, i) => {
                    const strong = row._kind === 'section' || row._kind === 'total' || row._kind === 'subtotal';
                    return (
                      <TR key={i} className={cn(row._kind === 'section' && 'bg-muted/60 hover:bg-muted/60', row._kind === 'total' && 'border-t-2 border-primary/60 bg-gold-soft/50 hover:bg-gold-soft/50', row._exclude && !strong && 'text-muted-foreground')}>
                        {shown.map((c, ci) => (
                          <TD key={c.key} className={cn('py-2', ci === 0 && 'whitespace-nowrap', isNumeric(c) && 'whitespace-nowrap text-right', (c.type === 'date' || c.type === 'datetime') && 'whitespace-nowrap')}>
                            <Cell c={c} v={row[c.key]} bold={strong} />
                          </TD>
                        ))}
                      </TR>
                    );
                  })}
                </TBody>
                {data.totals && (
                  <tfoot>
                    <TR className="border-t-2 border-primary/60 bg-gold-soft/50 font-semibold hover:bg-gold-soft/50">
                      {shown.map((c, i) => (
                        <TD key={c.key} className={cn('py-2.5', isNumeric(c) && 'whitespace-nowrap text-right')}>
                          {data.totals![c.key] !== undefined ? <Cell c={c} v={data.totals![c.key]} bold /> : i === 0 ? 'Total' : ''}
                        </TD>
                      ))}
                    </TR>
                  </tfoot>
                )}
              </Table>
            </div>
            {/* Paging */}
            {!data.statement && meta && (
              <div className="flex flex-col gap-2 border-t px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">Showing {from}-{to} of {meta.total}{data.totals ? ' · totals include every page' : ''}</p>
                <div className="flex items-center gap-2">
                  <NativeSelect aria-label="Rows per page" className="h-8 w-24 text-xs" value={String(meta.pageSize)} onChange={(e) => update({ pageSize: e.target.value, page: '' })}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </NativeSelect>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => update({ page: String(meta.page - 1) })}><ChevronLeft /></Button>
                  <span className="text-xs tabular-nums">{meta.page} / {meta.totalPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => update({ page: String(meta.page + 1) })}><ChevronRight /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      <SaveFilterDialog open={saveOpen} onOpenChange={setSaveOpen} reportKey={reportKey} params={{ ...query, ...(visible ? { columns: visible.join(',') } : {}) }} />
    </div>
  );
}

function SaveFilterDialog({ open, onOpenChange, reportKey, params }: { open: boolean; onOpenChange: (o: boolean) => void; reportKey: string; params: Record<string, string> }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  const save = useMutation({
    mutationFn: () => api.post('/reports/saved-filters', { reportKey, name, params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'page')) }),
    onSuccess: () => { toast.success(`Filter "${name}" saved`); void qc.invalidateQueries({ queryKey: ['reports', 'saved', reportKey] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle><BookmarkPlus className="h-5 w-5 text-primary" /> Save filters</DialogTitle>
          <DialogDescription>Keep the current period, filters, sorting and columns under a name, to open them again in one click.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) save.mutate(); }} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="sf-name" required>Name</Label>
            <Input id="sf-name" autoFocus maxLength={60} placeholder="e.g. VIP customers this month" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
