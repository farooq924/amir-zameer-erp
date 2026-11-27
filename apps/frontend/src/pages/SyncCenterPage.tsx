import { SYNC_ENTITIES, syncEntityLabel } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, GitMerge, MonitorSmartphone, RefreshCw, RotateCcw, Smartphone, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { ConflictReviewDialog } from '@/features/offline/ConflictReviewDialog';
import { OutboxStatusBadge, SyncStatusBadge } from '@/features/offline/SyncBadges';
import { useLive } from '@/features/offline/use-live';
import { useCan } from '@/hooks/use-permission';
import { type OutboxOp, db } from '@/offline/db';
import { deviceId, deviceName, setDeviceName } from '@/offline/device';
import { usePwa } from '@/offline/pwa';
import { useSync } from '@/offline/sync';
import { api, errorMessage } from '@/services/api';
import { useAuth } from '@/store/auth';
import type { Paginated } from '@/types';
import type { SyncConflictRow, SyncLogRow, SyncSummary } from '@/types/sync';
import { formatDateTime } from '@/utils/format';

function resultText(r: Record<string, unknown> | null): string {
  if (!r) return '';
  const parts = [r.code, r.orderNumber, r.receiptNo, r.versionNo ? `version ${String(r.versionNo)}` : null, r.resolution ? String(r.resolution).replace(/_/g, ' ').toLowerCase() : null];
  return parts.filter(Boolean).map(String).join(' · ');
}

