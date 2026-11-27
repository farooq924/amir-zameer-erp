import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

export type TileTone = 'gold' | 'purple' | 'green' | 'blue' | 'rose' | 'slate';

export const TILE: Record<TileTone, string> = {
  gold: 'bg-gold-soft text-[#9a7420] dark:text-gold',
  purple: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
};

/** Summary card with a coloured icon tile. `featured` renders the navy hero card. */
export function StatCard({ label, value, hint, icon: Icon, loading, tone, tile = 'gold', featured, compact, className }: {
  label: string; value: string; hint?: string; icon: LucideIcon; loading?: boolean; tone?: 'positive' | 'negative';
  tile?: TileTone; featured?: boolean; compact?: boolean; className?: string;
}) {
  return (
    <Card className={cn('flex items-center gap-3', compact ? 'p-3' : 'p-3 sm:p-4', featured && 'border-transparent bg-navy text-white dark:bg-navy-soft', className)}>
      <div className={cn('icon-tile', compact ? 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5' : 'h-11 w-11 [&_svg]:h-6 [&_svg]:w-6', featured ? 'bg-white/10 text-gold' : TILE[tile])}>
        <Icon aria-hidden />
      </div>
      <div className="min-w-0">
        <p className={cn('text-xs font-medium leading-tight', featured ? 'text-white/75' : 'text-muted-foreground')}>{label}</p>
        {loading ? <Skeleton className="mt-1.5 h-6 w-24" /> : (
          <p className={cn('truncate font-bold tabular-nums', compact ? 'text-base' : 'text-xl', tone === 'negative' && !featured && 'text-rose-700 dark:text-rose-400')} title={value}>{value}</p>
        )}
        {hint && <p className={cn('line-clamp-1 text-[11px]', featured ? 'text-white/60' : 'text-muted-foreground')}>{hint}</p>}
      </div>
    </Card>
  );
}
