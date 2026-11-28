import { PAYMENT_METHODS, formatPhone, normalizePhone } from '@az/shared';
import { Banknote, ClipboardList, Plus, Ruler, Trash2, UserPlus, UserRoundPen } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayPK } from '@/features/finance/shared';
import { type CachedCustomer, type CachedOrder, db, getMeta } from '@/offline/db';
import { pendingOpFor, useSync } from '@/offline/sync';
import { formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';
import { CUSTOMER_TYPES_FALLBACK } from './constants';
import { useLive } from './use-live';

function savedToast(what: string) {
  if (useSync.getState().online) toast.success(`${what} saved. Sending to the server...`);
  else toast.success(`${what} saved on this device. It will sync when the internet is back.`);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Customer search box over the device copy (works offline). */
export function CustomerPicker({ value, onChange, autoFocus }: { value: CachedCustomer | null; onChange: (c: CachedCustomer | null) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const results = useLive(async () => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [] as CachedCustomer[];
    const digits = term.replace(/\D/g, '');
    return db.customers.filter((c) => c.name.toLowerCase().includes(term) || (c.code ?? '').toLowerCase().includes(term)
      || (digits.length >= 3 && (c.mobile.includes(digits) || c.mobile.includes(digits.replace(/^0/, '92'))))).limit(12).toArray();
  }, [q], []);
  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 p-3">
        <div className="min-w-0"><p className="truncate font-semibold">{value.name}</p>
          <p className="truncate text-xs text-muted-foreground">{value.code ?? 'New (not synced yet)'} · {formatPhone(value.mobile)}</p></div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input aria-label="Search customer" autoFocus={autoFocus} placeholder="Name, customer code or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
          {results.length === 0 ? <li className="p-3 text-center text-sm text-muted-foreground">No customer found on this device.</li> : results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.code ?? 'New'} · {formatPhone(c.mobile)}{c.city ? ` · ${c.city}` : ''}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ customer (new / edit)

export function OfflineCustomerDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing?: CachedCustomer | null; onSaved?: (c: CachedCustomer) => void;
}) {
  const enqueue = useSync((s) => s.enqueue);
  const empty = { name: '', mobile: '', whatsapp: '', city: 'Karachi', address: '', customerType: 'REGULAR', notes: '' };
  const [f, setF] = useState(empty);
  const [allowDup, setAllowDup] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setAllowDup(false);
    setF(editing ? {
      name: editing.name, mobile: formatPhone(editing.mobile), whatsapp: editing.whatsapp && editing.whatsapp !== editing.mobile ? formatPhone(editing.whatsapp) : '',
      city: editing.city ?? '', address: editing.address ?? '', customerType: editing.customerType, notes: editing.notes ?? '',
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);
  const mobile = normalizePhone(f.mobile);
  const dup = useLive(async () => (mobile ? db.customers.filter((c) => c.id !== editing?.id && (c.mobile === mobile || c.whatsapp === mobile)).first() : undefined), [mobile, editing?.id], undefined);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast.error('Enter the customer name');
    if (!mobile) return toast.error('Enter a valid mobile number, e.g. 0300-1234567');
    if (f.whatsapp && !normalizePhone(f.whatsapp)) return toast.error('Enter a valid WhatsApp number');
    if (dup && !allowDup && !editing) return toast.error('This mobile number already exists. Tick "Save as a separate customer" to continue.');
    setBusy(true);
    try {
      if (editing) {
        const before: Record<string, string> = {
          name: editing.name, mobile: editing.mobile, whatsapp: editing.whatsapp ?? '', city: editing.city ?? '', address: editing.address ?? '',
          customerType: editing.customerType, notes: editing.notes ?? '',
        };
        const after: Record<string, string> = {
          name: f.name.trim(), mobile, whatsapp: f.whatsapp ? normalizePhone(f.whatsapp)! : (before.whatsapp === before.mobile ? mobile : ''), city: f.city.trim(),
          address: f.address.trim(), customerType: f.customerType, notes: f.notes.trim(),
        };
        const changes = Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== before[k]).map(([k, v]) => [k, k === 'mobile' || k === 'whatsapp' ? (v ? formatPhone(v) : '') : v]));
        if (!Object.keys(changes).length) { onOpenChange(false); return; }
        await enqueue({ entityType: 'customer', operation: 'UPDATE', entityId: editing.id, baseVersion: editing.version, payload: changes, title: `Edit customer: ${after.name}`, subtitle: Object.keys(changes).join(', ') });
        const updated = { ...editing, name: after.name, mobile, whatsapp: after.whatsapp || null, city: after.city || null, address: after.address || null, customerType: after.customerType, notes: after.notes || null };
        await db.customers.put(updated);
        savedToast('Customer change');
        onSaved?.(updated);
      } else {
        const id = newId();
        const payload: Record<string, unknown> = {
          name: f.name.trim(), mobile: f.mobile.trim(), whatsapp: f.whatsapp.trim() || undefined, city: f.city.trim() || undefined,
          address: f.address.trim() || undefined, customerType: f.customerType, notes: f.notes.trim() || undefined, allowDuplicate: allowDup || undefined,
          registrationDate: todayPK(),
        };
        const local: CachedCustomer = {
          id, code: null, name: f.name.trim(), mobile, whatsapp: normalizePhone(f.whatsapp) ?? mobile, email: null, city: f.city.trim() || null,
          address: f.address.trim() || null, customerType: f.customerType, status: 'ACTIVE', notes: f.notes.trim() || null, version: 1,
          updatedAt: new Date().toISOString(), local: true,
        };
        await db.customers.put(local);
        await enqueue({ entityType: 'customer', operation: 'CREATE', entityId: id, payload, title: `New customer: ${local.name}`, subtitle: formatPhone(mobile) });
        savedToast('Customer');
        onSaved?.(local);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save on this device');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? <UserRoundPen className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />} {editing ? 'Edit customer' : 'New customer'}</DialogTitle>
          <DialogDescription>{editing ? 'Changes are saved on this device and sent to the server when online.' : 'Saved on this device first. The customer code is given when it syncs.'}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5"><Label htmlFor="oc-name" required>Full name</Label><Input id="oc-name" autoFocus maxLength={120} value={f.name} onChange={set('name')} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="oc-mobile" required>Mobile</Label><Input id="oc-mobile" inputMode="tel" placeholder="0300-1234567" value={f.mobile} onChange={set('mobile')} /></div>
            <div className="space-y-1.5"><Label htmlFor="oc-wa">WhatsApp (if different)</Label><Input id="oc-wa" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} /></div>
          </div>
          {dup && !editing && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">Same mobile as {dup.name} ({dup.code ?? 'new'}).</p>
              <label className="mt-2 flex items-center gap-2"><Checkbox checked={allowDup} onCheckedChange={(v) => setAllowDup(v === true)} /> Save as a separate customer</label>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="oc-city">City</Label><Input id="oc-city" maxLength={80} value={f.city} onChange={set('city')} /></div>
            <div className="space-y-1.5"><Label htmlFor="oc-type">Customer type</Label>
              <NativeSelect id="oc-type" value={f.customerType} onChange={set('customerType')}>{CUSTOMER_TYPES_FALLBACK.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="oc-address">Address</Label><Input id="oc-address" maxLength={300} placeholder="House, street, area" value={f.address} onChange={set('address')} /></div>
          <div className="space-y-1.5"><Label htmlFor="oc-notes">Notes</Label><Textarea id="oc-notes" rows={2} maxLength={2000} value={f.notes} onChange={set('notes')} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing ? 'Save change' : 'Save customer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ measurement

export function OfflineMeasurementDialog({ open, onOpenChange, customer: initial }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: CachedCustomer | null }) {
  const enqueue = useSync((s) => s.enqueue);
  const templates = useLive(() => db.templates.orderBy('name').toArray(), [], []);
  const [customer, setCustomer] = useState<CachedCustomer | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [unit, setUnit] = useState<'INCH' | 'CM'>('INCH');
  const [values, setValues] = useState<Record<string, string>>({});
  const [takenBy, setTakenBy] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCustomer(initial ?? null); setValues({}); setNotes(''); setTakenBy('');
    setTemplateId((t) => t || templates[0]?.id || '');
  }, [open, initial, templates]);
  const template = templates.find((t) => t.id === templateId);
  useEffect(() => { if (template) setUnit(template.defaultUnit); }, [template]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customer) return toast.error('Select a customer');
    if (!template) return toast.error('Select a measurement template');
    const max = unit === 'INCH' ? 120 : 300;
    const missing = template.fields.filter((fl) => fl.isRequired && !Number(values[fl.key]));
    if (missing.length) return toast.error(`Required: ${missing.map((m) => m.label).join(', ')}`);
    const filled = template.fields.filter((fl) => values[fl.key] && Number(values[fl.key]) > 0);
    if (!filled.length) return toast.error('Enter at least one measurement');
    const bad = filled.find((fl) => Number(values[fl.key]) > max);
    if (bad) return toast.error(`${bad.label} must be at most ${max}`);
    setBusy(true);
    try {
      const dep = customer.local ? await pendingOpFor(customer.id) : undefined;
      await enqueue({
        entityType: 'measurement', operation: 'CREATE',
        payload: {
          customerId: customer.id, templateId: template.id, unit, values: filled.map((fl) => ({ fieldKey: fl.key, value: Number(values[fl.key]).toFixed(2) })),
          takenByName: takenBy.trim() || undefined, notes: notes.trim() || undefined,
        },
        dependsOn: dep ? [dep.id] : undefined,
        title: `Measurement: ${customer.name}`, subtitle: `${template.name}, ${filled.length} values (${unit === 'INCH' ? 'inches' : 'cm'})`,
      });
      savedToast('Measurement');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><Ruler className="h-5 w-5 text-primary" /> Take measurement</DialogTitle>
          <DialogDescription>Saved as a new measurement version when it syncs. Earlier versions are never changed.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5"><Label required>Customer</Label><CustomerPicker value={customer} onChange={setCustomer} autoFocus={!initial} /></div>
          {!templates.length ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No measurement templates on this device. Go online once and press "Download latest data".</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="om-tpl" required>Garment</Label>
                  <NativeSelect id="om-tpl" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues({}); }}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></div>
                <div className="space-y-1.5"><Label htmlFor="om-unit">Unit</Label>
                  <NativeSelect id="om-unit" value={unit} onChange={(e) => setUnit(e.target.value as 'INCH' | 'CM')}><option value="INCH">Inches</option><option value="CM">Centimetres</option></NativeSelect></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {template?.fields.map((fl) => (
                  <div key={fl.key} className="space-y-1">
                    <Label htmlFor={`om-${fl.key}`} required={fl.isRequired} className="text-xs">{fl.label}</Label>
                    <Input id={`om-${fl.key}`} inputMode="decimal" value={values[fl.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [fl.key]: e.target.value.replace(/[^\d.]/g, '') }))} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="om-by">Taken by</Label><Input id="om-by" maxLength={120} value={takenBy} onChange={(e) => setTakenBy(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="om-notes">Notes</Label><Input id="om-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!templates.length}>Save measurement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ order

interface Line { key: string; garmentTypeId: string; garmentName: string; quantity: string; price: string }

export function OfflineOrderDialog({ open, onOpenChange, customer: initial }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: CachedCustomer | null }) {
  const enqueue = useSync((s) => s.enqueue);
  const garments = useLive(() => db.garments.orderBy('name').toArray(), [], []);
  const settings = useLive(async () => (await getMeta<{ defaultDeliveryDays?: number; requireAdvancePayment?: boolean; minimumAdvancePercent?: number }>('orderSettings')) ?? null, [], null);
  const [customer, setCustomer] = useState<CachedCustomer | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [delivery, setDelivery] = useState('');
  const [instructions, setInstructions] = useState('');
  const [advance, setAdvance] = useState('');
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const today = todayPK();
  const blankLine = (): Line => ({ key: newId(), garmentTypeId: garments[0]?.id ?? '', garmentName: garments[0]?.name ?? '', quantity: '1', price: garments[0] ? String(Number(garments[0].defaultStitchingPrice)) : '' });
  useEffect(() => {
    if (!open) return;
    setCustomer(initial ?? null); setInstructions(''); setAdvance(''); setMethod('CASH');
    setLines([blankLine()]);
    setDelivery(addDays(today, Number(settings?.defaultDeliveryDays ?? 7)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, garments.length, settings]);
  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0), [lines]);
  const minAdvance = settings?.requireAdvancePayment ? Math.round(total * Number(settings.minimumAdvancePercent ?? 0)) / 100 : 0;
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customer) return toast.error('Select a customer');
    const valid = lines.filter((l) => l.garmentName.trim().length >= 2 && Number(l.quantity) >= 1);
    if (!valid.length) return toast.error('Add at least one garment');
    if (valid.some((l) => !(Number(l.price) >= 0) || l.price === '')) return toast.error('Enter the stitching price for every garment');
    if (delivery && delivery < today) return toast.error('Delivery date cannot be before today');
    const adv = Number(advance) || 0;
    if (adv > total) return toast.error('Advance cannot be more than the order total');
    if (adv < minAdvance) return toast.error(`An advance of at least ${formatPKR(minAdvance)} is required`);
    setBusy(true);
    try {
      const id = newId();
      const dep = customer.local ? await pendingOpFor(customer.id) : undefined;
      const payload = {
        customerId: customer.id, orderDate: today, expectedDeliveryDate: delivery || undefined, specialInstructions: instructions.trim() || undefined,
        items: valid.map((l) => ({ garmentTypeId: l.garmentTypeId || undefined, garmentName: l.garmentName.trim(), quantity: Number(l.quantity), stitchingPrice: Number(l.price).toFixed(2) })),
        advance: adv > 0 ? { amount: adv.toFixed(2), method } : undefined,
      };
      const local: CachedOrder = {
        id, orderNumber: null, customerId: customer.id, customerName: customer.name, customerCode: customer.code, customerMobile: customer.mobile,
        orderDate: today, expectedDeliveryDate: delivery || null, totalAmount: total.toFixed(2), paidAmount: adv.toFixed(2), balanceAmount: (total - adv).toFixed(2),
        paymentStatus: adv >= total ? 'PAID' : adv > 0 ? 'PARTIAL' : 'UNPAID', lifecycle: 'OPEN', stage: null, items: valid.length, version: 1,
        updatedAt: new Date().toISOString(), local: true,
      };
      await db.orders.put(local);
      await enqueue({
        entityType: 'order', operation: 'CREATE', entityId: id, payload, dependsOn: dep ? [dep.id] : undefined,
        title: `New order: ${customer.name}`, subtitle: `${valid.map((l) => `${l.quantity} x ${l.garmentName}`).join(', ')} · ${formatPKR(total)}`,
      });
      savedToast('Order');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><ClipboardList className="h-5 w-5 text-primary" /> Book order</DialogTitle>
          <DialogDescription>The order number is given when it syncs. The latest measurements are copied into the order on the server.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5"><Label required>Customer</Label><CustomerPicker value={customer} onChange={setCustomer} autoFocus={!initial} /></div>
          <div className="space-y-2">
            <Label required>Garments</Label>
            {lines.map((l, idx) => (
              <div key={l.key} className="grid grid-cols-12 items-end gap-2 rounded-lg border p-2">
                <div className="col-span-12 space-y-1 sm:col-span-5">
                  <Label htmlFor={`oo-g-${idx}`} className="text-xs">Garment</Label>
                  {garments.length ? (
                    <NativeSelect id={`oo-g-${idx}`} value={l.garmentTypeId} onChange={(e) => {
                      const g = garments.find((x) => x.id === e.target.value);
                      setLine(l.key, { garmentTypeId: e.target.value, garmentName: g?.name ?? '', price: g ? String(Number(g.defaultStitchingPrice)) : l.price });
                    }}>{garments.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
                  ) : <Input id={`oo-g-${idx}`} placeholder="e.g. Shalwar Kameez" value={l.garmentName} onChange={(e) => setLine(l.key, { garmentName: e.target.value })} />}
                </div>
                <div className="col-span-3 space-y-1 sm:col-span-2"><Label htmlFor={`oo-q-${idx}`} className="text-xs">Qty</Label>
                  <Input id={`oo-q-${idx}`} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value.replace(/\D/g, '') })} /></div>
                <div className="col-span-6 space-y-1 sm:col-span-4"><Label htmlFor={`oo-p-${idx}`} className="text-xs">Price per piece (Rs)</Label>
                  <Input id={`oo-p-${idx}`} inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value.replace(/[^\d.]/g, '') })} /></div>
                <div className="col-span-3 flex justify-end sm:col-span-1">
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove garment" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="gold" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus /> Add garment</Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="oo-del">Delivery date</Label><Input id="oo-del" type="date" min={today} value={delivery} onChange={(e) => setDelivery(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="oo-adv">Advance (Rs){minAdvance > 0 && <span className="text-muted-foreground"> min {formatPKR(minAdvance)}</span>}</Label>
              <Input id="oo-adv" inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value.replace(/[^\d.]/g, ''))} /></div>
            <div className="space-y-1.5"><Label htmlFor="oo-method">Method</Label>
              <NativeSelect id="oo-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="oo-notes">Special instructions</Label><Textarea id="oo-notes" rows={2} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
          <div className="flex items-center justify-between rounded-lg bg-navy px-4 py-3 text-white dark:bg-navy-soft">
            <span className="text-sm text-white/80">Order total</span>
            <span className="text-right"><span className="block text-lg font-bold tabular-nums text-gold">{formatPKR(total)}</span>
              <span className="block text-xs text-white/70">Balance {formatPKR(Math.max(0, total - (Number(advance) || 0)))}</span></span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save order</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ payment

export function OfflinePaymentDialog({ open, onOpenChange, order: initial }: { open: boolean; onOpenChange: (o: boolean) => void; order?: CachedOrder | null }) {
  const enqueue = useSync((s) => s.enqueue);
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<CachedOrder | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setQ(''); setOrder(initial ?? null); setAmount(initial ? String(Number(initial.balanceAmount)) : ''); setMethod('CASH'); setReference('');
  }, [open, initial]);
  const orders = useLive(async () => {
    const term = q.trim().toLowerCase();
    const rows = await db.orders.filter((o) => Number(o.balanceAmount) > 0 && (!term || o.customerName.toLowerCase().includes(term)
      || (o.orderNumber ?? '').toLowerCase().includes(term) || o.customerMobile.includes(term.replace(/\D/g, '') || '~'))).toArray();
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
  }, [q], []);
  const over = order && Number(amount) > Number(order.balanceAmount);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order || !(Number(amount) > 0) || over) return;
    setBusy(true);
    try {
      const dep = order.local ? await pendingOpFor(order.id) : undefined;
      const amt = Number(amount);
      await enqueue({
        entityType: 'payment', operation: 'CREATE', payload: { orderId: order.id, amount: amt.toFixed(2), method, reference: reference.trim() || undefined },
        dependsOn: dep ? [dep.id] : undefined,
        title: `Payment: ${order.customerName}`, subtitle: `${formatPKR(amt)} · ${order.orderNumber ?? 'new order'}`,
      });
      await db.orders.update(order.id, { paidAmount: (Number(order.paidAmount) + amt).toFixed(2), balanceAmount: (Number(order.balanceAmount) - amt).toFixed(2) });
      savedToast('Payment');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Banknote className="h-5 w-5 text-primary" /> Receive payment</DialogTitle>
          <DialogDescription>The receipt number is given when it syncs. Print the receipt from the order after syncing.</DialogDescription>
        </DialogHeader>
        {!order ? (
          <div className="space-y-3">
            <Input aria-label="Search orders" autoFocus placeholder="Order number, customer name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {!orders.length ? <li className="p-4 text-center text-sm text-muted-foreground">No open orders with a balance on this device.</li> : orders.map((o) => (
                <li key={o.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted" onClick={() => { setOrder(o); setAmount(String(Number(o.balanceAmount))); }}>
                    <span className="min-w-0"><span className="block font-mono text-xs font-semibold">{o.orderNumber ?? 'New order (not synced)'}</span>
                      <span className="block truncate text-sm font-medium">{o.customerName}</span></span>
                    <span className="shrink-0 text-right"><span className="block text-xs text-muted-foreground">Balance</span><span className="font-semibold tabular-nums text-rose-700 dark:text-rose-400">{formatPKR(o.balanceAmount)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3 text-sm">
              <div><p className="font-mono text-xs font-semibold">{order.orderNumber ?? 'New order'}</p><p className="font-medium">{order.customerName}</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">Balance</p><p className="font-semibold tabular-nums">{formatPKR(order.balanceAmount)}</p></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="op-amount" required>Amount (Rs)</Label>
                <Input id="op-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                {over && <p className="text-xs text-destructive">More than the balance.</p>}</div>
              <div className="space-y-1.5"><Label htmlFor="op-method" required>Method</Label>
                <NativeSelect id="op-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="op-ref">Reference</Label><Input id="op-ref" maxLength={100} placeholder="Transaction ID or cheque no." value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <DialogFooter>
              {!initial && <Button type="button" variant="outline" onClick={() => setOrder(null)}>Back</Button>}
              <Button type="submit" loading={busy} disabled={!Number(amount) || !!over}>Receive {Number(amount) ? formatPKR(amount) : ''}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
