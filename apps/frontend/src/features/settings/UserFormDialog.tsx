import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { passwordSchema } from '@/features/auth/ChangePasswordDialog';
import { api, errorMessage } from '@/services/api';
import type { RoleSummary, UserRow } from '@/types';

const base = {
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  email: z.string().trim().email('Enter a valid email'),
  roleIds: z.array(z.string()).min(1, 'Select at least one role'),
};
const createSchema = z.object({
  ...base,
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,60}$/, '3-60 letters, numbers, dot, dash or underscore'),
  password: passwordSchema,
});
const editSchema = z.object({ ...base, username: z.string().optional(), password: z.string().optional() });
type FormValues = z.infer<typeof createSchema>;

export function UserFormDialog({ open, onOpenChange, roles, user }: {
  open: boolean; onOpenChange: (o: boolean) => void; roles: RoleSummary[]; user?: UserRow | null;
}) {
  const qc = useQueryClient();
  const editing = !!user;
  const form = useForm<FormValues>({ resolver: zodResolver(editing ? editSchema : createSchema) as never });

  useEffect(() => {
    if (open) {
      form.reset({
        fullName: user?.fullName ?? '', email: user?.email ?? '', username: user?.username ?? '', password: '',
        roleIds: user?.roles.map((r) => r.id) ?? [],
      });
    }
  }, [open, user, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      editing
        ? api.patch(`/users/${user!.id}`, { fullName: v.fullName, email: v.email, roleIds: v.roleIds })
        : api.post('/users', v),
    onSuccess: () => {
      toast.success(editing ? 'User updated' : 'User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const err = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit user' : 'Add user'}</DialogTitle>
          <DialogDescription>Users only see and use the modules their roles allow.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="u-name">Full name</Label><Input id="u-name" {...form.register('fullName')} /><FieldError message={err.fullName?.message} /></div>
            <div className="space-y-1.5"><Label htmlFor="u-email">Email</Label><Input id="u-email" type="email" {...form.register('email')} /><FieldError message={err.email?.message} /></div>
            <div className="space-y-1.5"><Label htmlFor="u-username">Username</Label><Input id="u-username" disabled={editing} {...form.register('username')} /><FieldError message={err.username?.message} /></div>
            {!editing && (
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="u-password">Initial password</Label><Input id="u-password" type="password" autoComplete="new-password" {...form.register('password')} /><FieldError message={err.password?.message} /></div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Roles</Label>
            <Controller
              control={form.control}
              name="roleIds"
              render={({ field }) => (
                <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                  {roles.filter((r) => r.isActive).map((r) => {
                    const checked = field.value?.includes(r.id) ?? false;
                    return (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                        <Checkbox checked={checked} onCheckedChange={(c) => field.onChange(c ? [...(field.value ?? []), r.id] : field.value.filter((id) => id !== r.id))} />
                        {r.name}
                      </label>
                    );
                  })}
                </div>
              )}
            />
            <FieldError message={err.roleIds?.message} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create user'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
