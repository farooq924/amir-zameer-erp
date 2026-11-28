import { MODULES } from '@az/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, Eye,
  FileSpreadsheet, FileText, MoreVertical, Pencil, Printer, Trash2, Upload, X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { errorMessage } from '@/services/api';
import { cn } from '@/utils/cn';
import { exportCsv, exportExcel, printTable } from './files';
import { ImportDialog } from './ImportDialog';
import type { CellValue, DataColumn, RowAction, ServerPagination, SortState, TableImporter } from './types';

export type { DataColumn, ImportField, ServerPagination, SortState, TableImporter } from './types';

export const PAGE_SIZES = [10, 25, 50, 100];

export interface DataTableProps<T> {
  /** Used for print / export titles and file names. */
  title: string;
  /** Permission module: Export needs its EXPORT right and Print its PRINT right (when the module has them). */
  module?: string;
  rows: T[] | undefined;
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Shown when there are no rows. */
  empty?: ReactNode;
  /** Filters / search shown on the left of the toolbar. */
  toolbar?: ReactNode;
  /** Extra buttons on the right of the toolbar (before Import / Export / Print). */
  toolbarActions?: ReactNode;

  /** Server-side paging. Leave out for client-side paging of `rows`. */
  pagination?: ServerPagination;
  /** Server-side sort (with `pagination`). */
  sort?: SortState | null;
  onSortChange?: (s: SortState | null) => void;
  /** Client-side default sort. */
  defaultSort?: SortState;
  defaultPageSize?: number;
  /** Server tables: loads every matching row for export / print of "all". */
  fetchAll?: () => Promise<T[]>;

  onRowClick?: (row: T) => void;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  /** Opens a pre-filled form (one row). */
  onDuplicate?: (row: T) => void;
  /** Creates a copy straight away (used by the row button and the bulk action). */
  duplicateRow?: (row: T) => Promise<unknown>;
  /** Deletes one record (used by the row button and the bulk action, after a confirmation). */
  deleteRow?: (row: T) => Promise<unknown>;
  /** Hide an action for some rows (e.g. system records). */
  canRow?: (action: RowAction, row: T) => boolean;
  /** Name shown in the delete confirmation, e.g. "customer". */
  noun?: string;
  deleteWarning?: string;
  /** Extra per-row menu items (shown in the ⋮ menu). */
  rowMenu?: (row: T) => ReactNode;
  /** Called after bulk delete / duplicate / import, to refresh data. */
  onChanged?: () => void;
  importer?: TableImporter;
  /** Phones: card layout for a row. Without it, the table scrolls sideways. */
  mobileCard?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** Totals row: cell content per column id (computed from all rows on client tables). */
  footer?: (rows: T[]) => Partial<Record<string, ReactNode>>;
  selectable?: boolean;
  /** Hide Import / Export / Print toolbar (rare: small embedded lists). */
  hideTools?: boolean;
  className?: string;
}

function compare(a: CellValue, b: CellValue): number {
  const empty = (v: CellValue) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (a instanceof Date || b instanceof Date) return new Date(a as Date).getTime() - new Date(b as Date).getTime();
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'boolean') return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function readSize(key: string, fallback: number) {
  try { const v = Number(localStorage.getItem(key)); return PAGE_SIZES.includes(v) ? v : fallback; } catch { return fallback; }
}

function pageList(page: number, pages: number): (number | '...')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '...')[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('...');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push('...');
  out.push(pages);
  return out;
}

const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '');

