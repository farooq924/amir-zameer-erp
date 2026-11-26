import { buildQuery } from '@/services/api';
import { formatDate, formatMonth, formatPKR, humanize } from '@/utils/format';

describe('formatting', () => {
  it('formats PKR amounts', () => {
    expect(formatPKR('1250.50')).toBe('Rs 1,250.5');
    expect(formatPKR('0.00')).toBe('Rs 0');
    expect(formatPKR(null)).toBe('Rs 0');
  });
  it('formats Karachi dates', () => {
    expect(formatDate('2026-11-26')).toBe('26 Nov 2026');
    expect(formatDate('2026-11-25T20:00:00Z')).toBe('26 Nov 2026'); // 01:00 PKT next day
    expect(formatMonth('2026-01')).toBe('Jan 26');
  });
  it('humanizes codes', () => {
    expect(humanize('MANAGE_SETTINGS')).toBe('Manage Settings');
  });
  it('builds query strings without empty values', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
  });
});
