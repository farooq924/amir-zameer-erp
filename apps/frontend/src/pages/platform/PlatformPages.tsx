import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Banknote, Building2, CreditCard, KeyRound, LogIn, MoreHorizontal, Pencil, Plus, Power, Search, Users, Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { type DataColumn, DataTable, type ServerPagination, fetchAllPages } from '@/components/data-table/DataTable';
import { StatCard } from '@/features/dashboard/StatCard';
import {
  AccessBadge, CompanyFormDialog, CompanyStatusBadge, PLAN_MODULE_OPTIONS, PaymentDialog, moduleLabel, useEnterCompany, usePlans,
} from '@/features/platform/shared';
import { api, errorMessage } from '@/services/api';
import type { Paginated } from '@/types';
import type { CompanyDetail, CompanyPaymentRow, CompanyRow, PlanRow, PlatformAuditRow, PlatformOverview } from '@/types/platform';
import { PAYMENT_METHODS } from '@/types/platform';
import { formatDate, formatDateTime, formatPKR, humanize } from '@/utils/format';

const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

function TableSkeleton() {
  return <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

// ------------------------------------------------------------------ overview

export function PlatformOverviewPage() {
  const q = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api.get<PlatformOverview>('/platform/overview') });
  const d = q.data;
  return (
    <div>
      <PageHeader title="Super Admin" description="TailoringERP companies, subscriptions and income at a glance."
        actions={<Button asChild><Link to="/platform/companies?new=1"><Plus /> New company</Link></Button>} />
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard featured label="Companies" value={String(d?.companies ?? 0)} hint={`${d?.active ?? 0} active · ${d?.trial ?? 0} on trial`} icon={Building2} loading={q.isLoading} />
            <StatCard label="Monthly recurring" value={formatPKR(d?.monthlyRecurring ?? 0)} hint="Active paid companies" icon={Wallet} tile="green" loading={q.isLoading} />
            <StatCard label="Received this month" value={formatPKR(d?.paidThisMonth ?? 0)} hint={`${d?.paymentsThisMonth ?? 0} payments`} icon={Banknote} tile="blue" loading={q.isLoading} />
            <StatCard label="Active users" value={String(d?.activeUsers ?? 0)} hint="All companies" icon={Users} tile="purple" loading={q.isLoading} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatCard compact label="Grace period" value={String(d?.grace ?? 0)} icon={AlertTriangle} tile="gold" loading={q.isLoading} />
            <StatCard compact label="Read-only (expired)" value={String(d?.readOnly ?? 0)} icon={AlertTriangle} tile="rose" loading={q.isLoading} />
            <StatCard compact label="Suspended" value={String(d?.suspended ?? 0)} icon={Power} tile="slate" loading={q.isLoading} />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Ending in the next 7 days</CardTitle><CardDescription>Remind these shops to renew.</CardDescription></CardHeader>
              <CardContent>
                {!d?.expiringSoon.length ? <p className="text-sm text-muted-foreground">Nothing is ending soon.</p> : (
                  <ul className="divide-y">
                    {d.expiringSoon.map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                        <Link to={`/platform/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                        <span className="flex items-center gap-2"><CompanyStatusBadge status={c.status} /><span className="text-muted-foreground">{formatDate(c.endsAt)} ({c.daysLeft}d)</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Latest payments</CardTitle><CardDescription><Link className="text-primary hover:underline" to="/platform/payments">See all payments</Link></CardDescription></CardHeader>
              <CardContent>
                {!d?.recentPayments.length ? <p className="text-sm text-muted-foreground">No payments recorded yet.</p> : (
                  <ul className="divide-y">
                    {d.recentPayments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                        <span><span className="font-medium">{p.company}</span><span className="block text-xs text-muted-foreground">{formatDate(p.paidAt)} · {methodLabel(p.method)} · {p.months} month{p.months > 1 ? 's' : ''}</span></span>
                        <span className="font-semibold tabular-nums">{formatPKR(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ companies

const STATUS_FILTERS = [
  { value: '', label: 'All companies' }, { value: 'ACTIVE', label: 'Active' }, { value: 'TRIAL', label: 'Trial' },
  { value: 'EXPIRING', label: 'Ending within 7 days' }, { value: 'READ_ONLY', label: 'Read-only (expired)' }, { value: 'SUSPENDED', label: 'Suspended' },
];

export function CompaniesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [formOpen, setFormOpen] = useState(() => new URLSearchParams(window.location.search).get('new') === '1');
  const enter = useEnterCompany();
  const list = useQuery({
    queryKey: ['platform', 'companies', { search, status, page, pageSize }],
    queryFn: () => api.get<Paginated<CompanyRow>>('/platform/companies', { search, status, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader title="Companies" description="Every tailoring shop using TailoringERP."
        actions={<Button onClick={() => setFormOpen(true)}><Plus /> New company</Button>} />
      <Card>
        <DataTable
          title="Companies"
          noun="company"
          rows={list.data?.data}
          getRowId={(c) => c.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<CompanyRow>>('/platform/companies', { search, status, page: pg, pageSize: size }))}
          onRowClick={(c) => navigate(`/platform/companies/${c.id}`)}
          onView={(c) => navigate(`/platform/companies/${c.id}`)}
          rowMenu={(c) => <DropdownMenuItem disabled={enter.isPending} onSelect={() => enter.mutate(c.id)}><LogIn /> Open this company (support)</DropdownMenuItem>}
          toolbar={
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search name, code, phone or city" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <NativeSelect className="sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
                {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </NativeSelect>
            </div>
          }
          columns={[
            { id: 'company', header: 'Company', value: (c) => c.name, text: (c) => `${c.name} (${c.code})${c.city ? ` - ${c.city}` : ''}${c.phone ? ` - ${c.phone}` : ''}`,
              cell: (c) => <><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.code}{c.city ? ` · ${c.city}` : ''}{c.phone ? ` · ${c.phone}` : ''}</div></> },
            { id: 'plan', header: 'Plan', value: (c) => c.plan.name },
            { id: 'status', header: 'Status', value: (c) => c.status, cell: (c) => <CompanyStatusBadge status={c.status} /> },
            { id: 'subscription', header: 'Subscription', value: (c) => c.endsAt, text: (c) => `${c.access}${c.endsAt ? ` until ${formatDate(c.endsAt)}` : ''}`,
              cell: (c) => <span className="whitespace-nowrap"><AccessBadge access={c.access} daysLeft={c.daysLeft} />{c.endsAt && <span className="ml-1 text-xs text-muted-foreground">{formatDate(c.endsAt)}</span>}</span> },
            { id: 'users', header: 'Users', value: (c) => c.activeUsers ?? 0, text: (c) => `${c.activeUsers ?? 0} / ${c.plan.maxUsers}` },
            { id: 'lastLogin', header: 'Last login', value: (c) => c.lastLoginAt ?? null, text: (c) => formatDateTime(c.lastLoginAt ?? null), className: 'whitespace-nowrap text-muted-foreground' },
          ]}
          empty={<EmptyState title="No companies found" icon={<Building2 />} />}
        />
      </Card>
      <CompanyFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={(c) => navigate(`/platform/companies/${c.id}`)} />
    </div>
  );
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform', 'company', id], queryFn: () => api.get<CompanyDetail>(`/platform/companies/${id}`) });
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [activateOpen, setActivateOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const enter = useEnterCompany();
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform'] });

  const suspend = useMutation({
    mutationFn: () => api.post(`/platform/companies/${id}/suspend`, { reason }),
    onSuccess: () => { toast.success('Company suspended. Its users were logged out.'); setSuspendOpen(false); setReason(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const activate = useMutation({
    mutationFn: () => api.post(`/platform/companies/${id}/activate`),
    onSuccess: () => { toast.success('Company activated'); setActivateOpen(false); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resetPw = useMutation({
    mutationFn: () => api.post<{ username: string }>(`/platform/companies/${id}/reset-owner-password`, { password: pw }),
    onSuccess: (r) => { toast.success(`Owner password changed. Username: ${r.username}`); setPwOpen(false); setPw(''); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <TableSkeleton />;
  const c = q.data;
  const extra = c.modules.filter((m) => PLAN_MODULE_OPTIONS.some((o) => o.key === m));

  return (
    <div>
      <Link to="/platform/companies" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Companies</Link>
      <PageHeader
        title={c.name}
        description={`Code ${c.code} · document prefix ${c.docPrefix} · since ${formatDate(c.createdAt)}`}
        actions={(
          <>
            <Button variant="navy" loading={enter.isPending} onClick={() => enter.mutate(c.id)}><LogIn /> Open company</Button>
            <Button onClick={() => setPayOpen(true)}><CreditCard /> Record payment</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil /> Edit company & plan</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPwOpen(true)}><KeyRound /> Reset Owner password</DropdownMenuItem>
                <DropdownMenuSeparator />
                {c.status === 'SUSPENDED'
                  ? <DropdownMenuItem onSelect={() => setActivateOpen(true)}><Power /> Activate</DropdownMenuItem>
                  : <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onSelect={() => setSuspendOpen(true)}><Power /> Suspend</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      />
      {c.status === 'SUSPENDED' && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <strong>Suspended.</strong> {c.suspendedReason} Users of this company cannot sign in.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Plan">{c.plan.name} ({formatPKR(c.plan.monthlyPrice)} / month)</Row>
            <Row label="Status"><CompanyStatusBadge status={c.status} /></Row>
            <Row label="Access"><AccessBadge access={c.access} daysLeft={c.daysLeft} /></Row>
            <Row label={c.status === 'TRIAL' ? 'Trial ends' : 'Paid until'}>{c.endsAt ? formatDate(c.endsAt) : 'No expiry'}</Row>
            {c.graceEndsAt && <Row label="Read-only from">{formatDate(c.graceEndsAt)}</Row>}
            <Row label="Grace days">{c.graceDays}</Row>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Shop details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Owner">{c.ownerName || '-'}</Row>
            <Row label="Phone">{c.phone || '-'}</Row>
            <Row label="Email">{c.email || '-'}</Row>
            <Row label="City">{c.city || '-'}</Row>
            <Row label="Address">{c.address || '-'}</Row>
            {c.notes && <Row label="Notes">{c.notes}</Row>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Active users">{c.users.filter((u) => u.isActive).length} / {c.plan.maxUsers}</Row>
            <Row label="Customers">{c.usage.customers}</Row>
            <Row label="Orders">{c.usage.orders}</Row>
            <Row label="Employees">{c.usage.employees}</Row>
            <div className="pt-1">
              <p className="mb-1 text-xs text-muted-foreground">Extra modules on this plan</p>
              <div className="flex flex-wrap gap-1">{extra.length ? extra.map((m) => <Badge key={m} variant="gold">{moduleLabel(m)}</Badge>) : <span className="text-xs">Core modules only</span>}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <DataTable
          title={`${c.name} - users`}
          noun="user"
          rows={c.users}
          getRowId={(u) => u.id}
          columns={[
            { id: 'name', header: 'Name', value: (u) => u.fullName, text: (u) => `${u.fullName}${u.email ? ` (${u.email})` : ''}`,
              cell: (u) => <><div className="font-medium">{u.fullName}</div><div className="text-xs text-muted-foreground">{u.email}</div></> },
            { id: 'username', header: 'Username', value: (u) => u.username, className: 'text-muted-foreground' },
            { id: 'roles', header: 'Roles', value: (u) => u.roles.map((r) => r.name).join(', '), cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.code} variant="secondary">{r.name}</Badge>)}</div> },
            { id: 'status', header: 'Status', value: (u) => (u.isActive ? 'Active' : 'Inactive'), cell: (u) => (u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>) },
            { id: 'lastLogin', header: 'Last login', value: (u) => u.lastLoginAt, text: (u) => formatDateTime(u.lastLoginAt), className: 'whitespace-nowrap text-muted-foreground' },
          ]}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <PaymentsTable title={`${c.name} - payments`} rows={c.payments} empty={<EmptyState title="No payments yet" icon={<CreditCard />} />} />
      </Card>

      <CompanyFormDialog open={editOpen} onOpenChange={setEditOpen} company={c} />
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} company={c} />
      <ConfirmDialog open={activateOpen} onOpenChange={setActivateOpen} title="Activate company?" description={`${c.name} users will be able to sign in again.`}
        confirmLabel="Activate" loading={activate.isPending} onConfirm={() => activate.mutate()} />
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Suspend {c.name}?</DialogTitle><DialogDescription>All its users are logged out at once and cannot sign in until you activate it. No data is deleted.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="s-reason">Reason (shown in the Super Admin panel)</Label><Textarea id="s-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="destructive" disabled={reason.trim().length < 3} loading={suspend.isPending} onClick={() => suspend.mutate()}>Suspend</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pwOpen} onOpenChange={(o) => { setPwOpen(o); if (!o) setPw(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reset Owner password</DialogTitle><DialogDescription>For when the shop owner forgot the password. They are logged out of all devices.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="o-pw">New password</Label><Input id="o-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <DialogFooter><Button disabled={pw.length < 10} loading={resetPw.isPending} onClick={() => resetPw.mutate()}>Reset password</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{children}</span></div>;
}

function PaymentsTable({ rows, showCompany, title = 'Subscription payments', empty, loading, error, onRetry, pagination, fetchAll, toolbar, footer }: {
  rows?: CompanyPaymentRow[]; showCompany?: boolean; title?: string; empty?: React.ReactNode; loading?: boolean; error?: unknown; onRetry?: () => void;
  pagination?: ServerPagination; fetchAll?: () => Promise<CompanyPaymentRow[]>; toolbar?: React.ReactNode; footer?: string;
}) {
  const navigate = useNavigate();
  const columns: DataColumn<CompanyPaymentRow>[] = [
    { id: 'paidAt', header: 'Paid on', value: (p) => p.paidAt, text: (p) => formatDate(p.paidAt), className: 'whitespace-nowrap' },
    ...(showCompany ? [{ id: 'company', header: 'Company', value: (p: CompanyPaymentRow) => p.company, cell: (p: CompanyPaymentRow) => <span className="font-medium">{p.company}</span> }] : []),
    { id: 'method', header: 'Method', value: (p) => methodLabel(p.method) },
    { id: 'reference', header: 'Reference', value: (p) => p.reference || '-', className: 'text-muted-foreground' },
    { id: 'period', header: 'Period', value: (p) => p.periodFrom, text: (p) => `${formatDate(p.periodFrom)} - ${formatDate(p.periodTo)} (${p.months} mo)`, className: 'whitespace-nowrap text-muted-foreground' },
    { id: 'amount', header: 'Amount', type: 'money', value: (p) => p.amount, cell: (p) => <span className="font-semibold">{formatPKR(p.amount)}</span> },
  ];
  return (
    <DataTable title={title} noun="payment" rows={rows} columns={columns} getRowId={(p) => p.id} loading={loading} error={error} onRetry={onRetry}
      pagination={pagination} fetchAll={fetchAll} toolbar={toolbar} empty={empty}
      onView={showCompany ? (p) => navigate(`/platform/companies/${p.companyId}`) : undefined}
      footer={footer ? () => ({ amount: footer }) : undefined} />
  );
}

// ------------------------------------------------------------------ payments

export function PlatformPaymentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const q = useQuery({
    queryKey: ['platform', 'payments', { search, page, pageSize }],
    queryFn: () => api.get<Paginated<CompanyPaymentRow> & { totalAmount: string }>('/platform/payments', { search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader title="Subscription Payments" description="Payments received from companies (JazzCash, EasyPaisa, bank, cash). Record a new one from the company page." />
      <Card>
        <PaymentsTable
          showCompany
          rows={q.data?.data}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          pagination={{ page, pageSize, total: q.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<CompanyPaymentRow>>('/platform/payments', { search, page: pg, pageSize: size }))}
          footer={q.data ? `Total ${formatPKR(q.data.totalAmount)}` : undefined}
          toolbar={
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search company or reference" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          }
          empty={<EmptyState title="No payments found" icon={<CreditCard />} />}
        />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ plans

const blankPlan = { code: '', name: '', description: '', monthlyPrice: 0, maxUsers: 3, modules: [] as string[], sortOrder: 0, isActive: true };

export function PlansPage() {
  const plans = usePlans();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blankPlan);
  const start = (p: PlanRow | null) => {
    setEditing(p);
    setF(p ? { code: p.code, name: p.name, description: p.description ?? '', monthlyPrice: Number(p.monthlyPrice), maxUsers: p.maxUsers, modules: p.modules, sortOrder: p.sortOrder, isActive: p.isActive } : blankPlan);
    setOpen(true);
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), description: f.description.trim(), monthlyPrice: Number(f.monthlyPrice), maxUsers: Number(f.maxUsers), modules: f.modules, sortOrder: Number(f.sortOrder), isActive: f.isActive };
      return editing ? api.patch(`/platform/plans/${editing.id}`, body) : api.post('/platform/plans', { ...body, code: f.code.trim().toUpperCase() });
    },
    onSuccess: () => { toast.success('Plan saved. Companies on this plan get the change at their next page load.'); setOpen(false); qc.invalidateQueries({ queryKey: ['platform'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = (k: string) => setF((d) => ({ ...d, modules: d.modules.includes(k) ? d.modules.filter((m) => m !== k) : [...d.modules, k] }));

  return (
    <div>
      <PageHeader title="Plans" description="Price, user limit and modules of each subscription plan. Core modules (customers, measurements, orders, payments, reports, settings) are in every plan."
        actions={<Button onClick={() => start(null)}><Plus /> New plan</Button>} />
      {plans.isError ? <ErrorState message={errorMessage(plans.error)} onRetry={() => plans.refetch()} /> : plans.isLoading ? <TableSkeleton /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.data!.map((p) => (
            <Card key={p.id} className={p.isActive ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div><CardTitle>{p.name}</CardTitle><CardDescription>{p.code}{p.isActive ? '' : ' · inactive'}</CardDescription></div>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => start(p)}><Pencil /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p><span className="text-2xl font-bold">{formatPKR(p.monthlyPrice)}</span> <span className="text-muted-foreground">/ month</span></p>
                <p>Up to <strong>{p.maxUsers}</strong> users · {p.companies} compan{p.companies === 1 ? 'y' : 'ies'}</p>
                {p.description && <p className="text-muted-foreground">{p.description}</p>}
                <div className="flex flex-wrap gap-1">{p.modules.length ? p.modules.map((m) => <Badge key={m} variant="gold">{moduleLabel(m)}</Badge>) : <span className="text-xs text-muted-foreground">Core modules only</span>}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : 'New plan'}</DialogTitle><DialogDescription>Modules switched off here disappear from the menu of every company on this plan.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {!editing && <div className="space-y-1.5"><Label htmlFor="pl-code">Code</Label><Input id="pl-code" placeholder="e.g. GOLD" value={f.code} onChange={(e) => setF((d) => ({ ...d, code: e.target.value.toUpperCase() }))} /></div>}
            <div className="space-y-1.5"><Label htmlFor="pl-name">Name</Label><Input id="pl-name" value={f.name} onChange={(e) => setF((d) => ({ ...d, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="pl-price">Monthly price (PKR)</Label><Input id="pl-price" type="number" min={0} value={f.monthlyPrice} onChange={(e) => setF((d) => ({ ...d, monthlyPrice: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="pl-users">Max users</Label><Input id="pl-users" type="number" min={1} value={f.maxUsers} onChange={(e) => setF((d) => ({ ...d, maxUsers: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="pl-sort">Sort order</Label><Input id="pl-sort" type="number" min={0} value={f.sortOrder} onChange={(e) => setF((d) => ({ ...d, sortOrder: Number(e.target.value) }))} /></div>
            <label className="flex items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={f.isActive} onChange={(e) => setF((d) => ({ ...d, isActive: e.target.checked }))} /> Available for new companies</label>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pl-desc">Description</Label><Textarea id="pl-desc" value={f.description} onChange={(e) => setF((d) => ({ ...d, description: e.target.value }))} /></div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium">Extra modules</p>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_MODULE_OPTIONS.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.modules.includes(m.key)} onChange={() => toggle(m.key)} /> {m.label}</label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={f.name.trim().length < 2 || (!editing && !/^[A-Z0-9_]{2,30}$/.test(f.code)) || f.maxUsers < 1} loading={save.isPending} onClick={() => save.mutate()}>Save plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ activity

export function PlatformActivityPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const q = useQuery({
    queryKey: ['platform', 'activity', { search, page, pageSize }],
    queryFn: () => api.get<Paginated<PlatformAuditRow>>('/platform/audit-logs', { search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader title="Platform Activity" description="Super Admin actions: companies created, plan changes, payments, suspensions and support visits. It cannot be edited or deleted." />
      <Card>
        <DataTable
          title="Platform activity"
          noun="record"
          rows={q.data?.data}
          getRowId={(r) => r.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          pagination={{ page, pageSize, total: q.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<PlatformAuditRow>>('/platform/audit-logs', { search, page: pg, pageSize: size }))}
          toolbar={
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search action" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          }
          columns={[
            { id: 'when', header: 'When', value: (r) => r.createdAt, text: (r) => formatDateTime(r.createdAt), className: 'whitespace-nowrap text-muted-foreground' },
            { id: 'action', header: 'Action', value: (r) => humanize(r.action), cell: (r) => <Badge variant="secondary">{humanize(r.action)}</Badge> },
            { id: 'company', header: 'Company', value: (r) => r.company ?? '-' },
            { id: 'by', header: 'By', value: (r) => r.user ?? 'System' },
            { id: 'ip', header: 'IP', value: (r) => r.ipAddress ?? '-', className: 'text-muted-foreground' },
          ]}
          empty={<EmptyState title="No activity yet" />}
        />
      </Card>
    </div>
  );
}
