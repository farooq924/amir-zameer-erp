import { describe, expect, it } from 'vitest';
import { salaryText, shiftMonth } from './shared';

describe('HR helpers', () => {
  it('shows salary in plain words', () => {
    const base = { monthlySalary: '30000.00', dailyWage: '1500.00', perPieceRate: '600.00' };
    expect(salaryText({ ...base, salaryType: 'MONTHLY' })).toBe('Rs 30,000 / month');
    expect(salaryText({ ...base, salaryType: 'DAILY' })).toBe('Rs 1,500 / day');
    expect(salaryText({ ...base, salaryType: 'PER_PIECE' })).toBe('Rs 600 / piece');
    expect(salaryText({ ...base, salaryType: 'FIXED_PLUS_INCENTIVE' })).toBe('Rs 30,000 / month + Rs 600 / piece');
    expect(salaryText(null)).toBe('No salary set');
  });
  it('moves months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
