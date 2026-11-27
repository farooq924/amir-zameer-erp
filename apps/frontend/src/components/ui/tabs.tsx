import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/utils/cn';

export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...p }, ref) => (
    <TabsPrimitive.List ref={ref} className={cn('inline-flex h-11 max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1 text-muted-foreground shadow-sm', className)} {...p} />
  ),
);
TabsList.displayName = 'TabsList';
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...p }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn('inline-flex h-full items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-all hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm', className)}
      {...p}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';
export const TabsContent = TabsPrimitive.Content;
