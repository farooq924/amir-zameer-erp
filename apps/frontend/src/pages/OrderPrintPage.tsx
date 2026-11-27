import { formatPhone } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { PrintFooter } from '@/components/PrintFooter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { METHOD_LABEL, ORDER_TYPE_LABEL } from '@/features/orders/badges';
import { api, errorMessage } from '@/services/api';
import type { OrderDetail, SettingsMap } from '@/types';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';

/**
 * Printable documents for an order (outside the app layout):
 *  - customer receipt (thermal 58/80 mm from Settings > Printing), optionally for one payment (?receipt=<paymentId>)
 *  - workshop job card on A4 with measurements and no prices (?copy=workshop)
 */
export function OrderPrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const workshop = params.get('copy') === 'workshop';
  const receiptId = params.get('receipt');
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000 });
  const o = q.data;
  const biz = settings.data?.business ?? {};
  const printing = settings.data?.printing ?? {};

  useEffect(() => { if (o) document.title = `${workshop ? 'Job card' : 'Receipt'} ${o.orderNumber}`; }, [o, workshop]);

  if (q.isError) return <div className="p-6"><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></div>;
  if (!o || settings.isLoading) return <div className="mx-auto max-w-[210mm] space-y-3 p-8"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

  const toolbar = (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4">
      <Button onClick={() => window.print()}><Printer /> Print</Button>
    </div>
  );

  if (workshop) {
    return (
      <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
        {toolbar}
        <article className="print-sheet mx-auto max-w-[210mm] bg-white p-10 text-black shadow print:max-w-none print:p-0 print:shadow-none">
          <header className="flex items-start justify-between border-b-2 border-black pb-3">
            <div><h1 className="text-2xl font-bold tracking-wide">{String(biz.businessName || 'AMIR ZAMEER')}</h1><p className="text-sm">Workshop job card</p></div>
            <div className="text-right"><p className="text-2xl font-bold">{o.orderNumber}</p><p className="text-sm">Delivery: <b>{formatDate(o.expectedDeliveryDate)}</b></p></div>
          </header>
          <section className="mt-3 grid grid-cols-2 gap-x-8 text-sm">
            <p><b>Customer:</b> {o.customer.name} ({o.customer.code})</p>
            <p><b>Booked:</b> {formatDate(o.orderDate)}</p>
            <p><b>Type:</b> {ORDER_TYPE_LABEL[o.orderType]}</p>
            <p><b>Tailor:</b> {o.assignedEmployee?.name ?? '________________'}</p>
          </section>
          {o.specialInstructions && <p className="mt-3 border border-black p-2 text-sm"><b>Instructions:</b> {o.specialInstructions}</p>}
          {o.items.map((i) => (
            <section key={i.id} className="mt-5 break-inside-avoid">
              <h2 className="border-b border-black pb-1 text-base font-bold">{i.lineNo}. {i.garmentName} x {i.quantity}
                <span className="ml-2 text-sm font-normal">{i.fabricSource === 'SHOP' ? 'Shop fabric' : "Customer's fabric"}{i.fabricDescription ? `: ${i.fabricDescription}` : ''}{Number(i.fabricQuantity) ? ` (${Number(i.fabricQuantity)} m)` : ''}</span></h2>
              {i.notes && <p className="mt-1 text-sm"><b>Notes:</b> {i.notes}</p>}
              {i.measurement ? (
                <table className="mt-2 w-full border-collapse text-sm">
                  <tbody>
                    {chunk(i.measurement.values, 4).map((row, r) => (
                      <tr key={r}>{row.map((v) => (
                        <td key={v.key} className="w-1/4 border border-black px-2 py-1"><span className="block text-[11px]">{v.label}</span><b className="text-base">{v.value != null ? Number(v.value) : ''}</b>{v.text && <span className="block text-[11px]">{v.text}</span>}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="mt-2 text-sm italic">No measurement recorded.</p>}
              {i.measurement && <p className="mt-1 text-[11px]">{i.measurement.templateName} · {i.measurement.unit === 'CM' ? 'centimetres' : 'inches'}</p>}
            </section>
          ))}
          <footer className="mt-10 flex justify-between text-xs"><span>Cutting: ________ Stitching: ________ Checked: ________</span><span>Printed {formatDateTime(new Date())}</span></footer>
          <PrintFooter />
        </article>
      </div>
    );
  }

  const payment = receiptId ? o.payments.find((p) => p.id === receiptId) : null;
  const width = printing.receiptWidth === '58mm' ? '58mm' : '80mm';
  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      {toolbar}
      <style>{`@media print { @page { size: ${width} auto; margin: 2mm; } }`}</style>
      <article className="receipt mx-auto bg-white p-3 font-mono text-[11px] leading-snug text-black shadow print:shadow-none" style={{ width }}>
        <header className="text-center">
          <p className="text-sm font-bold">{String(biz.businessName || 'AMIR ZAMEER')}</p>
          {biz.tagline ? <p>{String(biz.tagline)}</p> : null}
          {biz.address || biz.city ? <p>{[biz.address, biz.city].filter(Boolean).join(', ')}</p> : null}
          {biz.phone ? <p>{String(biz.phone)}</p> : null}
        </header>
        <Dash />
        <p className="text-center font-bold">{payment ? `PAYMENT RECEIPT ${payment.receiptNo}` : 'ORDER RECEIPT'}</p>
        <Dash />
        <Line l="Order" r={o.orderNumber} />
        <Line l="Date" r={formatDate(o.orderDate)} />
        <Line l="Delivery" r={formatDate(o.expectedDeliveryDate)} />
        <Line l="Customer" r={o.customer.name} />
        <Line l="Mobile" r={formatPhone(o.customer.mobile)} />
        <Dash />
        {o.items.map((i) => (
          <div key={i.id}>
            <p className="font-bold">{i.quantity} x {i.garmentName}</p>
            {Number(i.stitchingAmount) > 0 && <Line l={`  Stitching ${i.quantity} x ${Number(i.stitchingPrice)}`} r={amount(i.stitchingAmount)} />}
            {Number(i.fabricAmount) > 0 && <Line l={`  Fabric ${Number(i.fabricQuantity)} m`} r={amount(i.fabricAmount)} />}
            {Number(i.additionalCharges) > 0 && <Line l="  Extra" r={amount(i.additionalCharges)} />}
          </div>
        ))}
        <Dash />
        {Number(o.additionalCharges) > 0 && <Line l="Extra charges" r={amount(o.additionalCharges)} />}
        {Number(o.discount) > 0 && <Line l="Discount" r={`-${amount(o.discount)}`} />}
        {Number(o.adjustmentsTotal) !== 0 && <Line l="Adjustments" r={amount(o.adjustmentsTotal)} />}
        <Line l="TOTAL" r={formatPKR(o.effectiveTotal)} bold />
        {payment ? (
          <>
            <Dash />
            <Line l="Received now" r={formatPKR(payment.amount)} bold />
            <Line l="Method" r={METHOD_LABEL[payment.method] ?? payment.method} />
            {payment.reference && <Line l="Ref" r={payment.reference} />}
            <Line l="On" r={formatDateTime(payment.paymentDate)} />
          </>
        ) : o.payments.map((p) => <Line key={p.id} l={`Paid ${p.receiptNo}`} r={amount(p.amount)} />)}
        <Line l="Total paid" r={formatPKR(o.paidAmount)} />
        <Line l={Number(o.balanceAmount) < 0 ? 'CREDIT' : 'BALANCE'} r={formatPKR(Math.abs(Number(o.balanceAmount)))} bold />
        <Dash />
        <p className="text-center">{String(printing.invoiceFooter || 'Thank you.')}</p>
        <p className="mt-1 text-center text-[10px]">Printed {formatDateTime(new Date())}</p>
        <PrintFooter variant="receipt" />
      </article>
    </div>
  );
}

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
const amount = (v: string) => Number(v).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function Dash() { return <p className="my-1 overflow-hidden whitespace-nowrap">{'-'.repeat(60)}</p>; }
function Line({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return <p className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}><span className="whitespace-pre">{l}</span><span className="text-right">{r}</span></p>;
}
