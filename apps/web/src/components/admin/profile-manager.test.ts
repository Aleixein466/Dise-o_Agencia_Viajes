import { describe, expect, it } from "vitest";
import { profileErrorMessage } from "./profile-manager";

describe("profileErrorMessage", () => {
  it("describes safe account errors without exposing backend details", () => {
    expect(profileErrorMessage({ status: 400, data: { code: "INVALID_CURRENT_PASSWORD" } })).toContain(
      "contraseña actual",
    );
    expect(profileErrorMessage({ status: 503, data: { code: "MAIL_DISABLED" } })).toContain("correo de pruebas");
    expect(profileErrorMessage({ status: 429, data: null })).toContain("Demasiados intentos");
  });
});
