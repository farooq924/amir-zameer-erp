import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { Agent, bootApp, login } from './helpers';

// Backups of the test database go to a temporary folder with a temporary key.
const dir = mkdtempSync(join(tmpdir(), 'az-e2e-backups-'));
process.env.BACKUP_DIR = join(dir, 'backups');
process.env.BACKUP_KEY_FILE = join(dir, 'backup.key');
delete process.env.BACKUP_ENCRYPTION_KEY;

jest.setTimeout(120_000);

describe('Phase 10: security & backups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  let admin: Agent;
  let cashier: Agent;
  let backupId: string;
  let backupFile: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
    const roles = (await owner.agent.get('/api/roles').expect(200)).body as { id: string; code: string }[];
    const roleId = (c: string) => roles.find((r) => r.code === c)!.id;
    await owner.agent.post('/api/users').set('X-CSRF-Token', owner.csrf)
      .send({ fullName: 'Sec Admin', email: 'secadmin@test.local', username: 'secadmin', password: 'SecAdmin12345', roleIds: [roleId('ADMINISTRATOR')] }).expect(201);
    await owner.agent.post('/api/users').set('X-CSRF-Token', owner.csrf)
      .send({ fullName: 'Sec Cashier', email: 'seccash@test.local', username: 'seccash', password: 'SecCash12345', roleIds: [roleId('CASHIER')] }).expect(201);
    admin = await login(app, 'secadmin', 'SecAdmin12345');
    cashier = await login(app, 'seccash', 'SecCash12345');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ security hardening

  it('sends security headers and hides the server technology', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(res.headers['permissions-policy']).toContain('microphone=()');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('rejects unknown fields (mass assignment) and oversized bodies', async () => {
    await owner.agent.post('/api/customers').set('X-CSRF-Token', owner.csrf)
      .send({ name: 'Mass Assign', mobile: '03001112233', isOwner: true, createdById: '00000000-0000-0000-0000-000000000000' }).expect(400);
    await owner.agent.post('/api/customers').set('X-CSRF-Token', owner.csrf)
      .send({ name: 'x'.repeat(1_100_000), mobile: '03001112233' }).expect(413);
  });

  it('treats SQL and script text in searches as plain text', async () => {
    const res = await owner.agent.get('/api/customers').query({ search: "' OR 1=1; DROP TABLE customers; --" }).expect(200);
    expect(res.body.data).toEqual([]);
    expect(await prisma.customer.count()).toBeGreaterThanOrEqual(0);
    const created = await owner.agent.post('/api/customers').set('X-CSRF-Token', owner.csrf)
      .send({ name: '<script>alert(1)</script> Bilal', mobile: '03019998877' }).expect(201);
    expect(created.body.name).toBe('<script>alert(1)</script> Bilal'); // stored as text; the web app escapes it when shown
  });

  it('does not leak internals in error responses', async () => {
    const res = await owner.agent.get('/api/backup/not-a-uuid/download').expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|prisma/i);
  });

  it('main screens answer quickly (performance smoke test)', async () => {
    const paths = ['/api/dashboard/summary', '/api/customers', '/api/orders', '/api/payments', '/api/security/overview', '/api/backup/overview'];
    for (const p of paths) {
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const t = Date.now();
        await owner.agent.get(p).expect(200);
        times.push(Date.now() - t);
      }
      times.sort((a, b) => a - b);
      expect(times[8]).toBeLessThan(1500); // 90th percentile
    }
  });

  // ------------------------------------------------------------------ security center

  it('security overview needs security.view and lists the checks', async () => {
    await cashier.agent.get('/api/security/overview').expect(403);
    const res = await owner.agent.get('/api/security/overview').expect(200);
    const keys = (res.body.checks as { key: string }[]).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['https', 'owner_password', 'lockout', 'backup', 'backup_key']));
    expect(res.body.checks.find((c: { key: string }) => c.key === 'backup').status).toBe('bad'); // no backup yet
    expect(res.body.stats.activeSessions).toBeGreaterThanOrEqual(3);
    expect(res.body.score).toBeGreaterThan(0);
  });

  it('everyone sees and ends only their own sessions', async () => {
    const second = await login(app, 'seccash', 'SecCash12345');
    const mine = (await cashier.agent.get('/api/security/sessions').expect(200)).body as { id: string; current: boolean; device: string }[];
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.filter((s) => s.current)).toHaveLength(1);
    await cashier.agent.get('/api/security/sessions').query({ scope: 'all' }).expect(403);
    const ownerSessions = (await owner.agent.get('/api/security/sessions').expect(200)).body as { id: string }[];
    await cashier.agent.post(`/api/security/sessions/${ownerSessions[0].id}/revoke`).set('X-CSRF-Token', cashier.csrf).expect(403);
    const res = await cashier.agent.post('/api/security/sessions/revoke-others').set('X-CSRF-Token', cashier.csrf).expect(200);
    expect(res.body.revoked).toBeGreaterThanOrEqual(1);
    await second.agent.get('/api/auth/me').expect(401);
    await cashier.agent.get('/api/auth/me').expect(200);
  });

  it('admin can end another user\'s session but not the Owner\'s', async () => {
    const victim = await login(app, 'seccash', 'SecCash12345');
    const all = (await admin.agent.get('/api/security/sessions').query({ scope: 'all' }).expect(200)).body as { id: string; user: { username: string } }[];
    const ownerSession = all.find((s) => s.user.username === 'owner')!;
    await admin.agent.post(`/api/security/sessions/${ownerSession.id}/revoke`).set('X-CSRF-Token', admin.csrf).expect(403);
    const meRes = await victim.agent.get('/api/auth/me').expect(200);
    await admin.agent.post(`/api/security/sessions/${meRes.body.user.sessionId}/revoke`).set('X-CSRF-Token', admin.csrf).expect(200);
    await victim.agent.get('/api/auth/me').expect(401);
  });

  it('shows login history and unlocks a locked account', async () => {
    // Other suites log many failures from the same test address; start clean so the per-address block does not interfere.
    await prisma.loginAttempt.deleteMany({ where: { success: false } });
    for (let i = 0; i < 3; i++) await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: 'seccash', password: 'wrong-password' }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: 'seccash', password: 'SecCash12345' }).expect(429);
    const locked = (await owner.agent.get('/api/security/locked-users').expect(200)).body as { id: string; username: string }[];
    const u = locked.find((l) => l.username === 'seccash')!;
    expect(u).toBeDefined();
    const failed = await owner.agent.get('/api/security/login-attempts').query({ result: 'failed', search: 'seccash' }).expect(200);
    expect(failed.body.data.length).toBeGreaterThanOrEqual(3);
    expect(failed.body.data.every((a: { success: boolean }) => !a.success)).toBe(true);
    await cashier.agent.post(`/api/security/users/${u.id}/unlock`).set('X-CSRF-Token', cashier.csrf).expect(403);
    await owner.agent.post(`/api/security/users/${u.id}/unlock`).set('X-CSRF-Token', owner.csrf).expect(200);
    cashier = await login(app, 'seccash', 'SecCash12345');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_UNLOCKED', recordId: u.id } });
    expect(audit).not.toBeNull();
  });

  // ------------------------------------------------------------------ backups

  it('backup pages need backup permissions', async () => {
    await cashier.agent.get('/api/backup/overview').expect(403);
    await cashier.agent.post('/api/backup').set('X-CSRF-Token', cashier.csrf).send({}).expect(403);
    const res = await owner.agent.get('/api/backup/overview').expect(200);
    expect(res.body.config).toMatchObject({ autoEnabled: true, dailyTime: '23:00', keepAutomatic: 14 });
    expect(res.body.tool.pgDump).toMatch(/pg_dump/);
    expect(res.body.key.fingerprint).toHaveLength(16);
    expect(res.body.lastBackup).toBeNull();
  });

  it('makes an encrypted, verified backup', async () => {
    const res = await owner.agent.post('/api/backup').set('X-CSRF-Token', owner.csrf).send({ note: 'e2e backup' }).expect(201);
    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.note).toBe('e2e backup');
    expect(res.body.sizeBytes).toBeGreaterThan(1000);
    backupId = res.body.id;
    backupFile = join(process.env.BACKUP_DIR!, res.body.fileName);
    const bytes = readFileSync(backupFile);
    expect(bytes.subarray(0, 8).toString()).toBe('AZBKUP01');
    expect(bytes.includes(Buffer.from('PGDMP'))).toBe(false); // not a readable pg_dump archive
    expect(bytes.includes(Buffer.from('owner@test.local'))).toBe(false);
    const manifest = JSON.parse(readFileSync(`${backupFile}.json`, 'utf8'));
    expect(manifest).toMatchObject({ app: 'AMIR ZAMEER ERP', id: backupId, type: 'MANUAL' });
    expect(manifest.counts.users).toBeGreaterThanOrEqual(3);
    expect(await prisma.auditLog.findFirst({ where: { action: 'BACKUP_CREATED', recordId: backupId } })).not.toBeNull();
  });

  it('lists, downloads and verifies the backup', async () => {
    const list = await owner.agent.get('/api/backup').expect(200);
    expect(list.body.data[0]).toMatchObject({ id: backupId, fileExists: true, encrypted: true });
    const dl = await owner.agent.get(`/api/backup/${backupId}/download`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(dl.headers['content-disposition']).toContain('.azbak');
    expect((dl.body as Buffer).equals(readFileSync(backupFile))).toBe(true);
    await cashier.agent.get(`/api/backup/${backupId}/download`).expect(403);
    const v = await owner.agent.post(`/api/backup/${backupId}/verify`).set('X-CSRF-Token', owner.csrf).expect(200);
    expect(v.body.status).toBe('VERIFIED');
  });

  it('restore test restores into a temporary database and compares row counts', async () => {
    const res = await owner.agent.post(`/api/backup/${backupId}/restore-test`).set('X-CSRF-Token', owner.csrf).expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tables).toBeGreaterThan(50);
    expect(res.body.counts.users).toBe(res.body.expected.users);
    const dbs = await prisma.$queryRawUnsafe<{ datname: string }[]>("SELECT datname FROM pg_database WHERE datname LIKE '%restore_check%'");
    expect(dbs).toEqual([]);
  });

  it('only the Owner can restore, with password and RESTORE', async () => {
    await admin.agent.post(`/api/backup/${backupId}/restore`).set('X-CSRF-Token', admin.csrf).send({ password: 'SecAdmin12345', confirm: 'RESTORE' }).expect(403);
    await owner.agent.post(`/api/backup/${backupId}/restore`).set('X-CSRF-Token', owner.csrf).send({ password: 'OwnerPass123', confirm: 'yes' }).expect(400);
    await owner.agent.post(`/api/backup/${backupId}/restore`).set('X-CSRF-Token', owner.csrf).send({ password: 'wrong', confirm: 'RESTORE' }).expect(400);
  });

  it('restores the database exactly as it was (all or nothing) after a safety backup', async () => {
    const before = await prisma.customer.count();
    await owner.agent.post('/api/customers').set('X-CSRF-Token', owner.csrf).send({ name: 'Made After Backup', mobile: '03217776655' }).expect(201);
    expect(await prisma.customer.count()).toBe(before + 1);

    const res = await owner.agent.post(`/api/backup/${backupId}/restore`).set('X-CSRF-Token', owner.csrf)
      .send({ password: 'OwnerPass123', confirm: 'RESTORE' }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.safetyBackup).toMatch(/\.azbak$/);

    expect(await prisma.customer.count()).toBe(before);
    expect(await prisma.customer.findFirst({ where: { name: 'Made After Backup' } })).toBeNull();
    // Database rules (triggers) still work after the restore.
    await expect(prisma.$executeRawUnsafe('DELETE FROM audit_logs')).rejects.toThrow();

    // The backups list knows both files, including the safety backup made just before.
    const list = (await prisma.backupRecord.findMany()).map((r) => r.fileName);
    expect(list).toEqual(expect.arrayContaining([res.body.safetyBackup, backupFile.split(/[\\/]/).pop()]));
    expect(await prisma.auditLog.findFirst({ where: { action: 'BACKUP_RESTORED' } })).not.toBeNull();
    // The safety backup still holds the customer that the restore removed.
    expect(existsSync(join(process.env.BACKUP_DIR!, res.body.safetyBackup))).toBe(true);
  });

  it('settings are validated, saved and audited', async () => {
    owner = await login(app, 'owner', 'OwnerPass123');
    await owner.agent.put('/api/backup/settings').set('X-CSRF-Token', owner.csrf).send({ dailyTime: '25:00' }).expect(400);
    await owner.agent.put('/api/backup/settings').set('X-CSRF-Token', owner.csrf).send({ copyFolder: 'relative/folder' }).expect(400);
    const copy = join(dir, 'second-copy');
    const res = await owner.agent.put('/api/backup/settings').set('X-CSRF-Token', owner.csrf)
      .send({ dailyTime: '22:30', keepAutomatic: 3, copyFolder: copy }).expect(200);
    expect(res.body).toMatchObject({ dailyTime: '22:30', keepAutomatic: 3, copyFolder: copy });
    const made = await owner.agent.post('/api/backup').set('X-CSRF-Token', owner.csrf).send({}).expect(201);
    expect(made.body.externalPath).toBe(join(copy, made.body.fileName));
    expect(existsSync(made.body.externalPath)).toBe(true);
  });

  it('the Owner downloads the recovery key with the password', async () => {
    await admin.agent.post('/api/backup/recovery-key').set('X-CSRF-Token', admin.csrf).send({ password: 'SecAdmin12345' }).expect(403);
    await owner.agent.post('/api/backup/recovery-key').set('X-CSRF-Token', owner.csrf).send({ password: 'nope' }).expect(400);
    const res = await owner.agent.post('/api/backup/recovery-key').set('X-CSRF-Token', owner.csrf).send({ password: 'OwnerPass123' }).expect(200);
    const key = readFileSync(process.env.BACKUP_KEY_FILE!, 'utf8').trim();
    expect(res.text).toContain(key);
    expect(res.text).toContain('Brandistan');
    const overview = await owner.agent.get('/api/backup/overview').expect(200);
    expect(overview.body.key.savedAt).not.toBeNull();
  });

  it('the daily automatic backup runs once per day and old ones are pruned', async () => {
    const svc = app.get((await import('../src/modules/backup/backup.service')).BackupService);
    await prisma.systemSetting.update({ where: { key: 'backup.config' }, data: { value: { autoEnabled: true, dailyTime: '01:00', keepAutomatic: 3, copyFolder: '', verifyAfterBackup: false } } });
    // Each loop is "one day later": earlier automatic backups move one day back, then the tick runs.
    for (let n = 1; n <= 5; n++) {
      await prisma.$executeRawUnsafe(`UPDATE backup_records SET "startedAt" = "startedAt" - interval '1 day' WHERE type = 'AUTOMATIC'`);
      expect(await svc.tick()).toBe('ran');
      expect(await svc.tick()).toBe('skipped'); // only once per day
    }
    expect(await prisma.backupRecord.count({ where: { type: 'AUTOMATIC' } })).toBe(3);
  });

  it('manual backups can be deleted, and the folder scan finds copied backups', async () => {
    const r = await prisma.backupRecord.findFirstOrThrow({ where: { type: 'MANUAL', status: 'VERIFIED' }, orderBy: { startedAt: 'desc' } });
    await cashier.agent.delete(`/api/backup/${r.id}`).set('X-CSRF-Token', cashier.csrf).expect(403);
    // Forget one backup in the database only: the scan adds it back from its file.
    const other = await prisma.backupRecord.findFirstOrThrow({ where: { id: { not: r.id }, type: 'MANUAL' } });
    await prisma.backupRecord.delete({ where: { id: other.id } });
    const scan = await owner.agent.post('/api/backup/scan').set('X-CSRF-Token', owner.csrf).expect(200);
    expect(scan.body.added).toBe(1);
    await owner.agent.delete(`/api/backup/${r.id}`).set('X-CSRF-Token', owner.csrf).expect(200);
    expect(existsSync(join(process.env.BACKUP_DIR!, r.fileName))).toBe(false);
    expect(await prisma.backupRecord.findUnique({ where: { id: r.id } })).toBeNull();
  });
});
