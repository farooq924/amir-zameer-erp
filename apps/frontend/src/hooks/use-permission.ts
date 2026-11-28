import { MODULES, PLATFORM_ONLY_MODULES, type PermissionAction, permissionCode } from '@az/shared';
import { useAuth } from '@/store/auth';
import type { AuthUser } from '@/types';

const COMPANY_MODULE_KEYS = new Set(MODULES.map((m) => m.key));

/** True when this module is switched on for the user's company plan (platform-only modules: Super Admin). */
export function moduleEnabled(user: AuthUser | null, module: string): boolean {
  if (!user) return false;
  if (PLATFORM_ONLY_MODULES.includes(module)) return !!user.isSuperAdmin;
  if (!COMPANY_MODULE_KEYS.has(module)) return true;
  // Super Admin outside a company sees only the platform area.
  if (user.isSuperAdmin && !user.company) return false;
  return !user.company || user.company.modules.includes(module);
}

/** Pure check, shared by hooks and route guards. UI hiding is convenience only: the API enforces every permission. */
export function hasPermission(user: AuthUser | null, module: string, action: PermissionAction = 'VIEW'): boolean {
  if (!user || !moduleEnabled(user, module)) return false;
  if (user.isOwner) return true;
  return user.permissions.includes(permissionCode(module, action));
}

/** Platform area (companies, plans, payments): Super Admin only. */
export function isPlatformUser(user: AuthUser | null): boolean {
  return !!user?.isSuperAdmin;
}

/** The company's subscription has ended: screens open but nothing can be saved. */
export function isReadOnly(user: AuthUser | null): boolean {
  return !!user?.company && user.company.access === 'READ_ONLY' && !user.supportMode;
}

const READ_ONLY_ACTIONS = new Set<PermissionAction>(['VIEW', 'PRINT', 'EXPORT']);

export function useCan() {
  const user = useAuth((s) => s.user);
  return (module: string, action: PermissionAction = 'VIEW') => {
    if (!READ_ONLY_ACTIONS.has(action) && isReadOnly(user)) return false;
    return hasPermission(user, module, action);
  };
}