export function SyncCenterPage() {
  const can = useCan();
  const approver = can('sync', 'APPROVE');
  const user = useAuth((s) => s.user);
  const { online, syncing, lastSyncAt, lastError, counts, syncNow, retry, discard } = useSync();
  const pwa = usePwa();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'device';
  const [scope, setScope] = useState<'mine' | 'all'>(approver ? 'all' : 'mine');
  const [conflictStatus, setConflictStatus] = useState<'PENDING' | 'RESOLVED'>('PENDING');
  const [review, setReview] = useState<SyncConflictRow | null>(null);
  const [toDiscard, setToDiscard] = useState<OutboxOp | null>(null);
  const [logStatus, setLogStatus] = useState('');
  const [logEntity, setLogEntity] = useState('');
  const [page, setPage] = useState(1);
  const [name, setName] = useState(deviceName());

  const outbox = useLive(async () => (user ? (await db.outbox.where('userId').equals(user.id).toArray()).sort((a, b) => b.clientTimestamp.localeCompare(a.clientTimestamp)) : []), [user?.id], [] as OutboxOp[]);
  const summary = useQuery({ queryKey: ['sync', 'summary'], queryFn: () => api.get<SyncSummary>('/sync/summary'), enabled: online });
  const conflicts = useQuery({
    queryKey: ['sync', 'conflicts', conflictStatus, scope],
    queryFn: () => api.get<SyncConflictRow[]>('/sync/conflicts', { status: conflictStatus, scope }),
    enabled: online,
  });
  const log = useQuery({
    queryKey: ['sync', 'log', scope, logStatus, logEntity, page],
    queryFn: () => api.get<Paginated<SyncLogRow>>('/sync/operations', { scope, status: logStatus || undefined, entityType: logEntity || undefined, page, pageSize: 25 }),
    enabled: online && tab === 'log',
  });

  const runSync = async () => {
    const r = await syncNow({});
    const err = useSync.getState().lastError;
    if (err) toast.error(err);
    else if (r) toast.success(r.sent ? `Sync finished: ${r.saved} saved${r.problems ? `, ${r.problems} need review` : ''}` : 'Everything is up to date');
    void summary.refetch(); void conflicts.refetch();
  };
  const openConflict = async (id: string | undefined) => {
    if (!id) return;
    const found = conflicts.data?.find((c) => c.id === id) ?? (await api.get<SyncConflictRow[]>('/sync/conflicts', { scope }).catch(() => [])).find((c) => c.id === id);
    if (found) setReview(found); else toast.info('Open this conflict when you are online.');
  };

  const saved24 = (summary.data?.last24h.APPLIED ?? 0) + (summary.data?.last24h.DUPLICATE ?? 0);
  const setTab = (t: string) => { params.set('tab', t); setParams(params, { replace: true }); };

  return (
    <div>
      <PageHeader
        title="Sync Center"
        description="Work saved on this device, sync conflicts to review and the history of every synced entry."
        actions={(
          <>
            {pwa.canInstall && <Button variant="navy" onClick={() => void pwa.install()}><Download /> Install app</Button>}
            <Button onClick={runSync} loading={syncing} disabled={!online}><RefreshCw /> Sync now</Button>
          </>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Connection" value={syncing ? 'Syncing...' : online ? 'Online' : 'Offline'} hint={lastSyncAt ? `Last sync ${formatDateTime(lastSyncAt)}` : 'Not synced in this session'} icon={online ? Wifi : WifiOff} />
        <StatCard label="Waiting on this device" value={String(counts.pending)} hint={counts.rejected ? `${counts.rejected} rejected` : 'Sent automatically'} icon={Smartphone} tile="gold" />
        <StatCard label="Conflicts to review" value={online ? String(summary.data?.pendingConflicts ?? counts.conflict) : String(counts.conflict)} icon={GitMerge} tile="rose" tone={(summary.data?.pendingConflicts ?? counts.conflict) > 0 ? 'negative' : undefined} />
        <StatCard label="Saved in last 24 hours" value={online ? String(saved24) : '-'} hint={summary.data?.scope === 'all' ? 'All users' : 'Your entries'} icon={CheckCircle2} tile="green" loading={online && summary.isLoading} />
      </div>
      {lastError && <p className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"><AlertTriangle className="h-4 w-4" /> {lastError}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="device">This device{counts.total ? ` (${counts.total})` : ''}</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts{summary.data?.pendingConflicts ? ` (${summary.data.pendingConflicts})` : ''}</TabsTrigger>
          <TabsTrigger value="log">Sync log</TabsTrigger>
          <TabsTrigger value="app">Offline app</TabsTrigger>
        </TabsList>

        <TabsContent value="device">
          <Card>
            {!outbox.length ? (
              <EmptyState icon={<CheckCircle2 />} title="Nothing waiting on this device" description="Everything you saved offline is on the server." />
            ) : (
              <ul className="divide-y">
                {outbox.map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{o.title}</span><OutboxStatusBadge status={o.status} /></div>
                      {o.subtitle && <p className="truncate text-xs text-muted-foreground">{o.subtitle}</p>}
                      <p className="text-xs text-muted-foreground">Saved {formatDateTime(o.clientTimestamp)}{o.attempts ? ` · tried ${o.attempts} time(s)` : ''}</p>
                      {o.message && <p className={o.status === 'rejected' ? 'mt-1 text-xs text-rose-700 dark:text-rose-400' : 'mt-1 text-xs text-muted-foreground'}>{o.message}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {o.status === 'conflict' && <Button size="sm" onClick={() => void openConflict(o.conflictId)}><GitMerge /> Review</Button>}
                      {(o.status === 'rejected' || o.status === 'retry') && <Button size="sm" variant="outline" onClick={() => void retry(o.id)}><RotateCcw /> Retry</Button>}
                      {o.status !== 'conflict' && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setToDiscard(o)} aria-label="Discard entry"><Trash2 /></Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="conflicts">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <NativeSelect aria-label="Conflict status" className="w-auto" value={conflictStatus} onChange={(e) => setConflictStatus(e.target.value as 'PENDING' | 'RESOLVED')}>
                <option value="PENDING">Needs review</option><option value="RESOLVED">Resolved</option>
              </NativeSelect>
              {approver && (
                <NativeSelect aria-label="Whose conflicts" className="w-auto" value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'all')}>
                  <option value="all">All users</option><option value="mine">Only mine</option>
                </NativeSelect>
              )}
            </div>
            {!online ? <EmptyState icon={<WifiOff />} title="Go online to see conflicts" description="Conflicts are decided on the server." />
              : conflicts.isLoading ? <LoadingState />
              : conflicts.isError ? <ErrorState message={errorMessage(conflicts.error)} onRetry={() => void conflicts.refetch()} />
              : !conflicts.data?.length ? <EmptyState icon={<CheckCircle2 />} title={conflictStatus === 'PENDING' ? 'No conflicts to review' : 'No resolved conflicts yet'} />
              : (
                <ul className="divide-y">
                  {conflicts.data.map((c) => (
                    <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{String(c.device.name ?? c.server.name ?? 'Customer')}</span>
                          <Badge variant={c.resolution === 'PENDING' ? 'gold' : 'success'}>{c.resolution === 'PENDING' ? c.kindLabel : 'Resolved'}</Badge></div>
                        <p className="text-xs text-muted-foreground">{c.operation.message}</p>
                        <p className="text-xs text-muted-foreground">{c.operation.user?.fullName ?? 'Unknown'} · {c.operation.deviceId} · {formatDateTime(c.createdAt)}</p>
                      </div>
                      <Button size="sm" variant={c.resolution === 'PENDING' ? 'default' : 'outline'} onClick={() => setReview(c)}>{c.resolution === 'PENDING' ? 'Review' : 'View'}</Button>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <NativeSelect aria-label="Status" className="w-auto" value={logStatus} onChange={(e) => { setLogStatus(e.target.value); setPage(1); }}>
                <option value="">All statuses</option><option value="APPLIED">Saved</option><option value="CONFLICT">Conflict</option><option value="REJECTED">Rejected</option>
              </NativeSelect>
              <NativeSelect aria-label="Record type" className="w-auto" value={logEntity} onChange={(e) => { setLogEntity(e.target.value); setPage(1); }}>
                <option value="">All records</option>{SYNC_ENTITIES.map((en) => <option key={en.key} value={en.key}>{en.label}</option>)}
              </NativeSelect>
              {approver && (
                <NativeSelect aria-label="Whose entries" className="w-auto" value={scope} onChange={(e) => { setScope(e.target.value as 'mine' | 'all'); setPage(1); }}>
                  <option value="all">All users</option><option value="mine">Only mine</option>
                </NativeSelect>
              )}
            </div>
            {!online ? <EmptyState icon={<WifiOff />} title="Go online to see the sync log" />
              : log.isLoading ? <LoadingState />
              : log.isError ? <ErrorState message={errorMessage(log.error)} onRetry={() => void log.refetch()} />
              : !log.data?.data.length ? <EmptyState title="No synced entries yet" description="Entries saved in the Offline Desk appear here once they reach the server." />
              : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <THead><TR><TH>Synced</TH><TH>Record</TH><TH>User / device</TH><TH>Status</TH><TH>Result</TH></TR></THead>
                      <TBody>
                        {log.data.data.map((r) => (
                          <TR key={r.id}>
                            <TD className="whitespace-nowrap text-xs">{formatDateTime(r.serverTimestamp)}<span className="block text-muted-foreground">saved {formatDateTime(r.clientTimestamp)}</span></TD>
                            <TD>{syncEntityLabel(r.entityType)} <span className="text-xs text-muted-foreground">{r.operation === 'CREATE' ? 'new' : 'edit'}</span></TD>
                            <TD className="text-xs">{r.user?.fullName ?? '-'}<span className="block font-mono text-muted-foreground">{r.deviceId}</span></TD>
                            <TD><SyncStatusBadge status={r.status} /></TD>
                            <TD className="max-w-xs text-xs">{r.status === 'APPLIED' ? resultText(r.result) : <span className="text-muted-foreground">{r.message}</span>}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                  <ul className="divide-y md:hidden">
                    {log.data.data.map((r) => (
                      <li key={r.id} className="space-y-1 p-3">
                        <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{syncEntityLabel(r.entityType)} {r.operation === 'CREATE' ? '(new)' : '(edit)'}</span><SyncStatusBadge status={r.status} /></div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(r.serverTimestamp)} · {r.user?.fullName ?? '-'}</p>
                        <p className="text-xs">{r.status === 'APPLIED' ? resultText(r.result) : r.message}</p>
                      </li>
                    ))}
                  </ul>
                  {log.data.meta.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                      <span>{log.data.meta.total} record(s)</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                        <span className="self-center">Page {page} of {log.data.meta.totalPages}</span>
                        <Button size="sm" variant="outline" disabled={page >= log.data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
          </Card>
        </TabsContent>

        <TabsContent value="app">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 font-semibold"><MonitorSmartphone className="h-5 w-5 text-primary" /> This device</h2>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Offline ready</dt><dd>{pwa.offlineReady ? <Badge variant="success">Yes</Badge> : <Badge variant="warning">Open once online</Badge>}</dd>
                <dt className="text-muted-foreground">Installed as app</dt><dd>{pwa.installed ? <Badge variant="success">Yes</Badge> : <Badge variant="outline">No</Badge>}</dd>
                <dt className="text-muted-foreground">Device ID</dt><dd className="font-mono text-xs">{deviceId()}</dd>
              </dl>
              <div className="flex gap-2">
                <Input aria-label="Device name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="outline" onClick={() => { setDeviceName(name); toast.success('Device name saved'); }}>Save name</Button>
              </div>
              {pwa.canInstall && <Button variant="navy" onClick={() => void pwa.install()}><Download /> Install AZ ERP on this device</Button>}
              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-semibold text-foreground">How to install</p>
                <p>Android / Chrome / Edge: open the browser menu and choose "Install app" or "Add to Home screen".</p>
                <p>iPhone / iPad (Safari): tap Share, then "Add to Home Screen".</p>
                <p>The ERP must be opened at least once online on each device before it works offline.</p>
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5 text-primary" /> Devices that synced (30 days)</h2>
              {!online ? <p className="text-sm text-muted-foreground">Go online to see devices.</p> : !summary.data?.devices.length ? <p className="text-sm text-muted-foreground">No device has synced yet.</p> : (
                <ul className="divide-y rounded-lg border">
                  {summary.data.devices.map((d) => (
                    <li key={d.deviceId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{d.deviceId}{d.deviceId === deviceId() && <Badge variant="gold" className="ml-2">This device</Badge>}</span>
                      <span className="text-right text-xs text-muted-foreground">{d.operations} entries<span className="block">{formatDateTime(d.lastSeen)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ConflictReviewDialog conflict={review} onOpenChange={(o) => !o && setReview(null)} />
      <ConfirmDialog
        open={!!toDiscard} onOpenChange={(o) => !o && setToDiscard(null)} destructive confirmLabel="Discard"
        title="Discard this entry?" description={`"${toDiscard?.title ?? ''}" will be removed from this device and never sent to the server.`}
        onConfirm={() => { if (toDiscard) void discard(toDiscard.id); setToDiscard(null); toast.success('Entry discarded'); }}
      />
    </div>
  );
}
