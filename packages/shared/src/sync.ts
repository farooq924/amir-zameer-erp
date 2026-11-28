/**
 * Offline sync (Phase 9). Shared by the backend sync API and the PWA outbox.
 *
 * A device saves work in its own IndexedDB outbox while offline. Every entry is one
 * "operation" with a client-generated UUID. The server applies each operation exactly once:
 * sending the same operation id again only returns the stored result (idempotent).
 */

export const SYNC_ENTITIES = [
  { key: 'customer', label: 'Customer', operations: ['CREATE', 'UPDATE'] },
  { key: 'measurement', label: 'Measurement', operations: ['CREATE'] },
  { key: 'order', label: 'Order', operations: ['CREATE'] },
  { key: 'payment', label: 'Payment', operations: ['CREATE'] },
] as const;
export type SyncEntityType = (typeof SYNC_ENTITIES)[number]['key'];
export const SYNC_ENTITY_KEYS = SYNC_ENTITIES.map((e) => e.key) as SyncEntityType[];

export const SYNC_OPERATIONS = ['CREATE', 'UPDATE'] as const;
export type SyncOperationType = (typeof SYNC_OPERATIONS)[number];

/** Result of one pushed operation. WAITING and RETRY are not stored: the device simply sends it again later. */
export const SYNC_RESULT_STATUSES = ['APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED', 'WAITING', 'RETRY'] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

export const SYNC_STORED_STATUSES = ['PENDING', 'APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED'] as const;
export type SyncStoredStatus = (typeof SYNC_STORED_STATUSES)[number];

export const CONFLICT_RESOLUTIONS = [
  { key: 'KEEP_SERVER', label: 'Keep server copy', help: 'Discard the change made on the device.' },
  { key: 'KEEP_CLIENT', label: 'Keep device copy', help: 'Overwrite the server with the change made on the device.' },
  { key: 'MERGED', label: 'Merge field by field', help: 'Choose for each field which value to keep.' },
  { key: 'KEEP_BOTH', label: 'Keep both', help: 'Save the device record as a separate new record.' },
] as const;
export type ConflictResolutionCode = (typeof CONFLICT_RESOLUTIONS)[number]['key'];

/** Conflict kinds and the resolutions each one allows. */
export const CONFLICT_KINDS = {
  VERSION: { label: 'Edited on two devices', resolutions: ['KEEP_SERVER', 'KEEP_CLIENT', 'MERGED'] },
  DUPLICATE: { label: 'Possible duplicate customer', resolutions: ['KEEP_SERVER', 'KEEP_BOTH'] },
} as const satisfies Record<string, { label: string; resolutions: readonly ConflictResolutionCode[] }>;
export type ConflictKind = keyof typeof CONFLICT_KINDS;

/** Customer fields a device may change offline; used for field-by-field conflict review. */
export const SYNC_CUSTOMER_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'address', label: 'Address' },
  { key: 'customerType', label: 'Customer type' },
  { key: 'notes', label: 'Notes' },
] as const;
export type SyncCustomerField = (typeof SYNC_CUSTOMER_FIELDS)[number]['key'];

/** Most operations a device may send in one push request. */
export const SYNC_MAX_BATCH = 100;

export function syncEntityLabel(key: string): string {
  return SYNC_ENTITIES.find((e) => e.key === key)?.label ?? key;
}

/** Field keys whose values differ between two records (null, undefined and '' are equal). */
export function changedFields(a: Record<string, unknown>, b: Record<string, unknown>, keys: readonly string[]): string[] {
  const norm = (v: unknown) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' ? v.trim() : v);
  return keys.filter((k) => JSON.stringify(norm(a[k])) !== JSON.stringify(norm(b[k])));
}
