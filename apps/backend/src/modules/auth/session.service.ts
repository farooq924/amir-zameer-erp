import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
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
    const session = await this.prisma.session.create({
      data: { tokenHash: sha256(token), csrfToken, userId, ipAddress, userAgent, expiresAt },
    });
    return { token, csrfToken, expiresAt, sessionId: session.id };
  }

  /** Resolves a cookie token to an active session and its user's effective permissions. */
  async validate(token: string | undefined): Promise<ValidatedSession | null> {
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

    const activeRoles = user.roles.filter((ur) => ur.role.isActive);
    const isOwner = activeRoles.some((ur) => ur.role.code === 'OWNER');
    const permissions = new Set<string>();
    activeRoles.forEach((ur) => ur.role.permissions.forEach((rp) => permissions.add(rp.permission.code)));

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
      },
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Logs a user out everywhere (password change, deactivation). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const res = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  /** Housekeeping: removes sessions that ended more than 30 days ago. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000);
    const res = await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return res.count;
  }
}
