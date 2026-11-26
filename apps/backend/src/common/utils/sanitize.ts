const SENSITIVE_KEYS = /pass(word)?|hash|token|secret|csrf|cookie|authorization|apikey|cnic|bankAccountNumber/i;

/** Removes secrets and personal identifiers before writing to audit logs. */
export function redact<T>(value: T, depth = 0): T {
  if (value === null || value === undefined || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
