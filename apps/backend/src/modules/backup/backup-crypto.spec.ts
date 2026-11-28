import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { BACKUP_MAGIC, createDecryptStream, createEncryptStream, keyFingerprint } from './backup-crypto';

async function collect(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(c as Buffer);
  return Buffer.concat(parts);
}

describe('backup encryption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'az-bk-'));
  const secret = 'test-secret-key-1234567890';
  const plain = Buffer.from('PGDMP'.repeat(5000) + ' customer Ali Raza 0300-1234567');
  const file = join(dir, 'a.azbak');

  beforeAll(async () => {
    await pipeline(Readable.from([plain.subarray(0, 1000), plain.subarray(1000)]), createEncryptStream(secret), createWriteStream(file));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('writes no readable data', () => {
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 8).equals(BACKUP_MAGIC)).toBe(true);
    expect(bytes.includes(Buffer.from('PGDMP'))).toBe(false);
    expect(bytes.includes(Buffer.from('Ali Raza'))).toBe(false);
  });

  it('decrypts back to the same bytes', async () => {
    expect((await collect(createDecryptStream(file, secret))).equals(plain)).toBe(true);
  });

  it('fails with a wrong key', async () => {
    await expect(collect(createDecryptStream(file, 'another-secret-key-000000'))).rejects.toThrow(/different encryption key/);
  });

  it('fails when one byte was changed', async () => {
    const bytes = readFileSync(file);
    bytes[200] ^= 0xff;
    const bad = join(dir, 'bad.azbak');
    writeFileSync(bad, bytes);
    await expect(collect(createDecryptStream(bad, secret))).rejects.toThrow(/damaged/);
  });

  it('rejects files that are not backups', async () => {
    const other = join(dir, 'x.azbak');
    writeFileSync(other, Buffer.alloc(100, 1));
    expect(() => createDecryptStream(other, secret)).toThrow(/not an AMIR ZAMEER/);
  });

  it('fingerprint is stable and does not reveal the key', () => {
    expect(keyFingerprint(secret)).toBe(keyFingerprint(secret));
    expect(keyFingerprint(secret)).toHaveLength(16);
    expect(keyFingerprint(secret)).not.toContain(secret.slice(0, 6));
  });
});
