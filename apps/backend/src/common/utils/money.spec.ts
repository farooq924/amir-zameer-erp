import { money, moneyString, sum } from './money';

describe('money helpers', () => {
  it('avoids floating point errors', () => {
    expect(sum([0.1, 0.2]).toString()).toBe('0.3');
    expect(moneyString(sum(['1999.99', '0.01']))).toBe('2000.00');
  });
  it('rounds half up to 2 dp', () => {
    expect(money('10.005').toFixed(2)).toBe('10.01');
    expect(money('10.004').toFixed(2)).toBe('10.00');
  });
  it('treats null/empty as zero', () => {
    expect(moneyString(null)).toBe('0.00');
    expect(moneyString('')).toBe('0.00');
  });
});
