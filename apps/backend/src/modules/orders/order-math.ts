import { Prisma } from '@prisma/client';
import { dec, money } from '../../common/utils/money';

export interface LineInput {
  quantity: number;
  stitchingPrice: string;
  fabricQuantity?: string;
  fabricRate?: string;
  additionalCharges?: string;
  /** Customer's own fabric is never charged. */
  chargeFabric: boolean;
}

export interface LineAmounts {
  stitchingPrice: Prisma.Decimal;
  stitchingAmount: Prisma.Decimal;
  fabricQuantity: Prisma.Decimal;
  fabricPerPiece: Prisma.Decimal;
  fabricRate: Prisma.Decimal;
  fabricAmount: Prisma.Decimal;
  additionalCharges: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

/** One order line: qty x stitching price + fabric qty x rate + extra charges (all rounded to paisa). */
export function lineAmounts(l: LineInput): LineAmounts {
  const qty = dec(l.quantity);
  const stitchingPrice = money(l.stitchingPrice);
  const stitchingAmount = money(stitchingPrice.times(qty));
  const fabricQuantity = dec(l.fabricQuantity).toDecimalPlaces(3);
  const fabricRate = l.chargeFabric ? money(l.fabricRate) : dec(0);
  const fabricAmount = money(fabricQuantity.times(fabricRate));
  const additionalCharges = money(l.additionalCharges);
  return {
    stitchingPrice, stitchingAmount, fabricQuantity,
    fabricPerPiece: l.quantity > 0 ? fabricQuantity.div(qty).toDecimalPlaces(3) : dec(0),
    fabricRate, fabricAmount, additionalCharges,
    lineTotal: stitchingAmount.plus(fabricAmount).plus(additionalCharges),
  };
}

export interface OrderAmounts {
  stitchingTotal: Prisma.Decimal;
  fabricTotal: Prisma.Decimal;
  additionalCharges: Prisma.Decimal;
  discount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/** Order totals. `additionalCharges` on the order = order-level charges only; item extras are inside the line totals. */
export function orderAmounts(lines: LineAmounts[], orderCharges: string | undefined, discount: string | undefined): OrderAmounts {
  const stitchingTotal = lines.reduce((a, l) => a.plus(l.stitchingAmount), dec(0));
  const fabricTotal = lines.reduce((a, l) => a.plus(l.fabricAmount), dec(0));
  const extras = lines.reduce((a, l) => a.plus(l.additionalCharges), dec(0));
  const charges = money(orderCharges);
  const disc = money(discount);
  const subtotal = stitchingTotal.plus(fabricTotal).plus(extras).plus(charges);
  return { stitchingTotal, fabricTotal, additionalCharges: charges, discount: disc, subtotal, totalAmount: subtotal.minus(disc) };
}

export type PaymentStatusCode = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';

/** Balance and payment status from what is owed (total + adjustments) and what was paid. */
export function paymentState(effectiveTotal: Prisma.Decimal, paid: Prisma.Decimal): { balanceAmount: Prisma.Decimal; paymentStatus: PaymentStatusCode } {
  const balanceAmount = effectiveTotal.minus(paid);
  let paymentStatus: PaymentStatusCode;
  if (paid.lte(0)) paymentStatus = effectiveTotal.lte(0) ? 'PAID' : 'UNPAID';
  else if (paid.lt(effectiveTotal)) paymentStatus = 'PARTIAL';
  else if (paid.eq(effectiveTotal)) paymentStatus = 'PAID';
  else paymentStatus = 'OVERPAID';
  return { balanceAmount, paymentStatus };
}
