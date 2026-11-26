import { Prisma } from '@prisma/client';

/** Decimal-safe money helpers. Never use JS floating point for money. */
export type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export function dec(value: DecimalLike): Prisma.Decimal {
  if (value === null || value === undefined || value === '') return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

/** Rounds to 2 decimal places using banker-safe ROUND_HALF_UP (standard for PKR invoices). */
export function money(value: DecimalLike): Prisma.Decimal {
  return dec(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(dec(v)), new Prisma.Decimal(0));
}

/** Serialises a Decimal for JSON responses as a fixed 2-dp string, e.g. "1250.00". */
export function moneyString(value: DecimalLike): string {
  return money(value).toFixed(2);
}
