import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Clock, DatabaseBackup, Download, FlaskConical, FolderSearch, HardDrive, KeyRound, Loader2, MoreVertical,
  RotateCcw, Save, ShieldCheck, Trash2, XCircle,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { StatCard } from '@/features/dashboard/StatCard';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import { useAuth } from '@/store/auth';
import type { Paginated } from '@/types';
import type { BackupConfig, BackupOverview, BackupRow, RestoreTestResult } from '@/types/security';
import { formatDateTime } from '@/utils/format';

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function ageText(hours: number | null): string {
  if (hours === null) return 'Never';
  if (hours < 1) return 'Just now';
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** "Today 23:00" / "Tomorrow 23:00" / date. */
function whenText(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const now = new Date();
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() + 86400_000))) return `Tomorrow ${time}`;
  return formatDateTime(iso);
}

export function BackupStatusBadge({ status }: { status: BackupRow['status'] }) {
  const map: Record<BackupRow['status'], { v: 'success' | 'warning' | 'danger' | 'info' | 'secondary'; t: string }> = {
    VERIFIED: { v: 'success', t: 'Verified' },
    COMPLETED: { v: 'info', t: 'Saved' },
    RUNNING: { v: 'warning', t: 'Running' },
    FAILED: { v: 'danger', t: 'Failed' },
    RESTORED: { v: 'secondary', t: 'Restored' },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.t}</Badge>;
}

