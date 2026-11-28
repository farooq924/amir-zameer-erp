import type { PermissionAction } from '@az/shared';
import { MODULES } from '@az/shared';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { hasPermission } from '@/hooks/use-permission';
import { AppLayout } from '@/layouts/AppLayout';
import { AttendancePage } from '@/pages/AttendancePage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { AccountingPage } from '@/pages/AccountingPage';
import { AccountLedgerPage } from '@/pages/AccountLedgerPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { ExpenseVoucherPrintPage } from '@/pages/ExpenseVoucherPrintPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ReportPrintPage } from '@/pages/ReportPrintPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ReportViewerPage } from '@/pages/ReportViewerPage';
import { EmployeeDetailPage } from '@/pages/EmployeeDetailPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { PayrollDetailPage } from '@/pages/PayrollDetailPage';
import { PayrollPage } from '@/pages/PayrollPage';
import { PayrollPrintPage, PayslipPrintPage } from '@/pages/PayslipPrintPage';
import { ProductionPage } from '@/pages/ProductionPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CustomerProfilePage } from '@/pages/CustomerProfilePage';
import { CustomersPage } from '@/pages/CustomersPage';
import { LoginPage } from '@/pages/LoginPage';
import { MeasurementPrintPage } from '@/pages/MeasurementPrintPage';
import { GarmentsPage } from '@/pages/GarmentsPage';
import { FabricDetailPage } from '@/pages/FabricDetailPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { PurchaseDetailPage } from '@/pages/PurchaseDetailPage';
import { PurchaseFormPage } from '@/pages/PurchaseFormPage';
import { PurchasesPage } from '@/pages/PurchasesPage';
import { SupplierDetailPage } from '@/pages/SupplierDetailPage';
import { SuppliersPage } from '@/pages/SuppliersPage';
import { MeasurementsPage } from '@/pages/MeasurementsPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { OrderFormPage } from '@/pages/OrderFormPage';
import { OrderPrintPage } from '@/pages/OrderPrintPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { RolesPage } from '@/pages/RolesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ForbiddenPage, NotFoundPage, PlannedModulePage } from '@/pages/StatusPages';
import { UsersPage } from '@/pages/UsersPage';
import { WhatsAppPage } from '@/pages/WhatsAppPage';
import { OfflineDeskPage } from '@/pages/OfflineDeskPage';
import { SyncCenterPage } from '@/pages/SyncCenterPage';
import { BackupPage } from '@/pages/BackupPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { CompaniesPage, CompanyDetailPage, PlansPage, PlatformActivityPage, PlatformOverviewPage, PlatformPaymentsPage } from '@/pages/platform/PlatformPages';
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

