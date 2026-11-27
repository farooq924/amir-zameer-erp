import { GitCompare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/common';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, errorMessage } from '@/services/api';
import type { MeasurementComparison } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';

const fmt = (v: string | null) => (v == null ? '-' : String(Number(v)));

export function CompareDialog({ fromId, toId, onClose }: { fromId: string | null; toId: string | null; onClose: () => void }) {
  const open = !!fromId && !!toId;
  const cmp = useQuery({
    queryKey: ['measurements', 'compare', fromId, toId],
    queryFn: () => api.get<MeasurementComparison>('/measurements/compare', { from: fromId!, to: toId! }),
    enabled: open,
  });
  const d = cmp.data;
  const unit = d?.unit === 'CM' ? 'cm' : 'in';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle><GitCompare className="h-5 w-5 text-primary" />Compare measurements</DialogTitle>
          <DialogDescription>
            {d ? `Version ${d.from.versionNo} (${formatDate(d.from.takenAt)}) vs version ${d.to.versionNo} (${formatDate(d.to.takenAt)}). Values shown in ${d.unit === 'CM' ? 'centimetres' : 'inches'}.` : 'Loading...'}
          </DialogDescription>
        </DialogHeader>
        {cmp.isError ? <ErrorState message={errorMessage(cmp.error)} onRetry={() => cmp.refetch()} /> : !d ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <>
            {!d.sameTemplate && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">These versions use different garments ({d.from.template.name} and {d.to.template.name}).</p>}
            <Table>
              <THead><TR><TH>Measurement</TH><TH className="text-right">V{d.from.versionNo}</TH><TH className="text-right">V{d.to.versionNo}</TH><TH className="text-right">Change</TH></TR></THead>
              <TBody>
                {d.fields.map((f) => {
                  const diff = f.difference == null ? null : Number(f.difference);
                  return (
                    <TR key={f.fieldKey} className={cn(f.changed && 'bg-amber-50/60 dark:bg-amber-500/10')}>
                      <TD className="font-medium">{f.fieldLabel}</TD>
                      <TD className="text-right tabular-nums">{fmt(f.from)}{f.fromText && <span className="block text-xs text-muted-foreground">{f.fromText}</span>}</TD>
                      <TD className="text-right tabular-nums">{fmt(f.to)}{f.toText && <span className="block text-xs text-muted-foreground">{f.toText}</span>}</TD>
                      <TD className={cn('text-right tabular-nums', diff && diff > 0 && 'text-emerald-700', diff && diff < 0 && 'text-red-700')}>
                        {diff == null ? (f.changed ? 'Changed' : '-') : diff === 0 ? 'Same' : `${diff > 0 ? '+' : ''}${diff} ${unit}`}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
