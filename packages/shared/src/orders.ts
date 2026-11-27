/** Order and garment constants shared by backend and frontend. */
export const ORDER_TYPES = [
  { key: 'STITCHING', label: 'Stitching only', hint: 'Customer brings the fabric' },
  { key: 'STITCHING_WITH_FABRIC', label: 'Stitching with fabric', hint: 'Fabric from the shop + stitching' },
  { key: 'FABRIC_SALE', label: 'Fabric sale', hint: 'Fabric only, no stitching' },
  { key: 'ALTERATION', label: 'Alteration', hint: 'Changes to an existing garment' },
] as const;
export type OrderTypeCode = (typeof ORDER_TYPES)[number]['key'];

export const FABRIC_SOURCES = [
  { key: 'CUSTOMER', label: "Customer's fabric" },
  { key: 'SHOP', label: 'Shop fabric' },
] as const;
export type FabricSourceCode = (typeof FABRIC_SOURCES)[number]['key'];

export const ORDER_LIFECYCLES = ['OPEN', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderLifecycleCode = (typeof ORDER_LIFECYCLES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'] as const;
export type PaymentStatusCode = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  { key: 'CASH', label: 'Cash' },
  { key: 'BANK_TRANSFER', label: 'Bank transfer' },
  { key: 'MOBILE_WALLET', label: 'JazzCash / Easypaisa' },
  { key: 'CARD', label: 'Card' },
  { key: 'CHEQUE', label: 'Cheque' },
  { key: 'OTHER', label: 'Other' },
] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]['key'];

export const ORDER_ADJUSTMENT_TYPES = [
  { key: 'PRICE_INCREASE', label: 'Price increase', sign: 1 },
  { key: 'ALTERATION_CHARGE', label: 'Alteration charge', sign: 1 },
  { key: 'PRICE_DECREASE', label: 'Price decrease', sign: -1 },
  { key: 'DISCOUNT', label: 'Extra discount', sign: -1 },
  { key: 'WRITE_OFF', label: 'Write-off (bad debt)', sign: -1 },
] as const;
export type OrderAdjustmentTypeCode = (typeof ORDER_ADJUSTMENT_TYPES)[number]['key'];

/** Workflow stage codes with special meaning. Other stages are free to rename, reorder or add. */
export const STAGE_NEW = 'NEW';
export const STAGE_DELIVERED = 'DELIVERED';
export const STAGE_CANCELLED = 'CANCELLED';

export const STAGE_COLORS = ['slate', 'sky', 'indigo', 'violet', 'amber', 'orange', 'cyan', 'rose', 'emerald', 'green', 'red', 'gold'] as const;

/** Default garments seeded once (linked to the measurement template with the same code). */
export const DEFAULT_GARMENTS = [
  { code: 'SHALWAR_KAMEEZ', name: 'Shalwar Kameez', category: 'SHALWAR_KAMEEZ', template: 'SHALWAR_KAMEEZ', fabric: '4.500' },
  { code: 'KURTA', name: 'Kurta', category: 'KURTA', template: 'KURTA', fabric: '2.500' },
  { code: 'WAISTCOAT', name: 'Waistcoat', category: 'WAISTCOAT', template: 'WAISTCOAT', fabric: '1.250' },
  { code: 'FORMAL_SUIT', name: 'Formal Suit (2 piece)', category: 'FORMAL_SUIT', template: 'FORMAL_SUIT', fabric: '3.250' },
  { code: 'SHIRT', name: 'Shirt', category: 'SHIRT', template: 'SHIRT', fabric: '2.000' },
  { code: 'TROUSER', name: 'Trouser', category: 'TROUSER', template: 'TROUSER', fabric: '1.250' },
  { code: 'PANT', name: 'Pant', category: 'PANT', template: 'PANT', fabric: '1.250' },
] as const;

/**
 * Money maths in whole paisa (integers) so totals match the backend exactly.
 * Input amounts are strings like "1500" or "1500.50".
 */
export function toPaisa(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function fromPaisa(p: number): string {
  return (p / 100).toFixed(2);
}

export interface OrderLineInput {
  quantity: number;
  stitchingPrice: string;
  fabricQuantity?: string;
  fabricRate?: string;
  additionalCharges?: string;
}

export interface OrderTotals {
  lines: { stitchingAmount: string; fabricAmount: string; lineTotal: string }[];
  stitchingTotal: string;
  fabricTotal: string;
  itemCharges: string;
  subtotal: string;
  totalAmount: string;
}

/** Same rules as the backend: line = qty x stitching + fabric qty x rate + extra; total = lines + order charges - discount. */
export function calculateOrderTotals(lines: OrderLineInput[], orderCharges = '0', discount = '0'): OrderTotals {
  let st = 0, fb = 0, ex = 0;
  const out = lines.map((l) => {
    const qty = Math.max(0, Math.trunc(l.quantity || 0));
    const s = toPaisa(l.stitchingPrice) * qty;
    // fabric quantity has 3 decimals: round the product to paisa
    const f = Math.round((toPaisa(l.fabricRate) * Math.round(Number(l.fabricQuantity || 0) * 1000)) / 1000);
    const e = toPaisa(l.additionalCharges);
    st += s; fb += f; ex += e;
    return { stitchingAmount: fromPaisa(s), fabricAmount: fromPaisa(f), lineTotal: fromPaisa(s + f + e) };
  });
  const subtotal = st + fb + ex + toPaisa(orderCharges);
  return {
    lines: out,
    stitchingTotal: fromPaisa(st),
    fabricTotal: fromPaisa(fb),
    itemCharges: fromPaisa(ex),
    subtotal: fromPaisa(subtotal),
    totalAmount: fromPaisa(Math.max(0, subtotal - toPaisa(discount))),
  };
}