/** Super Admin area. Company users never see it (the API also refuses them). */
function RequirePlatform({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  return user?.isSuperAdmin ? <>{children}</> : <ForbiddenPage />;
}

/** Home: the dashboard for a company, the Super Admin overview for the platform area. */
function HomeRoute() {
  const user = useAuth((s) => s.user);
  if (user?.isSuperAdmin && !user.company) return <Navigate to="/platform" replace />;
  return <RequirePermission module="dashboard"><DashboardPage /></RequirePermission>;
}

const IMPLEMENTED = new Set(['dashboard', 'audit_logs', 'settings', 'users', 'customers', 'measurements', 'orders', 'garments', 'inventory', 'purchases', 'suppliers', 'employees', 'attendance', 'payroll', 'production', 'payments', 'expenses', 'accounting', 'reports', 'whatsapp', 'sync', 'backup', 'security']);

/** Remount the order form on every navigation so "Book another order" starts clean. */
function OrderFormRoute() {
  const location = useLocation();
  return <OrderFormPage key={location.key} />;
}

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/print/measurements/:id" element={<RequireAuth><RequirePermission module="measurements"><MeasurementPrintPage /></RequirePermission></RequireAuth>} />
      <Route path="/print/orders/:id" element={<RequireAuth><RequirePermission module="orders" action="PRINT"><OrderPrintPage /></RequirePermission></RequireAuth>} />
      <Route path="/print/payslips/:id" element={<RequireAuth><RequirePermission module="payroll" action="PRINT"><PayslipPrintPage /></RequirePermission></RequireAuth>} />
      <Route path="/print/payroll/:id" element={<RequireAuth><RequirePermission module="payroll" action="PRINT"><PayrollPrintPage /></RequirePermission></RequireAuth>} />
      <Route path="/print/expenses/:id" element={<RequireAuth><RequirePermission module="expenses" action="PRINT"><ExpenseVoucherPrintPage /></RequirePermission></RequireAuth>} />
      <Route path="/print/reports/:key" element={<RequireAuth><RequirePermission module="reports" action="PRINT"><ReportPrintPage /></RequirePermission></RequireAuth>} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<HomeRoute />} />
        <Route path="platform" element={<RequirePlatform><PlatformOverviewPage /></RequirePlatform>} />
        <Route path="platform/companies" element={<RequirePlatform><CompaniesPage /></RequirePlatform>} />
        <Route path="platform/companies/:id" element={<RequirePlatform><CompanyDetailPage /></RequirePlatform>} />
        <Route path="platform/payments" element={<RequirePlatform><PlatformPaymentsPage /></RequirePlatform>} />
        <Route path="platform/plans" element={<RequirePlatform><PlansPage /></RequirePlatform>} />
        <Route path="platform/activity" element={<RequirePlatform><PlatformActivityPage /></RequirePlatform>} />
        <Route path="settings" element={<RequirePermission module="settings"><SettingsPage /></RequirePermission>} />
        <Route path="settings/users" element={<RequirePermission module="users"><UsersPage /></RequirePermission>} />
        <Route path="settings/roles" element={<RequirePermission module="users"><RolesPage /></RequirePermission>} />
        <Route path="customers" element={<RequirePermission module="customers"><CustomersPage /></RequirePermission>} />
        <Route path="customers/:id" element={<RequirePermission module="customers"><CustomerProfilePage /></RequirePermission>} />
        <Route path="measurements" element={<RequirePermission module="measurements"><MeasurementsPage /></RequirePermission>} />
        <Route path="orders" element={<RequirePermission module="orders"><OrdersPage /></RequirePermission>} />
        <Route path="orders/new" element={<RequirePermission module="orders" action="CREATE"><OrderFormRoute /></RequirePermission>} />
        <Route path="orders/:id" element={<RequirePermission module="orders"><OrderDetailPage /></RequirePermission>} />
        <Route path="orders/:id/edit" element={<RequirePermission module="orders" action="EDIT"><OrderFormRoute /></RequirePermission>} />
        <Route path="garments" element={<RequirePermission module="garments"><GarmentsPage /></RequirePermission>} />
        <Route path="inventory" element={<RequirePermission module="inventory"><InventoryPage /></RequirePermission>} />
        <Route path="inventory/fabrics/:id" element={<RequirePermission module="inventory"><FabricDetailPage /></RequirePermission>} />
        <Route path="suppliers" element={<RequirePermission module="suppliers"><SuppliersPage /></RequirePermission>} />
        <Route path="suppliers/:id" element={<RequirePermission module="suppliers"><SupplierDetailPage /></RequirePermission>} />
        <Route path="purchases" element={<RequirePermission module="purchases"><PurchasesPage /></RequirePermission>} />
        <Route path="purchases/new" element={<RequirePermission module="purchases" action="CREATE"><PurchaseFormPage /></RequirePermission>} />
        <Route path="purchases/:id" element={<RequirePermission module="purchases"><PurchaseDetailPage /></RequirePermission>} />
        <Route path="employees" element={<RequirePermission module="employees"><EmployeesPage /></RequirePermission>} />
        <Route path="employees/:id" element={<RequirePermission module="employees"><EmployeeDetailPage /></RequirePermission>} />
        <Route path="attendance" element={<RequirePermission module="attendance"><AttendancePage /></RequirePermission>} />
        <Route path="production" element={<RequirePermission module="production"><ProductionPage /></RequirePermission>} />
        <Route path="payroll" element={<RequirePermission module="payroll"><PayrollPage /></RequirePermission>} />
        <Route path="payroll/:id" element={<RequirePermission module="payroll"><PayrollDetailPage /></RequirePermission>} />
        <Route path="payments" element={<RequirePermission module="payments"><PaymentsPage /></RequirePermission>} />
        <Route path="expenses" element={<RequirePermission module="expenses"><ExpensesPage /></RequirePermission>} />
        <Route path="accounting" element={<RequirePermission module="accounting"><AccountingPage /></RequirePermission>} />
        <Route path="accounting/accounts/:id" element={<RequirePermission module="accounting"><AccountLedgerPage /></RequirePermission>} />
        <Route path="reports" element={<RequirePermission module="reports"><ReportsPage /></RequirePermission>} />
        <Route path="reports/:key" element={<RequirePermission module="reports"><ReportViewerPage /></RequirePermission>} />
        <Route path="whatsapp" element={<RequirePermission module="whatsapp"><WhatsAppPage /></RequirePermission>} />
        <Route path="offline" element={<OfflineDeskPage />} />
        <Route path="backup" element={<RequirePermission module="backup"><BackupPage /></RequirePermission>} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="sync" element={<SyncCenterPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="audit-logs" element={<RequirePermission module="audit_logs"><AuditLogsPage /></RequirePermission>} />
        {MODULES.filter((m) => !IMPLEMENTED.has(m.key) && !m.hidden).map((m) => (
          <Route key={m.key} path={`${m.path.slice(1)}/*`} element={<RequirePermission module={m.key}><PlannedModulePage /></RequirePermission>} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
