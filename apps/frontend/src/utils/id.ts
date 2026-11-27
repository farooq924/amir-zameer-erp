/**
 * Random UUID v4 for idempotency keys and client-side ids.
 * crypto.randomUUID() exists only on HTTPS or localhost; on a plain-HTTP shop network
 * (e.g. http://192.168.1.10:4000) it is missing, so fall back to getRandomValues.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
