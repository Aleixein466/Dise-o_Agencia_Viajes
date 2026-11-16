/**
 * Audit snapshots (before / after / details) are free-form JSON written by many modules. Before they leave the API,
 * the value of every key whose NAME matches this pattern is replaced by "[oculto]", at any depth, so credentials,
 * one-time codes, contact data and document numbers never reach the admin UI even if a writer stored them.
 * Matched (case-insensitive, substring): password, hash, secret, token, otp, mfa, key, email, phone, document, and the
 * secret code fields trackingCode / recoveryCode / verificationCode / loginCode. A bare `code` (promotion or reservation
 * identifier) is not secret and stays visible; one-time codes are only ever stored hashed (caught by `hash`).
 */
export const SENSITIVE_KEY =
  /password|hash|secret|token|otp|mfa|key|email|phone|document|trackingcode|recoverycode|verificationcode|logincode/i;
export const REDACTED = "[oculto]";
const MAX_DEPTH = 12;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value))
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  return out;
}
