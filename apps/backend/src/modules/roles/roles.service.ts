import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MODULES } from '@az/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

const PROTECTED_ROLE = 'OWNER';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Permission catalogue grouped by module, in navigation order. */
  async catalogue() {
    const perms = await this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
    return MODULES.map((m) => ({
      module: m.key,
      label: m.label,
      phase: m.phase,
      permissions: perms.filter((p) => p.module === m.key).map((p) => ({ code: p.code, action: p.action, description: p.description })),
    })).filter((g) => g.permissions.length > 0);
  }

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem, isActive: r.isActive,
      userCount: r._count.users,
      permissions: r.code === PROTECTED_ROLE ? ['*'] : r.permissions.map((rp) => rp.permission.code).sort(),
    }));
  }

  async create(dto: CreateRoleDto, ctx: RequestContext) {
    const ids = await this.resolvePermissionIds(dto.permissions);
    const exists = await this.prisma.role.findFirst({ where: { OR: [{ code: dto.code }, { name: { equals: dto.name, mode: 'insensitive' } }] } });
    if (exists) throw new ConflictException('A role with this code or name already exists');
    const role = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: { code: dto.code, name: dto.name.trim(), description: dto.description, permissions: { create: ids.map((permissionId) => ({ permissionId })) } },
      });
      await this.audit.log({ action: 'CREATE', module: 'users', recordId: r.id, newValues: { role: r.code, permissions: dto.permissions } }, ctx, tx);
      return r;
    });
    return (await this.list()).find((r) => r.id === role.id);
  }

  async update(id: string, dto: UpdateRoleDto, ctx: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === PROTECTED_ROLE) throw new BadRequestException('The Owner role always has full access and cannot be changed');
    const ids = dto.permissions ? await this.resolvePermissionIds(dto.permissions) : null;
    const before = { name: role.name, isActive: role.isActive, permissions: role.permissions.map((p) => p.permission.code).sort() };

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description, isActive: dto.isActive } });
      if (ids) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: id, permissionId })) });
      }
      await this.audit.log({
        action: 'PERMISSIONS_CHANGED', module: 'users', recordId: id, oldValues: before,
        newValues: { name: dto.name ?? role.name, isActive: dto.isActive ?? role.isActive, permissions: dto.permissions?.slice().sort() ?? before.permissions },
      }, ctx, tx);
    });
    return (await this.list()).find((r) => r.id === id);
  }

  async remove(id: string, ctx: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Default system roles cannot be deleted. Deactivate it instead.');
    if (role._count.users > 0) throw new BadRequestException('Remove this role from all users before deleting it');
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log({ action: 'DELETE', module: 'users', recordId: id, oldValues: { role: role.code } }, ctx, tx);
    });
    return { success: true };
  }

  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes)];
    const perms = await this.prisma.permission.findMany({ where: { code: { in: unique } }, select: { id: true, code: true } });
    if (perms.length !== unique.length) {
      const known = new Set(perms.map((p) => p.code));
      throw new BadRequestException({ message: 'Unknown permission codes', details: unique.filter((c) => !known.has(c)) });
    }
    return perms.map((p) => p.id);
  }
}
