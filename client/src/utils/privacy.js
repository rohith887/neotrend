/* ── Privacy masking utilities for PII (email, mobile) ────────────────────
   Partially masks sensitive contact fields by default.
   A "View" toggle reveals the full value; the reveal event is logged
   server-side for audit without exposing the actual value in logs.
   ─────────────────────────────────────────────────────────────────────── */

const MASK_CHAR = '\u2022'; // bullet •

/**
 * Mask an email address.
 * "bishal1234@gmail.com" → "bishal1234••••••••@gmail.com"
 * Shows first 4 chars + masked middle + @domain
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at); // includes @
  if (local.length <= 4) return email; // too short to mask
  return local + MASK_CHAR.repeat(Math.max(4, local.length - 4)) + domain;
}

/**
 * Mask a phone number.
 * "+9191912345835" → "+91919••••5835"
 * Shows country code + first 3 + masked middle + last 4
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 7) return phone; // too short to mask

  // Detect leading country code (1-3 digits if phone starts with +)
  let prefix = '';
  let body = digits;
  if (phone.startsWith('+')) {
    // Separator after the country code (e.g. "+91 9898612362") pinpoints it.
    const nonDigitIdx = phone.slice(1).search(/\D/);
    if (nonDigitIdx > 0 && nonDigitIdx <= 3) {
      prefix = phone.slice(1, 1 + nonDigitIdx);
      const rest = phone.slice(1 + nonDigitIdx).replace(/\D/g, '');
      if (rest.length > 7) {
        body = rest;
      } else {
        prefix = '';
      }
    } else if (digits.length > 10) {
      // No separators (e.g. "+919891236250"): anything past the first 3
      // digits is the local number — never swallow the whole value as a
      // country code, which would leave nothing left to mask.
      const rest = digits.slice(3);
      if (rest.length > 7) {
        prefix = digits.slice(0, 3);
        body = rest;
      }
    }
  }

  // Now mask the rest: show first 3 + last 4
  const visibleStart = body.slice(0, 3);
  const visibleEnd = body.slice(-4);
  const maskedLen = Math.max(4, body.length - 7);
  const masked = MASK_CHAR.repeat(maskedLen);

  // Reconstruct with original formatting characters
  const prefixPart = prefix ? `+${prefix}` : '';
  return `${prefixPart}${visibleStart}${masked}${visibleEnd}`;
}

/**
 * Determine if a value looks like an email.
 */
export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
