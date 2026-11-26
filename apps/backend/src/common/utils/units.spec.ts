import { normalizePhone, formatPhone, whatsappLink } from '@az/shared';
import { convertMeasurement } from './units';

describe('convertMeasurement', () => {
  it('converts inches to cm and back exactly to 2 dp', () => {
    expect(convertMeasurement('40', 'INCH', 'CM').toFixed(2)).toBe('101.60');
    expect(convertMeasurement('101.60', 'CM', 'INCH').toFixed(2)).toBe('40.00');
    expect(convertMeasurement('15.25', 'INCH', 'CM').toFixed(2)).toBe('38.74');
    expect(convertMeasurement('38.5', 'CM', 'CM').toFixed(2)).toBe('38.50');
  });
});

describe('Pakistani phone normalisation', () => {
  it.each([
    ['0300-1234567', '923001234567'],
    ['+92 300 1234567', '923001234567'],
    ['923001234567', '923001234567'],
    ['3001234567', '923001234567'],
    ['0092 321 7654321', '923217654321'],
    ['042-35761234', '04235761234'],
    ['+971 50 123 4567', '971501234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it('rejects junk', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
  it('formats for display and WhatsApp', () => {
    expect(formatPhone('923001234567')).toBe('0300-1234567');
    expect(whatsappLink('923001234567', 'Hi')).toBe('https://wa.me/923001234567?text=Hi');
  });
});
