import { BackupRecord, BackupType, Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join, relative, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { PKT_OFFSET_MINUTES } from '../../common/utils/date-range';
import { BACKUP_EXTENSION, BackupFileError, createDecryptStream, createEncryptStream, readBackupHeader } from './backup-crypto';
import { BACKEND_ROOT, BackupKey, backupDir, resolveBackupKey } from './backup-key';
import { PgConnection, findPgTool, lastLines, parseDatabaseUrl, pgEnv, runTool, toolMissing, withDatabase } from './pg-tools';

/** Tables whose row counts are saved with every backup and compared by the restore test. */
export const COUNTED_TABLES = ['users', 'customers', 'customer_measurements', 'orders', 'payments', 'expenses', 'fabrics', 'employees', 'journal_entries'] as const;
export type TableCounts = Record<string, number>;

/** Saved next to every backup as "<file>.json" so a backups folder describes itself (also on a new PC). */
export interface BackupManifest {
  app: string; // 'TailoringERP' ('AMIR ZAMEER ERP' in backups made before v2.0)
  format: 1;
  id: string;
  fileName: string;
  type: BackupType;
  note: string | null;
  createdAt: string;
  appVersion: string;
  database: string;
  migration: string | null;
  keyFingerprint: string;
  sizeBytes: number;
  checksumSha256: string;
  counts: TableCounts;
  verifiedAt?: string | null;
  restoreTest?: { at: string; ok: boolean; message: string } | null;
}

export interface CreateBackupOptions {
  type: BackupType;
  note?: string | null;
  userId?: string | null;
  verify?: boolean;
  copyFolder?: string | null;
}

export interface RestoreTestResult {
  ok: boolean;
  message: string;
  tables: number;
  counts: TableCounts;
  expected: TableCounts | null;
  migration: string | null;
  durationMs: number;
}

export class BackupBusyError extends Error {}

export function appVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(BACKEND_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

/** 2026-11-28 23:00:05 in Karachi -> "20261128-230005". */
export function karachiStamp(d: Date = new Date()): string {
  const k = new Date(d.getTime() + PKT_OFFSET_MINUTES * 60_000).toISOString();
  return `${k.slice(0, 10).replace(/-/g, '')}-${k.slice(11, 19).replace(/:/g, '')}`;
}

function sha256File(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (c) => h.update(c)).on('error', rej).on('end', () => res(h.digest('hex')));
  });
}

/**
 * Backup engine: encrypted pg_dump archives, verification, restore test and restore.
 * Plain database data is never written to disk: pg_dump output is encrypted on the fly, and restore streams
 * the decrypted archive straight into pg_restore.
 */
export class BackupEngine {
  private static busy: string | null = null;
  readonly dir: string;
  private readonly conn: PgConnection;

  constructor(private readonly prisma: PrismaClient, databaseUrl = process.env.DATABASE_URL ?? '') {
    this.dir = backupDir();
    this.conn = parseDatabaseUrl(databaseUrl);
  }

  static get running(): string | null {
    return BackupEngine.busy;
  }

  key(): BackupKey {
    return resolveBackupKey();
  }

  private async exclusive<T>(what: string, fn: () => Promise<T>): Promise<T> {
    if (BackupEngine.busy) throw new BackupBusyError(`Please wait: ${BackupEngine.busy} is already running.`);
    BackupEngine.busy = what;
    try {
      return await fn();
    } finally {
      BackupEngine.busy = null;
    }
  }

  ensureDir(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  /** Absolute path of a backup file, refusing anything outside the backups folder. */
  pathOf(fileName: string): string {
    const p = resolve(this.dir, basename(fileName));
    const rel = relative(this.dir, p);
    if (rel.startsWith('..') || rel.includes('/') || rel.includes('\\') || !p.endsWith(BACKUP_EXTENSION)) {
      throw new BackupFileError('Invalid backup file name.');
    }
    return p;
  }

  readManifest(fileName: string): BackupManifest | null {
    const p = `${this.pathOf(fileName)}.json`;
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as BackupManifest;
    } catch {
      return null;
    }
  }

