import { Prisma } from '@prisma/client';
import { dec, money } from '../../common/utils/money';

/**
 * Pure payroll maths (no database). Rules:
 *  - MONTHLY / FIXED_PLUS_INCENTIVE: monthly salary, pro-rated for days employed in the month;
 *    absence deduction = (salary / days in month) x (absent days + half of half days).
 *    Days with no attendance mark are NOT deducted.
 *  - DAILY: daily wage x (present days + half of half days). Leave / holiday / unmarked days are unpaid.
 *  - PER_PIECE: sum of unpaid production amounts.
 *  - FIXED_PLUS_INCENTIVE also adds unpaid production amounts.
 *  - Overtime: approved, unpaid overtime records.
 *  - Advance deduction: monthly instalment of each open advance (or its full balance when no instalment),
 *    never more than what is left after other deductions.
 */
export type SalaryTypeCode = 'MONTHLY' | 'DAILY' | 'PER_PIECE' | 'FIXED_PLUS_INCENTIVE';

export interface PayrollInput {
  salaryType: SalaryTypeCode;
  monthlySalary: Prisma.Decimal.Value;
  dailyWage: Prisma.Decimal.Value;
  daysInMonth: number;
  employedDays: number;
  present: number;
  halfDays: number;
  absent: number;
  pieces: number;
  pieceAmount: Prisma.Decimal.Value;
  overtimeAmount: Prisma.Decimal.Value;
  /** Suggested deduction from open advances, before capping. */
  advanceDue: Prisma.Decimal.Value;
  /** Manual figures kept from the draft (undefined = use the suggestion). */
  manual?: { incentives?: Prisma.Decimal.Value; bonus?: Prisma.Decimal.Value; otherDeductions?: Prisma.Decimal.Value; advanceDeduction?: Prisma.Decimal.Value };
}

export interface PayrollFigures {
  basicAmount: Prisma.Decimal;
  presentDays: Prisma.Decimal;
  absentDays: Prisma.Decimal;
  completedPieces: number;
  pieceAmount: Prisma.Decimal;
  overtimeAmount: Prisma.Decimal;
  incentives: Prisma.Decimal;
  bonus: Prisma.Decimal;
  absenceDeduction: Prisma.Decimal;
  advanceDeduction: Prisma.Decimal;
  otherDeductions: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
}

export function calculatePayroll(i: PayrollInput): PayrollFigures {
  const zero = dec(0);
  const presentDays = dec(i.present).plus(dec(i.halfDays).div(2));
  const absentDays = dec(i.absent).plus(dec(i.halfDays).div(2));
  const usesMonthly = i.salaryType === 'MONTHLY' || i.salaryType === 'FIXED_PLUS_INCENTIVE';
  const usesPieces = i.salaryType === 'PER_PIECE' || i.salaryType === 'FIXED_PLUS_INCENTIVE';

  let basic = zero;
  let absence = zero;
  if (usesMonthly) {
    const perDay = dec(i.monthlySalary).div(i.daysInMonth);
    basic = i.employedDays >= i.daysInMonth ? money(i.monthlySalary) : money(perDay.times(i.employedDays));
    absence = Prisma.Decimal.min(money(perDay.times(absentDays)), basic);
  } else if (i.salaryType === 'DAILY') {
    basic = money(dec(i.dailyWage).times(presentDays));
  }
  const pieceAmount = usesPieces ? money(i.pieceAmount) : zero;
  const overtime = money(i.overtimeAmount);
  const incentives = money(i.manual?.incentives ?? 0);
  const bonus = money(i.manual?.bonus ?? 0);
  const other = money(i.manual?.otherDeductions ?? 0);
  const gross = basic.plus(pieceAmount).plus(overtime).plus(incentives).plus(bonus);
  const room = Prisma.Decimal.max(gross.minus(absence).minus(other), zero);
  const wantedAdvance = i.manual?.advanceDeduction !== undefined ? money(i.manual.advanceDeduction) : money(i.advanceDue);
  const advance = Prisma.Decimal.min(Prisma.Decimal.min(wantedAdvance, money(i.advanceDue)), room);
  const net = gross.minus(absence).minus(other).minus(advance);
  return {
    basicAmount: basic, presentDays, absentDays, completedPieces: usesPieces ? i.pieces : 0, pieceAmount, overtimeAmount: overtime,
    incentives, bonus, absenceDeduction: absence, advanceDeduction: advance, otherDeductions: other, grossAmount: gross, netAmount: net,
  };
}

/** Days of the month the employee was on the payroll (joined / left mid-month). */
export function employedDays(periodStart: string, periodEnd: string, joining: string, leaving: string | null): number {
  const from = joining > periodStart ? joining : periodStart;
  const to = leaving && leaving < periodEnd ? leaving : periodEnd;
  if (to < from) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Suggested advance recovery for one advance. */
export function advanceInstalment(balance: Prisma.Decimal.Value, installment: Prisma.Decimal.Value): Prisma.Decimal {
  const b = dec(balance);
  const inst = dec(installment);
  return inst.gt(0) ? Prisma.Decimal.min(inst, b) : b;
}
