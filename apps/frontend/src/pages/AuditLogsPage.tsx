import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { DateRangeFilter, type RangeValue } from '@/features/dashboard/DateRangeFilter';
import { api, errorMessage } from '@/services/api';
import type { AuditLogRow, Paginated } from '@/types';
import { formatDateTime, humanize } from '@/utils/format';

export function AuditLogsPage() {
  const [range, setRange] = useState<RangeValue>({ preset: 'this_month' });
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);
  const ready = range.preset !== 'custom' || (!!range.from && !!range.to);

  const filters = useQuery({ queryKey: ['audit-filters'], queryFn: () => api.get<{ modules: string[]; actions: string[] }>('/audit-logs/filters') });
  const params = { preset: range.preset, from: range.from, to: range.to, module, action, page, pageSize: 50 };
  const logs = useQuery({
    queryKey: ['audit-logs', params], enabled: ready, placeholderData: keepPreviousData,
    queryFn: () => api.get<Paginated<AuditLogRow>>('/audit-logs', range.preset === 'custom' ? params : { ...params, from: undefined, to: undefined }),
  });

  return (
    <div>
      <PageHeader title="Audit Logs" description="Permanent, tamper-proof record of logins and every sensitive change." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} />
          <NativeSelect aria-label="Module" className="w-40" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
            <option value="">All modules</option>
            {filters.data?.modules.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Action" className="w-48" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">All actions</option>
            {filters.data?.actions.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
          </NativeSelect>
        </div>
        {logs.isError ? <ErrorState message={errorMessage(logs.error)} onRetry={() => logs.refetch()} /> : logs.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !logs.data?.data.length ? <EmptyState title="No activity in this period" /> : (
          <Table>
            <THead><TR><TH>Time</TH><TH>User</TH><TH>Module</TH><TH>Action</TH><TH>IP address</TH><TH className="w-10" /></TR></THead>
            <TBody>
              {logs.data.data.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TD>
                  <TD>{r.user?.fullName ?? <span className="text-muted-foreground">System</span>}</TD>
                  <TD>{humanize(r.module)}</TD>
                  <TD><Badge variant={/DELETE|LOCKED|DEACTIVATE/.test(r.action) ? 'danger' : /LOGIN|LOGOUT/.test(r.action) ? 'secondary' : 'info'}>{humanize(r.action)}</Badge></TD>
                  <TD className="text-muted-foreground">{r.ipAddress ?? '-'}</TD>
                  <TD>{(r.oldValues != null || r.newValues != null) && <Button variant="ghost" size="icon" aria-label="View details" onClick={() => setDetail(r)}><Eye /></Button>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {logs.data && logs.data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">Page {logs.data.meta.page} of {logs.data.meta.totalPages} · {logs.data.meta.total} records</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= logs.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail && `${humanize(detail.action)} · ${humanize(detail.module)}`}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['oldValues', 'newValues'] as const).map((k) => (
              <div key={k}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{k === 'oldValues' ? 'Before' : 'After'}</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{detail?.[k] ? JSON.stringify(detail[k], null, 2) : '-'}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
