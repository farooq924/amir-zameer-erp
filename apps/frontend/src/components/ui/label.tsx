import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/utils/cn';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none text-foreground', className)} {...props}>
    {children}{required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
  </LabelPrimitive.Root>
));
Label.displayName = 'Label';

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="text-xs text-destructive">{message}</p>;
}
