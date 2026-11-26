import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { PasswordService, passwordPolicyError } from './password.service';
import { CreatedSession, SessionService } from './session.service';

const IP_FAILURE_LIMIT = 30; // failed logins per IP per window before the IP is blocked
const IP_WINDOW_MINUTES = 15;
const GENERIC_LOGIN_ERROR = 'Invalid username or password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(identifierRaw: string, password: string, ctx: RequestContext): Promise<CreatedSession & { userId: string }> {
    const identifier = identifierRaw.trim().toLowerCase();
    const { LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES } = env();

    // 1. IP-level brute force protection.
    if (ctx.ipAddress) {
      const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);
      const ipFailures = await this.prisma.loginAttempt.count({
        where: { ipAddress: ctx.ipAddress, success: false, createdAt: { gte: since } },
      });
      if (ipFailures >= IP_FAILURE_LIMIT) {
        await this.recordAttempt(identifier, ctx, false, 'IP_BLOCKED');
        throw new HttpException('Too many failed login attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const user = await this.prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ email: { equals: identifier, mode: 'insensitive' } }, { username: { equals: identifier, mode: 'insensitive' } }] },
    });

    // 2. Account lockout.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordAttempt(identifier, ctx, false, 'LOCKED');
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(`Account is temporarily locked. Try again in ${minutes} minute(s).`, HttpStatus.TOO_MANY_REQUESTS);
    }

    // 3. Verify password (constant-ish time even if the user does not exist).
    const valid = await this.passwords.verify(user?.passwordHash ?? null, password);

    if (!user || !valid) {
      await this.recordAttempt(identifier, ctx, false, user ? 'BAD_PASSWORD' : 'UNKNOWN_USER');
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        const lock = attempts >= LOGIN_MAX_ATTEMPTS;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: lock ? 0 : attempts,
            lockedUntil: lock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null,
          },
        });
        if (lock) {
          await this.audit.log({ action: 'ACCOUNT_LOCKED', module: 'auth', recordId: user.id, userId: user.id }, ctx);
        }
      }
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (!user.isActive) {
      await this.recordAttempt(identifier, ctx, false, 'INACTIVE');
      throw new UnauthorizedException('This account has been deactivated. Contact the business owner.');
    }

    // 4. Success.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const session = await this.sessions.create(user.id, ctx.ipAddress, ctx.userAgent);
    await this.recordAttempt(identifier, ctx, true, null);
    await this.audit.log({ action: 'LOGIN', module: 'auth', recordId: user.id, userId: user.id }, { ...ctx, sessionId: session.sessionId });
    return { ...session, userId: user.id };
  }

  async logout(user: AuthUser, ctx: RequestContext): Promise<void> {
    await this.sessions.revoke(user.sessionId);
    await this.audit.log({ action: 'LOGOUT', module: 'auth', recordId: user.id }, ctx);
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const policy = passwordPolicyError(newPassword);
    if (policy) throw new BadRequestException(policy);
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await this.passwords.verify(record.passwordHash, currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (currentPassword === newPassword) throw new BadRequestException('New password must be different from the current password');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(newPassword), passwordChangedAt: new Date() },
    });
    const revoked = await this.sessions.revokeAllForUser(user.id, user.sessionId);
    await this.audit.log({ action: 'PASSWORD_CHANGED', module: 'auth', recordId: user.id, newValues: { otherSessionsRevoked: revoked } }, ctx);
  }

  private async recordAttempt(identifier: string, ctx: RequestContext, success: boolean, reason: string | null): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: { identifier: identifier.slice(0, 160), ipAddress: ctx.ipAddress, success, reason },
    });
  }
}
