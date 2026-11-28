import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['true', '1', 'yes'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().positive().default(120),
  COOKIE_SECURE: bool.default(false),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().positive().default(15),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  SWAGGER_ENABLED: bool.optional(),
  TRUST_PROXY: bool.default(false),
  /** Folder of the built web app served on the API port. Default: apps/frontend/dist. */
  FRONTEND_DIST: z.string().optional(),
  /** Phase 10 backups. Folder for .azbak files (default: <project>/backups). */
  BACKUP_DIR: z.string().optional(),
  /** Encryption key for backups (min 16 characters). When empty, a key file is created (BACKUP_KEY_FILE, default apps/backend/backup.key). */
  BACKUP_ENCRYPTION_KEY: z.string().optional(),
  BACKUP_KEY_FILE: z.string().optional(),
  /** Folder with pg_dump / pg_restore, e.g. C:\Program Files\PostgreSQL\18\bin. Found automatically when empty. */
  PG_BIN_DIR: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

/** Validates process.env once. Fails fast at startup with a readable message. */
export function env(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached environment. */
export function resetEnvCache(): void {
  cached = null;
}
