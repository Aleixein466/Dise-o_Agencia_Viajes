import { renderSVG } from "uqr";

export type TotpEnrollment = Readonly<{ secret: string; groupedSecret: string; account: string; qrDataUrl: string }>;

const BASE32 = /^[A-Z2-7]+=*$/;

/**
 * Parses the otpauth:// URL returned by /auth/mfa/setup and renders its QR locally (uqr, no network).
 * Returns null for anything that is not a well-formed TOTP URL, so a malformed response never reaches the screen.
 */
export function parseTotpEnrollment(otpauthUrl: string): TotpEnrollment | null {
  let url: URL;
  try {
    url = new URL(otpauthUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "otpauth:" || url.host !== "totp") return null;
  const secret = (url.searchParams.get("secret") ?? "").toUpperCase();
  if (secret.length < 16 || !BASE32.test(secret)) return null;
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const account = label.includes(":") ? label.slice(label.indexOf(":") + 1) : label;
  const svg = renderSVG(otpauthUrl, { ecc: "M", border: 2, pixelSize: 6 });
  return {
    secret,
    groupedSecret: secret.replace(/=+$/, "").replace(/(.{4})(?=.)/g, "$1 "),
    account,
    qrDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}
