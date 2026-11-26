import { MODULES, PermissionAction, permissionCode } from './modules';

export const ROLE_CODES = [
  'OWNER',
  'ADMINISTRATOR',
  'MANAGER',
  'ACCOUNTANT',
  'CASHIER',
  'INVENTORY_MANAGER',
  'TAILOR',
  'RECEPTIONIST',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
  /** module key -> allowed actions. '*' = every action of every module. */
  grants: '*' | Record<string, readonly PermissionAction[] | '*'>;
}

const VIEW: readonly PermissionAction[] = ['VIEW'];
const WORK: readonly PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'PRINT'];

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  { code: 'OWNER', name: 'Owner', description: 'Business owner. Full, unrestricted access.', grants: '*' },
  {
    code: 'ADMINISTRATOR',
    name: 'Administrator',
    description: 'Full operational access including users and settings.',
    grants: Object.fromEntries(MODULES.map((m) => [m.key, '*'])),
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Runs daily shop operations and approves work.',
    grants: {
      dashboard: '*', customers: '*', measurements: '*', orders: '*', garments: '*',
      inventory: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT', 'PRINT'],
      purchases: ['VIEW', 'CREATE', 'EDIT', 'EXPORT', 'PRINT'], suppliers: WORK,
      employees: WORK, attendance: '*', production: '*', payroll: VIEW,
      expenses: ['VIEW', 'CREATE', 'EDIT', 'PRINT'], payments: WORK,
      reports: '*', whatsapp: ['VIEW', 'CREATE'],
    },
  },
  {
    code: 'ACCOUNTANT',
    name: 'Accountant',
    description: 'Finance, payroll, expenses and accounting.',
    grants: {
      dashboard: '*', customers: VIEW, orders: VIEW, suppliers: '*', purchases: '*',
      employees: VIEW, attendance: VIEW, payroll: '*', expenses: '*', payments: '*',
      accounting: '*', reports: '*', audit_logs: VIEW,
    },
  },
  {
    code: 'CASHIER',
    name: 'Cashier',
    description: 'Receives customer payments and records daily expenses.',
    grants: {
      dashboard: VIEW, customers: ['VIEW', 'CREATE', 'EDIT'], orders: ['VIEW', 'PRINT'],
      payments: ['VIEW', 'CREATE', 'PRINT'], expenses: ['VIEW', 'CREATE'], whatsapp: ['VIEW', 'CREATE'],
    },
  },
  {
    code: 'INVENTORY_MANAGER',
    name: 'Inventory Manager',
    description: 'Fabric stock, purchases and suppliers.',
    grants: {
      dashboard: VIEW, inventory: '*', purchases: '*', suppliers: '*', orders: VIEW,
      reports: ['VIEW', 'EXPORT', 'PRINT'],
    },
  },
  {
    code: 'TAILOR',
    name: 'Tailor',
    description: 'Views assigned work and updates production status.',
    grants: { orders: VIEW, measurements: ['VIEW', 'PRINT'], production: ['VIEW', 'EDIT'] },
  },
  {
    code: 'RECEPTIONIST',
    name: 'Receptionist',
    description: 'Front desk: customers, measurements and new orders.',
    grants: {
      dashboard: VIEW, customers: WORK, measurements: WORK, orders: ['VIEW', 'CREATE', 'PRINT'],
      payments: ['VIEW', 'CREATE', 'PRINT'], whatsapp: ['VIEW', 'CREATE'],
    },
  },
];

/** Expands a role's grants into concrete permission codes (only actions the module supports). */
export function expandRoleGrants(role: RoleDefinition): string[] {
  const codes: string[] = [];
  for (const m of MODULES) {
    const g = role.grants === '*' ? '*' : role.grants[m.key];
    if (!g) continue;
    const actions = g === '*' ? m.actions : m.actions.filter((a) => g.includes(a));
    actions.forEach((a) => codes.push(permissionCode(m.key, a)));
  }
  return codes;
}
