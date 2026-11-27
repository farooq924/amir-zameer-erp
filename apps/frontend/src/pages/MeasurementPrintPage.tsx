import { formatPhone } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/services/api';
import type { Measurement, SettingsMap } from '@/types';
import { formatDateTime } from '@/utils/format';

/** A4 measurement sheet for the cutting master. Rendered outside the app layout. */
export function MeasurementPrintPage() {
  const { id = '' } = useParams();
  const m = useQuery({ queryKey: ['measurements', id], queryFn: () => api.get<Measurement>(`/measurements/${id}`) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000 });
  const biz = settings.data?.business ?? {};
  const d = m.data;

  useEffect(() => {
    if (d) document.title = `Measurement ${d.customer.code} ${d.template.name} V${d.versionNo}`;
  }, [d]);

  if (m.isError) return <div className="p-6"><ErrorState message={errorMessage(m.error)} onRetry={() => m.refetch()} /></div>;
  if (!d || settings.isLoading) return <div className="mx-auto max-w-[210mm] space-y-3 p-8"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  const unit = d.unit === 'CM' ? 'cm' : 'in';

  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4">
        <Button onClick={() => window.print()}><Printer /> Print</Button>
      </div>
      <article className="print-sheet mx-auto max-w-[210mm] bg-white p-10 text-black shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-black pb-3">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">{String(biz.businessName || 'AMIR ZAMEER')}</h1>
            {biz.tagline ? <p className="text-sm">{String(biz.tagline)}</p> : null}
            <p className="text-xs">{[biz.address, biz.city].filter(Boolean).join(', ')}{biz.phone ? ` · ${String(biz.phone)}` : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Measurement Sheet</p>
            <p className="text-sm">{d.template.name} · Version {d.versionNo}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <p><span className="font-semibold">Customer:</span> {d.customer.name}</p>
          <p><span className="font-semibold">Code:</span> {d.customer.code}</p>
          <p><span className="font-semibold">Mobile:</span> {formatPhone(d.customer.mobile)}</p>
          <p><span className="font-semibold">Measured on:</span> {formatDateTime(d.takenAt)}</p>
          <p><span className="font-semibold">Measured by:</span> {d.takenByName ?? '-'}</p>
          <p><span className="font-semibold">Unit:</span> {d.unit === 'CM' ? 'Centimetres' : 'Inches'}</p>
        </section>

        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black px-3 py-1.5 text-left">Measurement</th>
              <th className="w-32 border border-black px-3 py-1.5 text-right">Value ({unit})</th>
              <th className="border border-black px-3 py-1.5 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {d.values.map((v) => (
              <tr key={v.fieldKey}>
                <td className="border border-black px-3 py-1.5">{v.fieldLabel}</td>
                <td className="border border-black px-3 py-1.5 text-right text-base font-semibold tabular-nums">{v.value != null ? Number(v.value) : ''}</td>
                <td className="border border-black px-3 py-1.5">{v.textValue ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {d.notes && <section className="mt-4 text-sm"><p className="font-semibold">Notes</p><p className="whitespace-pre-wrap">{d.notes}</p></section>}

        <footer className="mt-10 flex justify-between text-xs">
          <span>Cutting master: ____________________</span>
          <span>Printed {formatDateTime(new Date())}</span>
        </footer>
      </article>
    </div>
  );
}
