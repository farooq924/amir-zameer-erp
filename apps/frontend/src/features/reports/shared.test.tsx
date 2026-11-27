import type { ReportColumn } from '@az/shared';
import { describe, expect, it } from 'vitest';
import { cellText, isNumeric } from './shared';

const c = (type: ReportColumn['type']): ReportColumn => ({ key: 'x', label: 'X', type });

describe('report cell text', () => {
  it('formats each column type', () => {
    expect(cellText(c('month'), '2026-11')).toBe('Nov 2026');
    expect(cellText(c('percent'), '12.5')).toBe('12.5%');
    expect(cellText(c('number'), 12000)).toBe('12,000');
    expect(cellText(c('text'), 'Kurta')).toBe('Kurta');
    expect(cellText(c('money'), '1500.00')).toMatch(/1,500/);
  });
  it('keeps empty statement cells empty and shows a dash for missing values', () => {
    expect(cellText(c('text'), '')).toBe('');
    expect(cellText(c('text'), null)).toBe('-');
    expect(cellText(c('money'), null)).toBe('');
  });
  it('knows which columns are numeric', () => {
    expect(isNumeric(c('money'))).toBe(true);
    expect(isNumeric(c('status'))).toBe(false);
  });
});
