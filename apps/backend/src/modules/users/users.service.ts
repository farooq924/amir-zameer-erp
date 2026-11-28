import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { byCompany } from '../../common/tenant';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { Paginated, PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { PasswordService, passwordPolicyError } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const userSelect = {
  id: true, fullName: true, email: true, username: true, isActive: true, lastLoginAt: true,
  lockedUntil: true, employeeId: true, createdAt: true, updatedAt: true,
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function present(u: UserRow) {
  const { roles, ...rest } = u;
  return { ...rest, roles: roles.map((r) => r.role) };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryDto): Promise<Paginated<ReturnType<typeof present>>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.search ? { OR: [
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { username: { contains: q.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows.map(present), total, q);
  }

  async get(id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
    if (!u) throw new NotFoundException('User not found');
    return present(u);
  }

  async create(dto: CreateUserDto, actor: AuthUser, ctx: RequestContext) {
    const policy = passwordPolicyError(dto.password);
    if (policy) throw new BadRequestException(policy);
    await this.assertRolesAssignable(dto.roleIds, actor);
    await this.assertUnique(dto.email, dto.username);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          username: dto.username.trim().toLowerCase(),
          passwordHash: await this.passwords.hash(dto.password),
          isActive: dto.isActive ?? true,
          employeeId: dto.employeeId ?? null,
          roles: { create: dto.roleIds.map((roleId) => ({ roleId, assignedById: actor.id })) },
        },
        select: userSelect,
      });
      await this.audit.log({ action: 'CREATE', module: 'users', recordId: created.id, newValues: present(created) }, ctx, tx);
      return created;
    });
    return present(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ctx: RequestContext) {
    const before = await this.get(id);
    if (dto.roleIds) {
      await this.assertRolesAssignable(dto.roleIds, actor);
      const wasOwner = before.roles.some((r) => r.code === 'OWNER');
      const ownerRole = await this.prisma.role.findUnique({ where: { companyId_code: byCompany({ code: 'OWNER' }) } });
      const staysOwner = ownerRole ? dto.roleIds.includes(ownerRole.id) : false;
      if (wasOwner && !staysOwner) await this.assertNotLastOwner(id);
    }
    if (dto.email && dto.email.toLowerCase() !== before.email) await this.assertUnique(dto.email, undefined, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ userId: id, roleId, assignedById: actor.id })) });
      }
      const u = await tx.user.update({
        where: { id },
        data: {
          fullName: dto.fullName?.trim(),
          email: dto.email?.trim().toLowerCase(),
          employeeId: dto.employeeId === undefined ? undefined : dto.employeeId,
        },
        select: userSelect,
      });
      await this.audit.log({ action: 'UPDATE', module: 'users', recordId: id, oldValues: before, newValues: present(u) }, ctx, tx);
      return u;
    });
    return present(updated);
  }

  async setStatus(id: string, isActive: boolean, actor: AuthUser, ctx: RequestContext) {
    if (id === actor.id && !isActive) throw new BadRequestException('You cannot deactivate your own account');
    const before = await this.get(id);
    if (!isActive && before.roles.some((r) => r.code === 'OWNER')) await this.assertNotLastOwner(id);
    const u = await this.prisma.user.update({ where: { id }, data: { isActive, ...(isActive ? { lockedUntil: null, failedLoginAttempts: 0 } : {}) }, select: userSelect });
    if (!isActive) await this.sessions.revokeAllForUser(id);
    await this.audit.log({ action: isActive ? 'ACTIVATE' : 'DEACTIVATE', module: 'users', recordId: id, oldValues: { isActive: before.isActive }, newValues: { isActive } }, ctx);
    return present(u);
  }

  async resetPassword(id: string, newPassword: string, ctx: RequestContext) {
    const policy = passwordPolicyError(newPassword);
    if (policy) throw new BadRequestException(policy);
    await this.get(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.passwords.hash(newPassword), passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.sessions.revokeAllForUser(id);
    await this.audit.log({ action: 'PASSWORD_RESET', module: 'users', recordId: id }, ctx);
    return { success: true };
  }

  /** Only an Owner may grant the Owner role. */
  private async assertRolesAssignable(roleIds: string[], actor: AuthUser) {
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== new Set(roleIds).size) throw new BadRequestException('One or more roles do not exist');
    if (roles.some((r) => !r.isActive)) throw new BadRequestException('Inactive roles cannot be assigned');
    if (roles.some((r) => r.code === 'OWNER') && !actor.isOwner) throw new BadRequestException('Only the Owner can assign the Owner role');
  }

  private async assertNotLastOwner(userId: string) {
    const owners = await this.prisma.user.count({
      where: { id: { not: userId }, isActive: true, deletedAt: null, roles: { some: { role: { code: 'OWNER' } } } },
    });
    if (owners === 0) throw new BadRequestException('The system must keep at least one active Owner account');
  }

  private async assertUnique(email?: string, username?: string, exceptId?: string) {
    const or: Prisma.UserWhereInput[] = [];
    if (email) or.push({ email: { equals: email.trim(), mode: 'insensitive' } });
    if (username) or.push({ username: { equals: username.trim(), mode: 'insensitive' } });
    if (or.length === 0) return;
    const existing = await this.prisma.user.findFirst({ where: { OR: or, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (existing) throw new ConflictException('A user with this email or username already exists');
  }
}
