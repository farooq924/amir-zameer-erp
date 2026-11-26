import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { errorMessage } from '@/services/api';
import { useAuth } from '@/store/auth';

const schema = z.object({
  identifier: z.string().trim().min(3, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
});

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { identifier: '', password: '' } });

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.identifier, v.password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">AZ</span>
          <h1 className="text-lg font-semibold">AMIR ZAMEER</h1>
          <p className="text-sm text-muted-foreground">Tailoring &amp; Fabric Management ERP</p>
        </div>
        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border bg-background p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Username or email</Label>
            <Input id="identifier" autoComplete="username" autoFocus aria-invalid={!!form.formState.errors.identifier} {...form.register('identifier')} />
            <FieldError message={form.formState.errors.identifier?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}><Lock /> Sign in</Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Sessions expire automatically. Accounts lock after repeated failed attempts.</p>
      </div>
    </div>
  );
}
