import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { allPermissionCodes } from '@az/shared';
import { Tenant } from '../../common/tenant';
import { AuthCompany, AuthUser } from '../../common/types/auth-user';
import { enabledModules, subscriptionState } from '../platform/subscription';
import { randomToken, sha256 } from '../../common/utils/crypto';

export const SESSION_COOKIE = 'az_sid';
export const CSRF_COOKIE = 'az_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  sessionId: string;
}

export interface ValidatedSession {
  user: AuthUser;
  csrfToken: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, ipAddress: string | null, userAgent: string | null): Promise<CreatedSession> {
    const token = randomToken(32);
    const csrfToken = randomToken(32);
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000);
    const session = await Tenant.system(async () => {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
      return this.prisma.session.create({
        data: { tokenHash: sha256(token), csrfToken, userId, ipAddress, userAgent, expiresAt, companyId: u.companyId },
      });
    });
    return { token, csrfToken, expiresAt, sessionId: session.id };
  }

  /** Resolves a cookie token to an active session and its user's effective permissions. */
  async validate(token: string | undefined): Promise<ValidatedSession | null> {
    // Sessions are looked up before the company is known: platform mode.
    return Tenant.system(() => this.validateInner(token));
  }

  private async validateInner(token: string | undefined): Promise<ValidatedSession | null> {
    if (!token || token.length > 200) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: {
          include: {
            roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          },
        },
      },
    });
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    const idleLimit = env().SESSION_IDLE_MINUTES * 60_000;
    if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > idleLimit) {
      await this.revoke(session.id);
      return null;
    }
    const user = session.user;
    if (!user.isActive || user.deletedAt) {
      await this.revoke(session.id);
      return null;
    }

    // Sliding idle timeout; written at most once per minute to keep requests cheap.
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }

    // Which company does this session work in?
    const companyId = user.isSuperAdmin ? session.actingCompanyId : user.companyId;
    const company = companyId ? await this.loadCompany(companyId) : null;
    if (companyId && !company) {
      await this.revoke(session.id);
      return null;
    }
    if (company?.access === 'SUSPENDED' && !user.isSuperAdmin) {
      await this.revoke(session.id);
      return null;
    }

    const activeRoles = user.roles.filter((ur) => ur.role.isActive);
    const isOwner = user.isSuperAdmin || activeRoles.some((ur) => ur.role.code === 'OWNER');
    const permissions = new Set<string>();
    if (user.isSuperAdmin) allPermissionCodes().forEach((p) => permissions.add(p));
    else activeRoles.forEach((ur) => ur.role.permissions.forEach((rp) => permissions.add(rp.permission.code)));
    // A company only gets the modules of its plan.
    if (company) {
      const allowed = new Set(company.modules);
      for (const p of [...permissions]) if (!allowed.has(p.split('.')[0])) permissions.delete(p);
    }

    return {
      csrfToken: session.csrfToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        isOwner,
        roles: activeRoles.map((ur) => ({ code: ur.role.code, name: ur.role.name })),
        permissions: [...permissions].sort(),
        sessionId: session.id,
        isSuperAdmin: user.isSuperAdmin,
        companyId: companyId ?? null,
        company,
        supportMode: user.isSuperAdmin && !!companyId,
      },
    };
  }

  /** Company, plan and subscription state for a session. */
  async loadCompany(companyId: string): Promise<AuthCompany | null> {
    const c = await this.prisma.company.findUnique({ where: { id: companyId }, include: { plan: true } });
    if (!c) return null;
    const st = subscriptionState(c);
    return {
      id: c.id, code: c.code, name: c.name, status: c.status,
      plan: { code: c.plan.code, name: c.plan.name, maxUsers: c.plan.maxUsers },
      modules: enabledModules(c.plan.modules),
      access: st.access,
      endsAt: st.endsAt?.toISOString() ?? null,
      graceEndsAt: st.graceEndsAt?.toISOString() ?? null,
      daysLeft: st.daysLeft,
    };
  }

  /** Super Admin support access: open (companyId) or leave (null) a company in this session. */
  async setActingCompany(sessionId: string, companyId: string | null): Promise<void> {
    await Tenant.system(() => this.prisma.session.update({ where: { id: sessionId }, data: { actingCompanyId: companyId } }));
  }

  async revoke(sessionId: string): Promise<void> {
    await Tenant.system(() => this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } }));
  }

  /** Logs a user out everywhere (password change, deactivation). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const res = await Tenant.system(() => this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    }));
    return res.count;
  }

  /** Housekeeping: removes sessions that ended more than 30 days ago. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000);
    const res = await Tenant.system(() => this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    }));
    return res.count;
  }
}
