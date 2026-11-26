import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

export function StatCard({ label, value, hint, icon: Icon, loading, tone }: {
  label: string; value: string; hint?: string; icon: LucideIcon; loading?: boolean; tone?: 'positive' | 'negative';
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      {loading ? <Skeleton className="mt-2 h-6 w-24" /> : (
        <p className={cn('mt-1.5 truncate text-lg font-semibold tabular-nums', tone === 'negative' && 'text-red-700')} title={value}>{value}</p>
      )}
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}
