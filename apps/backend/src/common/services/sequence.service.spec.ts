import { formatSequence } from './sequence.service';

describe('formatSequence', () => {
  it('formats yearly order numbers', () => {
    expect(formatSequence('AZ', '2026', 1, 5)).toBe('AZ-2026-00001');
    expect(formatSequence('AZ', '2026', 123456, 5)).toBe('AZ-2026-123456');
  });
  it('formats global numbers', () => {
    expect(formatSequence('AZC', '', 7, 5)).toBe('AZC-00007');
  });
});
