import { describe, expect, it } from "vitest";
import { parseTotpEnrollment } from "./totp-enrollment";

const URL_OK =
  "otpauth://totp/Ricaurte%20Tours:ana%40ricaurte.test?secret=JBSWY3DPEHPK3PXPJBSWY3DP&issuer=Ricaurte%20Tours";

describe("parseTotpEnrollment", () => {
  it("extracts the secret, the account and a local SVG QR", () => {
    const result = parseTotpEnrollment(URL_OK);
    expect(result?.secret).toBe("JBSWY3DPEHPK3PXPJBSWY3DP");
    expect(result?.groupedSecret).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP");
    expect(result?.account).toBe("ana@ricaurte.test");
    expect(result?.qrDataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(result!.qrDataUrl)).toContain("<svg");
  });

  it("never points the QR at a remote resource", () => {
    expect(parseTotpEnrollment(URL_OK)?.qrDataUrl).not.toMatch(/https?:/);
  });

  it.each([
    "not a url",
    "https://example.com/?secret=JBSWY3DPEHPK3PXP",
    "otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP",
    "otpauth://totp/x?secret=short",
    "otpauth://totp/x?secret=JBSWY3DP%3Cscript%3E",
    "otpauth://totp/x",
  ])("rejects %s", (value) => {
    expect(parseTotpEnrollment(value)).toBeNull();
  });
});
