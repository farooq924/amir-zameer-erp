import { FABRIC_SOURCES, ORDER_TYPES, PAYMENT_METHODS, calculateOrderTotals, toPaisa, unitShort } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, CopyPlus, ExternalLink, Minus, Plus, Printer, RefreshCw, Ruler, Shirt, Trash2, Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FabricPicker, type PickedFabric } from '@/features/inventory/FabricPicker';
import { formatQty } from '@/features/inventory/shared';
import { CustomerPicker, type PickedCustomer } from '@/features/orders/CustomerPicker';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import { newId } from '@/utils/id';
import type { CustomerMeasurementRef, CustomerProfile, FabricOption, OrderDetail, OrderFormOptions } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';

interface ItemForm {
  key: string;
  id?: string;
  garmentTypeId: string; // '' = other / custom
  garmentName: string;
  quantity: number;
  stitchingPrice: string;
  fabricSource: 'CUSTOMER' | 'SHOP';
  fabricDescription: string;
  fabricQuantity: string;
  fabricRate: string;
  /** Shop fabric picked from stock (reserved when the order is saved). */
  fabric: PickedFabric | null;
  /** Edit mode: fabric this item already holds in reserve (counts as free for this item). */
  reservedHere: number;
  additionalCharges: string;
  notes: string;
  measurementId: string; // '' = latest
  refreshMeasurement: boolean;
  currentMeasurement?: string | null; // edit mode: what the order holds now
}

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const QTY = /^\d{1,8}(\.\d{1,3})?$/;
let keySeq = 0;
const newKey = () => `i${++keySeq}`;
const blankItem = (fabricSource: 'CUSTOMER' | 'SHOP'): ItemForm => ({
  key: newKey(), garmentTypeId: '', garmentName: '', quantity: 1, stitchingPrice: '', fabricSource, fabricDescription: '', fabricQuantity: '',
  fabricRate: '', fabric: null, reservedHere: 0, additionalCharges: '', notes: '', measurementId: '', refreshMeasurement: false,
});
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const clean = (v: string) => (v.trim() === '' ? undefined : v.trim());

function itemFromOrder(i: OrderDetail['items'][number], keepId: boolean, alteration: boolean): ItemForm {
  return {
    key: newKey(), id: keepId ? i.id : undefined, garmentTypeId: i.garmentTypeId ?? '', garmentName: i.garmentName,
    quantity: alteration ? Math.max(1, i.deliveredQuantity || i.quantity) : i.quantity,
    stitchingPrice: alteration ? '' : Number(i.stitchingPrice) ? i.stitchingPrice : '', fabricSource: alteration ? 'CUSTOMER' : i.fabricSource,
    fabricDescription: i.fabricDescription ?? '', fabricQuantity: alteration ? '' : Number(i.fabricQuantity) ? String(Number(i.fabricQuantity)) : '',
    fabricRate: alteration ? '' : Number(i.fabricRate) ? i.fabricRate : '',
    fabric: !alteration && i.fabricSource === 'SHOP' && i.fabric ? { ...i.fabric, salePrice: i.fabricRate, purchasePrice: '0', availableStock: '0' } : null,
    reservedHere: keepId && i.stock?.status === 'ACTIVE' ? Number(i.stock.reserved) - Number(i.stock.issued) : 0,
    additionalCharges: alteration ? '' : Number(i.additionalCharges) ? i.additionalCharges : '',
    notes: keepId ? i.notes ?? '' : '', measurementId: keepId ? i.measurement?.sourceMeasurementId ?? '' : '', refreshMeasurement: false,
    currentMeasurement: keepId ? i.measurement?.templateName ?? null : undefined,
  };
}

