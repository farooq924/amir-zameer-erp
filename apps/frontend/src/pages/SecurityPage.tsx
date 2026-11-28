import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, KeyRound, Laptop, Lock, LogOut, MonitorSmartphone, ShieldAlert, ShieldCheck, Smartphone, Unlock, UserX, XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Paginated } from '@/types';
import type { LockedUser, LoginAttemptRow, SecurityCheck, SecurityOverview, SessionRow } from '@/types/security';
import { cn } from '@/utils/cn';
import { formatDateTime, humanize } from '@/utils/format';

const CHECK_STYLE: Record<SecurityCheck['status'], { icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', label: 'OK' },
  warn: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', label: 'Needs attention' },
  bad: { icon: XCircle, cls: 'text-rose-600 dark:text-rose-400', label: 'Action needed' },
};

const REASONS: Record<string, string> = {
  BAD_PASSWORD: 'Wrong password', UNKNOWN_USER: 'Unknown username', LOCKED: 'Account locked', INACTIVE: 'Account deactivated', IP_BLOCKED: 'Address blocked',
};

function deviceIcon(device: string) {
  return /Android|iPhone/.test(device) ? Smartphone : /Windows|Mac|Linux/.test(device) ? Laptop : MonitorSmartphone;
}

export function SecurityPage() {
  const can = useCan();
  const canView = can('security', 'VIEW');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? (canView ? 'overview' : 'sessions');
  const setTab = (t: string) => { params.set('tab', t); setParams(params, { replace: true }); };

  return (
    <div>
      <PageHeader
        title={canView ? 'Security Center' : 'My Devices'}
        description={canView ? 'Security checklist, signed-in devices, login history and locked accounts.' : 'Devices where you are signed in. Sign out any device you do not recognise.'}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3 w-full justify-start overflow-x-auto sm:w-auto">
          {canView && <TabsTrigger value="overview">Overview</TabsTrigger>}
          <TabsTrigger value="sessions">{canView ? 'Signed-in devices' : 'My devices'}</TabsTrigger>
          {canView && <TabsTrigger value="logins">Login history</TabsTrigger>}
          {canView && <TabsTrigger value="locked">Locked accounts</TabsTrigger>}
        </TabsList>
        {canView && <TabsContent value="overview"><OverviewTab /></TabsContent>}
        <TabsContent value="sessions"><SessionsTab allowAll={canView} /></TabsContent>
        {canView && <TabsContent value="logins"><LoginsTab /></TabsContent>}
        {canView && <TabsContent value="locked"><LockedTab canUnlock={can('security', 'MANAGE_SETTINGS')} /></TabsContent>}
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  const q = useQuery({ queryKey: ['security', 'overview'], queryFn: () => api.get<SecurityOverview>('/security/overview'), refetchInterval: 60_000 });
  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const problems = d.checks.filter((c) => c.status !== 'ok').length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Security score" value={`${d.score}%`} hint={problems ? `${problems} item(s) need attention` : 'Everything looks good'} icon={ShieldCheck} />
        <StatCard label="Signed-in devices" value={String(d.stats.activeSessions)} hint="Active now" icon={MonitorSmartphone} tile="blue" />
        <StatCard label="Failed logins (24 hours)" value={String(d.stats.failedLogins24h)} hint={`${d.stats.successfulLogins24h} successful`} icon={ShieldAlert} tile="rose" tone={d.stats.failedLogins24h >= 20 ? 'negative' : undefined} />
        <StatCard label="Locked accounts" value={String(d.stats.lockedUsers)} icon={Lock} tile="gold" tone={d.stats.lockedUsers ? 'negative' : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Security checklist</CardTitle></CardHeader>
          <ul className="divide-y">
            {d.checks.map((c) => {
              const s = CHECK_STYLE[c.status];
              const Icon = s.icon;
              return (
                <li key={c.key} className="flex items-start gap-3 px-4 py-3">
                  <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.cls)} aria-label={s.label} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.label}</p>
                    <p className="text-sm text-muted-foreground">{c.detail}</p>
                  </div>
                  {c.link && c.status !== 'ok' && <Button asChild size="sm" variant="outline"><Link to={c.link}>Open</Link></Button>}
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Most failed logins (24 hours)</CardTitle></CardHeader>
            <CardContent>
              {!d.topFailedIps.length ? <p className="text-sm text-muted-foreground">No failed logins.</p> : (
                <ul className="space-y-2 text-sm">
                  {d.topFailedIps.map((t) => (
                    <li key={t.ipAddress ?? 'unknown'} className="flex justify-between gap-2"><span className="font-mono">{t.ipAddress ?? 'Unknown'}</span><Badge variant={t.count >= 10 ? 'danger' : 'secondary'}>{t.count}</Badge></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> Built-in protection</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Passwords stored with Argon2id (never readable)</li>
                <li>HTTP-only, SameSite login cookies and CSRF tokens</li>
                <li>Role permissions checked on the server for every request</li>
                <li>Append-only audit log of every change</li>
                <li>Encrypted daily backups with restore test</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SessionsTab({ allowAll }: { allowAll: boolean }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'mine' | 'all'>(allowAll ? 'all' : 'mine');
  const [toRevoke, setToRevoke] = useState<SessionRow | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const q = useQuery({ queryKey: ['security', 'sessions', scope], queryFn: () => api.get<SessionRow[]>('/security/sessions', { scope }) });
  const done = () => void qc.invalidateQueries({ queryKey: ['security'] });
  const revoke = useMutation({
    mutationFn: (s: SessionRow) => api.post(`/security/sessions/${s.id}/revoke`),
    onSuccess: () => { toast.success('Device signed out'); setToRevoke(null); done(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/security/sessions/revoke-others'),
    onSuccess: (r) => { toast.success(`${r.revoked} other device(s) signed out`); setOthersOpen(false); done(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {allowAll && (
          <NativeSelect aria-label="Whose devices" className="w-auto" value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'all')}>
            <option value="all">All users</option><option value="mine">Only mine</option>
          </NativeSelect>
        )}
        <Button className="ml-auto" variant="outline" onClick={() => setOthersOpen(true)}><LogOut /> Sign out my other devices</Button>
      </div>
      {q.isLoading ? <LoadingState /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        : !q.data?.length ? <EmptyState icon={<MonitorSmartphone />} title="No signed-in devices" /> : (
          <ul className="divide-y">
            {q.data.map((s) => {
              const Icon = deviceIcon(s.device);
              return (
                <li key={s.id} className="flex items-start gap-3 p-3 sm:items-center">
                  <div className="icon-tile h-10 w-10 bg-gold-soft text-[#9a7420] dark:text-gold"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.device}</span>
                      {s.current && <Badge variant="success">This device</Badge>}
                      {!s.user.isActive && <Badge variant="danger">User deactivated</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.user.fullName} ({s.user.username}) · {s.ipAddress ?? 'Unknown address'}</p>
                    <p className="text-xs text-muted-foreground">Signed in {formatDateTime(s.createdAt)} · last active {formatDateTime(s.lastSeenAt)}</p>
                  </div>
                  {!s.current && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setToRevoke(s)}><LogOut /> Sign out</Button>}
                </li>
              );
            })}
          </ul>
        )}
      <ConfirmDialog
        open={!!toRevoke} onOpenChange={(v) => !v && setToRevoke(null)} destructive loading={revoke.isPending}
        title="Sign out this device?" description={`${toRevoke?.device ?? ''} of ${toRevoke?.user.fullName ?? ''} will have to sign in again.`}
        confirmLabel="Sign out" onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
      />
      <ConfirmDialog
        open={othersOpen} onOpenChange={setOthersOpen} loading={revokeOthers.isPending}
        title="Sign out your other devices?" description="You stay signed in here. Every other phone or computer with your login must sign in again."
        confirmLabel="Sign out others" onConfirm={() => revokeOthers.mutate()}
      />
    </Card>
  );
}

function LoginsTab() {
  const [result, setResult] = useState<'all' | 'failed' | 'success'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const params = { result, search: search || undefined };
  const q = useQuery({
    queryKey: ['security', 'logins', result, search, page, pageSize],
    queryFn: () => api.get<Paginated<LoginAttemptRow>>('/security/login-attempts', { ...params, page, pageSize }),
  });
  const resultText = (a: LoginAttemptRow) => (a.success ? 'Signed in' : REASONS[a.reason ?? ''] ?? humanize(a.reason ?? 'Failed'));
  return (
    <Card>
      <DataTable
        title="Login history"
        module="security"
        noun="login"
        rows={q.data?.data}
        getRowId={(a) => a.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        pagination={{ page, pageSize, total: q.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
        fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<LoginAttemptRow>>('/security/login-attempts', { ...params, page: pg, pageSize: size }))}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="Result" className="w-auto" value={result} onChange={(e) => { setResult(e.target.value as typeof result); setPage(1); }}>
              <option value="all">All logins</option><option value="failed">Failed only</option><option value="success">Successful only</option>
            </NativeSelect>
            <Input aria-label="Search username or address" placeholder="Search username or address" className="sm:w-64" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        }
        columns={[
          { id: 'time', header: 'Time', value: (a) => a.createdAt, text: (a) => formatDateTime(a.createdAt), className: 'whitespace-nowrap' },
          { id: 'identifier', header: 'Username / email', value: (a) => a.identifier },
          { id: 'ip', header: 'Address', value: (a) => a.ipAddress ?? '-', className: 'font-mono text-xs' },
          { id: 'result', header: 'Result', value: resultText, cell: (a) => (a.success ? <Badge variant="success">Signed in</Badge> : <Badge variant="danger">{resultText(a)}</Badge>) },
        ]}
        empty={<EmptyState icon={<ShieldCheck />} title="No logins found" />}
        mobileCard={(a) => (
          <div className="flex items-center justify-between gap-2 px-1 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{a.identifier}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)} · {a.ipAddress ?? '-'}</p>
            </div>
            {a.success ? <Badge variant="success">Signed in</Badge> : <Badge variant="danger">{resultText(a)}</Badge>}
          </div>
        )}
      />
    </Card>
  );
}

function LockedTab({ canUnlock }: { canUnlock: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['security', 'locked'], queryFn: () => api.get<LockedUser[]>('/security/locked-users') });
  const unlock = useMutation({
    mutationFn: (id: string) => api.post(`/security/users/${id}/unlock`),
    onSuccess: () => { toast.success('Account unlocked'); void qc.invalidateQueries({ queryKey: ['security'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      {q.isLoading ? <LoadingState /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        : !q.data?.length ? <EmptyState icon={<Unlock />} title="No locked accounts" description="Accounts lock for a short time after too many wrong passwords." /> : (
          <ul className="divide-y">
            {q.data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 p-3">
                <div className="icon-tile h-10 w-10 bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><UserX className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{u.fullName} ({u.username})</p>
                  <p className="text-xs text-muted-foreground">Locked until {formatDateTime(u.lockedUntil)}</p>
                </div>
                {canUnlock && <Button size="sm" variant="outline" loading={unlock.isPending && unlock.variables === u.id} onClick={() => unlock.mutate(u.id)}><Unlock /> Unlock</Button>}
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
