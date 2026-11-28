import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BackupRecord, Prisma } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tenant } from '../../common/tenant';
import { AuditService } from '../../common/services/audit.service';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { PasswordService } from '../auth/password.service';
import { BACKUP_CONFIG_KEY, BackupConfig, BackupConfigSchema, DEFAULT_BACKUP_CONFIG, lastScheduledSlot, nextScheduledSlot } from './backup-config';
import { BackupFileError } from './backup-crypto';
import { BackupBusyError, BackupEngine, RestoreTestResult } from './backup-engine';
import { BackupListQueryDto, UpdateBackupConfigDto } from './dto/backup.dto';

const KEY_SAVED_SETTING = 'backup.key_saved';
const TICK_MS = 5 * 60_000;

export interface BackupRow {
  id: string;
  fileName: string;
  type: string;
  status: string;
  note: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  encrypted: boolean;
  externalPath: string | null;
  verifiedAt: Date | null;
  restoredAt: Date | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdBy: string | null;
  fileExists: boolean;
  appVersion: string | null;
  restoreTest: { at: string; ok: boolean; message: string } | null;
}

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastAutoError: string | null = null;
  readonly engine: BackupEngine;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly passwords: PasswordService) {
    this.engine = new BackupEngine(prisma);
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // Backups cover the whole platform (all companies), so the scheduler runs in platform mode.
    setTimeout(() => void Tenant.system(() => this.engine.reconcile()).catch((e: Error) => this.logger.warn(`Backup folder check failed: ${e.message}`)), 5_000).unref();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------- settings

  async getConfig(): Promise<BackupConfig> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: BACKUP_CONFIG_KEY } });
    const parsed = BackupConfigSchema.safeParse({ ...DEFAULT_BACKUP_CONFIG, ...((row?.value as object) ?? {}) });
    return parsed.success ? parsed.data : DEFAULT_BACKUP_CONFIG;
  }

  async updateConfig(dto: UpdateBackupConfigDto, ctx: RequestContext): Promise<BackupConfig> {
    const before = await this.getConfig();
    const changes = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    const parsed = BackupConfigSchema.safeParse({ ...before, ...changes });
    if (!parsed.success) throw new BadRequestException({ message: 'Validation failed', details: parsed.error.issues.map((i) => i.message) });
    const value = parsed.data;
    if (value.copyFolder && !isAbsolute(value.copyFolder)) throw new BadRequestException('The copy folder must be a full path, for example D:\\ERP-Backups');
    if (value.copyFolder && resolve(value.copyFolder) === resolve(this.engine.dir)) throw new BadRequestException('The copy folder must be different from the backups folder');
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key: BACKUP_CONFIG_KEY },
        create: { key: BACKUP_CONFIG_KEY, value: value as Prisma.InputJsonValue, updatedById: ctx.userId },
        update: { value: value as Prisma.InputJsonValue, updatedById: ctx.userId },
      });
      await this.audit.log({ action: 'BACKUP_SETTINGS_CHANGED', module: 'backup', recordId: BACKUP_CONFIG_KEY, oldValues: before, newValues: value }, ctx, tx);
    });
    return value;
  }

  // ---------------------------------------------------------------- overview & list

  async overview() {
    const config = await this.getConfig();
    let key: { fingerprint: string; source: string; file: string | null; error: string | null };
    try {
      const k = this.engine.key();
      key = { fingerprint: k.fingerprint, source: k.source, file: k.file, error: null };
    } catch (e) {
      key = { fingerprint: '', source: 'missing', file: null, error: (e as Error).message };
    }
    const [lastGood, lastAny, totals, failed24h, keySaved, tool] = await Promise.all([
      this.prisma.backupRecord.findFirst({ where: { status: { in: ['COMPLETED', 'VERIFIED'] } }, orderBy: { startedAt: 'desc' } }),
      this.prisma.backupRecord.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.backupRecord.aggregate({ where: { status: { in: ['COMPLETED', 'VERIFIED'] } }, _count: true, _sum: { sizeBytes: true } }),
      this.prisma.backupRecord.count({ where: { status: 'FAILED', startedAt: { gte: new Date(Date.now() - 86400_000) } } }),
      this.prisma.platformSetting.findUnique({ where: { key: KEY_SAVED_SETTING } }),
      this.engine.toolInfo(),
    ]);
    const ageHours = lastGood ? (Date.now() - lastGood.startedAt.getTime()) / 3600_000 : null;
    return {
      config,
      folder: this.engine.dir,
      key: { ...key, savedAt: (keySaved?.value as { at?: string } | null)?.at ?? null },
      tool,
      running: BackupEngine.running,
      lastBackup: lastGood ? this.toRow(lastGood) : null,
      lastAttempt: lastAny ? this.toRow(lastAny) : null,
      lastBackupAgeHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      nextAutomaticAt: config.autoEnabled ? nextScheduledSlot(config.dailyTime) : null,
      goodBackups: totals._count,
      totalSizeBytes: Number(totals._sum.sizeBytes ?? 0),
      failedLast24h: failed24h,
      lastAutoError: this.lastAutoError,
    };
  }

  async list(q: BackupListQueryDto) {
    const where: Prisma.BackupRecordWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status as BackupRecord['status'] } : {}),
      ...(q.search ? { fileName: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.backupRecord.findMany({
        where, orderBy: { startedAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.backupRecord.count({ where }),
    ]);
    return paginate(rows.map((r) => this.toRow(r)), total, q);
  }

  private toRow(r: BackupRecord & { createdBy?: { fullName: string } | null }): BackupRow {
    let manifest = null;
    let fileExists = false;
    try {
      manifest = this.engine.readManifest(r.fileName);
      fileExists = existsSync(this.engine.pathOf(r.fileName));
    } catch { /* invalid name */ }
    return {
      id: r.id, fileName: r.fileName, type: r.type, status: r.status, note: manifest?.note ?? null,
      sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes), checksumSha256: r.checksumSha256, encrypted: r.encrypted,
      externalPath: r.externalPath, verifiedAt: r.verifiedAt, restoredAt: r.restoredAt, errorMessage: r.errorMessage,
      startedAt: r.startedAt, completedAt: r.completedAt, createdBy: r.createdBy?.fullName ?? (r.type === 'AUTOMATIC' ? 'Automatic' : null),
      fileExists, appVersion: manifest?.appVersion ?? null, restoreTest: manifest?.restoreTest ?? null,
    };
  }

  private async find(id: string): Promise<BackupRecord> {
    const r = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Backup not found');
    return r;
  }

  /** Maps engine errors to readable API errors. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BackupBusyError) throw new ConflictException(e.message);
      if (e instanceof BackupFileError) throw new BadRequestException(e.message);
      throw new BadRequestException((e as Error).message);
    }
  }

  // ---------------------------------------------------------------- actions

  async createNow(user: AuthUser, note: string | undefined, ctx: RequestContext): Promise<BackupRow> {
    const config = await this.getConfig();
    const r = await this.run(() => this.engine.create({
      type: 'MANUAL', note: note?.trim() || null, userId: user.id, verify: config.verifyAfterBackup, copyFolder: config.copyFolder || null,
    }));
    await this.audit.log({ action: 'BACKUP_CREATED', module: 'backup', recordId: r.id, newValues: { fileName: r.fileName, sizeBytes: Number(r.sizeBytes), status: r.status } }, ctx);
    return this.toRow(r);
  }

  async verify(id: string, ctx: RequestContext): Promise<BackupRow> {
    const r = await this.run(async () => this.engine.verify(await this.find(id)));
    await this.audit.log({ action: 'BACKUP_VERIFIED', module: 'backup', recordId: id, newValues: { status: r.status } }, ctx);
    return this.toRow(r);
  }

  async restoreTest(id: string, ctx: RequestContext): Promise<RestoreTestResult> {
    const result = await this.run(async () => this.engine.restoreTest(await this.find(id)));
    await this.audit.log({ action: 'BACKUP_RESTORE_TEST', module: 'backup', recordId: id, newValues: { ok: result.ok, message: result.message } }, ctx);
    return result;
  }

  async restore(id: string, user: AuthUser, password: string, ctx: RequestContext) {
    if (!user.isOwner) throw new ForbiddenException('Only the Owner can restore a backup');
    await this.confirmPassword(user, password);
    const record = await this.find(id);
    await this.audit.log({ action: 'BACKUP_RESTORE_STARTED', module: 'backup', recordId: id, newValues: { fileName: record.fileName } }, ctx);
    const result = await this.run(() => this.engine.restore(record, { userId: user.id }));
    // The audit log now comes from the backup: record the restore in it.
    await this.audit.log({
      action: 'BACKUP_RESTORED', module: 'backup', recordId: id,
      newValues: { fileName: record.fileName, safetyBackup: result.safetyBackup, restoredBy: user.username },
    }, { ...ctx, sessionId: null, userId: (await this.prisma.user.findUnique({ where: { id: user.id } })) ? user.id : null });
    return { success: true, fileName: record.fileName, safetyBackup: result.safetyBackup, message: result.test.message };
  }

  async remove(id: string, ctx: RequestContext): Promise<void> {
    const r = await this.find(id);
    if (r.status === 'RUNNING') throw new ConflictException('This backup is still running');
    await this.engine.remove(r);
    await this.audit.log({ action: 'BACKUP_DELETED', module: 'backup', recordId: id, oldValues: { fileName: r.fileName, type: r.type } }, ctx);
  }

  async scan(ctx: RequestContext) {
    const res = await this.run(() => this.engine.reconcile());
    await this.audit.log({ action: 'BACKUP_FOLDER_SCANNED', module: 'backup', newValues: res }, ctx);
    return res;
  }

  async openDownload(id: string, ctx: RequestContext) {
    const r = await this.find(id);
    const path = this.engine.pathOf(r.fileName);
    if (!existsSync(path)) throw new NotFoundException('The backup file is missing from the backups folder');
    await this.audit.log({ action: 'BACKUP_DOWNLOADED', module: 'backup', recordId: id, newValues: { fileName: r.fileName } }, ctx);
    return { fileName: r.fileName, stream: createReadStream(path) };
  }

  /** The recovery key, for the Owner only, after typing the password again. */
  async recoveryKey(user: AuthUser, password: string, ctx: RequestContext) {
    if (!user.isOwner) throw new ForbiddenException('Only the Owner can download the backup key');
    await this.confirmPassword(user, password);
    const key = this.engine.key();
    const at = new Date().toISOString();
    await this.prisma.platformSetting.upsert({
      where: { key: KEY_SAVED_SETTING },
      create: { key: KEY_SAVED_SETTING, value: { at, fingerprint: key.fingerprint }, updatedById: user.id },
      update: { value: { at, fingerprint: key.fingerprint }, updatedById: user.id },
    });
    await this.audit.log({ action: 'BACKUP_KEY_DOWNLOADED', module: 'backup', newValues: { fingerprint: key.fingerprint } }, ctx);
    const text = [
      'TAILORINGERP - BACKUP RECOVERY KEY',
      '',
      'Keep this file safe and private (for example on a USB drive in a locked drawer and in your email).',
      'Without this key the encrypted backups (.azbak) cannot be opened, also not by the developer.',
      '',
      `Key fingerprint: ${key.fingerprint}`,
      `Saved on: ${at}`,
      '',
      'Key:',
      key.secret,
      '',
      'To use it on a new computer: put the key on one line in apps/backend/.env as',
      `BACKUP_ENCRYPTION_KEY=${key.secret}`,
      '',
      'Software developed by Brandistan | www.brandistan.pk | 0333-2532924',
      '',
    ].join('\r\n');
    return { fileName: `AZ-backup-recovery-key-${key.fingerprint}.txt`, text };
  }

  private async confirmPassword(user: AuthUser, password: string): Promise<void> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await this.passwords.verify(record.passwordHash, password))) throw new BadRequestException('Password is incorrect');
  }

  // ---------------------------------------------------------------- schedule

  /** Runs the daily automatic backup when it is due. Also catches up after the PC was switched off. */
  async tick(now: Date = new Date()): Promise<'ran' | 'skipped' | 'failed'> {
    return Tenant.system(() => this.runTick(now));
  }

  private async runTick(now: Date): Promise<'ran' | 'skipped' | 'failed'> {
    try {
      const config = await this.getConfig();
      if (!config.autoEnabled || BackupEngine.running) return 'skipped';
      const slot = lastScheduledSlot(config.dailyTime, now);
      const done = await this.prisma.backupRecord.findFirst({
        where: { type: 'AUTOMATIC', startedAt: { gte: slot }, status: { in: ['RUNNING', 'COMPLETED', 'VERIFIED'] } },
      });
      if (done) return 'skipped';
      // After a failure, wait an hour before trying again.
      const recentFail = await this.prisma.backupRecord.findFirst({
        where: { type: 'AUTOMATIC', status: 'FAILED', startedAt: { gte: new Date(Math.max(slot.getTime(), now.getTime() - 3600_000)) } },
      });
      if (recentFail) return 'skipped';
      const r = await this.engine.create({ type: 'AUTOMATIC', verify: config.verifyAfterBackup, copyFolder: config.copyFolder || null });
      await this.engine.prune(config.keepAutomatic);
      this.lastAutoError = null;
      await this.audit.log({ action: 'BACKUP_CREATED', module: 'backup', recordId: r.id, newValues: { fileName: r.fileName, automatic: true, status: r.status } });
      this.logger.log(`Automatic backup saved: ${r.fileName}`);
      return 'ran';
    } catch (e) {
      this.lastAutoError = (e as Error).message;
      this.logger.error(`Automatic backup failed: ${(e as Error).message}`);
      return 'failed';
    }
  }
}
