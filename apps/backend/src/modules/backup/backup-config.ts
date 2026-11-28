import { z } from 'zod';
import { PKT_OFFSET_MINUTES } from '../../common/utils/date-range';

export const BACKUP_CONFIG_KEY = 'backup.config';

export const BackupConfigSchema = z.object({
  /** Daily automatic backup on/off. */
  autoEnabled: z.boolean(),
  /** Karachi time of the daily backup, HH:MM (24 hour). */
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, for example 23:00'),
  /** How many automatic backups to keep (older ones are deleted). Manual backups are kept until deleted. */
  keepAutomatic: z.number().int().min(3).max(365),
  /** Optional second folder (USB drive, Google Drive / OneDrive folder) that receives a copy of every backup. */
  copyFolder: z.string().trim().max(400),
  /** Check every new backup by decrypting it and reading its table list. */
  verifyAfterBackup: z.boolean(),
});
export type BackupConfig = z.infer<typeof BackupConfigSchema>;

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  autoEnabled: true,
  dailyTime: '23:00',
  keepAutomatic: 14,
  copyFolder: '',
  verifyAfterBackup: true,
};

/** The most recent moment (UTC) the daily backup was due, at or before `now`. */
export function lastScheduledSlot(dailyTime: string, now: Date = new Date()): Date {
  const [h, m] = dailyTime.split(':').map(Number);
  const local = new Date(now.getTime() + PKT_OFFSET_MINUTES * 60_000); // Karachi wall clock in UTC fields
  const slotLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m);
  let slot = slotLocal - PKT_OFFSET_MINUTES * 60_000;
  if (slot > now.getTime()) slot -= 24 * 3600_000;
  return new Date(slot);
}

export function nextScheduledSlot(dailyTime: string, now: Date = new Date()): Date {
  return new Date(lastScheduledSlot(dailyTime, now).getTime() + 24 * 3600_000);
}
