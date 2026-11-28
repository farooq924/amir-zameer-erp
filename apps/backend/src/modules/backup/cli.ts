/* eslint-disable no-console */
import 'reflect-metadata';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';

// Load apps/backend/.env like the server does. Real environment variables always win.
const envFile = resolve(__dirname, '..', '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

import { PrismaClient } from '@prisma/client';
import { BackupEngine } from './backup-engine';

/**
 * Backup tool (works while the ERP is stopped).
 *   node dist/modules/backup/cli.js create [note]        encrypted backup now (verified)
 *   node dist/modules/backup/cli.js list                 backups in the backups folder
 *   node dist/modules/backup/cli.js test <file>          restore test into a temporary database
 *   node dist/modules/backup/cli.js restore <file>       replace ALL data with the backup (safety backup first)
 *   node dist/modules/backup/cli.js key                  shows the key fingerprint and where the key is
 * <file> is a file name in the backups folder, or a full path to an .azbak file (it is copied into the folder).
 */
async function main(): Promise<void> {
  const [command = 'list', ...rest] = process.argv.slice(2);
  const prisma = new PrismaClient();
  const engine = new BackupEngine(prisma);
  try {
    if (command === 'key') {
      const k = engine.key();
      console.log(`Key fingerprint: ${k.fingerprint}`);
      console.log(k.source === 'env' ? 'Key source: BACKUP_ENCRYPTION_KEY in apps/backend/.env' : `Key file: ${k.file}${k.createdNow ? ' (created now)' : ''}`);
      return;
    }
    if (command === 'create') {
      console.log(`Making an encrypted backup in ${engine.dir} ...`);
      const r = await engine.create({ type: 'MANUAL', note: rest.join(' ') || 'Made with the backup tool', verify: true });
      console.log(`Backup saved and checked: ${r.fileName} (${(Number(r.sizeBytes) / 1048576).toFixed(2)} MB)`);
      return;
    }
    await engine.reconcile();
    if (command === 'list') {
      const rows = await prisma.backupRecord.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
      if (!rows.length) console.log('No backups yet.');
      for (const r of rows) console.log(`${r.startedAt.toISOString().slice(0, 16).replace('T', ' ')}  ${r.status.padEnd(9)} ${r.type.padEnd(9)} ${r.fileName}`);
      return;
    }
    if (command === 'test' || command === 'restore') {
      const record = await findRecord(prisma, engine, rest[0]);
      if (command === 'test') {
        const t = await engine.restoreTest(record);
        console.log(t.message);
        if (!t.ok) process.exitCode = 1;
        return;
      }
      console.log(`Restoring ${record.fileName} ... (a safety backup of the current data is made first)`);
      const res = await engine.restore(record, { allowOtherVersion: true });
      console.log(res.test.message);
      if (res.safetyBackup) console.log(`Safety backup of the data before the restore: ${res.safetyBackup}`);
      console.log('Restore finished.');
      return;
    }
    console.error('Usage: node dist/modules/backup/cli.js create | list | test <file> | restore <file> | key');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function findRecord(prisma: PrismaClient, engine: BackupEngine, arg: string | undefined) {
  if (!arg) throw new Error('Give the backup file name, for example AZ-backup-20261128-230000-auto.azbak');
  let name = basename(arg);
  if (existsSync(arg) && resolve(arg) !== engine.pathOf(name)) {
    const { copyFileSync } = await import('fs');
    copyFileSync(arg, engine.pathOf(name));
    if (existsSync(`${arg}.json`)) copyFileSync(`${arg}.json`, `${engine.pathOf(name)}.json`);
    await engine.reconcile();
    console.log(`Copied ${arg} into the backups folder.`);
  }
  if (!name.endsWith('.azbak')) name += '.azbak';
  const record = await prisma.backupRecord.findFirst({ where: { fileName: name } });
  if (!record) throw new Error(`Backup ${name} was not found in ${engine.dir}`);
  return record;
}

main().catch((err: Error) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