/** Book, revise, copy or create an alteration order. Tabs: Order Details / Garments / Measurements / Payment. */
export function OrderFormPage() {
  const { id: editId } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const isAlteration = params.get('type') === 'ALTERATION';
  const editing = !!editId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();

  const options = useQuery({ queryKey: ['order-form-options'], queryFn: () => api.get<OrderFormOptions>('/orders/form-options'), staleTime: 60_000 });
  const source = useQuery({
    queryKey: ['order', editId ?? fromId], queryFn: () => api.get<OrderDetail>(`/orders/${editId ?? fromId}`), enabled: !!(editId || fromId),
  });
  const preCustomerId = params.get('customerId');
  const preCustomer = useQuery({ queryKey: ['customer', preCustomerId], queryFn: () => api.get<CustomerProfile>(`/customers/${preCustomerId}`), enabled: !!preCustomerId && !editId && !fromId });

  const [clientId] = useState(() => newId());
  const [tab, setTab] = useState('details');
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [orderType, setOrderType] = useState<string>(isAlteration ? 'ALTERATION' : 'STITCHING');
  const [orderDate, setOrderDate] = useState('');
  const [delivery, setDelivery] = useState('');
  const [instructions, setInstructions] = useState('');
  const [items, setItems] = useState<ItemForm[]>([blankItem('CUSTOMER')]);
  const [charges, setCharges] = useState('');
  const [discount, setDiscount] = useState('');
  const [advance, setAdvance] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<OrderDetail | null>(null);

  // Initialise once the data we depend on has loaded.
  useEffect(() => {
    if (ready || !options.data) return;
    const today = options.data.today;
    const days = Number(options.data.settings.defaultDeliveryDays ?? 7);
    if (editId || fromId) {
      const o = source.data;
      if (!o) return;
      setCustomer({ ...o.customer });
      setOrderType(editing ? o.orderType : isAlteration ? 'ALTERATION' : o.orderType);
      setOrderDate(editing ? o.orderDate : today);
      setDelivery(editing ? o.expectedDeliveryDate ?? '' : addDays(today, isAlteration ? Math.min(days, 3) : days));
      setInstructions(editing ? o.specialInstructions ?? '' : isAlteration ? `Alteration for ${o.orderNumber}: ` : o.specialInstructions ?? '');
      setItems(o.items.map((i) => itemFromOrder(i, editing, isAlteration)));
      if (editing) { setCharges(Number(o.additionalCharges) ? o.additionalCharges : ''); setDiscount(Number(o.discount) ? o.discount : ''); }
    } else {
      if (preCustomerId) { if (!preCustomer.data && !preCustomer.isError) return; if (preCustomer.data) setCustomer(preCustomer.data); }
      setOrderDate(today);
      setDelivery(addDays(today, days));
    }
    setReady(true);
  }, [ready, options.data, source.data, preCustomer.data, preCustomer.isError, editId, fromId, preCustomerId, editing, isAlteration]);

  const measurements = useQuery({
    queryKey: ['order-measurements', customer?.id], queryFn: () => api.get<CustomerMeasurementRef[]>(`/orders/customer-measurements/${customer!.id}`), enabled: !!customer,
  });

  // Live stock of fabrics already on the order being revised or copied.
  const sourceFabricIds = useMemo(() => [...new Set((source.data?.items ?? []).map((i) => i.fabricId).filter((v): v is string => !!v))].join(','), [source.data]);
  const liveFabrics = useQuery({
    queryKey: ['fabric-options', 'orders', 'ids', sourceFabricIds], enabled: !!sourceFabricIds,
    queryFn: () => api.get<FabricOption[]>('/orders/fabric-options', { ids: sourceFabricIds }),
  });
  const liveFabric = useMemo(() => new Map((liveFabrics.data ?? []).map((f) => [f.id, f])), [liveFabrics.data]);
  const pickedFabric = (i: ItemForm): PickedFabric | null => (i.fabric ? { ...i.fabric, ...(liveFabric.get(i.fabric.id) ?? {}), salePrice: liveFabric.get(i.fabric.id)?.salePrice ?? i.fabric.salePrice } : null);
  const freeFor = (i: ItemForm) => {
    const f = pickedFabric(i);
    if (!f) return 0;
    const ownOnOrder = i.fabric && source.data?.items.find((x) => x.id === i.id)?.fabricId === f.id ? i.reservedHere : 0;
    return Number(f.availableStock) + ownOnOrder;
  };

  const garments = useMemo(() => options.data?.garments ?? [], [options.data]);
  const garmentById = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const fabricSale = orderType === 'FABRIC_SALE';
  const totals = useMemo(() => calculateOrderTotals(
    items.map((i) => ({ quantity: i.quantity, stitchingPrice: i.stitchingPrice || '0', fabricQuantity: i.fabricQuantity || '0', fabricRate: (fabricSale || i.fabricSource === 'SHOP') ? i.fabricRate || '0' : '0', additionalCharges: i.additionalCharges || '0' })),
    charges || '0', discount || '0',
  ), [items, charges, discount, fabricSale]);

  const setItem = (key: string, patch: Partial<ItemForm>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const pickGarment = (key: string, garmentTypeId: string) => {
    const g = garmentById.get(garmentTypeId);
    setItems((list) => list.map((i) => {
      if (i.key !== key) return i;
      const next = { ...i, garmentTypeId, measurementId: '', refreshMeasurement: !!i.id };
      if (g) {
        next.garmentName = g.name;
        if (!i.stitchingPrice && Number(g.defaultStitchingPrice) && orderType !== 'ALTERATION') next.stitchingPrice = g.defaultStitchingPrice;
        if (!i.fabricQuantity && i.fabricSource === 'SHOP' && Number(g.defaultFabricConsumption)) next.fabricQuantity = String(Number(g.defaultFabricConsumption) * i.quantity);
      }
      return next;
    }));
  };
  const changeType = (t: string) => {
    setOrderType(t);
    if (t === 'STITCHING_WITH_FABRIC' || t === 'FABRIC_SALE') setItems((l) => l.map((i) => ({ ...i, fabricSource: 'SHOP' })));
    if (t === 'STITCHING' || t === 'ALTERATION') setItems((l) => l.map((i) => ({ ...i, fabricSource: 'CUSTOMER', fabricRate: '' })));
  };

  // ---------------------------------------------------------------- validation
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!customer) e.customer = 'Select a customer';
    if (!orderDate) e.orderDate = 'Select the order date';
    if (delivery && orderDate && delivery < orderDate) e.delivery = 'Delivery date cannot be before the order date';
    if (!items.length) e.items = 'Add at least one garment';
    items.forEach((i) => {
      if (i.garmentName.trim().length < 2) e[`${i.key}.name`] = 'Select a garment or type its name';
      if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 999) e[`${i.key}.qty`] = 'Quantity must be 1 to 999';
      if (!fabricSale && !MONEY.test(i.stitchingPrice.trim())) e[`${i.key}.price`] = 'Enter the stitching price (0 if free)';
      if (fabricSale && i.stitchingPrice && !MONEY.test(i.stitchingPrice.trim())) e[`${i.key}.price`] = 'Enter a valid amount';
      if (i.fabricQuantity && !QTY.test(i.fabricQuantity.trim())) e[`${i.key}.fqty`] = 'Use a number like 4.5';
      else if ((fabricSale || i.fabricSource === 'SHOP') && i.fabric && !(Number(i.fabricQuantity) > 0)) e[`${i.key}.fqty`] = 'Enter how much fabric is needed';
      if ((fabricSale || i.fabricSource === 'SHOP') && i.fabricRate && !MONEY.test(i.fabricRate.trim())) e[`${i.key}.rate`] = 'Enter a valid rate';
      if (i.additionalCharges && !MONEY.test(i.additionalCharges.trim())) e[`${i.key}.extra`] = 'Enter a valid amount';
    });
    if (charges && !MONEY.test(charges.trim())) e.charges = 'Enter a valid amount';
    if (discount && !MONEY.test(discount.trim())) e.discount = 'Enter a valid amount';
    if (discount && toPaisa(discount) > toPaisa(totals.subtotal)) e.discount = 'Discount cannot be more than the order amount';
    if (advance) {
      if (!MONEY.test(advance.trim())) e.advance = 'Enter a valid amount';
      else if (toPaisa(advance) > toPaisa(totals.totalAmount)) e.advance = 'Advance cannot be more than the total';
    }
    const s = options.data?.settings;
    if (!editing && s?.requireAdvancePayment && toPaisa(totals.totalAmount) > 0) {
      const min = Math.round((toPaisa(totals.totalAmount) * Number(s.minimumAdvancePercent ?? 0)) / 100);
      if (toPaisa(advance) < min) e.advance = `Advance of at least ${formatPKR(min / 100)} is required`;
    }
    return e;
  }, [customer, orderDate, delivery, items, fabricSale, charges, discount, advance, totals, options.data, editing]);
  const tabOf = (k: string) => (k === 'customer' || k === 'orderDate' || k === 'delivery' ? 'details' : k === 'charges' || k === 'discount' || k === 'advance' ? 'payment' : 'garments');
  const err = (k: string) => (submitted ? errors[k] : undefined);
  const tabHasError = (t: string) => submitted && Object.keys(errors).some((k) => tabOf(k) === t);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        orderType, orderDate, expectedDeliveryDate: delivery || undefined, specialInstructions: instructions.trim(),
        additionalCharges: clean(charges) ?? '0', discount: clean(discount) ?? '0',
        items: items.map((i) => ({
          id: i.id, garmentTypeId: i.garmentTypeId || undefined, garmentName: i.garmentName.trim(), quantity: i.quantity,
          stitchingPrice: clean(i.stitchingPrice) ?? '0', fabricSource: fabricSale ? 'SHOP' : i.fabricSource, fabricDescription: i.fabricDescription.trim() || undefined,
          fabricId: (fabricSale || i.fabricSource === 'SHOP') && i.fabric ? i.fabric.id : null,
          fabricQuantity: clean(i.fabricQuantity), fabricRate: (fabricSale || i.fabricSource === 'SHOP') ? clean(i.fabricRate) : undefined,
          additionalCharges: clean(i.additionalCharges), notes: i.notes.trim() || undefined,
          measurementId: i.measurementId || undefined, refreshMeasurement: i.refreshMeasurement || undefined,
        })),
      };
      if (editing) return api.put<OrderDetail>(`/orders/${editId}`, { ...body, version: source.data!.version, revisionNote: revisionNote.trim() || undefined });
      return api.post<OrderDetail>('/orders', {
        ...body, id: clientId, customerId: customer!.id, duplicatedFromId: fromId || undefined,
        advance: toPaisa(advance) > 0 ? { amount: advance.trim(), method, reference: reference.trim() || undefined } : undefined,
      });
    },
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order', o.id] });
      void qc.invalidateQueries({ queryKey: ['customer', o.customer.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (editing) { toast.success(`Order ${o.orderNumber} updated`); navigate(`/orders/${o.id}`); } else setCreated(o);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    setSubmitted(true);
    const keys = Object.keys(errors);
    if (keys.length) {
      setTab(tabOf(keys[0]));
      toast.error('Please complete the highlighted fields');
      return;
    }
    save.mutate();
  };

  if (options.isError || source.isError) return <ErrorState message={errorMessage(options.error ?? source.error)} onRetry={() => { void options.refetch(); void source.refetch(); }} />;
  if (!ready) return <LoadingState label="Loading order form..." />;
  if (editing && source.data && !['OPEN', 'PARTIALLY_DELIVERED'].includes(source.data.lifecycle)) {
    return <ErrorState message="Only open orders can be revised. Use an adjustment on a delivered order." />;
  }

  const title = editing ? `Edit ${source.data?.orderNumber}` : isAlteration ? 'New alteration order' : fromId ? 'Copy order' : 'New order';
  const backTo = editing ? `/orders/${editId}` : fromId ? `/orders/${fromId}` : '/orders';
  const pieces = items.reduce((a, i) => a + (i.quantity || 0), 0);
  const balance = toPaisa(totals.totalAmount) - (editing ? toPaisa(source.data?.paidAmount) : toPaisa(advance)) + (editing ? toPaisa(source.data?.adjustmentsTotal) : 0);
  const versionsFor = (templateId: string | null | undefined) => (measurements.data ?? []).filter((m) => m.templateId === templateId);

  const summary = (
    <Card className="lg:sticky lg:top-4">
      <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> Order summary</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Customer">{customer ? customer.name : <span className="text-muted-foreground">Not selected</span>}</Row>
        <Row label="Garments">{pieces} piece(s)</Row>
        <Row label="Delivery">{delivery ? formatDate(delivery) : '-'}</Row>
        <div className="my-2 border-t" />
        <Row label="Stitching">{formatPKR(totals.stitchingTotal)}</Row>
        <Row label="Fabric">{formatPKR(totals.fabricTotal)}</Row>
        {toPaisa(totals.itemCharges) + toPaisa(charges) > 0 && <Row label="Extra charges">{formatPKR((toPaisa(totals.itemCharges) + toPaisa(charges)) / 100)}</Row>}
        {toPaisa(discount) > 0 && <Row label="Discount">- {formatPKR(discount)}</Row>}
        <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2.5 text-white dark:bg-navy-soft">
          <span className="text-sm text-white/80">Total</span><span className="text-lg font-bold tabular-nums">{formatPKR(totals.totalAmount)}</span>
        </div>
        {editing ? <Row label="Already paid">{formatPKR(source.data?.paidAmount)}</Row> : <Row label="Advance">{formatPKR(advance || 0)}</Row>}
        <Row label="Balance"><span className={cn('font-semibold', balance > 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(balance / 100)}</span></Row>
        <Button className="mt-2 w-full" size="lg" loading={save.isPending} onClick={submit}>{editing ? 'Save changes' : 'Save Order'}</Button>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {fromId && source.data && <Badge variant="gold">From {source.data.orderNumber}</Badge>}
        {editing && source.data && <Badge variant="outline">Revision {source.data.revisionNo + 1}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="w-full justify-start sm:w-auto">
            {[['details', 'Order Info'], ['garments', 'Garments'], ['measurements', 'Measurements'], ['payment', 'Payment']].map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="relative">{l}{tabHasError(v) && <span className="ml-1.5 h-2 w-2 rounded-full bg-destructive" aria-label="has errors" />}</TabsTrigger>
            ))}
          </TabsList>

          {/* ------------------------------------------------ Order info */}
          <TabsContent value="details" className="mt-4">
            <Card><CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label required>Customer</Label>
                <CustomerPicker value={customer} onChange={setCustomer} invalid={!!err('customer')} disabled={editing || !!fromId} />
                <FieldError message={err('customer')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Order type</Label>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {ORDER_TYPES.map((t) => (
                    <button key={t.key} type="button" onClick={() => changeType(t.key)} aria-pressed={orderType === t.key}
                      className={cn('rounded-lg border p-2.5 text-left transition-colors', orderType === t.key ? 'border-primary bg-gold-soft' : 'bg-card hover:border-primary')}>
                      <span className="block text-sm font-semibold">{t.label}</span><span className="block text-[11px] text-muted-foreground">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="o-date" required>Order date</Label>
                <Input id="o-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} aria-invalid={!!err('orderDate')} /><FieldError message={err('orderDate')} /></div>
              <div className="space-y-1.5"><Label htmlFor="o-due" required>Delivery date</Label>
                <Input id="o-due" type="date" value={delivery} min={orderDate} onChange={(e) => setDelivery(e.target.value)} aria-invalid={!!err('delivery')} /><FieldError message={err('delivery')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="o-notes">Special instructions</Label>
                <Textarea id="o-notes" rows={3} maxLength={2000} placeholder="e.g. Loose fitting, 2 side pockets, urgent for wedding on Friday" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
              {editing && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="o-rev">Reason for change</Label>
                <Input id="o-rev" maxLength={500} placeholder="e.g. Customer added one more suit" value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} /></div>}
              <div className="flex justify-end sm:col-span-2"><Button type="button" variant="navy" onClick={() => setTab('garments')}>Next: Garments</Button></div>
            </CardContent></Card>
          </TabsContent>

          {/* ------------------------------------------------ Garments */}
          <TabsContent value="garments" className="mt-4 space-y-3">
            {items.map((i, idx) => {
              const g = garmentById.get(i.garmentTypeId);
              const shop = fabricSale || i.fabricSource === 'SHOP';
              const line = totals.lines[idx];
              return (
                <Card key={i.key}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
                    <CardTitle className="flex items-center gap-2 text-sm"><span className="icon-tile h-8 w-8 rounded-lg bg-gold-soft text-[#8a6a1f] dark:text-gold"><Shirt className="h-4 w-4" /></span>Garment {idx + 1}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{formatPKR(line?.lineTotal)}</span>
                      {items.length > 1 && (!i.id || source.data?.items.find((x) => x.id === i.id)?.canRemove) && (
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove garment ${idx + 1}`} onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}><Trash2 className="text-destructive" /></Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 pt-3 sm:grid-cols-6">
                    <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${i.key}-g`} required>Garment</Label>
                      <NativeSelect id={`${i.key}-g`} value={i.garmentTypeId} onChange={(e) => pickGarment(i.key, e.target.value)}>
                        <option value="">Other (type name)</option>
                        {garments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </NativeSelect></div>
                    <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${i.key}-n`} required>Name on order</Label>
                      <Input id={`${i.key}-n`} maxLength={100} placeholder="e.g. Sherwani" value={i.garmentName} onChange={(e) => setItem(i.key, { garmentName: e.target.value })} aria-invalid={!!err(`${i.key}.name`)} />
                      <FieldError message={err(`${i.key}.name`)} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${i.key}-q`} required>Quantity</Label>
                      <div className="flex">
                        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-r-none" aria-label="Less" onClick={() => setItem(i.key, { quantity: Math.max(1, i.quantity - 1) })}><Minus /></Button>
                        <Input id={`${i.key}-q`} inputMode="numeric" className="rounded-none text-center" value={i.quantity || ''} onChange={(e) => setItem(i.key, { quantity: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-invalid={!!err(`${i.key}.qty`)} />
                        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-l-none" aria-label="More" onClick={() => setItem(i.key, { quantity: Math.min(999, i.quantity + 1) })}><Plus /></Button>
                      </div><FieldError message={err(`${i.key}.qty`)} /></div>
                    {!fabricSale && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${i.key}-p`} required>{orderType === 'ALTERATION' ? 'Alteration charge (each)' : 'Stitching price (each)'}</Label>
                      <Input id={`${i.key}-p`} inputMode="decimal" placeholder={g && Number(g.defaultStitchingPrice) ? g.defaultStitchingPrice : '0'} value={i.stitchingPrice} onChange={(e) => setItem(i.key, { stitchingPrice: e.target.value })} aria-invalid={!!err(`${i.key}.price`)} />
                      <FieldError message={err(`${i.key}.price`)} /></div>}
                    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${i.key}-x`}>Extra charges</Label>
                      <Input id={`${i.key}-x`} inputMode="decimal" placeholder="Buttons, embroidery..." value={i.additionalCharges} onChange={(e) => setItem(i.key, { additionalCharges: e.target.value })} aria-invalid={!!err(`${i.key}.extra`)} />
                      <FieldError message={err(`${i.key}.extra`)} /></div>
                    {!fabricSale && (
                      <div className="space-y-1.5 sm:col-span-6"><Label>Fabric</Label>
                        <div className="flex gap-2">
                          {FABRIC_SOURCES.map((f) => (
                            <button key={f.key} type="button" aria-pressed={i.fabricSource === f.key} onClick={() => setItem(i.key, { fabricSource: f.key, ...(f.key === 'CUSTOMER' ? { fabricRate: '', fabric: null } : {}) })}
                              className={cn('h-9 rounded-full border px-3 text-xs font-semibold', i.fabricSource === f.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary')}>{f.label}</button>
                          ))}
                        </div></div>
                    )}
                    {shop && (
                      <div className="space-y-1.5 sm:col-span-6"><Label>Fabric from stock</Label>
                        <FabricPicker source="orders" value={pickedFabric(i)} extraFree={pickedFabric(i) ? freeFor(i) - Number(pickedFabric(i)!.availableStock) : 0}
                          disabled={!!(i.id && source.data?.items.find((x) => x.id === i.id)?.stock?.issued && Number(source.data.items.find((x) => x.id === i.id)!.stock!.issued) > 0)}
                          placeholder="Search shop fabric (leave empty if not in stock)"
                          onChange={(f) => setItem(i.key, f
                            ? { fabric: f, fabricRate: Number(f.salePrice) ? String(Number(f.salePrice)) : i.fabricRate, fabricDescription: '' }
                            : { fabric: null })} />
                        {i.fabric && Number(i.fabricQuantity) > freeFor(i) && (
                          <p className="text-xs font-medium text-rose-700 dark:text-rose-400">Only {formatQty(freeFor(i), i.fabric.unit)} is free in stock. Buy more or choose another fabric.</p>
                        )}
                        {i.fabric && <p className="text-[11px] text-muted-foreground">This fabric is reserved when you save, and taken from stock when the garment is delivered.</p>}
                      </div>
                    )}
                    {!(shop && i.fabric) && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${i.key}-fd`}>Fabric details</Label>
                      <Input id={`${i.key}-fd`} maxLength={200} placeholder="e.g. Italian wool, navy" value={i.fabricDescription} onChange={(e) => setItem(i.key, { fabricDescription: e.target.value })} /></div>}
                    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${i.key}-fq`} required={!!(shop && i.fabric)}>Fabric ({i.fabric ? unitShort(i.fabric.unit) : 'meters'})</Label>
                      <Input id={`${i.key}-fq`} inputMode="decimal" placeholder={g && Number(g.defaultFabricConsumption) ? `${Number(g.defaultFabricConsumption) * (i.quantity || 1)}` : '0'} value={i.fabricQuantity} onChange={(e) => setItem(i.key, { fabricQuantity: e.target.value })} aria-invalid={!!err(`${i.key}.fqty`)} />
                      <FieldError message={err(`${i.key}.fqty`)} /></div>
                    {shop && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${i.key}-fr`}>Fabric rate (per {i.fabric ? unitShort(i.fabric.unit) : 'meter'})</Label>
                      <Input id={`${i.key}-fr`} inputMode="decimal" placeholder="0" value={i.fabricRate} onChange={(e) => setItem(i.key, { fabricRate: e.target.value })} aria-invalid={!!err(`${i.key}.rate`)} />
                      <FieldError message={err(`${i.key}.rate`)} /></div>}
                    <div className="space-y-1.5 sm:col-span-6"><Label htmlFor={`${i.key}-nt`}>Notes for the tailor</Label>
                      <Input id={`${i.key}-nt`} maxLength={1000} placeholder="Collar style, pockets, design..." value={i.notes} onChange={(e) => setItem(i.key, { notes: e.target.value })} /></div>
                    {line && <p className="text-xs text-muted-foreground sm:col-span-6">
                      Stitching {formatPKR(line.stitchingAmount)} + fabric {formatPKR(line.fabricAmount)}{toPaisa(i.additionalCharges) ? ` + extra ${formatPKR(i.additionalCharges)}` : ''} = <span className="font-semibold text-foreground">{formatPKR(line.lineTotal)}</span>
                    </p>}
                  </CardContent>
                </Card>
              );
            })}
            <FieldError message={err('items')} />
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="gold" disabled={items.length >= 50} onClick={() => setItems((l) => [...l, blankItem(orderType === 'STITCHING_WITH_FABRIC' || fabricSale ? 'SHOP' : 'CUSTOMER')])}><Plus /> Add garment</Button>
              <Button type="button" variant="navy" onClick={() => setTab(fabricSale ? 'payment' : 'measurements')}>Next: {fabricSale ? 'Payment' : 'Measurements'}</Button>
            </div>
          </TabsContent>

          {/* ------------------------------------------------ Measurements */}
          <TabsContent value="measurements" className="mt-4">
            <Card><CardContent className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">A copy of the chosen measurement is saved with the order. Later changes to the customer's measurements will not change this order.</p>
              {!customer ? <p className="text-sm">Select the customer first.</p> : fabricSale ? <p className="text-sm">Fabric sales do not need measurements.</p> : (
                <>
                  {items.map((i, idx) => {
                    const templateId = garmentById.get(i.garmentTypeId)?.measurementTemplate?.id;
                    const versions = templateId ? versionsFor(templateId) : (measurements.data ?? []);
                    const latest = versions.find((v) => v.isLatest) ?? versions[0];
                    return (
                      <div key={i.key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{idx + 1}. {i.garmentName || 'Garment'}</p>
                          {i.currentMeasurement && !i.refreshMeasurement && <p className="text-xs text-muted-foreground">On this order: {i.currentMeasurement}</p>}
                          {!templateId && !i.measurementId && <p className="text-xs text-muted-foreground">No measurement template linked to this garment. You can pick any saved measurement.</p>}
                        </div>
                        {versions.length ? (
                          <div className="flex flex-col gap-1 sm:w-80">
                            <NativeSelect aria-label={`Measurement for ${i.garmentName || `garment ${idx + 1}`}`} value={i.measurementId}
                              onChange={(e) => setItem(i.key, { measurementId: e.target.value, refreshMeasurement: !!i.id && !e.target.value })}>
                              <option value="">{templateId ? `Latest: V${latest.versionNo} (${formatDate(latest.takenAt)})` : 'No measurement'}</option>
                              {versions.map((v) => <option key={v.id} value={v.id}>{v.templateName} V{v.versionNo} · {formatDate(v.takenAt)}{v.isLatest ? ' (latest)' : ''}</option>)}
                            </NativeSelect>
                            {i.id && i.currentMeasurement && (
                              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={i.refreshMeasurement} onChange={(e) => setItem(i.key, { refreshMeasurement: e.target.checked })} /> Copy the latest measurement again</label>
                            )}
                          </div>
                        ) : templateId ? (
                          <div className="flex flex-col items-start gap-1 sm:items-end">
                            <Badge variant="warning"><AlertTriangle className="h-3 w-3" /> No {garmentById.get(i.garmentTypeId)?.measurementTemplate?.name} measurement yet</Badge>
                            {can('measurements', 'CREATE') && <Link className="inline-flex items-center gap-1 text-xs font-medium text-primary underline" to={`/customers/${customer.id}?tab=measurements`} target="_blank"><Ruler className="h-3 w-3" /> Take measurement <ExternalLink className="h-3 w-3" /></Link>}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button type="button" variant="outline" loading={measurements.isFetching} onClick={() => measurements.refetch()}><RefreshCw /> Reload measurements</Button>
                    <Button type="button" variant="navy" onClick={() => setTab('payment')}>Next: Payment</Button>
                  </div>
                </>
              )}
            </CardContent></Card>
          </TabsContent>

          {/* ------------------------------------------------ Payment */}
          <TabsContent value="payment" className="mt-4">
            <Card><CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="o-charges">Order extra charges</Label>
                <Input id="o-charges" inputMode="decimal" placeholder="e.g. urgent delivery" value={charges} onChange={(e) => setCharges(e.target.value)} aria-invalid={!!err('charges')} /><FieldError message={err('charges')} /></div>
              <div className="space-y-1.5"><Label htmlFor="o-disc">Discount</Label>
                <Input id="o-disc" inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-invalid={!!err('discount')} /><FieldError message={err('discount')} /></div>
              {editing ? (
                <p className="rounded-md bg-muted p-3 text-sm sm:col-span-2">Payments are received from the order page with <b>Receive payment</b>.</p>
              ) : can('payments', 'CREATE') ? (<>
                <div className="space-y-1.5"><Label htmlFor="o-adv">Advance received</Label>
                  <div className="flex gap-2">
                    <Input id="o-adv" inputMode="decimal" placeholder="0" value={advance} onChange={(e) => setAdvance(e.target.value)} aria-invalid={!!err('advance')} />
                    <Button type="button" variant="outline" onClick={() => setAdvance(totals.totalAmount)}>Full</Button>
                  </div><FieldError message={err('advance')} />
                  {options.data?.settings.requireAdvancePayment && <p className="text-[11px] text-muted-foreground">Minimum advance: {String(options.data.settings.minimumAdvancePercent ?? 0)}% of the total.</p>}
                </div>
                <div className="space-y-1.5"><Label htmlFor="o-method">Payment method</Label>
                  <NativeSelect id="o-method" value={method} onChange={(e) => setMethod(e.target.value)} disabled={!toPaisa(advance)}>
                    {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </NativeSelect></div>
                {method !== 'CASH' && toPaisa(advance) > 0 && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="o-ref">Reference / transaction id</Label>
                  <Input id="o-ref" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
              </>) : <p className="text-sm text-muted-foreground sm:col-span-2">You do not have permission to receive payments.</p>}
              <div className="flex items-center gap-2 rounded-lg bg-gold-soft p-3 text-sm sm:col-span-2"><Wallet className="h-4 w-4 text-primary" />
                Total <b className="tabular-nums">{formatPKR(totals.totalAmount)}</b> · Balance after this <b className="tabular-nums">{formatPKR(balance / 100)}</b></div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
        <div>{summary}</div>
      </div>

      {/* Success modal (matches the "Order Created" mockup) */}
      <Dialog open={!!created} onOpenChange={(o) => { if (!o && created) navigate(`/orders/${created.id}`); }}>
        <DialogContent className="max-w-sm text-center">
          <div className="icon-tile mx-auto mt-2 h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"><CheckCircle2 className="h-8 w-8" /></div>
          <div className="space-y-1.5">
            <DialogTitle className="justify-center text-lg">Order Created</DialogTitle>
            <DialogDescription>Order {created?.orderNumber} has been created successfully.{created && Number(created.paidAmount) > 0 ? ` Receipt ${created.payments[0]?.receiptNo} for ${formatPKR(created.paidAmount)}.` : ''}</DialogDescription>
          </div>
          <div className="grid gap-2">
            <Button variant="navy" onClick={() => navigate(`/orders/${created!.id}`)}>View Order</Button>
            {can('orders', 'PRINT') && <Button variant="outline" asChild><Link to={`/print/orders/${created?.id}`} target="_blank"><Printer /> Print receipt</Link></Button>}
            <Button variant="ghost" onClick={() => { setCreated(null); navigate('/orders/new', { replace: true }); }}><CopyPlus /> Book another order</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right tabular-nums">{children}</span></div>;
}
