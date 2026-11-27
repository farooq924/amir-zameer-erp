import { cn } from '@/utils/cn';

/** Software developer details printed at the bottom of every printed document. */
export const DEVELOPER = { name: 'Brandistan', website: 'www.brandistan.pk', url: 'https://www.brandistan.pk', phone: '0333-2532924' } as const;

/**
 * Developer credit for printouts. Use it at the end of every print layout.
 * `variant="receipt"` fits 58/80 mm thermal paper (two short lines); `"sheet"` is one line for A4 pages.
 * `printOnly` hides it on screen (for normal app pages that can be printed).
 */
export function PrintFooter({ variant = 'sheet', printOnly = false, className }: { variant?: 'sheet' | 'receipt'; printOnly?: boolean; className?: string }) {
  if (variant === 'receipt') {
    return (
      <div className={cn('print-footer mt-2 border-t border-dashed border-black/60 pt-1 text-center text-[9px] leading-tight', printOnly && 'print-only', className)}>
        <p>Software by {DEVELOPER.name}</p>
        <p>{DEVELOPER.website} | {DEVELOPER.phone}</p>
      </div>
    );
  }
  return (
    <div className={cn('print-footer mt-6 border-t border-black/20 pt-2 text-center text-[10px] text-black/70', printOnly && 'print-only', className)}>
      Software developed by <span className="font-semibold">{DEVELOPER.name}</span> | {DEVELOPER.website} | {DEVELOPER.phone}
    </div>
  );
}
