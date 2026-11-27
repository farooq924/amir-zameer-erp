import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, ClipboardList, Globe2, Hash, Printer, Save, ShieldCheck, UserCog, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { SettingsMap } from '@/types';

type Field =
  | { key: string; label: string; type: 'text' | 'email' | 'textarea'; hint?: string }
  | { key: string; label: string; type: 'number'; min?: number; max?: number }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; locked?: boolean }
  | { key: string; label: string; type: 'boolean' };

const GROUP_ICONS: Record<string, LucideIcon> = { business: Building2, regional: Globe2, numbering: Hash, orders: ClipboardList, printing: Printer };

const GROUPS: { key: string; label: string; description: string; fields: Field[] }[] = [
  {
    key: 'business', label: 'Business Profile', description: 'Shown on invoices, receipts and the app header.',
    fields: [
      { key: 'businessName', label: 'Business name', type: 'text' },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'whatsapp', label: 'WhatsApp number', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'ntn', label: 'NTN / Tax number', type: 'text' },
    ],
  },
  {
    key: 'regional', label: 'Regional', description: 'Currency and timezone are fixed for Pakistan.',
    fields: [
      { key: 'currency', label: 'Currency', type: 'select', locked: true, options: [{ value: 'PKR', label: 'PKR - Pakistani Rupee' }] },
      { key: 'timezone', label: 'Timezone', type: 'select', locked: true, options: [{ value: 'Asia/Karachi', label: 'Asia/Karachi (PKT)' }] },
      { key: 'dateFormat', label: 'Date format', type: 'select', options: ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'].map((v) => ({ value: v, label: v })) },
      { key: 'defaultMeasurementUnit', label: 'Default measurement unit', type: 'select', options: [{ value: 'INCH', label: 'Inches' }, { value: 'CM', label: 'Centimeters' }] },
      { key: 'fabricUnit', label: 'Default fabric unit', type: 'select', options: [{ value: 'METER', label: 'Meter' }, { value: 'YARD', label: 'Yard' }] },
    ],
  },
  {
    key: 'numbering', label: 'Numbering', description: 'Prefixes for automatic document numbers, e.g. AZ-2026-00001.',
    fields: [
      { key: 'orderPrefix', label: 'Order prefix', type: 'text' },
      { key: 'customerPrefix', label: 'Customer code prefix', type: 'text' },
      { key: 'receiptPrefix', label: 'Payment receipt prefix', type: 'text' },
      { key: 'expensePrefix', label: 'Expense prefix', type: 'text' },
    ],
  },
  {
    key: 'orders', label: 'Orders', description: 'Defaults used when booking a new order.',
    fields: [
      { key: 'defaultDeliveryDays', label: 'Default delivery time (days)', type: 'number', min: 1, max: 90 },
      { key: 'requireAdvancePayment', label: 'Require advance payment', type: 'boolean' },
      { key: 'minimumAdvancePercent', label: 'Minimum advance (%)', type: 'number', min: 0, max: 100 },
    ],
  },
  {
    key: 'printing', label: 'Printing', description: 'Invoice and receipt layout options.',
    fields: [
      { key: 'receiptWidth', label: 'Thermal receipt width', type: 'select', options: [{ value: '58mm', label: '58 mm' }, { value: '80mm', label: '80 mm' }] },
      { key: 'showLogoOnReceipt', label: 'Show logo on receipts', type: 'boolean' },
      { key: 'invoiceFooter', label: 'Invoice footer text', type: 'textarea' },
    ],
  },
];

function GroupForm({ group, values, canEdit }: { group: (typeof GROUPS)[number]; values: Record<string, unknown>; canEdit: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, unknown>>(values);
  useEffect(() => setDraft(values), [values]);
  const save = useMutation({
    mutationFn: () => api.put(`/settings/${group.key}`, draft),
    onSuccess: () => { toast.success(`${group.label} saved`); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card>
      <CardHeader><CardTitle>{group.label}</CardTitle><CardDescription>{group.description}</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {group.fields.map((f) => {
            const id = `s-${group.key}-${f.key}`;
            const v = draft[f.key];
            const disabled = !canEdit || (f.type === 'select' && f.locked);
            return (
              <div key={f.key} className={f.type === 'textarea' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                {f.type === 'boolean' ? (
                  <label className="flex items-center gap-2 pt-6 text-sm font-medium">
                    <input id={id} type="checkbox" className="h-4 w-4" disabled={disabled} checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} />{f.label}
                  </label>
                ) : (
                  <>
                    <Label htmlFor={id}>{f.label}</Label>
                    {f.type === 'textarea' ? <Textarea id={id} disabled={disabled} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                      : f.type === 'select' ? (
                        <NativeSelect id={id} disabled={disabled} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </NativeSelect>
                      ) : f.type === 'number' ? (
                        <Input id={id} type="number" min={f.min} max={f.max} disabled={disabled} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
                      ) : <Input id={id} type={f.type} disabled={disabled} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />}
                  </>
                )}
              </div>
            );
          })}
          {canEdit && <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}><Save /> Save</Button></div>}
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const can = useCan();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings') });
  const canEdit = can('settings', 'MANAGE_SETTINGS');

  return (
    <div>
      <PageHeader title="Settings" description="Business profile, defaults and access control." />
      {settings.isError ? <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} /> : settings.isLoading ? <Skeleton className="h-80 w-full" /> : (
        <Tabs defaultValue="business" orientation="vertical" className="grid gap-4 lg:grid-cols-[230px_1fr]">
          <Card className="h-fit p-2">
            <TabsList className="flex h-auto w-full flex-row flex-wrap items-stretch gap-1 border-0 bg-transparent p-0 shadow-none lg:flex-col">
              {GROUPS.map((g) => {
                const Icon = GROUP_ICONS[g.key] ?? Building2;
                return (
                  <TabsTrigger key={g.key} value={g.key}
                    className="h-9 justify-start gap-2.5 px-3 data-[state=active]:bg-gold-soft data-[state=active]:text-foreground data-[state=active]:shadow-none lg:w-full">
                    <Icon className="h-4 w-4 text-primary" />{g.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {can('users', 'VIEW') && (
              <div className="mt-1 border-t pt-1">
                {[{ to: '/settings/users', icon: UserCog, title: 'Users' }, { to: '/settings/roles', icon: ShieldCheck, title: 'Roles & Permissions' }].map((l) => (
                  <Link key={l.to} to={l.to} className={cn('flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    <l.icon className="h-4 w-4 text-primary" /><span className="flex-1">{l.title}</span><ChevronRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <div className="min-w-0">
            {GROUPS.map((g) => (
              <TabsContent key={g.key} value={g.key} className="mt-0">
                <GroupForm group={g} values={settings.data![g.key] ?? {}} canEdit={canEdit} />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}
    </div>
  );
}
