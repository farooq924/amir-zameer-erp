import { PAYMENT_METHODS, formatPhone } from '@az/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { PrintFooter } from '@/components/PrintFooter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EMPLOYEE_TYPE_LABEL, SALARY_TYPE_LABEL, TASK_LABEL } from '@/features/hr/shared';
import { api, errorMessage } from '@/services/api';
import type { PayrollDetail, Payslip, SettingsMap } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));
const rs = (v: string | number) => `Rs ${Number(v).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Row({ l, r, bold, minus }: { l: string; r: string | number; bold?: boolean; minus?: boolean }) {
  return (
    <tr className={bold ? 'font-bold' : ''}>
      <td className="border-b border-black/20 py-1 pr-2">{l}</td>
      <td className="border-b border-black/20 py-1 text-right tabular-nums">{minus && Number(r) > 0 ? '-' : ''}{rs(r)}</td>
    </tr>
  );
}

/** One payslip (A4 half page). */
export function PayslipSheet({ s, biz }: { s: Payslip; biz: Record<string, unknown> }) {
  const e = s.employeeDetail;
  const totalDeductions = Number(s.absenceDeduction) + Number(s.advanceDeduction) + Number(s.otherDeductions);
  return (
    <article className="payslip mx-auto mb-6 max-w-[210mm] break-inside-avoid bg-white p-8 text-[12px] text-black shadow print:mb-0 print:max-w-none print:p-6 print:shadow-none">
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
          <p className="text-lg font-bold">SALARY SLIP</p>
          <p className="font-semibold">{s.payroll.periodLabel}</p>
          <p className="text-[11px]">{s.payroll.payrollNo}</p>
        </div>
      </header>
      <section className="mt-3 grid grid-cols-2 gap-x-8 gap-y-0.5">
        <p><b>Employee:</b> {e.name}</p>
        <p><b>Code:</b> {e.code}</p>
        {e.fatherName && <p><b>Father's name:</b> {e.fatherName}</p>}
        {e.cnic && <p><b>CNIC:</b> {e.cnic}</p>}
        <p><b>Designation:</b> {e.designation || EMPLOYEE_TYPE_LABEL[e.employeeType]}</p>
        <p><b>Joined:</b> {formatDate(e.joiningDate)}</p>
        <p><b>Salary type:</b> {SALARY_TYPE_LABEL[s.salaryType]}</p>
        <p><b>Days:</b> present {Number(s.presentDays)} · absent {Number(s.absentDays)}</p>
        {e.contactNumber && <p><b>Mobile:</b> {formatPhone(e.contactNumber)}</p>}
        {e.bankAccountNumber && <p><b>Bank:</b> {[e.bankName, e.bankAccountNumber].filter(Boolean).join(' · ')}</p>}
      </section>
      <section className="mt-3 grid grid-cols-2 gap-6">
        <table className="w-full border-collapse">
          <thead><tr><th colSpan={2} className="border-b-2 border-black py-1 text-left">Earnings</th></tr></thead>
          <tbody>
            {Number(s.basicAmount) > 0 && <Row l={s.salaryType === 'DAILY' ? 'Daily wages' : 'Basic salary'} r={s.basicAmount} />}
            {Number(s.pieceAmount) > 0 && <Row l={`Piece work (${s.completedPieces} pcs)`} r={s.pieceAmount} />}
            {Number(s.overtimeAmount) > 0 && <Row l="Overtime" r={s.overtimeAmount} />}
            {Number(s.incentives) > 0 && <Row l="Incentive" r={s.incentives} />}
            {Number(s.bonus) > 0 && <Row l="Bonus" r={s.bonus} />}
            <Row l="Gross salary" r={s.grossAmount} bold />
          </tbody>
        </table>
        <table className="w-full border-collapse">
          <thead><tr><th colSpan={2} className="border-b-2 border-black py-1 text-left">Deductions</th></tr></thead>
          <tbody>
            <Row l={`Absent (${Number(s.absentDays)} day(s))`} r={s.absenceDeduction} minus />
            <Row l="Advance recovery" r={s.advanceDeduction} minus />
            {Number(s.otherDeductions) > 0 && <Row l="Other" r={s.otherDeductions} minus />}
            <Row l="Total deductions" r={totalDeductions} bold minus />
          </tbody>
        </table>
      </section>
      <section className="mt-3 flex items-center justify-between border-2 border-black px-3 py-2">
        <span className="text-base font-bold">NET SALARY</span>
        <span className="text-xl font-bold tabular-nums">{rs(s.netAmount)}</span>
      </section>
      <section className="mt-2 grid grid-cols-2 gap-6">
        <div>
          <p><b>Paid:</b> {rs(s.paidAmount)} · <b>Balance:</b> {rs(s.balance)}</p>
          {s.payments.map((p) => <p key={p.id} className="text-[11px]">{p.paymentNo} · {formatDate(p.paymentDate)} · {METHOD[p.method]}{p.reference ? ` (${p.reference})` : ''} · {rs(p.amount)}</p>)}
        </div>
        <div className="text-[11px]">
          {s.recoveries.length > 0 && <p>Advance recovered: {s.recoveries.map((r) => `${r.advanceNo} ${rs(r.amount)}`).join(', ')}</p>}
          <p>Advance still due: {rs(s.advanceBalanceAfter)}</p>
          {s.notes && <p><b>Note:</b> {s.notes}</p>}
        </div>
      </section>
      {s.production.length > 0 && (
        <section className="mt-2">
          <p className="font-semibold">Piece work</p>
          <p className="text-[10px] leading-snug">{s.production.map((p) => `${formatDate(p.workDate)} ${p.orderNumber} ${p.garmentName} ${TASK_LABEL[p.taskType]} ${p.quantity}x${Number(p.pieceRate)}`).join(' | ')}</p>
        </section>
      )}
      {s.overtime.length > 0 && <p className="mt-1 text-[10px]">Overtime: {s.overtime.map((o) => `${formatDate(o.date)} ${Number(o.hours)} h`).join(', ')}</p>}
      <footer className="mt-8 flex justify-between text-[11px]">
        <span>Employee signature: ____________________</span>
        <span>Authorised by: ____________________</span>
      </footer>
      <p className="mt-2 text-right text-[10px]">Printed {formatDateTime(new Date())}</p>
      <PrintFooter />
    </article>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = title; }, [title]);
  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      <style>{'@media print { @page { size: A4; margin: 8mm; } .payslip + .payslip { break-before: auto; } }'}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4"><Button onClick={() => window.print()}><Printer /> Print</Button></div>
      {children}
    </div>
  );
}

const useBusiness = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000 });
const Loading = () => <div className="mx-auto max-w-[210mm] space-y-3 p-8"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

export function PayslipPrintPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['payslip', id], queryFn: () => api.get<Payslip>(`/payroll/items/${id}/payslip`) });
  const settings = useBusiness();
  if (q.isError) return <div className="p-6"><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></div>;
  if (!q.data || settings.isLoading) return <Loading />;
  return <Shell title={`Payslip ${q.data.employeeDetail.name} ${q.data.payroll.periodKey}`}><PayslipSheet s={q.data} biz={settings.data?.business ?? {}} /></Shell>;
}

/** Every payslip of one payroll, for printing in one go. */
export function PayrollPrintPage() {
  const { id = '' } = useParams();
  const p = useQuery({ queryKey: ['payroll', 'detail', id], queryFn: () => api.get<PayrollDetail>(`/payroll/${id}`) });
  const settings = useBusiness();
  const slips = useQueries({ queries: (p.data?.items ?? []).map((i) => ({ queryKey: ['payslip', i.id], queryFn: () => api.get<Payslip>(`/payroll/items/${i.id}/payslip`) })) });
  if (p.isError) return <div className="p-6"><ErrorState message={errorMessage(p.error)} onRetry={() => p.refetch()} /></div>;
  const failed = slips.find((s) => s.isError);
  if (failed) return <div className="p-6"><ErrorState message={errorMessage(failed.error)} /></div>;
  if (!p.data || settings.isLoading || slips.some((s) => !s.data)) return <Loading />;
  return (
    <Shell title={`Payslips ${p.data.periodKey}`}>
      {slips.map((s) => <PayslipSheet key={s.data!.id} s={s.data!} biz={settings.data?.business ?? {}} />)}
    </Shell>
  );
}
