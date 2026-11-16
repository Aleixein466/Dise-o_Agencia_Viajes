export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export type PasswordPolicyResult =
  { ok: true } | { ok: false; reason: "too_short" | "too_long" | "compromised" | "contains_identifier" };
const COMPROMISED = new Set([
  "password1234",
  "password12345",
  "password123456",
  "administrator",
  "administrador",
  "admin1234567",
  "admin12345678",
  "ricaurtetours",
  "ricaurte1234",
  "ricaurtetours123",
  "123456789012",
  "qwertyuiopas",
]);
export const normalizePassword = (password: string) => password.normalize("NFKC");
const length = (value: string) => [...value].length;
function trivial(value: string): boolean {
  const p = [...value].map((c) => c.codePointAt(0) ?? 0);
  if (p.every((v) => v === p[0])) return true;
  const step = p[1] - p[0];
  return Math.abs(step) === 1 && p.every((v, i) => i === 0 || v - p[i - 1] === step);
}
export function checkPasswordPolicy(
  password: string,
  context: { email?: string | null; name?: string | null } = {},
): PasswordPolicyResult {
  const normalized = normalizePassword(password);
  const size = length(normalized);
  if (size < PASSWORD_MIN_LENGTH) return { ok: false, reason: "too_short" };
  if (size > PASSWORD_MAX_LENGTH) return { ok: false, reason: "too_long" };
  const lowered = normalized.toLowerCase();
  if (COMPROMISED.has(lowered) || trivial(lowered)) return { ok: false, reason: "compromised" };
  const ids = [context.email?.split("@")[0], ...(context.name?.split(/\s+/) ?? [])]
    .map((v) => v?.normalize("NFKC").toLowerCase().trim() ?? "")
    .filter((v) => length(v) >= 4);
  return ids.some((v) => lowered.includes(v)) ? { ok: false, reason: "contains_identifier" } : { ok: true };
}
