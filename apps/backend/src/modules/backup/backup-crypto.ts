import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import { closeSync, openSync, readSync, statSync, createReadStream } from 'fs';
import { Readable, Transform } from 'stream';

/**
 * Encrypted backup file format (".azbak"):
 *   8 bytes  magic "AZBKUP01"
 *   16 bytes scrypt salt
 *   12 bytes AES-GCM IV
 *   ...      AES-256-GCM ciphertext of the pg_dump custom-format archive
 *   16 bytes GCM authentication tag (detects any change to the file or a wrong key)
 */
export const BACKUP_MAGIC = Buffer.from('AZBKUP01', 'ascii');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
export const HEADER_LEN = BACKUP_MAGIC.length + SALT_LEN + IV_LEN;
export const BACKUP_EXTENSION = '.azbak';

export function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
}

/** Short, non-reversible id of a key so a backup can say which key it needs. */
export function keyFingerprint(secret: string): string {
  return createHash('sha256').update(`az-backup-key:${secret}`).digest('hex').slice(0, 16).toUpperCase();
}

/** Transform stream: plain bytes in, encrypted .azbak bytes out. */
export function createEncryptStream(secret: string): Transform {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
  const header = Buffer.concat([BACKUP_MAGIC, salt, iv]);
  let headerSent = false;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (!headerSent) { this.push(header); headerSent = true; }
      cb(null, cipher.update(chunk));
    },
    flush(cb) {
      if (!headerSent) this.push(header);
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      cb();
    },
  });
}

export class BackupFileError extends Error {}

/** Reads and checks the header of an .azbak file. */
export function readBackupHeader(path: string): { salt: Buffer; iv: Buffer; tag: Buffer; size: number } {
  const size = statSync(path).size;
  if (size < HEADER_LEN + TAG_LEN) throw new BackupFileError('This file is too small to be an AMIR ZAMEER backup.');
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(HEADER_LEN);
    readSync(fd, head, 0, HEADER_LEN, 0);
    if (!head.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw new BackupFileError('This file is not an AMIR ZAMEER encrypted backup (.azbak).');
    }
    const tag = Buffer.alloc(TAG_LEN);
    readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
    return {
      salt: head.subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + SALT_LEN),
      iv: head.subarray(BACKUP_MAGIC.length + SALT_LEN),
      tag,
      size,
    };
  } finally {
    closeSync(fd);
  }
}

/**
 * Readable stream of the decrypted archive. The stream errors at the end when the file was changed
 * or the key is wrong (GCM tag check), so consumers must treat the result as valid only after 'end'.
 */
export function createDecryptStream(path: string, secret: string): Readable {
  const { salt, iv, tag, size } = readBackupHeader(path);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  const source = size - TAG_LEN - 1 >= HEADER_LEN
    ? createReadStream(path, { start: HEADER_LEN, end: size - TAG_LEN - 1 })
    : Readable.from([]);
  const out = new Transform({
    transform(chunk: Buffer, _enc, cb) { cb(null, decipher.update(chunk)); },
    flush(cb) {
      try {
        this.push(decipher.final());
        cb();
      } catch {
        cb(new BackupFileError('The backup could not be decrypted: the file is damaged or it was made with a different encryption key.'));
      }
    },
  });
  source.on('error', (e: Error) => out.destroy(e));
  return source.pipe(out);
}