/**
 * The one table used across TailoringERP: selection, bulk actions, sorting, row actions,
 * pagination (10 / 25 / 50 / 100 rows), Import (Excel / CSV), Export (Excel / CSV) and Print.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    title, rows, columns, getRowId, loading, error, onRetry, pagination, fetchAll, importer, canRow,
    onView, onEdit, onDuplicate, duplicateRow, deleteRow, rowMenu, selectable = true, noun = 'record',
  } = props;
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const can = useCan();
  const mod = props.module ? MODULES.find((m) => m.key === props.module) : undefined;
  const right = (a: 'EXPORT' | 'PRINT') => !mod || !(mod.actions as readonly string[]).includes(a) || can(mod.key, a);
  const canExport = right('EXPORT');
  const canPrint = right('PRINT');
  const business = String((qc.getQueryData<Record<string, Record<string, unknown>>>(['settings'])?.business?.businessName as string) || user?.company?.name || '');
  const server = !!pagination;
  const sizeKey = `dt:size:${title}`;
  const [clientSort, setClientSort] = useState<SortState | null>(props.defaultSort ?? null);
  const [clientPage, setClientPage] = useState(1);
  const [clientSize, setClientSize] = useState(() => readSize(sizeKey, Math.max(props.defaultPageSize ?? 10, 10)));
  const [selected, setSelected] = useState<Map<string, T>>(new Map());
  const [confirm, setConfirm] = useState<T[] | null>(null);
  const [busy, setBusy] = useState<'' | 'delete' | 'duplicate' | 'export' | 'print'>('');
  const [importOpen, setImportOpen] = useState(false);

  const sort = server ? props.sort ?? null : clientSort;
  const all = useMemo(() => rows ?? [], [rows]);

  const sorted = useMemo(() => {
    if (server || !clientSort) return all;
    const col = columns.find((c) => c.id === clientSort.id);
    if (!col?.value) return all;
    const out = [...all].sort((a, b) => compare(col.value!(a), col.value!(b)));
    return clientSort.desc ? out.reverse() : out;
  }, [all, clientSort, columns, server]);

  const pageSize = server ? pagination!.pageSize : clientSize;
  const total = server ? pagination!.total : sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = server ? pagination!.page : Math.min(clientPage, pages);
  const visible = server ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);

  // Client tables: drop selections that are no longer in the (filtered) data.
  useEffect(() => {
    if (server) return;
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(all.map(getRowId));
      const next = new Map([...prev].filter(([id]) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [all, server, getRowId]);

  const allowed = (a: RowAction, r: T) => (canRow ? canRow(a, r) : true);
  const hasActions = !!(onView || onEdit || onDuplicate || duplicateRow || deleteRow || rowMenu);
  const pageIds = visible.map(getRowId);
  const pageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const pageSome = pageIds.some((id) => selected.has(id));
  const selRows = [...selected.values()];

  const toggleRow = (r: T) => setSelected((prev) => {
    const next = new Map(prev);
    const id = getRowId(r);
    if (next.has(id)) next.delete(id); else next.set(id, r);
    return next;
  });
  const togglePage = () => setSelected((prev) => {
    const next = new Map(prev);
    if (pageChecked) visible.forEach((r) => next.delete(getRowId(r)));
    else visible.forEach((r) => next.set(getRowId(r), r));
    return next;
  });
  const selectAll = async () => {
    try {
      const list = server ? (fetchAll ? await fetchAll() : visible) : sorted;
      setSelected(new Map(list.map((r) => [getRowId(r), r])));
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const toggleSort = (c: DataColumn<T>) => {
    const id = server ? c.sortKey ?? c.id : c.id;
    const next: SortState | null = sort?.id !== id ? { id, desc: false } : !sort.desc ? { id, desc: true } : null;
    if (server) props.onSortChange?.(next);
    else { setClientSort(next); setClientPage(1); }
  };
  const isSortable = (c: DataColumn<T>) => (server ? !!c.sortKey && !!props.onSortChange : c.sortable ?? !!c.value);

  const setPage = (p: number) => (server ? pagination!.onPageChange(p) : setClientPage(p));
  const setSize = (n: number) => {
    try { localStorage.setItem(sizeKey, String(n)); } catch { /* ignore */ }
    if (server) pagination!.onPageSizeChange(n); else { setClientSize(n); setClientPage(1); }
  };

  const rowsFor = async (which: 'selected' | 'all') => {
    if (which === 'selected') return selRows;
    if (!server) return sorted;
    return fetchAll ? fetchAll() : visible;
  };
  const doExport = async (which: 'selected' | 'all', format: 'xlsx' | 'csv') => {
    setBusy('export');
    try {
      const list = await rowsFor(which);
      if (format === 'csv') exportCsv(title, columns, list); else await exportExcel(title, business, columns, list);
      toast.success(`${list.length} record${list.length === 1 ? '' : 's'} exported`);
    } catch (e) { toast.error(`Export failed: ${errorMessage(e)}`); } finally { setBusy(''); }
  };
  const doPrint = async (which: 'selected' | 'all') => {
    setBusy('print');
    try { printTable(title, business, columns, await rowsFor(which)); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(''); }
  };

  const runEach = async (kind: 'delete' | 'duplicate', list: T[], fn: (r: T) => Promise<unknown>) => {
    setBusy(kind);
    let ok = 0;
    const errors: string[] = [];
    for (const r of list) {
      try { await fn(r); ok++; } catch (e) { errors.push(errorMessage(e)); }
    }
    setBusy('');
    const verb = kind === 'delete' ? 'deleted' : 'duplicated';
    if (ok) toast.success(`${ok} ${noun}${ok === 1 ? '' : 's'} ${verb}`);
    if (errors.length) toast.error(`${errors.length} could not be ${verb}: ${[...new Set(errors)].slice(0, 2).join(' ')}`);
    if (kind === 'delete') setSelected(new Map());
    props.onChanged?.();
  };

  const bulkDeletable = deleteRow ? selRows.filter((r) => allowed('delete', r)) : [];
  const bulkDuplicable = duplicateRow ? selRows.filter((r) => allowed('duplicate', r)) : [];
  const footerCells = props.footer?.(sorted);

  const rowActions = (r: T, compact = false) => {
    const btn = 'h-7 w-7 rounded-md [&_svg]:size-[15px] text-muted-foreground hover:bg-gold-soft hover:text-[#8a6a1f] dark:hover:text-gold';
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
    const extra = rowMenu?.(r);
    const hasExtra = extra !== null && extra !== undefined && extra !== false;
    const items = (
      <>
        {onView && allowed('view', r) && <DropdownMenuItem onSelect={() => onView(r)}><Eye /> View</DropdownMenuItem>}
        {onEdit && allowed('edit', r) && <DropdownMenuItem onSelect={() => onEdit(r)}><Pencil /> Edit</DropdownMenuItem>}
        {(onDuplicate || duplicateRow) && allowed('duplicate', r) && (
          <DropdownMenuItem onSelect={() => (onDuplicate ? onDuplicate(r) : runEach('duplicate', [r], duplicateRow!))}><Copy /> Duplicate</DropdownMenuItem>
        )}
        {extra}
        {deleteRow && allowed('delete', r) && (<><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm([r])}><Trash2 /> Delete</DropdownMenuItem></>)}
      </>
    );
    if (compact) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={btn} aria-label="Row actions" onClick={(e) => e.stopPropagation()}><MoreVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>{items}</DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <div className="flex items-center justify-end">
        {onView && allowed('view', r) && <Button variant="ghost" size="icon" className={btn} title="View" aria-label="View" onClick={stop(() => onView(r))}><Eye /></Button>}
        {onEdit && allowed('edit', r) && <Button variant="ghost" size="icon" className={btn} title="Edit" aria-label="Edit" onClick={stop(() => onEdit(r))}><Pencil /></Button>}
        {(onDuplicate || duplicateRow) && allowed('duplicate', r) && (
          <Button variant="ghost" size="icon" className={btn} title="Duplicate" aria-label="Duplicate" disabled={busy === 'duplicate'}
            onClick={stop(() => (onDuplicate ? onDuplicate(r) : runEach('duplicate', [r], duplicateRow!)))}><Copy /></Button>
        )}
        {deleteRow && allowed('delete', r) && (
          <Button variant="ghost" size="icon" className={cn(btn, 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400')} title="Delete" aria-label="Delete" onClick={stop(() => setConfirm([r]))}><Trash2 /></Button>
        )}
        {hasExtra && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={btn} aria-label="More actions" onClick={(e) => e.stopPropagation()}><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>{extra}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const exportMenu = (which: 'selected' | 'all', label: ReactNode, variant: 'navy' | 'outline', size: 'sm' | 'default' = 'sm') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} loading={busy === 'export'}>{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => doExport(which, 'xlsx')}><FileSpreadsheet className="text-emerald-600" /> Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => doExport(which, 'csv')}><FileText className="text-sky-600" /> CSV (.csv)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const hasRows = visible.length > 0;
  const showTools = !props.hideTools;

  return (
    <div className={cn('min-w-0', props.className)}>
      {(props.toolbar || showTools || props.toolbarActions) && (
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:justify-between no-print">
          <div className="min-w-0 flex-1">{props.toolbar}</div>
          <div className="flex flex-wrap items-center gap-2">
            {props.toolbarActions}
            {showTools && importer && <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload /> Import</Button>}
            {showTools && canExport && exportMenu('all', <><Download /> Export</>, 'navy')}
            {showTools && canPrint && <Button size="sm" onClick={() => doPrint('all')} loading={busy === 'print'}><Printer /> Print</Button>}
          </div>
        </div>
      )}

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-gold-soft/60 px-3 py-2 text-sm no-print">
          <span className="font-semibold">{selected.size} selected</span>
          {pageChecked && selected.size < total && (
            <button type="button" className="text-xs font-medium text-[#8a6a1f] underline-offset-2 hover:underline dark:text-gold" onClick={selectAll}>Select all {total}</button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {canPrint && <Button variant="outline" size="sm" onClick={() => doPrint('selected')}><Printer /> Print</Button>}
            {canExport && exportMenu('selected', <><Download /> Export</>, 'outline')}
            {duplicateRow && <Button variant="outline" size="sm" disabled={!bulkDuplicable.length} loading={busy === 'duplicate'} onClick={() => runEach('duplicate', bulkDuplicable, duplicateRow)}><Copy /> Duplicate</Button>}
            {deleteRow && <Button variant="destructive" size="sm" disabled={!bulkDeletable.length} onClick={() => setConfirm(bulkDeletable)}><Trash2 /> Delete</Button>}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())} aria-label="Clear selection"><X /> Clear</Button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={onRetry} />
      ) : loading && !rows ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : !hasRows ? (
        props.empty ?? <EmptyState title="No records found" />
      ) : (
        <>
          {props.mobileCard && (
            <ul className="divide-y sm:hidden">
              {visible.map((r) => {
                const id = getRowId(r);
                return (
                  <li key={id} className={cn('flex items-center gap-2 pl-3', selected.has(id) && 'bg-gold-soft/50')}>
                    {selectable && <Checkbox checked={selected.has(id)} onCheckedChange={() => toggleRow(r)} aria-label="Select row" />}
                    <div className="min-w-0 flex-1">{props.mobileCard!(r)}</div>
                    {hasActions && <div className="pr-1">{rowActions(r, true)}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={cn('relative w-full overflow-x-auto', props.mobileCard && 'hidden sm:block')}>
            <table className="w-full caption-bottom text-sm">
              <thead className="bg-muted/70 [&_tr]:border-b">
                <tr>
                  {selectable && (
                    <th className="w-10 px-3 no-print">
                      <Checkbox checked={pageChecked ? true : pageSome ? 'indeterminate' : false} onCheckedChange={togglePage} aria-label="Select all on this page" />
                    </th>
                  )}
                  {columns.map((c) => {
                    const sortable = isSortable(c);
                    const active = sort?.id === (server ? c.sortKey ?? c.id : c.id);
                    const right = c.align === 'right' || c.type === 'money' || c.type === 'number';
                    return (
                      <th key={c.id} className={cn('h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold text-foreground', right && 'text-right', alignClass(c.align), c.className, c.headerClassName)}
                        aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : undefined}>
                        {sortable ? (
                          <button type="button" onClick={() => toggleSort(c)} className={cn('inline-flex items-center gap-1 rounded hover:text-primary', right && 'flex-row-reverse', active && 'text-[#8a6a1f] dark:text-gold')}>
                            {c.header}
                            {active ? (sort!.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                          </button>
                        ) : c.header}
                      </th>
                    );
                  })}
                  {hasActions && <th className="h-10 w-px whitespace-nowrap px-3 text-right text-xs font-semibold no-print">Actions</th>}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {visible.map((r) => {
                  const id = getRowId(r);
                  const click = props.onRowClick;
                  return (
                    <tr key={id}
                      className={cn('border-b transition-colors hover:bg-accent/50', click && 'cursor-pointer', selected.has(id) && 'bg-gold-soft/50', props.rowClassName?.(r))}
                      onClick={click ? () => click(r) : undefined}
                      tabIndex={click ? 0 : undefined}
                      onKeyDown={click ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) click(r); } : undefined}>
                      {selectable && (
                        <td className="w-10 px-3 no-print" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(id)} onCheckedChange={() => toggleRow(r)} aria-label="Select row" />
                        </td>
                      )}
                      {columns.map((c) => {
                        const right = c.align === 'right' || c.type === 'money' || c.type === 'number';
                        const content = c.cell ? c.cell(r) : c.text ? c.text(r) : (() => { const v = c.value?.(r); return v === null || v === undefined ? '-' : v instanceof Date ? v.toLocaleDateString() : String(v); })();
                        return <td key={c.id} className={cn('px-3 py-2.5 align-middle', right && 'whitespace-nowrap text-right tabular-nums', alignClass(c.align), c.className)}>{content}</td>;
                      })}
                      {hasActions && <td className="px-2 py-1.5 no-print">{rowActions(r)}</td>}
                    </tr>
                  );
                })}
              </tbody>
              {footerCells && (
                <tfoot className="border-t-2 bg-muted/50 font-semibold">
                  <tr>
                    {selectable && <td className="no-print" />}
                    {columns.map((c) => {
                      const right = c.align === 'right' || c.type === 'money' || c.type === 'number';
                      return <td key={c.id} className={cn('px-3 py-2.5', right && 'whitespace-nowrap text-right tabular-nums', c.className)}>{footerCells[c.id] ?? ''}</td>;
                    })}
                    {hasActions && <td className="no-print" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {total > 0 && !error && (
        <div className="flex flex-col gap-2 border-t p-3 text-sm sm:flex-row sm:items-center sm:justify-between no-print">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Rows per page</span>
            <select aria-label="Rows per page" value={pageSize} onChange={(e) => setSize(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-primary focus:outline-none">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="whitespace-nowrap">{(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}</span>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page"><ChevronsLeft /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <div className="hidden items-center gap-1 sm:flex">
                {pageList(page, pages).map((p, i) => p === '...' ? <span key={`e${i}`} className="px-1 text-muted-foreground">...</span> : (
                  <Button key={p} variant={p === page ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</Button>
                ))}
              </div>
              <span className="px-2 text-xs text-muted-foreground sm:hidden">Page {page} of {pages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(pages)} aria-label="Last page"><ChevronsRight /></Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} ${noun}s?` : `Delete this ${noun}?`}
        description={props.deleteWarning ?? 'This cannot be undone.'}
        confirmLabel="Delete"
        loading={busy === 'delete'}
        onConfirm={async () => { const list = confirm ?? []; await runEach('delete', list, deleteRow!); setConfirm(null); }}
      />
      {importer && <ImportDialog open={importOpen} onOpenChange={setImportOpen} title={title} importer={importer} onDone={() => props.onChanged?.()} />}
    </div>
  );
}

/** Loads every page of a paginated list endpoint (for export / print / select all). */
export async function fetchAllPages<T>(load: (page: number, pageSize: number) => Promise<{ data: T[]; meta: { totalPages: number } }>): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const res = await load(page, 200);
    out.push(...res.data);
    if (page >= res.meta.totalPages || page >= 100) break;
    page++;
  }
  return out;
}
