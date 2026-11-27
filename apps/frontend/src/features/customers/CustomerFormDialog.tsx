import { zodResolver } from '@hookform/resolvers/zod';
import { formatPhone, normalizePhone } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { ApiError, api, errorMessage } from '@/services/api';
import type { Customer, DuplicateMatch } from '@/types';

const phone = (msg: string) => z.string().trim().refine((v) => !!normalizePhone(v), msg);

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the customer name').max(120),
  mobile: phone('Enter a valid mobile number, e.g. 0300-1234567'),
  whatsapp: z.string().trim().refine((v) => !v || !!normalizePhone(v), 'Enter a valid WhatsApp number'),
  email: z.string().trim().refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
  city: z.string().trim().max(80),
  address: z.string().trim().max(300),
  customerType: z.enum(['WALK_IN', 'REGULAR', 'VIP', 'CORPORATE']),
  registrationDate: z.string(),
  openingBalance: z.string().trim().refine((v) => !v || /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Enter an amount like 2500 or 2500.50'),
  whatsappOptIn: z.boolean(),
  notes: z.string().max(2000),
});
type FormValues = z.infer<typeof schema>;

const TYPES = [
  { value: 'REGULAR', label: 'Regular' }, { value: 'WALK_IN', label: 'Walk-in' }, { value: 'VIP', label: 'VIP' }, { value: 'CORPORATE', label: 'Corporate' },
];

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer | null; onSaved?: (c: Customer) => void;
}) {
  const qc = useQueryClient();
  const editing = !!customer;
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    setDuplicates([]);
    form.reset({
      name: customer?.name ?? '', mobile: customer ? formatPhone(customer.mobile) : '',
      whatsapp: customer?.whatsapp && customer.whatsapp !== customer.mobile ? formatPhone(customer.whatsapp) : '',
      email: customer?.email ?? '', city: customer?.city ?? '', address: customer?.address ?? '',
      customerType: customer?.customerType ?? 'REGULAR', registrationDate: customer?.registrationDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }),
      openingBalance: '', whatsappOptIn: customer?.whatsappOptIn ?? false, notes: customer?.notes ?? '',
    });
  }, [open, customer, form]);

  const checkDuplicates = async () => {
    const { mobile, whatsapp, name } = form.getValues();
    if (!normalizePhone(mobile) && name.trim().length < 3) return;
    try {
      const res = await api.get<DuplicateMatch[]>('/customers/check-duplicates', { mobile, whatsapp, name, excludeId: customer?.id });
      setDuplicates(res);
    } catch { /* non-blocking */ }
  };

  const save = useMutation({
    mutationFn: ({ v, allowDuplicate }: { v: FormValues; allowDuplicate: boolean }) => {
      const body = {
        name: v.name, mobile: v.mobile, whatsapp: v.whatsapp || (editing ? v.mobile : undefined), email: v.email, city: v.city, address: v.address,
        customerType: v.customerType, registrationDate: v.registrationDate, whatsappOptIn: v.whatsappOptIn, notes: v.notes, allowDuplicate,
      };
      return editing
        ? api.patch<Customer>(`/customers/${customer!.id}`, { ...body, version: customer!.version })
        : api.post<Customer>('/customers', { ...body, openingBalance: v.openingBalance || undefined, whatsapp: v.whatsapp || undefined });
    },
    onSuccess: (c) => {
      toast.success(editing ? 'Customer updated' : `Customer ${c.code} created`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', c.id] });
      onOpenChange(false);
      onSaved?.(c);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && (e.details as { duplicates?: DuplicateMatch[] })?.duplicates) {
        setDuplicates((e.details as { duplicates: DuplicateMatch[] }).duplicates);
        toast.warning('A customer with this phone number already exists');
        return;
      }
      toast.error(errorMessage(e));
    },
  });

  const phoneDup = duplicates.some((d) => d.reason !== 'NAME');
  const err = form.formState.errors;
  const submit = (allowDuplicate: boolean) => form.handleSubmit((v) => save.mutate({ v, allowDuplicate }))();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><UserPlus className="h-5 w-5 text-primary" />{editing ? `Edit ${customer!.code}` : 'Add customer'}</DialogTitle>
          <DialogDescription>{editing ? 'Changes are saved to the audit log.' : 'A customer code is generated automatically.'}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-name" required>Customer name</Label>
              <Input id="c-name" autoFocus {...form.register('name', { onBlur: checkDuplicates })} aria-invalid={!!err.name} /><FieldError message={err.name?.message} /></div>
            <div className="space-y-1.5"><Label htmlFor="c-mobile" required>Mobile number</Label>
              <Input id="c-mobile" inputMode="tel" placeholder="0300-1234567" {...form.register('mobile', { onBlur: checkDuplicates })} aria-invalid={!!err.mobile} /><FieldError message={err.mobile?.message} /></div>
            <div className="space-y-1.5"><Label htmlFor="c-wa">WhatsApp number</Label>
              <Input id="c-wa" inputMode="tel" placeholder="Same as mobile" {...form.register('whatsapp', { onBlur: checkDuplicates })} /><FieldError message={err.whatsapp?.message} /></div>
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> Possible duplicate customer</p>
              <ul className="space-y-0.5">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link className="underline" to={`/customers/${d.id}`} onClick={() => onOpenChange(false)}>{d.name} ({d.code})</Link>
                    {' '}· {formatPhone(d.mobile)}{d.city ? ` · ${d.city}` : ''} · same {d.reason === 'NAME' ? 'name' : d.reason === 'WHATSAPP' ? 'WhatsApp' : 'mobile'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="c-email">Email</Label><Input id="c-email" type="email" {...form.register('email')} /><FieldError message={err.email?.message} /></div>
            <div className="space-y-1.5"><Label htmlFor="c-city">City</Label><Input id="c-city" {...form.register('city')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-address">Address</Label><Input id="c-address" {...form.register('address')} /></div>
            <div className="space-y-1.5"><Label htmlFor="c-type">Customer type</Label>
              <NativeSelect id="c-type" {...form.register('customerType')}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="c-date">Registration date</Label><Input id="c-date" type="date" {...form.register('registrationDate')} /></div>
            {!editing && (
              <div className="space-y-1.5"><Label htmlFor="c-ob">Opening balance (Rs)</Label>
                <Input id="c-ob" inputMode="decimal" placeholder="0" {...form.register('openingBalance')} />
                <p className="text-[11px] text-muted-foreground">Amount this customer already owes from before the ERP.</p>
                <FieldError message={err.openingBalance?.message} /></div>
            )}
            <label className="flex items-center gap-2 self-center pt-4 text-sm"><input type="checkbox" className="h-4 w-4" {...form.register('whatsappOptIn')} /> Customer agrees to receive WhatsApp messages</label>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-notes">Notes</Label><Textarea id="c-notes" rows={2} {...form.register('notes')} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {phoneDup ? (
              <Button type="button" variant="secondary" loading={save.isPending} onClick={() => void submit(true)}>Save as separate customer</Button>
            ) : (
              <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create customer'}</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
