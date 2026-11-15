import { describe, expect, it } from "vitest";
import {
  SECRETS_NOTICE,
  blankSettings,
  describeSettingsError,
  settingsPayload,
  settingsValues,
  summarizeSettingsChanges,
  validateSettings,
} from "./helpers";

describe("agency settings form", () => {
  it("starts empty and accepts an empty form (nothing is invented)", () => {
    expect(validateSettings(blankSettings())).toEqual({});
    expect(Object.values(settingsPayload(blankSettings())).every((v) => v === null)).toBe(true);
  });
  it("validates emails, urls, phones, nit, rnt and dates", () => {
    const errors = validateSettings({
      ...blankSettings(),
      contactEmail: "no-es-correo",
      bookingsEmail: "a@b",
      facebookUrl: "javascript:alert(1)",
      instagramUrl: "ftp://x.co",
      tiktokUrl: "https://ok.example/u",
      phone: "abc",
      whatsapp: "+57 300 123 4567",
      nit: "NIT 1",
      rnt: "12 34",
      rntValidUntil: "31/12/2027",
      address: "x".repeat(251),
    });
    expect(Object.keys(errors).sort()).toEqual(
      [
        "address",
        "bookingsEmail",
        "contactEmail",
        "facebookUrl",
        "instagramUrl",
        "nit",
        "phone",
        "rnt",
        "rntValidUntil",
      ].sort(),
    );
  });
  it("normalises phones and nulls blanks in the payload", () => {
    const payload = settingsPayload({
      ...blankSettings(),
      tradeName: " Agencia ",
      whatsapp: "+57 (300) 123-4567",
      logoMediaId: "id-1",
    });
    expect(payload).toMatchObject({ tradeName: "Agencia", whatsapp: "+573001234567", city: null, logoMediaId: "id-1" });
  });
  it("loads server data into form values", () => {
    expect(settingsValues({ tradeName: "A", city: null, logo: { id: "m1" } })).toMatchObject({
      tradeName: "A",
      city: "",
      logoMediaId: "m1",
    });
  });
  it("explains that secrets live in environment variables", () => {
    expect(SECRETS_NOTICE).toMatch(/variables de entorno/);
    expect(describeSettingsError({ status: 400, data: { code: "SECRETS_NOT_ALLOWED" } }).message).toMatch(
      /variables de entorno/,
    );
  });
  it("summarises history by changed field labels without values", () => {
    expect(summarizeSettingsChanges({ details: { changedFields: ["phone", "logoMediaId"] } })).toEqual([
      "Campos modificados: Teléfono, Logo",
    ]);
    expect(summarizeSettingsChanges({ details: null })).toEqual([]);
  });
});
