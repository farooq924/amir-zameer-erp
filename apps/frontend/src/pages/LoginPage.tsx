import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { BrandLogo, TailorArt } from '@/components/brand';
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
    <div className="flex min-h-full flex-col bg-background lg:flex-row">
      {/* Brand panel (splash) */}
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-navy px-6 pb-14 pt-12 text-white lg:w-1/2 lg:pb-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_20%_10%,rgba(255,255,255,0.08),transparent_60%),repeating-linear-gradient(135deg,rgba(255,255,255,0.025)_0_2px,transparent_2px_6px)]" />
        <BrandLogo size="lg" stacked subtitle="Tailoring ERP" className="relative" />
        <svg viewBox="0 0 160 16" className="relative mt-3 h-4 w-40 text-gold" aria-hidden><path d="M2 10c30-10 60 8 90-2s50-6 66 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        <p className="relative mt-4 hidden max-w-xs text-center text-sm text-white/70 lg:block">Customers, measurements, orders, fabric and accounts for your tailoring business, in one place.</p>
        <TailorArt className="pointer-events-none absolute -bottom-6 -right-6 w-56 opacity-80 lg:w-96" />
      </div>

      {/* Form */}
      <div className="relative -mt-6 flex flex-1 items-start justify-center px-4 pb-10 lg:mt-0 lg:items-center">
        <div className="w-full max-w-sm">
          <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border bg-card p-6 shadow-xl lg:shadow-sm">
            <div>
              <h1 className="text-xl font-bold">Welcome back</h1>
              <p className="text-sm text-muted-foreground">Sign in to continue to your ERP.</p>
            </div>
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
            {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
            <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}><Lock /> Sign in</Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">Sessions expire automatically. Accounts lock after repeated failed attempts.</p>
        </div>
      </div>
    </div>
  );
}
