import { BackupConfigSchema, DEFAULT_BACKUP_CONFIG, lastScheduledSlot, nextScheduledSlot } from './backup-config';

describe('backup schedule (Karachi time)', () => {
  it('uses today when the time has passed', () => {
    // 2026-11-28 23:30 Karachi = 18:30 UTC
    const now = new Date('2026-11-28T18:30:00Z');
    expect(lastScheduledSlot('23:00', now).toISOString()).toBe('2026-11-28T18:00:00.000Z');
    expect(nextScheduledSlot('23:00', now).toISOString()).toBe('2026-11-29T18:00:00.000Z');
  });
  it('uses yesterday when the time has not come yet', () => {
    // 2026-11-28 10:00 Karachi = 05:00 UTC
    const now = new Date('2026-11-28T05:00:00Z');
    expect(lastScheduledSlot('23:00', now).toISOString()).toBe('2026-11-27T18:00:00.000Z');
  });
  it('handles an early morning time across the UTC date line', () => {
    // 2026-11-28 02:00 Karachi = 2026-11-27 21:00 UTC, backup at 01:30 Karachi
    const now = new Date('2026-11-27T21:00:00Z');
    expect(lastScheduledSlot('01:30', now).toISOString()).toBe('2026-11-27T20:30:00.000Z');
  });
  it('validates settings', () => {
    expect(BackupConfigSchema.safeParse(DEFAULT_BACKUP_CONFIG).success).toBe(true);
    expect(BackupConfigSchema.safeParse({ ...DEFAULT_BACKUP_CONFIG, dailyTime: '25:00' }).success).toBe(false);
    expect(BackupConfigSchema.safeParse({ ...DEFAULT_BACKUP_CONFIG, keepAutomatic: 1 }).success).toBe(false);
  });
});
