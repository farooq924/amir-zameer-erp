import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { PrintFooter } from '@/components/PrintFooter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { METHOD_LABEL } from '@/features/finance/shared';
import { api, errorMessage } from '@/services/api';
import type { SettingsMap } from '@/types';
import type { Expense } from '@/types/finance';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';

const STATUS: Record<string, string> = { APPROVED: 'APPROVED', PENDING_APPROVAL: 'WAITING FOR APPROVAL', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' };

/** Expense payment voucher (A5 / half A4) with signature boxes. */
export function ExpenseVoucherPrintPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['expenses', id], queryFn: () => api.get<Expense>(`/expenses/${id}`) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000, retry: false });
  useEffect(() => { if (q.data) document.title = `Expense voucher ${q.data.expenseNo}`; }, [q.data]);
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data || settings.isLoading) return <div className="mx-auto max-w-[210mm] p-8"><Skeleton className="h-96 w-full" /></div>;
  const x = q.data;
  const biz = (settings.data?.business ?? {}) as Record<string, unknown>;
  const Row = ({ l, r }: { l: string; r: string | null | undefined }) => (
    <tr><td className="w-40 border border-black/30 px-2 py-1.5 font-semibold">{l}</td><td className="border border-black/30 px-2 py-1.5">{r || '-'}</td></tr>
  );
  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4"><Button onClick={() => window.print()}><Printer /> Print</Button></div>
      <style>{'@media print { @page { size: A5 landscape; margin: 8mm; } }'}</style>
      <article className="mx-auto max-w-[210mm] bg-white p-8 text-[12px] text-black shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-black pb-2">
          <div className="flex items-start gap-3">
            {biz.logoUrl ? <img src={String(biz.logoUrl)} alt="" className="h-12 max-w-[110px] shrink-0 object-contain" /> : null}
            <div>
            <h1 className="text-xl font-bold tracking-wide">{String(biz.businessName || '')}</h1>
            {biz.address || biz.city ? <p>{[biz.address, biz.city].filter(Boolean).join(', ') as string}</p> : null}
            {biz.phone ? <p>{String(biz.phone)}</p> : null}
          </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">EXPENSE VOUCHER</p>
            <p className="font-mono font-semibold">{x.expenseNo}</p>
            <p>{formatDate(x.expenseDate)}</p>
          </div>
        </header>
        <table className="mt-4 w-full border-collapse">
          <tbody>
            <Row l="Category" r={x.category.name} />
            <Row l="Description" r={x.description} />
            <Row l="Paid to" r={x.paidTo} />
            <Row l="Paid by" r={METHOD_LABEL[x.paymentMethod] ?? x.paymentMethod} />
            <Row l="Bill / reference" r={x.reference} />
            <Row l="Account" r={x.category.account ? `${x.category.account.code} ${x.category.account.name}` : null} />
            {x.notes && <Row l="Notes" r={x.notes} />}
            <tr><td className="border border-black/30 px-2 py-2 font-bold">Amount</td><td className="border border-black/30 px-2 py-2 text-lg font-bold">{formatPKR(x.amount)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-[11px]">Status: <b>{STATUS[x.status] ?? x.status}</b>{x.approvedBy ? ` by ${x.approvedBy.fullName}` : ''}{x.journal ? ` · Journal ${x.journal.entryNo}` : ''}</p>
        <section className="mt-10 grid grid-cols-3 gap-6 text-center">
          <div><div className="border-t border-black pt-1">Prepared by{x.createdBy ? `: ${x.createdBy.fullName}` : ''}</div></div>
          <div><div className="border-t border-black pt-1">Approved by</div></div>
          <div><div className="border-t border-black pt-1">Received by</div></div>
        </section>
        <p className="mt-4 text-right text-[10px]">Printed {formatDateTime(new Date())}</p>
        <PrintFooter />
      </article>
    </div>
  );
}
