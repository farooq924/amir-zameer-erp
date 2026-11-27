import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Ruler, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTemplates } from '@/features/measurements/CustomerMeasurements';
import { TemplateEditorDialog } from '@/features/measurements/TemplateEditorDialog';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { MeasurementTemplate, Paginated } from '@/types';
import { formatDateTime } from '@/utils/format';

interface RecentRow {
  id: string; versionNo: number; unit: 'INCH' | 'CM'; takenAt: string; takenByName: string | null; isLatest: boolean;
  template: { id: string; name: string }; customer: { id: string; code: string; name: string; mobile: string }; _count: { values: number };
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function RecentTab() {
  const navigate = useNavigate();
  const templates = useTemplates(true);
  const [search, setSearch] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [latestOnly, setLatestOnly] = useState('true');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const recent = useQuery({
    queryKey: ['measurements', 'recent', { q, templateId, latestOnly, page }],
    queryFn: () => api.get<Paginated<RecentRow>>('/measurements', { search: q, templateId, latestOnly, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const open = (r: RecentRow) => navigate(`/customers/${r.customer.id}?tab=measurements`);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Customer name, code or mobile" aria-label="Search measurements" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <NativeSelect aria-label="Garment" className="w-44" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPage(1); }}>
          <option value="">All garments</option>
          {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Versions" className="w-44" value={latestOnly} onChange={(e) => { setLatestOnly(e.target.value); setPage(1); }}>
          <option value="true">Latest versions only</option><option value="false">All versions</option>
        </NativeSelect>
      </div>
      {recent.isError ? <ErrorState message={errorMessage(recent.error)} onRetry={() => recent.refetch()} /> : recent.isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : !recent.data!.data.length ? (
        <EmptyState icon={<Ruler className="h-5 w-5" />} title={q || templateId ? 'No measurements match your search' : 'No measurements yet'}
          description="Open a customer's profile and use the Measurements tab to take measurements." />
      ) : (
        <>
          <Table>
            <THead><TR><TH>Customer</TH><TH className="hidden sm:table-cell">Mobile</TH><TH>Garment</TH><TH>Version</TH><TH className="hidden md:table-cell">Measured by</TH><TH>Date</TH></TR></THead>
            <TBody>{recent.data!.data.map((r) => (
              <TR key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => e.key === 'Enter' && open(r)}>
                <TD><span className="font-medium">{r.customer.name}</span><span className="block font-mono text-xs text-muted-foreground">{r.customer.code}</span></TD>
                <TD className="hidden whitespace-nowrap sm:table-cell">{formatPhone(r.customer.mobile)}</TD>
                <TD>{r.template.name}</TD>
                <TD><span className="tabular-nums">V{r.versionNo}</span> {r.isLatest && <Badge variant="success" className="ml-1">Latest</Badge>}</TD>
                <TD className="hidden md:table-cell">{r.takenByName ?? '-'}</TD>
                <TD className="whitespace-nowrap">{formatDateTime(r.takenAt)}</TD>
              </TR>
            ))}</TBody>
          </Table>
          <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
            <span>{recent.data!.meta.total} records</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= recent.data!.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function TemplatesTab() {
  const can = useCan();
  const templates = useTemplates(true);
  const [editing, setEditing] = useState<MeasurementTemplate | null | undefined>(undefined);
  const canManage = can('measurements', 'MANAGE_SETTINGS');

  if (templates.isError) return <ErrorState message={errorMessage(templates.error)} onRetry={() => templates.refetch()} />;
  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setEditing(null)}><Plus /> New template</Button></div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />) : templates.data!.map((t) => {
          const active = t.fields.filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <Card key={t.id} className={t.isActive ? '' : 'opacity-70'}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {t.name}{!t.isSystem && <Badge variant="info">Custom</Badge>}{!t.isActive && <Badge variant="secondary">Not in use</Badge>}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{active.length} fields · default {t.defaultUnit === 'CM' ? 'centimetres' : 'inches'}</p>
                </div>
                {canManage && <Button size="icon" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil /></Button>}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{active.map((f) => f.label + (f.isRequired ? '*' : '')).join(', ')}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <TemplateEditorDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} template={editing} />
    </div>
  );
}

export function MeasurementsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'templates' ? 'templates' : 'recent';
  return (
    <div>
      <PageHeader title="Measurements" description="Recent measurements across all customers, and the garment templates used to take them." />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'recent' ? {} : { tab: v }, { replace: true })}>
        <TabsList><TabsTrigger value="recent">Recent measurements</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger></TabsList>
        <TabsContent value="recent" className="mt-4"><RecentTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