  private writeManifest(m: BackupManifest): void {
    const p = `${this.pathOf(m.fileName)}.json`;
    writeFileSync(`${p}.tmp`, JSON.stringify(m, null, 2));
    renameSync(`${p}.tmp`, p);
  }

  updateManifest(fileName: string, patch: Partial<BackupManifest>): void {
    const m = this.readManifest(fileName);
    if (m) this.writeManifest({ ...m, ...patch });
  }

  async tableCounts(client: PrismaClient = this.prisma): Promise<TableCounts> {
    const out: TableCounts = {};
    for (const t of COUNTED_TABLES) {
      const rows = await client.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${t}"`).catch(() => null);
      if (rows) out[t] = Number(rows[0].n);
    }
    return out;
  }

  async latestMigration(client: PrismaClient = this.prisma): Promise<string | null> {
    const rows = await client
      .$queryRawUnsafe<{ migration_name: string }[]>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1',
      )
      .catch(() => []);
    return rows[0]?.migration_name ?? null;
  }

  /** Creates an encrypted backup, verifies it (optional), copies it to the second folder (optional). */
  create(opts: CreateBackupOptions): Promise<BackupRecord> {
    return this.exclusive('a backup', () => this.createUnlocked(opts));
  }

  private async createUnlocked(opts: CreateBackupOptions): Promise<BackupRecord> {
    this.ensureDir();
    const key = this.key();
    const suffix = opts.type === 'AUTOMATIC' ? 'auto' : 'manual';
    let fileName = `AZ-backup-${karachiStamp()}-${suffix}${BACKUP_EXTENSION}`;
    for (let i = 2; existsSync(join(this.dir, fileName)); i++) fileName = `AZ-backup-${karachiStamp()}-${suffix}-${i}${BACKUP_EXTENSION}`;
    const target = this.pathOf(fileName);
    const partial = `${target}.part`;

    const record = await this.prisma.backupRecord.create({
      data: { fileName, storagePath: target, type: opts.type, status: 'RUNNING', encrypted: true, createdById: opts.userId ?? null },
    });

    try {
      const [counts, migration] = [await this.tableCounts(), await this.latestMigration()];
      await this.dumpTo(partial, key.secret);
      renameSync(partial, target);
      const sizeBytes = statSync(target).size;
      const checksumSha256 = await sha256File(target);
      const manifest: BackupManifest = {
        app: 'TailoringERP', format: 1, id: record.id, fileName, type: opts.type, note: opts.note?.slice(0, 200) ?? null,
        createdAt: record.startedAt.toISOString(), appVersion: appVersion(), database: this.conn.database, migration,
        keyFingerprint: key.fingerprint, sizeBytes, checksumSha256, counts, verifiedAt: null, restoreTest: null,
      };
      this.writeManifest(manifest);
      let updated = await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { status: 'COMPLETED', sizeBytes: BigInt(sizeBytes), checksumSha256, completedAt: new Date() },
      });
      if (opts.verify !== false) updated = await this.verifyUnlocked(updated);
      if (opts.copyFolder) updated = await this.copyOut(updated, opts.copyFolder);
      return updated;
    } catch (err) {
      for (const f of [partial]) if (existsSync(f)) unlinkSync(f);
      await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { status: 'FAILED', errorMessage: (err as Error).message.slice(0, 2000), completedAt: new Date() },
      });
      throw err;
    }
  }

  private async dumpTo(file: string, secret: string): Promise<void> {
    const cmd = findPgTool('pg_dump');
    const child = spawn(cmd, ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', `--dbname=${this.conn.uri}`], {
      env: pgEnv(this.conn), windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const exited = new Promise<void>((res, rej) => {
      child.on('error', (e) => rej(toolMissing(cmd, e)));
      child.on('close', (code) => (code === 0 ? res() : rej(new Error(`pg_dump failed: ${lastLines(stderr) || `exit code ${code}`}`))));
    });
    const written = pipeline(child.stdout, createEncryptStream(secret), createWriteStream(file, { mode: 0o600 }));
    await Promise.all([exited, written]);
  }

  /** Streams the decrypted archive into a pg_restore command. */
  private async pipeToRestore(file: string, args: string[], conn?: PgConnection): Promise<{ stdout: string; stderr: string }> {
    const cmd = findPgTool('pg_restore');
    const child = spawn(cmd, args, { env: pgEnv(conn ?? this.conn), windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const exited = new Promise<void>((res, rej) => {
      child.on('error', (e) => rej(toolMissing(cmd, e)));
      child.on('close', (code) => (code === 0 ? res() : rej(new Error(`pg_restore failed: ${lastLines(stderr) || `exit code ${code}`}`))));
    });
    const fed = pipeline(createDecryptStream(file, this.key().secret), child.stdin).catch((e: NodeJS.ErrnoException) => {
      // pg_restore closing its input early is reported by its own exit code. "pg_restore --list" only reads the
      // archive's table of contents and then exits, so the rest of the file hits a closed pipe:
      // EPIPE on Linux, "write EOF" (code EOF) on Windows.
      if (e.code === 'EPIPE' || e.code === 'EOF' || e.code === 'ERR_STREAM_PREMATURE_CLOSE' || e.code === 'ERR_STREAM_DESTROYED') return;
      child.kill();
      throw e;
    });
    await Promise.all([fed, exited]);
    return { stdout, stderr };
  }

  private checkKey(fileName: string): void {
    const m = this.readManifest(fileName);
    const fp = this.key().fingerprint;
    if (m && m.keyFingerprint && m.keyFingerprint !== fp) {
      throw new BackupFileError(`This backup was made with a different encryption key (key ${m.keyFingerprint}; this ERP uses ${fp}). Put the matching key in BACKUP_ENCRYPTION_KEY or apps/backend/backup.key.`);
    }
  }

  /** Checksum + full decryption (authentication tag) + archive table list. */
  verify(record: BackupRecord): Promise<BackupRecord> {
    return this.exclusive('a backup check', () => this.verifyUnlocked(record));
  }

  private async verifyUnlocked(record: BackupRecord): Promise<BackupRecord> {
    const file = this.pathOf(record.fileName);
    try {
      if (!existsSync(file)) throw new BackupFileError('The backup file is missing from the backups folder.');
      this.checkKey(record.fileName);
      if (record.checksumSha256 && (await sha256File(file)) !== record.checksumSha256) {
        throw new BackupFileError('The backup file has changed since it was made (checksum does not match).');
      }
      const { stdout } = await this.pipeToRestore(file, ['--list']);
      const tables = stdout.split(/\r?\n/).filter((l) => / TABLE DATA /.test(l)).length;
      if (tables < 10) throw new BackupFileError(`The backup looks incomplete (only ${tables} tables found).`);
      const verifiedAt = new Date();
      this.updateManifest(record.fileName, { verifiedAt: verifiedAt.toISOString() });
      return await this.prisma.backupRecord.update({ where: { id: record.id }, data: { status: 'VERIFIED', verifiedAt, errorMessage: null } });
    } catch (err) {
      await this.prisma.backupRecord.update({ where: { id: record.id }, data: { status: 'FAILED', errorMessage: (err as Error).message.slice(0, 2000) } });
      throw err;
    }
  }

  private async copyOut(record: BackupRecord, folder: string): Promise<BackupRecord> {
    try {
      mkdirSync(folder, { recursive: true });
      const dest = join(folder, record.fileName);
      copyFileSync(this.pathOf(record.fileName), dest);
      const manifest = `${this.pathOf(record.fileName)}.json`;
      if (existsSync(manifest)) copyFileSync(manifest, `${dest}.json`);
      return await this.prisma.backupRecord.update({ where: { id: record.id }, data: { externalPath: dest } });
    } catch (err) {
      // The backup itself is fine; only the second copy failed.
      return this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { errorMessage: `Saved, but the copy to ${folder} failed: ${(err as Error).message}`.slice(0, 2000) },
      });
    }
  }

  /**
   * Restore test: restores the backup into a temporary database next to the real one, counts the rows,
   * compares them with the counts saved at backup time, then deletes the temporary database.
   */
  restoreTest(record: BackupRecord): Promise<RestoreTestResult> {
    return this.exclusive('a restore test', () => this.restoreTestUnlocked(record));
  }

  private async restoreTestUnlocked(record: BackupRecord): Promise<RestoreTestResult> {
    const started = Date.now();
    const file = this.pathOf(record.fileName);
    if (!existsSync(file)) throw new BackupFileError('The backup file is missing from the backups folder.');
    this.checkKey(record.fileName);
    readBackupHeader(file);
    const testDb = `${this.conn.database}_restore_check`.slice(0, 63);
    const testConn = withDatabase(this.conn, testDb);
    const dropTestDb = () => this.prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
    await dropTestDb();
    await this.prisma.$executeRawUnsafe(`CREATE DATABASE "${testDb}"`);
    const expected = this.readManifest(record.fileName)?.counts ?? null;
    let result: RestoreTestResult;
    try {
      await this.pipeToRestore(file, ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${testConn.uri}`], testConn);
      const url = new URL(process.env.DATABASE_URL ?? '');
      url.pathname = `/${testDb}`;
      url.searchParams.set('connection_limit', '1');
      const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
      try {
        const counts = await this.tableCounts(client);
        const migration = await this.latestMigration(client);
        const tables = Number((await client.$queryRawUnsafe<{ n: bigint }[]>(
          "SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        ))[0].n);
        const mismatch = expected ? Object.keys(expected).filter((t) => counts[t] !== expected[t]) : [];
        const ok = tables >= 10 && mismatch.length === 0;
        const message = ok
          ? `Restore test passed: ${tables} tables restored, ${counts.customers ?? 0} customers and ${counts.orders ?? 0} orders match the backup.`
          : mismatch.length
            ? `Restore test failed: row counts differ for ${mismatch.join(', ')}.`
            : `Restore test failed: only ${tables} tables were restored.`;
        result = { ok, message, tables, counts, expected, migration, durationMs: Date.now() - started };
      } finally {
        await client.$disconnect();
      }
    } catch (err) {
      result = { ok: false, message: `Restore test failed: ${(err as Error).message}`, tables: 0, counts: {}, expected, migration: null, durationMs: Date.now() - started };
    } finally {
      await dropTestDb().catch(() => undefined);
    }
    this.updateManifest(record.fileName, { restoreTest: { at: new Date().toISOString(), ok: result.ok, message: result.message } });
    if (result.ok && record.status !== 'VERIFIED') {
      await this.prisma.backupRecord.update({ where: { id: record.id }, data: { status: 'VERIFIED', verifiedAt: new Date(), errorMessage: null } });
    }
    return result;
  }

  /**
   * Replaces the whole live database with the backup. Steps: verify the file, restore test (also checks the backup
   * belongs to this ERP version), safety backup of the current data, then restore in one transaction
   * (all or nothing). Returns the safety backup's file name.
   */
  restore(record: BackupRecord, opts: { userId?: string | null; allowOtherVersion?: boolean; skipSafetyBackup?: boolean } = {}) {
    return this.exclusive('a restore', async () => {
      const file = this.pathOf(record.fileName);
      await this.verifyUnlocked(record);
      const test = await this.restoreTestUnlocked(record);
      if (!test.ok) throw new BackupFileError(test.message);
      const current = await this.latestMigration();
      if (!opts.allowOtherVersion && test.migration !== current) {
        throw new BackupFileError(
          'This backup was made by a different ERP version. Restore it with scripts\\restore-backup.ps1, which also updates the database structure.',
        );
      }
      const safety = opts.skipSafetyBackup
        ? null
        : await this.createUnlocked({ type: 'MANUAL', note: `Safety copy before restoring ${record.fileName}`, userId: opts.userId, verify: true });
      await this.pipeToRestore(file, ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', `--dbname=${this.conn.uri}`]);
      // backup_records now holds the rows from the backup: rebuild the list from the files in the folder.
      await this.reconcile();
      await this.prisma.backupRecord.updateMany({ where: { fileName: record.fileName }, data: { restoredAt: new Date() } });
      return { safetyBackup: safety?.fileName ?? null, test };
    });
  }

  /** Adds backups found in the folder (copied from another PC, or after a restore) and marks missing files. */
  async reconcile(): Promise<{ added: number; missing: number }> {
    this.ensureDir();
    const files = readdirSync(this.dir).filter((f) => f.endsWith(BACKUP_EXTENSION));
    const known = await this.prisma.backupRecord.findMany();
    const byName = new Map(known.map((r) => [r.fileName, r]));
    let added = 0;
    for (const f of files) {
      if (byName.has(f)) continue;
      const path = this.pathOf(f);
      try {
        readBackupHeader(path);
      } catch {
        continue;
      }
      const m = this.readManifest(f);
      const size = statSync(path).size;
      const data: Prisma.BackupRecordUncheckedCreateInput = {
        fileName: f, storagePath: path, type: m?.type ?? 'MANUAL', encrypted: true,
        status: m?.verifiedAt ? 'VERIFIED' : 'COMPLETED', sizeBytes: BigInt(size),
        checksumSha256: m?.checksumSha256 ?? null, verifiedAt: m?.verifiedAt ? new Date(m.verifiedAt) : null,
        startedAt: m?.createdAt ? new Date(m.createdAt) : statSync(path).mtime, completedAt: statSync(path).mtime,
      };
      const idFree = m?.id && !(await this.prisma.backupRecord.findUnique({ where: { id: m.id } }));
      await this.prisma.backupRecord.create({ data: idFree ? { ...data, id: m!.id } : data });
      added++;
    }
    let missing = 0;
    for (const r of known) {
      if (r.status === 'RUNNING' && files.includes(r.fileName)) {
        // Restored from a backup that was taken while this very record was still running: finish it from its manifest.
        const m = this.readManifest(r.fileName);
        const size = statSync(this.pathOf(r.fileName)).size;
        await this.prisma.backupRecord.update({
          where: { id: r.id },
          data: {
            status: m?.verifiedAt ? 'VERIFIED' : 'COMPLETED', sizeBytes: BigInt(size), checksumSha256: m?.checksumSha256 ?? r.checksumSha256,
            verifiedAt: m?.verifiedAt ? new Date(m.verifiedAt) : null, completedAt: r.completedAt ?? new Date(), errorMessage: null,
          },
        });
        continue;
      }
      if (r.status === 'RUNNING' || r.status === 'FAILED') continue;
      if (!files.includes(r.fileName)) {
        await this.prisma.backupRecord.update({ where: { id: r.id }, data: { status: 'FAILED', errorMessage: 'The backup file is no longer in the backups folder.' } });
        missing++;
      }
    }
    // A run that was interrupted (PC switched off) never finishes.
    await this.prisma.backupRecord.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 3 * 3600_000) } },
      data: { status: 'FAILED', errorMessage: 'The backup was interrupted.' },
    });
    return { added, missing };
  }

  /** Deletes the file, its manifest, its copy in the second folder and its record. */
  async remove(record: BackupRecord): Promise<void> {
    const file = this.pathOf(record.fileName);
    for (const f of [file, `${file}.json`]) if (existsSync(f)) unlinkSync(f);
    if (record.externalPath) {
      for (const f of [record.externalPath, `${record.externalPath}.json`]) {
        try { if (existsSync(f) && basename(f).startsWith('AZ-backup-')) unlinkSync(f); } catch { /* second copy may be offline */ }
      }
    }
    await this.prisma.backupRecord.delete({ where: { id: record.id } });
  }

  /** Keeps the newest `keep` good automatic backups. Returns how many were deleted. */
  async prune(keep: number): Promise<number> {
    const autos = await this.prisma.backupRecord.findMany({
      where: { type: 'AUTOMATIC', status: { in: ['COMPLETED', 'VERIFIED'] } },
      orderBy: { startedAt: 'desc' },
    });
    const old = autos.slice(keep);
    for (const r of old) await this.remove(r);
    // Failed automatic runs older than 30 days are only noise.
    await this.prisma.backupRecord.deleteMany({ where: { type: 'AUTOMATIC', status: 'FAILED', startedAt: { lt: new Date(Date.now() - 30 * 86400_000) } } });
    return old.length;
  }

  /** Tool versions, for the Backup page. */
  async toolInfo(): Promise<{ pgDump: string | null; error: string | null }> {
    try {
      const { stdout } = await runTool(findPgTool('pg_dump'), ['--version'], process.env);
      return { pgDump: stdout.trim(), error: null };
    } catch (e) {
      return { pgDump: null, error: (e as Error).message };
    }
  }
}

