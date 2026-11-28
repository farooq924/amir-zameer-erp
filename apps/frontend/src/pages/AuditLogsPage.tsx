import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import { DateRangeFilter, type RangeValue } from '@/features/dashboard/DateRangeFilter';
import { api } from '@/services/api';
import type { AuditLogRow, Paginated } from '@/types';
import { formatDateTime, humanize } from '@/utils/format';

export function AuditLogsPage() {
  const [range, setRange] = useState<RangeValue>({ preset: 'this_month' });
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);
  const ready = range.preset !== 'custom' || (!!range.from && !!range.to);

  const filters = useQuery({ queryKey: ['audit-filters'], queryFn: () => api.get<{ modules: string[]; actions: string[] }>('/audit-logs/filters') });
  const query = { preset: range.preset, from: range.preset === 'custom' ? range.from : undefined, to: range.preset === 'custom' ? range.to : undefined, module, action };
  const logs = useQuery({
    queryKey: ['audit-logs', query, page, pageSize], enabled: ready, placeholderData: keepPreviousData,
    queryFn: () => api.get<Paginated<AuditLogRow>>('/audit-logs', { ...query, page, pageSize }),
  });
  const columns: DataColumn<AuditLogRow>[] = [
    { id: 'time', header: 'Time', value: (r) => r.createdAt, text: (r) => formatDateTime(r.createdAt), className: 'whitespace-nowrap' },
    { id: 'user', header: 'User', value: (r) => r.user?.fullName ?? 'System', cell: (r) => r.user?.fullName ?? <span className="text-muted-foreground">System</span> },
    { id: 'module', header: 'Module', value: (r) => humanize(r.module) },
    { id: 'action', header: 'Action', value: (r) => humanize(r.action),
      cell: (r) => <Badge variant={/DELETE|LOCKED|DEACTIVATE/.test(r.action) ? 'danger' : /LOGIN|LOGOUT/.test(r.action) ? 'secondary' : 'info'}>{humanize(r.action)}</Badge> },
    { id: 'ip', header: 'IP address', value: (r) => r.ipAddress ?? '-', className: 'text-muted-foreground' },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" description="Permanent, tamper-proof record of logins and every sensitive change." />
      <Card>
        <DataTable
          title="Audit Logs"
          module="audit_logs"
          noun="record"
          rows={logs.data?.data}
          columns={columns}
          getRowId={(r) => r.id}
          loading={logs.isLoading}
          error={logs.error}
          onRetry={() => logs.refetch()}
          selectable
          pagination={{ page, pageSize, total: logs.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<AuditLogRow>>('/audit-logs', { ...query, page: pg, pageSize: size }))}
          onView={(r) => setDetail(r)}
          canRow={(act, r) => act !== 'view' || r.oldValues != null || r.newValues != null}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
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
          }
          empty={<EmptyState title="No activity in this period" />}
        />
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
