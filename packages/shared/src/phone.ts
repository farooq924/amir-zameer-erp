/**
 * Phone number helpers for Pakistan.
 * Pakistani mobiles are stored as 12 digits: 92 + 3XXXXXXXXX (e.g. 923001234567).
 * Other numbers (landline / foreign) are stored as 7-15 digits.
 */
const PK_MOBILE = /^(?:0092|92|0)?(3\d{9})$/;

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  const pk = digits.match(PK_MOBILE);
  if (pk) return `92${pk[1]}`;
  if (digits.length >= 7 && digits.length <= 15) return digits.startsWith('00') ? digits.slice(2) : digits;
  return null;
}

export function isPakistaniMobile(normalized: string | null | undefined): boolean {
  return !!normalized && /^923\d{9}$/.test(normalized);
}

/** 923001234567 -> 0300-1234567 ; other numbers are returned with a leading + */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return '';
  if (isPakistaniMobile(normalized)) return `0${normalized.slice(2, 5)}-${normalized.slice(5)}`;
  return normalized.length > 10 ? `+${normalized}` : normalized;
}

/** wa.me link for manual WhatsApp sharing (works without the Cloud API). */
export function whatsappLink(normalized: string | null | undefined, text?: string): string | null {
  if (!normalized) return null;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
