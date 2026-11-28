import { MODULES, PLAN_MODULES } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/services/api';
import { useAuth } from '@/store/auth';
import type { CompanyAccess, CompanyDetail, CompanyRow, CompanyStatus, PlanRow } from '@/types/platform';
import { PAYMENT_METHODS } from '@/types/platform';
import { formatDate, formatPKR } from '@/utils/format';

export const moduleLabel = (key: string) => MODULES.find((m) => m.key === key)?.label ?? key;
export const PLAN_MODULE_OPTIONS = PLAN_MODULES.map((k) => ({ key: k, label: moduleLabel(k) }));

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  if (status === 'ACTIVE') return <Badge variant="success">Active</Badge>;
  if (status === 'TRIAL') return <Badge variant="info">Trial</Badge>;
  return <Badge variant="danger">Suspended</Badge>;
}

export function AccessBadge({ access, daysLeft }: { access: CompanyAccess; daysLeft: number | null }) {
  if (access === 'SUSPENDED') return <Badge variant="danger">Blocked</Badge>;
  if (access === 'READ_ONLY') return <Badge variant="danger">Read-only</Badge>;
  if (access === 'GRACE') return <Badge variant="warning">Grace period</Badge>;
  if (daysLeft === null) return <Badge variant="secondary">No expiry</Badge>;
  return <Badge variant={daysLeft <= 7 ? 'warning' : 'success'}>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</Badge>;
}

export function usePlans() {
  return useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api.get<PlanRow[]>('/platform/plans') });
}

