/**
 * Single source of truth for ERP modules, used by the backend (permission seed,
 * guards) and the frontend (navigation, permission-aware UI).
 */
export const PERMISSION_ACTIONS = [
  'VIEW',
  'CREATE',
  'EDIT',
  'DELETE',
  'APPROVE',
  'EXPORT',
  'PRINT',
  'MANAGE_SETTINGS',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface ModuleDefinition {
  key: string;
  label: string;
  path: string;
  /** Development phase in which the module becomes available. */
  phase: number;
  /** Lucide icon name used by the frontend navigation. */
  icon: string;
  /** Actions that make sense for this module. */
  actions: readonly PermissionAction[];
  /** Hidden modules have permissions but no navigation entry. */
  hidden?: boolean;
}

const CRUD: readonly PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'PRINT'];
const CRUD_APPROVE: readonly PermissionAction[] = [...CRUD, 'APPROVE'];

export const MODULES: readonly ModuleDefinition[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', phase: 1, icon: 'LayoutDashboard', actions: ['VIEW', 'EXPORT'] },
  { key: 'customers', label: 'Customers', path: '/customers', phase: 2, icon: 'Users', actions: CRUD },
  { key: 'measurements', label: 'Measurements', path: '/measurements', phase: 2, icon: 'Ruler', actions: [...CRUD, 'MANAGE_SETTINGS'] },
  { key: 'orders', label: 'Orders', path: '/orders', phase: 3, icon: 'ClipboardList', actions: [...CRUD_APPROVE, 'MANAGE_SETTINGS'] },
  { key: 'garments', label: 'Garments', path: '/garments', phase: 3, icon: 'Shirt', actions: [...CRUD, 'MANAGE_SETTINGS'] },
  { key: 'inventory', label: 'Fabric Inventory', path: '/inventory', phase: 4, icon: 'Layers', actions: CRUD_APPROVE },
  { key: 'purchases', label: 'Purchases', path: '/purchases', phase: 4, icon: 'ShoppingCart', actions: CRUD_APPROVE },
  { key: 'suppliers', label: 'Suppliers', path: '/suppliers', phase: 4, icon: 'Truck', actions: CRUD },
  { key: 'employees', label: 'Employees', path: '/employees', phase: 5, icon: 'IdCard', actions: CRUD },
  { key: 'attendance', label: 'Attendance', path: '/attendance', phase: 5, icon: 'CalendarCheck', actions: CRUD_APPROVE },
  { key: 'payroll', label: 'Payroll', path: '/payroll', phase: 5, icon: 'Wallet', actions: CRUD_APPROVE },
  { key: 'production', label: 'Production', path: '/production', phase: 5, icon: 'Scissors', actions: CRUD_APPROVE },
  { key: 'expenses', label: 'Expenses', path: '/expenses', phase: 6, icon: 'Receipt', actions: CRUD_APPROVE },
  { key: 'payments', label: 'Payments', path: '/payments', phase: 6, icon: 'Banknote', actions: CRUD_APPROVE },
  { key: 'accounting', label: 'Accounting', path: '/accounting', phase: 6, icon: 'BookOpen', actions: [...CRUD_APPROVE, 'MANAGE_SETTINGS'] },
  { key: 'reports', label: 'Reports', path: '/reports', phase: 7, icon: 'BarChart3', actions: ['VIEW', 'EXPORT', 'PRINT'] },
  { key: 'whatsapp', label: 'WhatsApp', path: '/whatsapp', phase: 8, icon: 'MessageCircle', actions: ['VIEW', 'CREATE', 'MANAGE_SETTINGS'] },
  { key: 'backup', label: 'Backup', path: '/backup', phase: 10, icon: 'DatabaseBackup', actions: ['VIEW', 'CREATE', 'APPROVE', 'EXPORT'] },
  { key: 'audit_logs', label: 'Audit Logs', path: '/audit-logs', phase: 1, icon: 'ShieldCheck', actions: ['VIEW', 'EXPORT'] },
  { key: 'settings', label: 'Settings', path: '/settings', phase: 1, icon: 'Settings', actions: ['VIEW', 'MANAGE_SETTINGS'] },
  { key: 'users', label: 'Users & Roles', path: '/settings/users', phase: 1, icon: 'UserCog', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'MANAGE_SETTINGS'], hidden: true },
  { key: 'sync', label: 'Synchronization', path: '/sync', phase: 9, icon: 'RefreshCw', actions: ['VIEW', 'APPROVE'], hidden: true },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

/** "customers" + "VIEW" -> "customers.view" */
export function permissionCode(module: string, action: PermissionAction): string {
  return `${module}.${action.toLowerCase()}`;
}

export function allPermissionCodes(): string[] {
  return MODULES.flatMap((m) => m.actions.map((a) => permissionCode(m.key, a)));
}
