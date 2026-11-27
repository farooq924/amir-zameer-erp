import { cashAccount, cr, dr, normaliseLines } from './posting.service';
import { nextDate } from '../expenses/expenses.service';

describe('posting helpers', () => {
  it('maps payment methods to cash, bank and wallet accounts', () => {
    expect(cashAccount('CASH')).toBe('1000');
    expect(cashAccount('BANK_TRANSFER')).toBe('1010');
    expect(cashAccount('CARD')).toBe('1010');
    expect(cashAccount('CHEQUE')).toBe('1010');
    expect(cashAccount('MOBILE_WALLET')).toBe('1020');
    expect(cashAccount('OTHER')).toBe('1000');
  });

  it('drops zero lines and flips negative amounts to the other side', () => {
    const lines = normaliseLines([dr('5100', '-500'), cr('2100', 0), dr('1000', '100.005')]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ code: '5100' });
    expect(lines[0].credit.toFixed(2)).toBe('500.00');
    expect(lines[0].debit.toFixed(2)).toBe('0.00');
    expect(lines[1].debit.toFixed(2)).toBe('100.01');
  });
});

describe('recurring expense dates', () => {
  it('keeps the day of month and clamps short months', () => {
    expect(nextDate('2026-01-31', 'MONTHLY', 31)).toBe('2026-02-28');
    expect(nextDate('2026-02-28', 'MONTHLY', 31)).toBe('2026-03-31');
    expect(nextDate('2028-01-31', 'MONTHLY', 31)).toBe('2028-02-29');
    expect(nextDate('2026-11-30', 'QUARTERLY', 30)).toBe('2027-02-28');
    expect(nextDate('2026-12-15', 'YEARLY', 15)).toBe('2027-12-15');
    expect(nextDate('2026-12-29', 'WEEKLY')).toBe('2027-01-05');
  });
});
