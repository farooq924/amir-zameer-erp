import type { PermissionAction } from '@az/shared';
import { MODULES } from '@az/shared';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { hasPermission } from '@/hooks/use-permission';
import { AppLayout } from '@/layouts/AppLayout';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CustomerProfilePage } from '@/pages/CustomerProfilePage';
import { CustomersPage } from '@/pages/CustomersPage';
import { LoginPage } from '@/pages/LoginPage';
import { MeasurementPrintPage } from '@/pages/MeasurementPrintPage';
import { MeasurementsPage } from '@/pages/MeasurementsPage';
import { RolesPage } from '@/pages/RolesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ForbiddenPage, NotFoundPage, PlannedModulePage } from '@/pages/StatusPages';
import { UsersPage } from '@/pages/UsersPage';
import { useAuth } from '@/store/auth';

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === 'unknown') {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequirePermission({ module, action = 'VIEW', children }: { module: string; action?: PermissionAction; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  return hasPermission(user, module, action) ? <>{children}</> : <ForbiddenPage />;
}

const IMPLEMENTED = new Set(['dashboard', 'audit_logs', 'settings', 'users', 'customers', 'measurements']);

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/print/measurements/:id" element={<RequireAuth><RequirePermission module="measurements"><MeasurementPrintPage /></RequirePermission></RequireAuth>} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<RequirePermission module="dashboard"><DashboardPage /></RequirePermission>} />
        <Route path="settings" element={<RequirePermission module="settings"><SettingsPage /></RequirePermission>} />
        <Route path="settings/users" element={<RequirePermission module="users"><UsersPage /></RequirePermission>} />
        <Route path="settings/roles" element={<RequirePermission module="users"><RolesPage /></RequirePermission>} />
        <Route path="customers" element={<RequirePermission module="customers"><CustomersPage /></RequirePermission>} />
        <Route path="customers/:id" element={<RequirePermission module="customers"><CustomerProfilePage /></RequirePermission>} />
        <Route path="measurements" element={<RequirePermission module="measurements"><MeasurementsPage /></RequirePermission>} />
        <Route path="audit-logs" element={<RequirePermission module="audit_logs"><AuditLogsPage /></RequirePermission>} />
        {MODULES.filter((m) => !IMPLEMENTED.has(m.key) && !m.hidden).map((m) => (
          <Route key={m.key} path={`${m.path.slice(1)}/*`} element={<RequirePermission module={m.key}><PlannedModulePage /></RequirePermission>} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
