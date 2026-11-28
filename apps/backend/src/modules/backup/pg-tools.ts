import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export interface PgConnection {
  /** Connection string without the password (passed to pg_dump/pg_restore via --dbname). */
  uri: string;
  password: string | null;
  database: string;
  host: string;
  port: string;
  user: string;
}

/** Turns Prisma's DATABASE_URL into something pg_dump understands (drops Prisma-only options like connection_limit). */
export function parseDatabaseUrl(databaseUrl: string): PgConnection {
  const u = new URL(databaseUrl);
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL has no database name.');
  const user = decodeURIComponent(u.username);
  const host = u.hostname || 'localhost';
  const port = u.port || '5432';
  const clean = new URL(`postgresql://${host}:${port}/`);
  clean.pathname = `/${encodeURIComponent(database)}`;
  if (user) clean.username = encodeURIComponent(user);
  const sslmode = u.searchParams.get('sslmode');
  if (sslmode) clean.searchParams.set('sslmode', sslmode);
  return { uri: clean.toString(), password: u.password ? decodeURIComponent(u.password) : null, database, host, port, user };
}

/** Same server, other database (used for the restore test database). */
export function withDatabase(conn: PgConnection, database: string): PgConnection {
  const u = new URL(conn.uri);
  u.pathname = `/${encodeURIComponent(database)}`;
  return { ...conn, uri: u.toString(), database };
}

const isWindows = process.platform === 'win32';

/** Finds pg_dump / pg_restore: PG_BIN_DIR, then the newest PostgreSQL in Program Files (Windows), then PATH. */
export function findPgTool(tool: 'pg_dump' | 'pg_restore'): string {
  const exe = isWindows ? `${tool}.exe` : tool;
  const configured = process.env.PG_BIN_DIR?.trim();
  if (configured) {
    const p = join(configured, exe);
    if (existsSync(p)) return p;
  }
  if (isWindows) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (!base) continue;
      const root = join(base, 'PostgreSQL');
      if (!existsSync(root)) continue;
      const versions = readdirSync(root).filter((v) => /^\d+(\.\d+)?$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of versions) {
        const p = join(root, v, 'bin', exe);
        if (existsSync(p)) return p;
      }
    }
  } else {
    // Debian/Ubuntu keep every installed version here; take the newest.
    const root = '/usr/lib/postgresql';
    if (existsSync(root)) {
      const versions = readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of versions) {
        const p = join(root, v, 'bin', exe);
        if (existsSync(p)) return p;
      }
    }
  }
  return exe; // rely on PATH
}

export function pgEnv(conn: PgConnection): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PGCONNECT_TIMEOUT: '15' };
  if (conn.password !== null) env.PGPASSWORD = conn.password;
  return env;
}

/** Runs a tool and returns its output; rejects with the tool's error text. */
export function runTool(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (e) => reject(toolMissing(cmd, e)));
    child.on('close', (code) => (code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(lastLines(stderr) || `${cmd} exited with code ${code}`))));
  });
}

export function toolMissing(cmd: string, e: Error & { code?: string }): Error {
  if (e.code === 'ENOENT') {
    return new Error(`${cmd} was not found. Install PostgreSQL tools or set PG_BIN_DIR in apps/backend/.env (for example C:\\Program Files\\PostgreSQL\\18\\bin).`);
  }
  return e;
}

export function lastLines(text: string, n = 6): string {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-n).join('\n').slice(0, 1500);
}
