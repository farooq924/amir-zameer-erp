import { AlertTriangle, CloudOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSync } from '@/offline/sync';
import { cn } from '@/utils/cn';

/** Header pill: Online / Offline / Syncing with the number of entries waiting to be sent. Opens the Sync Center. */
export function ConnectionPill({ onDark }: { onDark?: boolean }) {
  const { online, syncing, counts } = useSync();
  const waiting = counts.pending + counts.conflict + counts.rejected;
  const Icon = syncing ? RefreshCw : online ? Wifi : WifiOff;
  const label = syncing ? 'Syncing' : online ? 'Online' : 'Offline';
  return (
    <Link
      to="/sync"
      aria-label={`${label}. ${waiting} entr${waiting === 1 ? 'y' : 'ies'} waiting to sync. Open Sync Center`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
        onDark
          ? online ? 'border-white/15 bg-white/10 text-white hover:bg-white/15' : 'border-amber-300/40 bg-amber-400/20 text-amber-100'
          : online ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
            : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} aria-hidden />
      <span className={cn(onDark && 'sr-only sm:not-sr-only')}>{label}</span>
      {waiting > 0 && (
        <span className={cn('min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] leading-5', counts.conflict + counts.rejected > 0 ? 'bg-rose-600 text-white' : 'bg-primary text-white')}>{waiting}</span>
      )}
    </Link>
  );
}

/** Thin strip under the header when the device is offline, or when synced work needs a person. */
export function OfflineBanner() {
  const { online, counts } = useSync();
  if (!online) {
    return (
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 lg:px-6 no-print" role="status">
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1"><span className="sm:hidden">You are offline. Work is saved on this device.</span><span className="hidden sm:inline">You are offline. New customers, measurements, orders and payments can still be saved in the Offline Desk and will sync automatically.</span></span>
        <Link to="/offline" className="shrink-0 font-semibold underline underline-offset-2">Open Offline Desk</Link>
      </div>
    );
  }
  const problems = counts.conflict + counts.rejected;
  if (!problems) return null;
  return (
    <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 lg:px-6 no-print" role="status">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{problems} offline entr{problems === 1 ? 'y needs' : 'ies need'} your review before they can be saved.</span>
      <Link to="/sync?tab=device" className="shrink-0 font-semibold underline underline-offset-2">Review</Link>
    </div>
  );
}
