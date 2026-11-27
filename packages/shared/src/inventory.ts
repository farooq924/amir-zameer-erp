/** Fabric inventory, supplier and purchase constants shared by backend and frontend. */
export const FABRIC_UNITS = [
  { key: 'METER', label: 'Meter', short: 'm' },
  { key: 'YARD', label: 'Yard', short: 'yd' },
  { key: 'PIECE', label: 'Piece', short: 'pc' },
  { key: 'ROLL', label: 'Roll', short: 'roll' },
] as const;
export type FabricUnitCode = (typeof FABRIC_UNITS)[number]['key'];

export function unitShort(unit: string | null | undefined): string {
  return FABRIC_UNITS.find((u) => u.key === unit)?.short ?? 'm';
}

/** Every way stock can change. IN adds to stock, OUT takes from it. */
export const MOVEMENT_TYPES = [
  { key: 'OPENING', label: 'Opening stock', direction: 'IN' },
  { key: 'PURCHASE', label: 'Purchase', direction: 'IN' },
  { key: 'PURCHASE_RETURN', label: 'Return to supplier', direction: 'OUT' },
  { key: 'SALE', label: 'Sale', direction: 'OUT' },
  { key: 'SALE_RETURN', label: 'Customer return', direction: 'IN' },
  { key: 'ADJUSTMENT_IN', label: 'Adjustment (added)', direction: 'IN' },
  { key: 'ADJUSTMENT_OUT', label: 'Adjustment (removed)', direction: 'OUT' },
  { key: 'TRANSFER_IN', label: 'Transfer in', direction: 'IN' },
  { key: 'TRANSFER_OUT', label: 'Transfer out', direction: 'OUT' },
  { key: 'ORDER_CONSUMPTION', label: 'Used in order', direction: 'OUT' },
  { key: 'ORDER_REVERSAL', label: 'Order reversal', direction: 'IN' },
] as const;
export type MovementTypeCode = (typeof MOVEMENT_TYPES)[number]['key'];

export const ADJUSTMENT_REASONS = [
  'Physical count correction',
  'Damaged / defective',
  'Cutting waste',
  'Lost / missing',
  'Found in store',
  'Sample given',
  'Other',
] as const;

/** Default fabric categories seeded once (the owner can add, rename or hide them). */
export const DEFAULT_FABRIC_CATEGORIES = [
  'Wash & Wear', 'Cotton', 'Latha', 'Boski', 'Karandi', 'Khaddar', 'Linen', 'Suiting', 'Blended',
] as const;

/** Fabric quantities have 3 decimals; returns "4.500". */
export function qtyString(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(3);
}
