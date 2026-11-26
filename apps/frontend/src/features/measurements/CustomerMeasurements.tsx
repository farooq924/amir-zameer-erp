import { useQuery } from '@tanstack/react-query';
import { GitCompare, History, Plus, Printer, Ruler } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Measurement, MeasurementTemplate } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { CompareDialog } from './CompareDialog';
import { MeasurementFormDialog } from './MeasurementFormDialog';

export function useTemplates(includeInactive = false) {
  return useQuery({
    queryKey: ['measurement-templates', { includeInactive }],
    queryFn: () => api.get<MeasurementTemplate[]>('/measurement-templates', includeInactive ? { includeInactive: 'true' } : undefined),
    staleTime: 60_000,
  });
}

export function MeasurementValues({ m }: { m: Measurement }) {
  const unit = m.unit === 'CM' ? 'cm' : 'in';
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
      {m.values.map((v) => (
        <div key={v.fieldKey} className="rounded-md border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{v.fieldLabel}{v.isCustom && <span className="ml-1 text-[10px] uppercase">extra</span>}</dt>
          <dd className="font-semibold tabular-nums">
            {v.value != null ? `${Number(v.value)} ${unit}` : ''}
            {v.textValue && <span className={cn('block text-xs font-normal', v.value != null && 'text-muted-foreground')}>{v.textValue}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TemplateGroup({ versions, onNew, onCompare }: {
  versions: Measurement[]; onNew: (m: Measurement) => void; onCompare: (a: string, b: string) => void;
}) {
  const can = useCan();
  const latest = versions[0];
  // null = always show the latest version (so a newly saved version appears straight away)
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { setSelected(null); setPicked([]); }, [latest.id]);
  const shown = versions.find((v) => v.id === selected) ?? latest;

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {latest.template.name}
            <Badge variant="outline">V{shown.versionNo}</Badge>
            {shown.isLatest ? <Badge variant="success">Latest</Badge> : <Badge variant="secondary">Older version</Badge>}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(shown.takenAt)}{shown.takenByName ? ` · Measured by ${shown.takenByName}` : ''}{shown.createdBy ? ` · Saved by ${shown.createdBy.fullName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/print/measurements/${shown.id}`} target="_blank" rel="noopener"><Printer /> Print</Link>
          </Button>
          {can('measurements', 'CREATE') && <Button size="sm" onClick={() => onNew(latest)}><Plus /> New version</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MeasurementValues m={shown} />
        {shown.notes && <p className="rounded-md bg-muted p-2 text-sm"><span className="font-medium">Notes: </span>{shown.notes}</p>}
        {versions.length > 1 && (
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <p className="flex items-center gap-1.5 text-sm font-medium"><History className="h-4 w-4" /> History ({versions.length} versions)</p>
              <Button size="sm" variant="outline" disabled={picked.length !== 2}
                onClick={() => {
                  const [a, b] = [...picked].sort((x, y) => versions.find((v) => v.id === x)!.versionNo - versions.find((v) => v.id === y)!.versionNo);
                  onCompare(a, b);
                }}>
                <GitCompare /> Compare selected
              </Button>
            </div>
            <ul className="divide-y">
              {versions.map((v) => (
                <li key={v.id} className={cn('flex items-center gap-3 px-3 py-2 text-sm', v.id === shown.id && 'bg-muted/60')}>
                  <input type="checkbox" className="h-4 w-4" aria-label={`Select version ${v.versionNo} to compare`} checked={picked.includes(v.id)} onChange={() => togglePick(v.id)} />
                  <button type="button" className="flex flex-1 flex-wrap items-center gap-x-3 text-left" onClick={() => setSelected(v.isLatest ? null : v.id)}>
                    <span className="font-medium">Version {v.versionNo}</span>
                    <span className="text-muted-foreground">{formatDateTime(v.takenAt)}</span>
                    {v.takenByName && <span className="text-muted-foreground">by {v.takenByName}</span>}
                  </button>
                  {v.isLatest && <Badge variant="success">Latest</Badge>}
                </li>
              ))}
            </ul>
            <p className="px-3 py-2 text-xs text-muted-foreground">Tick two versions to compare them. Click a version to view it.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CustomerMeasurements({ customerId }: { customerId: string }) {
  const can = useCan();
  const templates = useTemplates();
  const history = useQuery({
    queryKey: ['measurements', 'customer', customerId],
    queryFn: () => api.get<Measurement[]>(`/customers/${customerId}/measurements`),
  });
  const [form, setForm] = useState<{ templateId?: string } | null>(null);
  const [compare, setCompare] = useState<[string, string] | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    for (const m of history.data ?? []) map.set(m.template.id, [...(map.get(m.template.id) ?? []), m]);
    return [...map.values()].map((g) => g.sort((a, b) => b.versionNo - a.versionNo));
  }, [history.data]);
  const latest = useMemo(() => Object.fromEntries(groups.map((g) => [g[0].template.id, g[0]])), [groups]);

  if (history.isError) return <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />;
  if (history.isLoading || templates.isLoading) return <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-4">
      {can('measurements', 'CREATE') && groups.length > 0 && (
        <div className="flex justify-end"><Button onClick={() => setForm({})}><Plus /> Take measurement</Button></div>
      )}
      {groups.length === 0 ? (
        <Card><EmptyState icon={<Ruler className="h-5 w-5" />} title="No measurements yet"
          description="Take this customer's measurements once. Every change is saved as a new version so history is never lost."
          action={can('measurements', 'CREATE') ? <Button size="sm" onClick={() => setForm({})}><Plus /> Take measurement</Button> : undefined} /></Card>
      ) : groups.map((g) => (
        <TemplateGroup key={g[0].template.id} versions={g}
          onNew={(m) => setForm({ templateId: m.template.id })}
          onCompare={(a, b) => setCompare([a, b])} />
      ))}
      <MeasurementFormDialog
        open={!!form} onOpenChange={(o) => !o && setForm(null)} customerId={customerId}
        templates={templates.data ?? []} templateId={form?.templateId} latest={latest}
      />
      <CompareDialog fromId={compare?.[0] ?? null} toId={compare?.[1] ?? null} onClose={() => setCompare(null)} />
    </div>
  );
}
