import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { api, errorMessage } from '@/services/api';

export const passwordSchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Add a lower case letter')
  .regex(/[A-Z]/, 'Add an upper case letter')
  .regex(/\d/, 'Add a number');

const schema = z
  .object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const submit = form.handleSubmit(async (v) => {
    try {
      await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Password changed. Other devices have been logged out.');
      form.reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  const err = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Use at least 10 characters with upper and lower case letters and a number.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5"><Label htmlFor="cp-current">Current password</Label><Input id="cp-current" type="password" autoComplete="current-password" {...form.register('currentPassword')} /><FieldError message={err.currentPassword?.message} /></div>
          <div className="space-y-1.5"><Label htmlFor="cp-new">New password</Label><Input id="cp-new" type="password" autoComplete="new-password" {...form.register('newPassword')} /><FieldError message={err.newPassword?.message} /></div>
          <div className="space-y-1.5"><Label htmlFor="cp-confirm">Confirm new password</Label><Input id="cp-confirm" type="password" autoComplete="new-password" {...form.register('confirm')} /><FieldError message={err.confirm?.message} /></div>
          <DialogFooter><Button type="submit" loading={form.formState.isSubmitting}>Update password</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
