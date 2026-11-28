import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { keyFingerprint } from './backup-crypto';

/** apps/backend (works from src/ under ts-node/jest and from dist/ in production). */
export const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');

export function backupDir(): string {
  return resolve(process.env.BACKUP_DIR || resolve(BACKEND_ROOT, '..', '..', 'backups'));
}

export function backupKeyFile(): string {
  return resolve(process.env.BACKUP_KEY_FILE || resolve(BACKEND_ROOT, 'backup.key'));
}

export interface BackupKey {
  secret: string;
  fingerprint: string;
  /** env = BACKUP_ENCRYPTION_KEY in .env; file = key file created by the ERP. */
  source: 'env' | 'file';
  file: string | null;
  createdNow: boolean;
}

/**
 * The encryption key for backups. Uses BACKUP_ENCRYPTION_KEY when set; otherwise a random key is created once
 * in apps/backend/backup.key (outside the backups folder, so a copied backups folder cannot be opened on its own).
 */
export function resolveBackupKey(): BackupKey {
  const fromEnv = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (fromEnv) {
    if (fromEnv.length < 16) throw new Error('BACKUP_ENCRYPTION_KEY must be at least 16 characters long.');
    return { secret: fromEnv, fingerprint: keyFingerprint(fromEnv), source: 'env', file: null, createdNow: false };
  }
  const file = backupKeyFile();
  let createdNow = false;
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${randomBytes(32).toString('base64url')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    createdNow = true;
  }
  const secret = readFileSync(file, 'utf8').trim();
  if (secret.length < 16) throw new Error(`The backup key file ${file} is empty or damaged.`);
  return { secret, fingerprint: keyFingerprint(secret), source: 'file', file, createdNow };
}
