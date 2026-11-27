import { advanceInstalment, calculatePayroll, employedDays } from './payroll-calc';

const base = { daysInMonth: 30, employedDays: 30, present: 0, halfDays: 0, absent: 0, pieces: 0, pieceAmount: 0, overtimeAmount: 0, advanceDue: 0, monthlySalary: 0, dailyWage: 0 };

describe('payroll maths', () => {
  it('monthly salary with absent and half days deducted', () => {
    const r = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '30000', present: 26, halfDays: 2, absent: 2 });
    expect(r.basicAmount.toFixed(2)).toBe('30000.00');
    expect(r.absentDays.toString()).toBe('3');
    expect(r.absenceDeduction.toFixed(2)).toBe('3000.00');
    expect(r.netAmount.toFixed(2)).toBe('27000.00');
  });

  it('pro-rates a monthly salary for a mid-month joiner', () => {
    const r = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '31000', daysInMonth: 31, employedDays: 10 });
    expect(r.basicAmount.toFixed(2)).toBe('10000.00');
  });

  it('daily wage pays present days and half of half days', () => {
    const r = calculatePayroll({ ...base, salaryType: 'DAILY', dailyWage: '1500', present: 20, halfDays: 1, absent: 5 });
    expect(r.basicAmount.toFixed(2)).toBe('30750.00');
    expect(r.absenceDeduction.toFixed(2)).toBe('0.00');
  });

  it('per piece pays production only; fixed + incentive adds both', () => {
    const p = calculatePayroll({ ...base, salaryType: 'PER_PIECE', monthlySalary: '20000', pieces: 40, pieceAmount: '24000' });
    expect(p.grossAmount.toFixed(2)).toBe('24000.00');
    expect(p.completedPieces).toBe(40);
    const f = calculatePayroll({ ...base, salaryType: 'FIXED_PLUS_INCENTIVE', monthlySalary: '15000', pieces: 10, pieceAmount: '2500' });
    expect(f.grossAmount.toFixed(2)).toBe('17500.00');
    const m = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '15000', pieces: 10, pieceAmount: '2500' });
    expect(m.grossAmount.toFixed(2)).toBe('15000.00');
  });

  it('adds overtime, bonus and incentives; subtracts other deductions and advance', () => {
    const r = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '20000', overtimeAmount: '1200', advanceDue: '3000', manual: { bonus: '500', incentives: '300', otherDeductions: '200' } });
    expect(r.grossAmount.toFixed(2)).toBe('22000.00');
    expect(r.netAmount.toFixed(2)).toBe('18800.00');
  });

  it('never takes more advance than is due, or more than the salary left', () => {
    const r = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '10000', advanceDue: '25000' });
    expect(r.advanceDeduction.toFixed(2)).toBe('10000.00');
    expect(r.netAmount.toFixed(2)).toBe('0.00');
    const manualHigh = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '10000', advanceDue: '2000', manual: { advanceDeduction: '5000' } });
    expect(manualHigh.advanceDeduction.toFixed(2)).toBe('2000.00');
    const manualLow = calculatePayroll({ ...base, salaryType: 'MONTHLY', monthlySalary: '10000', advanceDue: '2000', manual: { advanceDeduction: '500' } });
    expect(manualLow.advanceDeduction.toFixed(2)).toBe('500.00');
  });

  it('counts employed days inside the month', () => {
    expect(employedDays('2026-11-01', '2026-11-30', '2026-01-01', null)).toBe(30);
    expect(employedDays('2026-11-01', '2026-11-30', '2026-11-21', null)).toBe(10);
    expect(employedDays('2026-11-01', '2026-11-30', '2026-10-01', '2026-11-05')).toBe(5);
    expect(employedDays('2026-11-01', '2026-11-30', '2026-12-01', null)).toBe(0);
  });

  it('advance instalment is capped at the balance', () => {
    expect(advanceInstalment('1500', '2000').toFixed(2)).toBe('1500.00');
    expect(advanceInstalment('5000', '2000').toFixed(2)).toBe('2000.00');
    expect(advanceInstalment('5000', '0').toFixed(2)).toBe('5000.00');
  });
});
