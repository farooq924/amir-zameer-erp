import { karachiToday, resolveDateRange } from './date-range';

// 2026-11-26 03:30 UTC = 2026-11-26 08:30 PKT (a Thursday)
const NOW = new Date('2026-11-26T03:30:00Z');

describe('resolveDateRange (Asia/Karachi)', () => {
  it('today uses Karachi calendar date and UTC instants', () => {
    const r = resolveDateRange('today', undefined, undefined, NOW);
    expect(r.fromDate).toBe('2026-11-26');
    expect(r.toDate).toBe('2026-11-26');
    expect(r.start.toISOString()).toBe('2026-11-25T19:00:00.000Z');
    expect(r.endExclusive.toISOString()).toBe('2026-11-26T19:00:00.000Z');
  });

  it('handles the UTC/PKT day boundary', () => {
    // 20:00 UTC on 25th is already 01:00 on the 26th in Karachi
    expect(karachiToday(new Date('2026-11-25T20:00:00Z'))).toBe('2026-11-26');
    expect(karachiToday(new Date('2026-11-25T18:59:59Z'))).toBe('2026-11-25');
  });

  it('yesterday', () => {
    const r = resolveDateRange('yesterday', undefined, undefined, NOW);
    expect([r.fromDate, r.toDate]).toEqual(['2026-11-25', '2026-11-25']);
  });

  it('weeks start on Monday', () => {
    expect(resolveDateRange('this_week', undefined, undefined, NOW)).toMatchObject({ fromDate: '2026-11-23', toDate: '2026-11-29' });
    expect(resolveDateRange('last_week', undefined, undefined, NOW)).toMatchObject({ fromDate: '2026-11-16', toDate: '2026-11-22' });
  });

  it('months, quarter and year', () => {
    expect(resolveDateRange('this_month', undefined, undefined, NOW)).toMatchObject({ fromDate: '2026-11-01', toDate: '2026-11-30' });
    expect(resolveDateRange('last_month', undefined, undefined, NOW)).toMatchObject({ fromDate: '2026-10-01', toDate: '2026-10-31' });
    expect(resolveDateRange('this_quarter', undefined, undefined, NOW)).toMatchObject({ fromDate: '2026-10-01', toDate: '2026-12-31' });
    expect(resolveDateRange('this_year', undefined, undefined, NOW)).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-12-31' });
  });

  it('last month across a year boundary', () => {
    const jan = new Date('2027-01-10T10:00:00Z');
    expect(resolveDateRange('last_month', undefined, undefined, jan)).toMatchObject({ fromDate: '2026-12-01', toDate: '2026-12-31' });
  });

  it('leap year February', () => {
    const mar = new Date('2028-03-05T10:00:00Z');
    expect(resolveDateRange('last_month', undefined, undefined, mar)).toMatchObject({ fromDate: '2028-02-01', toDate: '2028-02-29' });
  });

  it('custom range validation', () => {
    expect(resolveDateRange('custom', '2026-01-05', '2026-02-10')).toMatchObject({ fromDate: '2026-01-05', toDate: '2026-02-10' });
    expect(() => resolveDateRange('custom', '2026-02-10', '2026-01-05')).toThrow(RangeError);
    expect(() => resolveDateRange('custom', '2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => resolveDateRange('custom')).toThrow(RangeError);
  });
});