/** Downloads a file from a POST/GET endpoint that answers with an attachment. */
async function downloadFrom(path: string, init?: RequestInit): Promise<string> {
  const csrf = document.cookie.match(/(?:^|; )az_csrf=([^;]*)/)?.[1];
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && init?.method ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

export function BackupPage() {
  const can = useCan();
  const isOwner = useAuth((s) => s.user?.isOwner ?? false);
  const canCreate = can('backup', 'CREATE');
  const canApprove = can('backup', 'APPROVE');
  const canExport = can('backup', 'EXPORT');
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [note, setNote] = useState('');
  const [testResult, setTestResult] = useState<{ row: BackupRow; result: RestoreTestResult } | null>(null);
  const [toDelete, setToDelete] = useState<BackupRow | null>(null);
  const [toRestore, setToRestore] = useState<BackupRow | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['backup', 'overview'], queryFn: () => api.get<BackupOverview>('/backup/overview'), refetchInterval: 30_000 });
  const list = useQuery({
    queryKey: ['backup', 'list', type, page, pageSize],
    queryFn: () => api.get<Paginated<BackupRow>>('/backup', { type: type || undefined, page, pageSize }),
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['backup'] }); void qc.invalidateQueries({ queryKey: ['security'] }); };

  const create = useMutation({
    mutationFn: () => api.post<BackupRow>('/backup', { note: note.trim() || undefined }),
    onSuccess: (r) => { toast.success(`Backup saved: ${r.fileName}`); setNote(''); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); refresh(); },
  });
  const scan = useMutation({
    mutationFn: () => api.post<{ added: number; missing: number }>('/backup/scan'),
    onSuccess: (r) => { toast.success(r.added ? `${r.added} backup(s) added from the folder` : 'No new backups found in the folder'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const act = async (row: BackupRow, action: 'verify' | 'test' | 'download') => {
    setBusyId(row.id);
    try {
      if (action === 'verify') {
        await api.post(`/backup/${row.id}/verify`);
        toast.success('Backup checked: the file is complete and can be decrypted');
      } else if (action === 'test') {
        const result = await api.post<RestoreTestResult>(`/backup/${row.id}/restore-test`);
        setTestResult({ row, result });
      } else {
        const name = await downloadFrom(`/backup/${row.id}/download`);
        toast.success(`${name} downloaded`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const remove = useMutation({
    mutationFn: (row: BackupRow) => api.delete(`/backup/${row.id}`),
    onSuccess: () => { toast.success('Backup deleted'); setToDelete(null); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const o = overview.data;
  const running = !!o?.running || create.isPending;

  return (
    <div>
      <PageHeader
        title="Backup & Restore"
        description="Encrypted copies of all ERP data. Made automatically every day, checked, and ready to restore."
        actions={canCreate ? (
          <>
            <Button variant="outline" onClick={() => scan.mutate()} loading={scan.isPending}><FolderSearch /> Scan folder</Button>
            <Button onClick={() => create.mutate()} loading={running} disabled={running}><DatabaseBackup /> Back up now</Button>
          </>
        ) : undefined}
      />

      {overview.isError ? <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard featured label="Last good backup" value={o ? ageText(o.lastBackupAgeHours) : '-'} hint={o?.lastBackup ? formatDateTime(o.lastBackup.startedAt) : 'No backup yet'} icon={ShieldCheck} loading={overview.isLoading} />
            <StatCard label="Next automatic backup" value={o?.nextAutomaticAt ? whenText(o.nextAutomaticAt) : o ? 'Switched off' : '-'} hint={o ? `Daily at ${o.config.dailyTime} (Karachi time)` : undefined} icon={Clock} tile="blue" loading={overview.isLoading} />
            <StatCard label="Backups kept" value={o ? String(o.goodBackups) : '-'} hint={o ? `${formatBytes(o.totalSizeBytes)} in total` : undefined} icon={HardDrive} tile="green" loading={overview.isLoading} />
            <StatCard label="Failed in last 24 hours" value={o ? String(o.failedLast24h) : '-'} icon={AlertTriangle} tile="rose" tone={o?.failedLast24h ? 'negative' : undefined} loading={overview.isLoading} />
          </div>

          {o?.tool.error && <Alert tone="bad"><b>Backups cannot run:</b> {o.tool.error}</Alert>}
          {o?.key.error && <Alert tone="bad"><b>Encryption key problem:</b> {o.key.error}</Alert>}
          {o?.lastAutoError && <Alert tone="bad"><b>Last automatic backup failed:</b> {o.lastAutoError}</Alert>}
          {o && !o.key.savedAt && isOwner && (
            <Alert tone="warn">
              <span className="flex-1"><b>Download your recovery key.</b> Backups are encrypted. On a new computer they can only be opened with this key.</span>
              <Button size="sm" variant="navy" onClick={() => setKeyOpen(true)}><KeyRound /> Download key</Button>
            </Alert>
          )}
          {running && <Alert tone="info"><Loader2 className="h-4 w-4 animate-spin" /> {o?.running ? `Please wait: ${o.running} is running...` : 'Making the backup...'}</Alert>}
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <DataTable
            title="Backups"
            module="backup"
            noun="backup"
            rows={list.data?.data}
            getRowId={(r) => r.id}
            loading={list.isLoading}
            error={list.error}
            onRetry={() => void list.refetch()}
            pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
            fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<BackupRow>>('/backup', { type: type || undefined, page: pg, pageSize: size }))}
            toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="Backup type" className="w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
              <option value="">All backups</option><option value="AUTOMATIC">Automatic</option><option value="MANUAL">Manual</option>
            </NativeSelect>
            {canCreate && (
              <div className="ml-auto flex w-full gap-2 sm:w-auto">
                <Input aria-label="Note for the next backup" placeholder="Note (optional), e.g. Before year end" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="sm:w-64" />
              </div>
            )}
          </div>
            }
            columns={[
              { id: 'date', header: 'Date', value: (r) => r.startedAt, text: (r) => formatDateTime(r.startedAt), className: 'whitespace-nowrap' },
              { id: 'backup', header: 'Backup', value: (r) => (r.type === 'AUTOMATIC' ? 'Automatic' : 'Manual'), text: (r) => `${r.type === 'AUTOMATIC' ? 'Automatic' : 'Manual'} - ${r.note ?? r.fileName}`,
                cell: (r) => <>
                  <div className="flex items-center gap-2"><span className="font-medium">{r.type === 'AUTOMATIC' ? 'Automatic' : 'Manual'}</span>{r.restoredAt && <Badge variant="gold">Restored {formatDateTime(r.restoredAt)}</Badge>}</div>
                  <p className="text-xs text-muted-foreground">{r.note ?? r.fileName}{r.createdBy && r.type === 'MANUAL' ? ` · by ${r.createdBy}` : ''}</p>
                  {r.restoreTest && <p className={r.restoreTest.ok ? 'text-xs text-emerald-700 dark:text-emerald-400' : 'text-xs text-rose-700 dark:text-rose-400'}>{r.restoreTest.ok ? 'Restore test passed' : 'Restore test failed'} · {formatDateTime(r.restoreTest.at)}</p>}
                  {r.errorMessage && <p className="text-xs text-rose-700 dark:text-rose-400">{r.errorMessage}</p>}
                </> },
              { id: 'size', header: 'Size', type: 'number', value: (r) => r.sizeBytes, text: (r) => formatBytes(r.sizeBytes) },
              { id: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <BackupStatusBadge status={r.status} /> },
              { id: 'menu', header: '', exportable: false, sortable: false, className: 'w-12 no-print',
                cell: (r) => <span onClick={(e) => e.stopPropagation()}><RowMenu row={r} busy={busyId === r.id} perms={{ canCreate, canApprove, canExport, isOwner }} onAction={act} onDelete={setToDelete} onRestore={setToRestore} /></span> },
            ]}
            empty={<EmptyState icon={<DatabaseBackup />} title="No backups yet" description="Press Back up now to make the first encrypted backup." />}
            mobileCard={(r) => (
              <div className="flex items-start gap-3 px-1 py-3">
                <div className="icon-tile h-10 w-10 bg-gold-soft text-[#9a7420] dark:text-gold"><DatabaseBackup className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.type === 'AUTOMATIC' ? 'Automatic' : 'Manual'}</span><BackupStatusBadge status={r.status} /></div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(r.startedAt)} · {formatBytes(r.sizeBytes)}</p>
                  {r.note && <p className="truncate text-xs text-muted-foreground">{r.note}</p>}
                  {r.errorMessage && <p className="text-xs text-rose-700 dark:text-rose-400">{r.errorMessage}</p>}
                </div>
                <RowMenu row={r} busy={busyId === r.id} perms={{ canCreate, canApprove, canExport, isOwner }} onAction={act} onDelete={setToDelete} onRestore={setToRestore} />
              </div>
            )}
          />
        </Card>

        <div className="space-y-4">
          {o && <SettingsCard config={o.config} canEdit={canApprove} onSaved={refresh} />}
          {o && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> Encryption</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Info label="Encryption">AES-256-GCM (every file)</Info>
                <Info label="Key fingerprint"><span className="font-mono">{o.key.fingerprint || '-'}</span></Info>
                <Info label="Key kept in">{o.key.source === 'env' ? 'BACKUP_ENCRYPTION_KEY (.env)' : o.key.file ?? '-'}</Info>
                <Info label="Recovery key">{o.key.savedAt ? `Downloaded ${formatDateTime(o.key.savedAt)}` : 'Not downloaded yet'}</Info>
                <Info label="Backups folder"><span className="break-all">{o.folder}</span></Info>
                <Info label="Database tool"><span className="break-all">{o.tool.pgDump ?? 'Not found'}</span></Info>
                {isOwner && <Button className="mt-2 w-full" variant="gold" onClick={() => setKeyOpen(true)}><Download /> Download recovery key</Button>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} destructive loading={remove.isPending}
        title="Delete this backup?" description={`${toDelete?.fileName ?? ''} and its copy in the second folder will be deleted. This cannot be undone.`}
        confirmLabel="Delete" onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
      <RestoreTestDialog data={testResult} onClose={() => setTestResult(null)} />
      <RestoreDialog row={toRestore} onClose={() => setToRestore(null)} />
      <RecoveryKeyDialog open={keyOpen} onClose={() => { setKeyOpen(false); refresh(); }} />
    </div>
  );
}

function Alert({ tone, children }: { tone: 'bad' | 'warn' | 'info'; children: ReactNode }) {
  const cls = tone === 'bad'
    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
    : tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
      : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200';
  return <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  );
}

function RowMenu({ row, busy, perms, onAction, onDelete, onRestore }: {
  row: BackupRow; busy: boolean;
  perms: { canCreate: boolean; canApprove: boolean; canExport: boolean; isOwner: boolean };
  onAction: (r: BackupRow, a: 'verify' | 'test' | 'download') => void;
  onDelete: (r: BackupRow) => void;
  onRestore: (r: BackupRow) => void;
}) {
  const usable = row.fileExists && (row.status === 'VERIFIED' || row.status === 'COMPLETED' || row.status === 'RESTORED');
  if (busy) return <Loader2 className="m-2 h-5 w-5 animate-spin text-muted-foreground" aria-label="Working" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Backup actions"><MoreVertical /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {perms.canExport && <DropdownMenuItem disabled={!row.fileExists} onSelect={() => onAction(row, 'download')}><Download /> Download</DropdownMenuItem>}
        {perms.canCreate && <DropdownMenuItem disabled={!row.fileExists} onSelect={() => onAction(row, 'verify')}><CheckCircle2 /> Check file</DropdownMenuItem>}
        {perms.canCreate && <DropdownMenuItem disabled={!usable} onSelect={() => onAction(row, 'test')}><FlaskConical /> Restore test</DropdownMenuItem>}
        {perms.isOwner && <DropdownMenuItem disabled={!usable} onSelect={() => onRestore(row)}><RotateCcw /> Restore this backup</DropdownMenuItem>}
        {perms.canApprove && row.status !== 'RUNNING' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onSelect={() => onDelete(row)}><Trash2 /> Delete</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsCard({ config, canEdit, onSaved }: { config: BackupConfig; canEdit: boolean; onSaved: () => void }) {
  const [form, setForm] = useState(config);
  useEffect(() => setForm(config), [config]);
  const dirty = JSON.stringify(form) !== JSON.stringify(config);
  const save = useMutation({
    mutationFn: () => api.put<BackupConfig>('/backup/settings', form),
    onSuccess: () => { toast.success('Backup settings saved'); onSaved(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-primary" /> Automatic backup</CardTitle>
        <CardDescription>Runs while the ERP is on. If the PC was off at that time, it runs as soon as the ERP starts again.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="bk-auto">Daily automatic backup</Label>
          <Switch id="bk-auto" checked={form.autoEnabled} disabled={!canEdit} onCheckedChange={(v) => setForm({ ...form, autoEnabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bk-time">Time (Karachi)</Label>
            <Input id="bk-time" type="time" value={form.dailyTime} disabled={!canEdit} onChange={(e) => setForm({ ...form, dailyTime: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bk-keep">Keep (automatic)</Label>
            <Input id="bk-keep" type="number" min={3} max={365} value={form.keepAutomatic} disabled={!canEdit} onChange={(e) => setForm({ ...form, keepAutomatic: Number(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bk-copy">Second copy folder (optional)</Label>
          <Input id="bk-copy" placeholder="e.g. E:\ERP-Backups or G:\My Drive\ERP-Backups" value={form.copyFolder} disabled={!canEdit} onChange={(e) => setForm({ ...form, copyFolder: e.target.value })} />
          <p className="text-xs text-muted-foreground">A USB drive, another disk, or a Google Drive / OneDrive folder on this PC. Every backup is copied there too.</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="bk-verify">Check every backup after saving</Label>
          <Switch id="bk-verify" checked={form.verifyAfterBackup} disabled={!canEdit} onCheckedChange={(v) => setForm({ ...form, verifyAfterBackup: v })} />
        </div>
        {canEdit && <Button className="w-full" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}><Save /> Save settings</Button>}
      </CardContent>
    </Card>
  );
}

function RestoreTestDialog({ data, onClose }: { data: { row: BackupRow; result: RestoreTestResult } | null; onClose: () => void }) {
  const r = data?.result;
  return (
    <Dialog open={!!data} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {r?.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-600" />}
            {r?.ok ? 'Restore test passed' : 'Restore test failed'}
          </DialogTitle>
          <DialogDescription>{r?.message}</DialogDescription>
        </DialogHeader>
        {r && Object.keys(r.counts).length > 0 && (
          <Table>
            <THead><TR><TH>Table</TH><TH className="text-right">In backup</TH><TH className="text-right">Restored</TH></TR></THead>
            <TBody>
              {Object.entries(r.counts).map(([t, n]) => (
                <TR key={t}>
                  <TD className="capitalize">{t.replace(/_/g, ' ')}</TD>
                  <TD className="text-right tabular-nums">{r.expected?.[t] ?? '-'}</TD>
                  <TD className={`text-right tabular-nums ${r.expected && r.expected[t] !== n ? 'text-rose-600' : ''}`}>{n}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">The test used a temporary database that has now been deleted. Your live data was not touched. Time: {r ? (r.durationMs / 1000).toFixed(1) : 0} s.</p>
        <Button onClick={onClose}>Close</Button>
      </DialogContent>
    </Dialog>
  );
}

function RestoreDialog({ row, onClose }: { row: BackupRow | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const logout = useAuth((s) => s.logout);
  useEffect(() => { setPassword(''); setConfirm(''); }, [row]);
  const restore = useMutation({
    mutationFn: () => api.post<{ message: string; safetyBackup: string | null }>(`/backup/${row!.id}/restore`, { password, confirm }),
    onSuccess: (r) => {
      toast.success(`Restore finished. ${r.message} Please sign in again.`, { duration: 10_000 });
      onClose();
      setTimeout(() => void logout().catch(() => window.location.assign('/login')), 1500);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && !restore.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400"><RotateCcw className="h-5 w-5" /> Restore this backup?</DialogTitle>
          <DialogDescription>
            All current ERP data will be replaced with the data from {row ? formatDateTime(row.startedAt) : ''}. Everything entered after that
            time will be removed. A safety backup of the current data is made first, so this can be undone by restoring that safety backup.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>The backup is checked and test-restored into a temporary database.</li>
          <li>A safety backup of the current data is saved.</li>
          <li>The data is replaced in one step (all or nothing).</li>
          <li>Everyone is signed out and signs in again.</li>
        </ol>
        <div className="space-y-1">
          <Label htmlFor="rs-pass">Your password</Label>
          <Input id="rs-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-confirm">Type RESTORE to confirm</Label>
          <Input id="rs-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder="RESTORE" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={restore.isPending} onClick={onClose}>Cancel</Button>
          <Button variant="destructive" loading={restore.isPending} disabled={!password || confirm !== 'RESTORE'} onClick={() => restore.mutate()}>Restore</Button>
        </div>
        {restore.isPending && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Restoring. Do not close this page.</p>}
      </DialogContent>
    </Dialog>
  );
}

function RecoveryKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPassword(''); }, [open]);
  const download = async () => {
    setBusy(true);
    try {
      const name = await downloadFrom('/backup/recovery-key', { method: 'POST', body: JSON.stringify({ password }) });
      toast.success(`${name} downloaded. Keep it somewhere safe.`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Download recovery key</DialogTitle>
          <DialogDescription>
            Keep this key on a USB drive and in your email. Anyone with the key and a backup file can read your data, so never share it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="rk-pass">Your password</Label>
          <Input id="rk-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && password) void download(); }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!password} onClick={() => void download()}><Download /> Download</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
