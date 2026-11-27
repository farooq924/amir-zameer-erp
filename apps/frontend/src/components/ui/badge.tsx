import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/utils/cn';

const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-slate-200/70 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200',
      outline: 'border-border bg-card text-foreground',
      success: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
      warning: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
      danger: 'border-transparent bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
      info: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
      gold: 'border-transparent bg-gold-soft text-[#8a6a1f] dark:text-gold',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
