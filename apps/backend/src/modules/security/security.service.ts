import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { SessionService } from '../auth/session.service';
import { BackupService } from '../backup/backup.service';
import { LoginAttemptsQueryDto } from './dto/security.dto';

export type CheckStatus = 'ok' | 'warn' | 'bad';
export interface SecurityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Where in the ERP the owner fixes it. */
  link?: string;
}

const HOUSEKEEPING_MS = 6 * 3600_000;
const LOGIN_HISTORY_DAYS = 180;

/** Short device description from a browser user agent: "Chrome on Windows". */
export function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : /curl|node|supertest|axios/i.test(ua) ? 'Script' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown system';
  return `${browser} on ${os}`;
}

@Injectable()
export class SecurityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly backups: BackupService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.housekeeping().catch((e: Error) => this.logger.warn(e.message)), HOUSEKEEPING_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Removes old ended sessions and login history older than 180 days. */
  async housekeeping(): Promise<{ sessions: number; loginAttempts: number }> {
    const sessions = await this.sessions.purgeExpired();
    const res = await this.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LOGIN_HISTORY_DAYS * 86400_000) } } });
    return { sessions, loginAttempts: res.count };
  }

  private activeSessionWhere(): Prisma.SessionWhereInput {
    const idleCutoff = new Date(Date.now() - env().SESSION_IDLE_MINUTES * 60_000);
    return { revokedAt: null, expiresAt: { gt: new Date() }, lastSeenAt: { gt: idleCutoff } };
  }

  async overview(user: AuthUser) {
    const config = env();
    const since24h = new Date(Date.now() - 86400_000);
    const [activeSessions, failed24h, success24h, lockedUsers, owners, demo, backup, inactiveWithSessions] = await Promise.all([
      this.prisma.session.count({ where: this.activeSessionWhere() }),
      this.prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24h } } }),
      this.prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: since24h } } }),
      this.prisma.user.count({ where: { deletedAt: null, lockedUntil: { gt: new Date() } } }),
      this.prisma.user.findMany({
        where: { deletedAt: null, isActive: true, roles: { some: { role: { code: 'OWNER' } } } },
        select: { id: true, username: true, passwordChangedAt: true, createdAt: true },
      }),
      this.prisma.systemSetting.findUnique({ where: { key: 'demo.data' } }),
      this.backups.overview().catch(() => null),
      this.prisma.session.count({ where: { ...this.activeSessionWhere(), user: { isActive: false } } }),
    ]);
    const topIps = await this.prisma.loginAttempt.groupBy({
      by: ['ipAddress'], where: { success: false, createdAt: { gte: since24h } }, _count: { _all: true },
      orderBy: { _count: { ipAddress: 'desc' } }, take: 5,
    });

    const https = config.APP_URL.startsWith('https://');
    const checks: SecurityCheck[] = [];
    checks.push(https
      ? { key: 'https', label: 'Secure connection (HTTPS)', status: 'ok', detail: `The ERP address is ${config.APP_URL}` }
      : { key: 'https', label: 'Secure connection (HTTPS)', status: 'warn', detail: `APP_URL is ${config.APP_URL}. Use the https:// address in apps/backend/.env when the ERP is used over the internet.` });
    checks.push(config.COOKIE_SECURE || config.TRUST_PROXY
      ? { key: 'cookies', label: 'Login cookies', status: 'ok', detail: 'HTTP-only, SameSite=Strict, and Secure on HTTPS connections' }
      : { key: 'cookies', label: 'Login cookies', status: 'warn', detail: 'Set TRUST_PROXY=true (Cloudflare / Nginx) or COOKIE_SECURE=true so login cookies are only sent over HTTPS.' });
    const swaggerOn = config.SWAGGER_ENABLED ?? config.NODE_ENV !== 'production';
    checks.push(swaggerOn
      ? { key: 'api_docs', label: 'API documentation page', status: config.NODE_ENV === 'production' ? 'warn' : 'ok', detail: 'The /api/docs page is switched on. Switch it off on the live ERP (SWAGGER_ENABLED=false).' }
      : { key: 'api_docs', label: 'API documentation page', status: 'ok', detail: 'Switched off on the live ERP' });
    const neverChanged = owners.filter((o) => !o.passwordChangedAt);
    checks.push(neverChanged.length
      ? { key: 'owner_password', label: 'Owner password', status: 'warn', detail: `The setup password of ${neverChanged.map((o) => o.username).join(', ')} was never changed. Change it from the user menu (Change password).` }
      : { key: 'owner_password', label: 'Owner password', status: 'ok', detail: 'Changed after setup' });
    checks.push({ key: 'lockout', label: 'Login protection', status: 'ok', detail: `Account locks for ${config.LOGIN_LOCK_MINUTES} minutes after ${config.LOGIN_MAX_ATTEMPTS} wrong passwords; ${config.LOGIN_RATE_LIMIT_PER_MINUTE} login tries per minute per address.` });
    checks.push({ key: 'sessions', label: 'Automatic sign-out', status: 'ok', detail: `After ${config.SESSION_IDLE_MINUTES} minutes without use, and always after ${config.SESSION_TTL_HOURS} hours` });
    checks.push(failed24h >= 20
      ? { key: 'failed_logins', label: 'Failed logins (24 hours)', status: 'warn', detail: `${failed24h} failed logins in the last 24 hours. Check the login history.`, link: '/security?tab=logins' }
      : { key: 'failed_logins', label: 'Failed logins (24 hours)', status: 'ok', detail: `${failed24h} failed login(s) in the last 24 hours` });
    if (!backup) {
      checks.push({ key: 'backup', label: 'Backups', status: 'bad', detail: 'Backup status could not be read.', link: '/backup' });
    } else if (!backup.lastBackup) {
      checks.push({ key: 'backup', label: 'Backups', status: 'bad', detail: 'No backup has been made yet. Open Backup and press Back up now.', link: '/backup' });
    } else if ((backup.lastBackupAgeHours ?? 0) > 48) {
      checks.push({ key: 'backup', label: 'Backups', status: 'bad', detail: `The last good backup is ${Math.round((backup.lastBackupAgeHours ?? 0) / 24)} days old.`, link: '/backup' });
    } else {
      checks.push({ key: 'backup', label: 'Backups', status: backup.config.autoEnabled ? 'ok' : 'warn', detail: backup.config.autoEnabled ? `Last backup ${backup.lastBackupAgeHours} hours ago; automatic daily backup at ${backup.config.dailyTime}` : 'Automatic daily backup is switched off.', link: '/backup' });
    }
    if (backup) {
      checks.push(backup.key.savedAt
        ? { key: 'backup_key', label: 'Backup recovery key', status: 'ok', detail: `Downloaded by the Owner on ${backup.key.savedAt.slice(0, 10)}`, link: '/backup' }
        : { key: 'backup_key', label: 'Backup recovery key', status: 'warn', detail: 'Download the recovery key and keep it safe. Backups cannot be opened without it.', link: '/backup' });
      checks.push(backup.config.copyFolder
        ? { key: 'backup_copy', label: 'Second copy of backups', status: 'ok', detail: `Every backup is also copied to ${backup.config.copyFolder}`, link: '/backup' }
        : { key: 'backup_copy', label: 'Second copy of backups', status: 'warn', detail: 'Backups are only on this computer. Add a copy folder (USB drive or Google Drive folder) in Backup settings.', link: '/backup' });
    }
    if (demo) checks.push({ key: 'demo', label: 'Demo data', status: 'warn', detail: 'Demo data and the demo login are loaded. Remove them before real use (scripts\\remove-demo-data.ps1).' });
    if (inactiveWithSessions) checks.push({ key: 'inactive', label: 'Deactivated users', status: 'warn', detail: `${inactiveWithSessions} session(s) of deactivated users are still open.`, link: '/security?tab=sessions' });

    const score = Math.round((checks.filter((c) => c.status === 'ok').length / checks.length) * 100);
    return {
      score,
      checks,
      stats: { activeSessions, failedLogins24h: failed24h, successfulLogins24h: success24h, lockedUsers },
      topFailedIps: topIps.map((t) => ({ ipAddress: t.ipAddress, count: t._count._all })),
      canManage: user.isOwner || user.permissions.includes('security.manage_settings'),
    };
  }

  async listSessions(user: AuthUser, scope: 'mine' | 'all') {
    if (scope === 'all' && !user.isOwner && !user.permissions.includes('security.view')) {
      throw new ForbiddenException('You do not have permission to see other users\' sessions');
    }
    const rows = await this.prisma.session.findMany({
      where: { ...this.activeSessionWhere(), ...(scope === 'mine' ? { userId: user.id } : {}) },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, fullName: true, username: true, isActive: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      user: s.user,
      device: describeDevice(s.userAgent),
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      current: s.id === user.sessionId,
    }));
  }

  async revokeSession(user: AuthUser, id: string, ctx: RequestContext): Promise<void> {
    const s = await this.prisma.session.findUnique({ where: { id }, include: { user: { select: { username: true } } } });
    if (!s) throw new NotFoundException('Session not found');
    const own = s.userId === user.id;
    if (!own && !user.isOwner && !user.permissions.includes('security.manage_settings')) {
      throw new ForbiddenException('You can only sign out your own devices');
    }
    // Only the Owner can end another Owner's session.
    if (!own && !user.isOwner) {
      const targetIsOwner = await this.prisma.userRole.count({ where: { userId: s.userId, role: { code: 'OWNER' } } });
      if (targetIsOwner) throw new ForbiddenException('Only an Owner can sign out the Owner');
    }
    await this.sessions.revoke(id);
    await this.audit.log({ action: 'SESSION_REVOKED', module: 'security', recordId: id, newValues: { username: s.user.username, own } }, ctx);
  }

  async revokeOtherSessions(user: AuthUser, ctx: RequestContext): Promise<number> {
    const n = await this.sessions.revokeAllForUser(user.id, user.sessionId);
    await this.audit.log({ action: 'SESSIONS_REVOKED', module: 'security', recordId: user.id, newValues: { count: n } }, ctx);
    return n;
  }

  async loginAttempts(q: LoginAttemptsQueryDto) {
    const where: Prisma.LoginAttemptWhereInput = {
      ...(q.result === 'failed' ? { success: false } : q.result === 'success' ? { success: true } : {}),
      ...(q.search ? { OR: [{ identifier: { contains: q.search.toLowerCase() } }, { ipAddress: { contains: q.search } }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.loginAttempt.findMany({ where, orderBy: { createdAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.loginAttempt.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  lockedUsers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null, lockedUntil: { gt: new Date() } },
      select: { id: true, fullName: true, username: true, lockedUntil: true },
      orderBy: { lockedUntil: 'desc' },
    });
  }

  async unlockUser(id: string, ctx: RequestContext): Promise<void> {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginAttempts: 0 } });
    await this.audit.log({ action: 'ACCOUNT_UNLOCKED', module: 'security', recordId: id, newValues: { username: u.username } }, ctx);
  }
}
