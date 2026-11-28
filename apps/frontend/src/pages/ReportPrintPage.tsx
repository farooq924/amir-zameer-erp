import { findReport, type ReportResult } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { PrintFooter } from '@/components/PrintFooter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cellText, isNumeric, summaryText } from '@/features/reports/shared';
import { api, errorMessage } from '@/services/api';
import type { SettingsMap } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { reportParams } from './ReportViewerPage';

/** A4 print of a whole report (all rows, the columns the user picked), ending with the developer footer. */
export function ReportPrintPage() {
  const { key = '' } = useParams();
  const [params] = useSearchParams();
  const { columns: cols, ...query } = reportParams(params);
  const def = findReport(key);
  const q = useQuery({ queryKey: ['reports', 'print', key, query], queryFn: () => api.get<ReportResult>(`/reports/${key}/all`, query) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000, retry: false });
  useEffect(() => { if (def) document.title = `${def.title} - print`; }, [def]);
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data || settings.isLoading) return <div className="mx-auto max-w-[297mm] p-8"><Skeleton className="h-96 w-full" /></div>;
  const r = q.data;
  const want = cols?.split(',') ?? null;
  const shown = r.columns.filter((c) => (want ? want.includes(c.key) : !c.optional));
  const biz = (settings.data?.business ?? {}) as Record<string, unknown>;
  const landscape = shown.length > 6;
  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[297mm] items-center justify-between gap-2 px-4">
        <p className="text-sm text-muted-foreground">{r.rows.length} rows · {landscape ? 'A4 landscape' : 'A4 portrait'}</p>
        <Button onClick={() => window.print()}><Printer /> Print</Button>
      </div>
      <style>{`@media print { @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; } thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
      <article className={cn('mx-auto bg-white p-8 text-[11px] text-black shadow print:max-w-none print:p-0 print:shadow-none', landscape ? 'max-w-[297mm]' : 'max-w-[210mm]')}>
        <header className="flex items-start justify-between border-b-2 border-[#101f3d] pb-2">
          <div className="flex items-start gap-3">
            {biz.logoUrl ? <img src={String(biz.logoUrl)} alt="" className="h-12 max-w-[110px] shrink-0 object-contain" /> : null}
            <div>
            <h1 className="text-xl font-bold tracking-wide text-[#101f3d]">{String(biz.businessName || '')}</h1>
            {biz.address || biz.city ? <p>{[biz.address, biz.city].filter(Boolean).join(', ') as string}</p> : null}
            {biz.phone ? <p>{String(biz.phone)}</p> : null}
          </div>
          </div>
          <div className="text-right">
            <p className="text-base font-bold text-[#9a7420]">{r.title}</p>
            <p className="font-semibold">{r.period}</p>
            <p className="text-[10px]">Printed {formatDateTime(new Date())}</p>
          </div>
        </header>
        {!!r.summary.length && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {r.summary.map((s) => (
              <div key={s.label} className="rounded border border-black/20 px-2 py-1">
                <p className="text-[9px] uppercase text-black/60">{s.label}</p>
                <p className="font-bold">{summaryText(s.type, s.value)}</p>
              </div>
            ))}
          </div>
        )}
        {r.note && <p className="mt-2 text-[10px] text-black/70">{r.note}</p>}
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="bg-[#101f3d] text-white print:bg-[#101f3d]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              {shown.map((c) => <th key={c.key} className={cn('border border-[#101f3d] px-1.5 py-1 text-left font-semibold', isNumeric(c) && 'text-right')}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {!r.rows.length && <tr><td colSpan={shown.length} className="border border-black/20 px-2 py-3 text-center">No records for this period / filter</td></tr>}
            {r.rows.map((row, i) => {
              const strong = row._kind === 'section' || row._kind === 'subtotal' || row._kind === 'total';
              return (
                <tr key={i} className={cn(strong && 'font-bold', row._kind === 'section' && 'bg-black/5', row._kind === 'total' && 'bg-[#f6efdd]', row._exclude && !strong && 'text-black/50')} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                  {shown.map((c) => <td key={c.key} className={cn('border border-black/20 px-1.5 py-0.5 align-top', isNumeric(c) && 'whitespace-nowrap text-right tabular-nums')}>{row[c.key] === null || row[c.key] === undefined ? '' : cellText(c, row[c.key])}</td>)}
                </tr>
              );
            })}
          </tbody>
          {r.totals && (
            <tfoot>
              <tr className="bg-[#f6efdd] font-bold" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                {shown.map((c, i) => <td key={c.key} className={cn('border border-black/30 px-1.5 py-1', isNumeric(c) && 'whitespace-nowrap text-right')}>{r.totals![c.key] !== undefined ? cellText(c, r.totals![c.key]) : i === 0 ? 'Total' : ''}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
        <PrintFooter />
      </article>
    </div>
  );
}
