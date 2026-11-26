import { SetMetadata } from '@nestjs/common';
import { PermissionAction, permissionCode } from '@az/shared';

export const PERMISSIONS_KEY = 'az:permissions';

/**
 * Backend-enforced permission check. All listed permissions are required.
 * Example: @RequirePermissions('customers', 'CREATE')
 */
export const RequirePermissions = (module: string, ...actions: PermissionAction[]) =>
  SetMetadata(PERMISSIONS_KEY, actions.map((a) => permissionCode(module, a)));
