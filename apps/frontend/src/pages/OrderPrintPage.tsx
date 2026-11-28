import { formatPhone } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { FileText, MessageCircle, Printer, Receipt, Scissors } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SewingMachineMark } from '@/components/brand';
import { ErrorState } from '@/components/common';
import { PrintFooter } from '@/components/PrintFooter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { METHOD_LABEL, ORDER_TYPE_LABEL } from '@/features/orders/badges';
import { SendWhatsAppDialog } from '@/features/whatsapp/SendWhatsAppDialog';
import { hasPermission } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { cn } from '@/utils/cn';
import { api, errorMessage } from '@/services/api';
import type { OrderDetail, SettingsMap } from '@/types';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';

type Copy = 'receipt' | 'invoice' | 'workshop';

/**
 * Printable documents for an order (outside the app layout):
 *  - customer receipt on 58 / 80 mm thermal paper (?copy=receipt, &width=58mm|80mm), optionally for one payment (?receipt=<paymentId>)
 *  - A4 customer invoice with items, payments, balance and terms (?copy=invoice)
 *  - workshop job card on A4 with measurements and no prices (?copy=workshop)
 * Without ?copy the main print from Settings > Printing opens.
 */
export function OrderPrintPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const user = useAuth((st) => st.user);
  const [waOpen, setWaOpen] = useState(false);
  const receiptId = params.get('receipt');
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000 });
  const o = q.data;
  const biz = settings.data?.business ?? {};
  const printing = settings.data?.printing ?? {};
  const requested = params.get('copy') as Copy | null;
  const copy: Copy = requested === 'workshop' || requested === 'invoice' || requested === 'receipt' ? requested
    : receiptId ? 'receipt' : printing.defaultOrderPrint === 'INVOICE' ? 'invoice' : 'receipt';
  const workshop = copy === 'workshop';
  const width = (params.get('width') ?? String(printing.receiptWidth ?? '80mm')) === '58mm' ? '58mm' : '80mm';
  const copies = Math.min(3, Math.max(1, Number(printing.receiptCopies ?? 1)));

  useEffect(() => { if (o) document.title = `${workshop ? 'Job card' : copy === 'invoice' ? 'Invoice' : 'Receipt'} ${o.orderNumber}`; }, [o, workshop, copy]);
  const printed = useRef(false);
  useEffect(() => {
    if (!o || settings.isLoading || printed.current || !printing.autoPrint) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [o, settings.isLoading, printing.autoPrint]);

  if (q.isError) return <div className="p-6"><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></div>;
  if (!o || settings.isLoading) return <div className="mx-auto max-w-[210mm] space-y-3 p-8"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

  const go = (next: Partial<Record<'copy' | 'width', string>>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (next.copy && next.copy !== 'receipt') p.delete('receipt');
    setParams(p, { replace: true });
  };
  const canWa = hasPermission(user, 'whatsapp', 'CREATE');
  const toolbar = (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1 shadow-sm" role="tablist" aria-label="Document">
        <ToolTab active={copy === 'receipt'} onClick={() => go({ copy: 'receipt' })}><Receipt /> Receipt</ToolTab>
        <ToolTab active={copy === 'invoice'} onClick={() => go({ copy: 'invoice' })}><FileText /> A4 invoice</ToolTab>
        <ToolTab active={workshop} onClick={() => go({ copy: 'workshop' })}><Scissors /> Job card</ToolTab>
      </div>
      <div className="flex flex-wrap gap-2">
        {copy === 'receipt' && (
          <div className="flex gap-1 rounded-lg border bg-card p-1 shadow-sm" role="tablist" aria-label="Paper width">
            <ToolTab active={width === '58mm'} onClick={() => go({ width: '58mm' })}>58 mm</ToolTab>
            <ToolTab active={width === '80mm'} onClick={() => go({ width: '80mm' })}>80 mm</ToolTab>
          </div>
        )}
        {canWa && !workshop && <Button variant="outline" onClick={() => setWaOpen(true)}><MessageCircle className="text-emerald-600" /> WhatsApp</Button>}
        <Button onClick={() => window.print()}><Printer /> Print</Button>
      </div>
      {canWa && <SendWhatsAppDialog open={waOpen} onOpenChange={setWaOpen} context={receiptId ? { type: 'PAYMENT', id: receiptId } : { type: 'ORDER', id: o.id }} purpose={receiptId ? 'PAYMENT_RECEIVED' : 'ORDER_CONFIRMATION'} />}
    </div>
  );
  const logo = printing.showLogoOnReceipt !== false;
  const thanks = String(printing.invoiceFooter || 'Thank you.');

  if (workshop) {
    return (
      <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
        {toolbar}
        <article className="print-sheet mx-auto max-w-[210mm] bg-white p-10 text-black shadow print:max-w-none print:p-0 print:shadow-none">
          <header className="flex items-start justify-between border-b-2 border-black pb-3">
            <div><h1 className="text-2xl font-bold tracking-wide">{String(biz.businessName || '')}</h1><p className="text-sm">Workshop job card</p></div>
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

  if (copy === 'invoice') return <InvoiceSheet o={o} biz={biz} printing={printing} toolbar={toolbar} logo={logo} thanks={thanks} />;

  const payment = receiptId ? o.payments.find((p) => p.id === receiptId) : null;
  const narrow = width === '58mm';
  const receipt = (n: number) => (
      <article key={n} className={cn('receipt mx-auto bg-white p-3 font-mono leading-snug text-black shadow print:shadow-none', narrow ? 'text-[10px]' : 'text-[11px]', n > 0 && 'mt-6 print:mt-0 print:break-before-page')} style={{ width }}>
        <header className="text-center">
          {logo && (biz.logoUrl ? <img src={String(biz.logoUrl)} alt="" className="mx-auto mb-1 max-h-12 max-w-[60%] object-contain grayscale" /> : <SewingMachineMark className="mx-auto mb-1 h-7 w-9 text-black" />)}
          <p className="text-sm font-bold">{String(biz.businessName || '')}</p>
          {biz.tagline ? <p>{String(biz.tagline)}</p> : null}
          {biz.address || biz.city ? <p>{[biz.address, biz.city].filter(Boolean).join(', ')}</p> : null}
          {biz.phone ? <p>{String(biz.phone)}</p> : null}
        </header>
        <Dash />
        <p className="text-center font-bold">{payment ? `${payment.type === 'REFUND' ? 'REFUND' : 'PAYMENT'} RECEIPT ${payment.receiptNo}` : 'ORDER RECEIPT'}</p>
        {payment?.status === 'REVERSED' && <p className="text-center font-bold">*** REVERSED ***</p>}
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
            <Line l={payment.type === 'REFUND' ? 'Refunded' : 'Received now'} r={formatPKR(payment.amount)} bold />
            <Line l="Method" r={METHOD_LABEL[payment.method] ?? payment.method} />
            {payment.reference && <Line l="Ref" r={payment.reference} />}
            <Line l="On" r={formatDateTime(payment.paymentDate)} />
          </>
        ) : o.payments.filter((p) => p.status !== 'REVERSED').map((p) => <Line key={p.id} l={`${p.type === 'REFUND' ? 'Refund' : 'Paid'} ${p.receiptNo}`} r={`${p.type === 'REFUND' ? '-' : ''}${amount(p.amount)}`} />)}
        <Line l="Total paid" r={formatPKR(o.paidAmount)} />
        <Line l={Number(o.balanceAmount) < 0 ? 'CREDIT' : 'BALANCE'} r={formatPKR(Math.abs(Number(o.balanceAmount)))} bold />
        <Dash />
        <p className="text-center">{thanks}</p>
        {copies > 1 && <p className="mt-1 text-center text-[10px] font-bold">{n === 0 ? 'CUSTOMER COPY' : 'SHOP COPY'}</p>}
        <p className="mt-1 text-center text-[10px]">Printed {formatDateTime(new Date())}</p>
        <PrintFooter variant="receipt" />
      </article>
  );
  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      {toolbar}
      <style>{`@media print { @page { size: ${width} auto; margin: 2mm; } }`}</style>
      {Array.from({ length: copies }, (_, n) => receipt(n))}
    </div>
  );
}

function ToolTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      {children}
    </button>
  );
}

/** A4 customer invoice (navy header, item table, payments, balance, terms, signatures, developer footer). */
function InvoiceSheet({ o, biz, printing, toolbar, logo, thanks }: {
  o: OrderDetail; biz: Record<string, unknown>; printing: Record<string, unknown>; toolbar: React.ReactNode; logo: boolean; thanks: string;
}) {
  const payments = o.payments.filter((p) => p.status !== 'REVERSED');
  const balance = Number(o.balanceAmount);
  const terms = String(printing.invoiceTerms ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  const status = o.lifecycle === 'CANCELLED' ? 'CANCELLED' : balance <= 0 ? 'PAID' : Number(o.paidAmount) > 0 ? 'PARTLY PAID' : 'UNPAID';
  const address = [biz.address, biz.city].filter(Boolean).join(', ');
  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      {toolbar}
      <style>{'@media print { @page { size: A4 portrait; margin: 12mm; } }'}</style>
      <article className="invoice print-sheet mx-auto max-w-[210mm] bg-white p-10 text-[13px] text-black shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-4 border-[#101f3d] pb-4">
          <div className="flex items-start gap-3">
            {logo && (biz.logoUrl
              ? <img src={String(biz.logoUrl)} alt="" className="h-14 max-w-[120px] shrink-0 object-contain" />
              : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#101f3d] text-[#be9637] print-color-exact"><SewingMachineMark className="h-9 w-11" /></div>)}
            <div>
              <h1 className="text-2xl font-bold tracking-wide text-[#101f3d]">{String(biz.businessName || '')}</h1>
              {biz.tagline ? <p className="text-sm text-black/70">{String(biz.tagline)}</p> : null}
              {address && <p className="text-xs text-black/70">{address}</p>}
              <p className="text-xs text-black/70">{[biz.phone && `Phone ${String(biz.phone)}`, biz.whatsapp && `WhatsApp ${String(biz.whatsapp)}`, biz.email && String(biz.email)].filter(Boolean).join(' · ')}</p>
              {printing.showNtnOnInvoice !== false && biz.ntn ? <p className="text-xs text-black/70">NTN: {String(biz.ntn)}</p> : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-[0.2em] text-[#be9637]">{String(printing.invoiceTitle || 'INVOICE')}</p>
            <p className="mt-1 text-base font-bold">{o.orderNumber}</p>
            <p className="text-xs">Date: {formatDate(o.orderDate)}</p>
            <p className="mt-1 inline-block rounded border border-black px-2 py-0.5 text-[11px] font-bold">{status}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-6">
          <div className="rounded-md border border-black/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-black/60">Bill to</p>
            <p className="text-base font-bold">{o.customer.name}</p>
            <p className="text-xs">Customer code: {o.customer.code}</p>
            <p className="text-xs">Mobile: {formatPhone(o.customer.mobile)}{o.customer.city ? ` · ${o.customer.city}` : ''}</p>
          </div>
          <div className="rounded-md border border-black/20 p-3 text-xs leading-6">
            <p className="flex justify-between"><span>Order type</span><b>{ORDER_TYPE_LABEL[o.orderType]}</b></p>
            <p className="flex justify-between"><span>Delivery date</span><b>{formatDate(o.actualDeliveryDate ?? o.expectedDeliveryDate) || '-'}</b></p>
            <p className="flex justify-between"><span>Pieces</span><b>{o.totalPieces}</b></p>
            {o.createdBy && <p className="flex justify-between"><span>Booked by</span><b>{o.createdBy.fullName}</b></p>}
          </div>
        </section>

        <table className="mt-5 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#101f3d] text-left text-white print-color-exact">
              <th className="px-2 py-2 font-semibold">#</th><th className="px-2 py-2 font-semibold">Description</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th><th className="px-2 py-2 text-right font-semibold">Stitching</th>
              <th className="px-2 py-2 text-right font-semibold">Fabric</th><th className="px-2 py-2 text-right font-semibold">Extra</th>
              <th className="px-2 py-2 text-right font-semibold">Amount (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id} className="border-b border-black/15 align-top">
                <td className="px-2 py-2">{i.lineNo}</td>
                <td className="px-2 py-2">
                  <b>{i.garmentName}</b>
                  <span className="block text-[11px] text-black/70">{i.fabricSource === 'SHOP' ? `Shop fabric${i.fabric ? `: ${i.fabric.name}` : i.fabricDescription ? `: ${i.fabricDescription}` : ''}${Number(i.fabricQuantity) ? ` (${Number(i.fabricQuantity)} m x ${amount(i.fabricRate)})` : ''}` : `Customer's fabric${i.fabricDescription ? `: ${i.fabricDescription}` : ''}`}</span>
                </td>
                <td className="px-2 py-2 text-right">{i.quantity}</td>
                <td className="px-2 py-2 text-right">{Number(i.stitchingAmount) ? `${i.quantity} x ${amount(i.stitchingPrice)}` : '-'}</td>
                <td className="px-2 py-2 text-right">{Number(i.fabricAmount) ? amount(i.fabricAmount) : '-'}</td>
                <td className="px-2 py-2 text-right">{Number(i.additionalCharges) ? amount(i.additionalCharges) : '-'}</td>
                <td className="px-2 py-2 text-right font-semibold">{amount(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 grid grid-cols-[1fr_260px] gap-6">
          <div>
            {payments.length > 0 && (
              <>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-black/60">Payments</p>
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-black/10">
                        <td className="py-1 font-mono">{p.receiptNo}</td><td className="py-1">{formatDate(p.paymentDate)}</td><td className="py-1">{METHOD_LABEL[p.method] ?? p.method}</td>
                        <td className="py-1 text-right">{p.type === 'REFUND' ? '-' : ''}{amount(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {o.specialInstructions && <p className="mt-3 text-xs"><b>Notes:</b> {o.specialInstructions}</p>}
          </div>
          <div className="text-xs">
            <Row l="Stitching" r={amount(o.stitchingTotal)} />
            {Number(o.fabricTotal) > 0 && <Row l="Fabric" r={amount(o.fabricTotal)} />}
            {Number(o.additionalCharges) > 0 && <Row l="Extra charges" r={amount(o.additionalCharges)} />}
            {Number(o.discount) > 0 && <Row l="Discount" r={`-${amount(o.discount)}`} />}
            {Number(o.adjustmentsTotal) !== 0 && <Row l="Adjustments" r={amount(o.adjustmentsTotal)} />}
            <div className="my-1 border-t-2 border-[#101f3d]" />
            <Row l="Total" r={formatPKR(o.effectiveTotal)} bold />
            <Row l="Paid" r={formatPKR(o.paidAmount)} />
            <div className="mt-1 flex justify-between rounded bg-[#be9637]/15 px-2 py-1.5 text-sm font-bold print-color-exact"><span>{balance < 0 ? 'Credit' : 'Balance due'}</span><span>{formatPKR(Math.abs(balance))}</span></div>
          </div>
        </section>

        {terms.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-black/60">Terms & conditions</p>
            <ol className="mt-1 list-decimal pl-5 text-[11px] leading-5 text-black/80">{terms.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>
        )}
        {printing.showSignatureLine !== false && (
          <section className="mt-12 grid grid-cols-2 gap-16 text-xs">
            <p className="border-t border-black pt-1 text-center">Customer signature</p>
            <p className="border-t border-black pt-1 text-center">For {String(biz.businessName || '')}</p>
          </section>
        )}
        <p className="mt-6 text-center text-sm font-medium">{thanks}</p>
        <p className="mt-1 text-center text-[10px] text-black/60">Printed {formatDateTime(new Date())}</p>
        <PrintFooter />
      </article>
    </div>
  );
}

function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return <p className={cn('flex justify-between py-0.5', bold && 'text-sm font-bold')}><span>{l}</span><span className="tabular-nums">{r}</span></p>;
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
