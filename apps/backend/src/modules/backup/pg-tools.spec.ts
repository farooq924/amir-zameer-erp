import { parseDatabaseUrl, withDatabase } from './pg-tools';

describe('parseDatabaseUrl', () => {
  it('removes the password and Prisma-only options', () => {
    const c = parseDatabaseUrl('postgresql://postgres:p%40ss%3Aword@localhost:5432/amir_zameer_erp?schema=public&connection_limit=10');
    expect(c.password).toBe('p@ss:word');
    expect(c.database).toBe('amir_zameer_erp');
    expect(c.uri).toBe('postgresql://postgres@localhost:5432/amir_zameer_erp');
    expect(c.uri).not.toContain('connection_limit');
  });
  it('keeps sslmode and switches database', () => {
    const c = parseDatabaseUrl('postgres://u:p@db.example.com:6543/erp?sslmode=require');
    expect(c.uri).toBe('postgresql://u@db.example.com:6543/erp?sslmode=require');
    expect(withDatabase(c, 'erp_restore_check').uri).toBe('postgresql://u@db.example.com:6543/erp_restore_check?sslmode=require');
  });
});
