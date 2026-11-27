import { Prisma } from '@prisma/client';
import { CM_PER_INCH } from '@az/shared';

export type Unit = 'INCH' | 'CM';

/** Decimal-safe conversion rounded to 2 dp (measurement precision). */
export function convertMeasurement(value: Prisma.Decimal | string | number, from: Unit, to: Unit): Prisma.Decimal {
  const v = new Prisma.Decimal(value);
  if (from === to) return v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const r = from === 'INCH' ? v.times(CM_PER_INCH) : v.dividedBy(CM_PER_INCH);
  return r.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Largest believable body measurement, used for input validation. */
export const MAX_MEASUREMENT: Record<Unit, number> = { INCH: 150, CM: 381 };
