import { AlertTriangle, CheckCircle2, Inbox, Loader2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="icon-tile mb-1 h-14 w-14 rounded-full bg-gold-soft text-primary [&_svg]:h-6 [&_svg]:w-6">{icon ?? <Inbox />}</div>
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading...', hint = 'Please wait while we fetch the data.' }: { label?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-center" role="status">
      <Loader2 className="mb-1 h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="icon-tile mb-1 h-14 w-14 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15"><AlertTriangle className="h-6 w-6" /></div>
      <p className="text-base font-semibold">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Centered confirmation, matching the brand style (red icon for destructive actions). */
export function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <div className={cn('icon-tile mx-auto mt-2 h-14 w-14 rounded-full', props.destructive ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15' : 'bg-gold-soft text-primary')}>
          {props.destructive ? <Trash2 className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
        </div>
        <div className="space-y-1.5">
          <DialogTitle className="justify-center text-lg">{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button variant={props.destructive ? 'destructive' : 'default'} loading={props.loading} onClick={props.onConfirm}>
            {props.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