/** Open a company as Super Admin (support access). Every visit is written to the audit log. */
export function useEnterCompany() {
  const qc = useQueryClient();
  const bootstrap = useAuth((s) => s.bootstrap);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => api.post<{ company: { name: string } }>(`/platform/companies/${id}/enter`),
    onSuccess: async (r) => {
      await bootstrap();
      qc.clear();
      toast.success(`Opened ${r.company.name} for support`);
      navigate('/', { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useExitCompany() {
  const qc = useQueryClient();
  const bootstrap = useAuth((s) => s.bootstrap);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/platform/exit-company'),
    onSuccess: async () => {
      await bootstrap();
      qc.clear();
      navigate('/platform/companies', { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

const blankCompany = {
  name: '', code: '', ownerName: '', phone: '', email: '', city: '', address: '', docPrefix: '', planId: '', trial: true, trialDays: 14, paidUntil: '',
  owner: { fullName: '', email: '', username: '', password: '' },
};

/** Create a new company (with its Owner login), or edit an existing one. */
export function CompanyFormDialog({ open, onOpenChange, company, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; company?: CompanyRow | null; onSaved?: (c: CompanyRow) => void;
}) {
  const qc = useQueryClient();
  const plans = usePlans();
  const [f, setF] = useState(blankCompany);
  const [noExpiry, setNoExpiry] = useState(false);
  const [edit, setEdit] = useState({ status: 'TRIAL' as 'TRIAL' | 'ACTIVE', trialEndsAt: '', paidUntil: '', graceDays: 7, notes: '' });
  useEffect(() => {
    if (!open) return;
    if (company) {
      setF({ ...blankCompany, name: company.name, ownerName: company.ownerName ?? '', phone: company.phone ?? '', email: company.email ?? '', city: company.city ?? '', address: company.address ?? '', planId: company.plan.id });
      setEdit({
        status: company.status === 'SUSPENDED' ? 'ACTIVE' : company.status,
        trialEndsAt: company.trialEndsAt?.slice(0, 10) ?? '', paidUntil: company.paidUntil?.slice(0, 10) ?? '', graceDays: company.graceDays, notes: company.notes ?? '',
      });
      setNoExpiry(company.status === 'ACTIVE' && !company.paidUntil);
    } else {
      setF({ ...blankCompany, planId: plans.data?.find((p) => p.isActive)?.id ?? '' });
    }
  }, [open, company, plans.data]);

  const set = <K extends keyof typeof blankCompany>(k: K, v: (typeof blankCompany)[K]) => setF((d) => ({ ...d, [k]: v }));
  const setOwner = (k: keyof typeof blankCompany.owner, v: string) => setF((d) => ({ ...d, owner: { ...d.owner, [k]: v } }));

  const save = useMutation({
    mutationFn: () => {
      const base = { name: f.name.trim(), ownerName: f.ownerName.trim() || undefined, phone: f.phone.trim() || undefined, email: f.email.trim() || undefined, city: f.city.trim() || undefined, address: f.address.trim() || undefined, planId: f.planId };
      if (company) {
        return api.patch<CompanyRow>(`/platform/companies/${company.id}`, {
          ...base, ...(company.status === 'SUSPENDED' ? {} : { status: edit.status }),
          trialEndsAt: edit.trialEndsAt || undefined, graceDays: Number(edit.graceDays), notes: edit.notes,
          ...(noExpiry ? { noExpiry: true } : edit.paidUntil ? { paidUntil: edit.paidUntil } : {}),
        });
      }
      return api.post<CompanyRow>('/platform/companies', {
        ...base, code: f.code.trim() || undefined, docPrefix: f.docPrefix.trim() || undefined, trial: f.trial,
        ...(f.trial ? { trialDays: Number(f.trialDays) } : f.paidUntil ? { paidUntil: f.paidUntil } : {}),
        owner: { fullName: f.owner.fullName.trim(), email: f.owner.email.trim(), username: f.owner.username.trim(), password: f.owner.password },
      });
    },
    onSuccess: (c) => {
      toast.success(company ? 'Company saved' : `Company created. The Owner can now sign in as "${f.owner.username}".`);
      qc.invalidateQueries({ queryKey: ['platform'] });
      onOpenChange(false);
      onSaved?.(c);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const ownerOk = company || (f.owner.fullName.trim().length >= 2 && f.owner.email.includes('@') && f.owner.username.trim().length >= 3 && f.owner.password.length >= 10);
  const valid = f.name.trim().length >= 2 && !!f.planId && ownerOk;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? `Edit ${company.name}` : 'New company'}</DialogTitle>
          <DialogDescription>{company ? 'Shop details, plan and subscription dates.' : 'Creates the company with its default data (roles, order stages, garments) and an Owner login.'}</DialogDescription>
        </DialogHeader>
        <form id="company-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-name">Company / shop name *</Label><Input id="c-name" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          {!company && (
            <>
              <div className="space-y-1.5"><Label htmlFor="c-code">Company code</Label><Input id="c-code" placeholder="made from the name" value={f.code} onChange={(e) => set('code', e.target.value.toLowerCase())} /></div>
              <div className="space-y-1.5"><Label htmlFor="c-prefix">Document prefix</Label><Input id="c-prefix" placeholder="e.g. ZA (ZA-2026-00001)" maxLength={4} value={f.docPrefix} onChange={(e) => set('docPrefix', e.target.value.toUpperCase())} /></div>
            </>
          )}
          <div className="space-y-1.5"><Label htmlFor="c-owner">Owner name</Label><Input id="c-owner" value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-phone">Phone</Label><Input id="c-phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-email">Email</Label><Input id="c-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-city">City</Label><Input id="c-city" value={f.city} onChange={(e) => set('city', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-address">Address</Label><Input id="c-address" value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="c-plan">Plan *</Label>
            <NativeSelect id="c-plan" value={f.planId} onChange={(e) => set('planId', e.target.value)}>
              <option value="">Select a plan</option>
              {(plans.data ?? []).filter((p) => p.isActive || p.id === f.planId).map((p) => (
                <option key={p.id} value={p.id}>{p.name} - {formatPKR(p.monthlyPrice)} / month - up to {p.maxUsers} users</option>
              ))}
            </NativeSelect>
          </div>

          {!company ? (
            <>
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                <input type="checkbox" className="h-4 w-4" checked={f.trial} onChange={(e) => set('trial', e.target.checked)} /> Start with a free trial
              </label>
              {f.trial ? (
                <div className="space-y-1.5"><Label htmlFor="c-trial">Trial days</Label><Input id="c-trial" type="number" min={1} max={90} value={f.trialDays} onChange={(e) => set('trialDays', Number(e.target.value))} /></div>
              ) : (
                <div className="space-y-1.5"><Label htmlFor="c-paid">Paid until (empty = no expiry)</Label><Input id="c-paid" type="date" value={f.paidUntil} onChange={(e) => set('paidUntil', e.target.value)} /></div>
              )}
              <p className="pt-2 text-sm font-semibold sm:col-span-2">Owner login</p>
              <div className="space-y-1.5"><Label htmlFor="o-name">Full name *</Label><Input id="o-name" value={f.owner.fullName} onChange={(e) => setOwner('fullName', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="o-email">Email *</Label><Input id="o-email" type="email" value={f.owner.email} onChange={(e) => setOwner('email', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="o-user">Username *</Label><Input id="o-user" autoComplete="off" value={f.owner.username} onChange={(e) => setOwner('username', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="o-pass">Password * (min 10)</Label><Input id="o-pass" type="password" autoComplete="new-password" value={f.owner.password} onChange={(e) => setOwner('password', e.target.value)} /></div>
            </>
          ) : (
            <>
              {company.status !== 'SUSPENDED' && (
                <div className="space-y-1.5">
                  <Label htmlFor="e-status">Status</Label>
                  <NativeSelect id="e-status" value={edit.status} onChange={(e) => setEdit((d) => ({ ...d, status: e.target.value as 'TRIAL' | 'ACTIVE' }))}>
                    <option value="TRIAL">Trial</option><option value="ACTIVE">Active (paid)</option>
                  </NativeSelect>
                </div>
              )}
              <div className="space-y-1.5"><Label htmlFor="e-grace">Grace days after expiry</Label><Input id="e-grace" type="number" min={0} max={60} value={edit.graceDays} onChange={(e) => setEdit((d) => ({ ...d, graceDays: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-trial">Trial ends on</Label><Input id="e-trial" type="date" value={edit.trialEndsAt} onChange={(e) => setEdit((d) => ({ ...d, trialEndsAt: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="e-paid">Paid until</Label>
                <Input id="e-paid" type="date" disabled={noExpiry} value={edit.paidUntil} onChange={(e) => setEdit((d) => ({ ...d, paidUntil: e.target.value }))} />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} /> No expiry</label>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="e-notes">Notes (only Super Admin sees these)</Label><Textarea id="e-notes" value={edit.notes} onChange={(e) => setEdit((d) => ({ ...d, notes: e.target.value }))} /></div>
            </>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="company-form" disabled={!valid} loading={save.isPending}>{company ? 'Save' : 'Create company'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Record a subscription payment received by JazzCash / EasyPaisa / bank / cash. */
export function PaymentDialog({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company: CompanyRow | CompanyDetail | null }) {
  const qc = useQueryClient();
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ months: 1, amount: '', method: 'JAZZCASH', reference: '', paidAt: today, notes: '' });
  useEffect(() => {
    if (open && company) setF({ months: 1, amount: String(Number(company.plan.monthlyPrice)), method: 'JAZZCASH', reference: '', paidAt: today, notes: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company]);
  const save = useMutation({
    mutationFn: () => api.post<{ company: CompanyDetail }>(`/platform/companies/${company!.id}/payments`, {
      amount: Number(f.amount), months: Number(f.months), method: f.method, reference: f.reference || undefined, paidAt: f.paidAt, notes: f.notes || undefined,
    }),
    onSuccess: (r) => {
      toast.success(`Payment recorded. Paid until ${formatDate(r.company.paidUntil)}.`);
      qc.invalidateQueries({ queryKey: ['platform'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>{company?.name}: the subscription is extended by the months paid, from the current end date or today.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-months">Months</Label>
            <Input id="p-months" type="number" min={1} max={36} value={f.months}
              onChange={(e) => { const m = Number(e.target.value); setF((d) => ({ ...d, months: m, amount: company ? String(Number(company.plan.monthlyPrice) * (m || 0)) : d.amount })); }} />
          </div>
          <div className="space-y-1.5"><Label htmlFor="p-amount">Amount (PKR)</Label><Input id="p-amount" type="number" min={1} value={f.amount} onChange={(e) => setF((d) => ({ ...d, amount: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="p-method">Method</Label>
            <NativeSelect id="p-method" value={f.method} onChange={(e) => setF((d) => ({ ...d, method: e.target.value }))}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5"><Label htmlFor="p-date">Paid on</Label><Input id="p-date" type="date" max={today} value={f.paidAt} onChange={(e) => setF((d) => ({ ...d, paidAt: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="p-ref">Transaction ID / reference</Label><Input id="p-ref" value={f.reference} onChange={(e) => setF((d) => ({ ...d, reference: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="p-notes">Notes</Label><Input id="p-notes" value={f.notes} onChange={(e) => setF((d) => ({ ...d, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!(Number(f.amount) >= 1 && f.months >= 1)} loading={save.isPending} onClick={() => save.mutate()}>Mark as paid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
