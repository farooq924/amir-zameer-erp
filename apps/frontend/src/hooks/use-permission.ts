import { type PermissionAction, permissionCode } from '@az/shared';
import { useAuth } from '@/store/auth';
import type { AuthUser } from '@/types';

/** Pure check, shared by hooks and route guards. UI hiding is convenience only: the API enforces every permission. */
export function hasPermission(user: AuthUser | null, module: string, action: PermissionAction = 'VIEW'): boolean {
  if (!user) return false;
  if (user.isOwner) return true;
  return user.permissions.includes(permissionCode(module, action));
}

export function useCan() {
  const user = useAuth((s) => s.user);
  return (module: string, action: PermissionAction = 'VIEW') => hasPermission(user, module, action);
}
