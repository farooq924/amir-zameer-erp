export interface BackupConfig {
  autoEnabled: boolean;
  dailyTime: string;
  keepAutomatic: number;
  copyFolder: string;
  verifyAfterBackup: boolean;
}

export interface BackupRow {
  id: string;
  fileName: string;
  type: 'AUTOMATIC' | 'MANUAL';
  status: 'RUNNING' | 'COMPLETED' | 'VERIFIED' | 'FAILED' | 'RESTORED';
  note: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  encrypted: boolean;
  externalPath: string | null;
  verifiedAt: string | null;
  restoredAt: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: string | null;
  fileExists: boolean;
  appVersion: string | null;
  restoreTest: { at: string; ok: boolean; message: string } | null;
}

export interface BackupOverview {
  config: BackupConfig;
  folder: string;
  key: { fingerprint: string; source: 'env' | 'file' | 'missing'; file: string | null; error: string | null; savedAt: string | null };
  tool: { pgDump: string | null; error: string | null };
  running: string | null;
  lastBackup: BackupRow | null;
  lastAttempt: BackupRow | null;
  lastBackupAgeHours: number | null;
  nextAutomaticAt: string | null;
  goodBackups: number;
  totalSizeBytes: number;
  failedLast24h: number;
  lastAutoError: string | null;
}

export interface RestoreTestResult {
  ok: boolean;
  message: string;
  tables: number;
  counts: Record<string, number>;
  expected: Record<string, number> | null;
  durationMs: number;
}

export interface SecurityCheck {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'bad';
  detail: string;
  link?: string;
}

export interface SecurityOverview {
  score: number;
  checks: SecurityCheck[];
  stats: { activeSessions: number; failedLogins24h: number; successfulLogins24h: number; lockedUsers: number };
  topFailedIps: { ipAddress: string | null; count: number }[];
  canManage: boolean;
}

export interface SessionRow {
  id: string;
  user: { id: string; fullName: string; username: string; isActive: boolean };
  device: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface LoginAttemptRow {
  id: string;
  identifier: string;
  ipAddress: string | null;
  success: boolean;
  reason: string | null;
  createdAt: string;
}

export interface LockedUser {
  id: string;
  fullName: string;
  username: string;
  lockedUntil: string;
}
