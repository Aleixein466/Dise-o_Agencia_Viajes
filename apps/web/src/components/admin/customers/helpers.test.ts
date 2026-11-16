import { describe, expect, it } from "vitest";
import { contactPatch, describeCustomerError, latestCaption, validateContact } from "./helpers";

const base = { name: "Ana Pérez", email: "ana@correo.co", phone: "+57 300 123 4567", country: "CO" };

describe("customers helpers", () => {
  it("validates contact fields", () => {
    expect(validateContact(base)).toEqual({});
    expect(validateContact({ name: "A", email: "x@", phone: "12", country: "COL" })).toEqual({
      name: expect.any(String),
      email: expect.any(String),
      phone: expect.any(String),
      country: expect.any(String),
    });
    expect(validateContact({ ...base, country: "" })).toEqual({});
  });
  it("sends only changed, normalised fields; empty country becomes null", () => {
    expect(contactPatch(base, base)).toEqual({});
    expect(contactPatch({ ...base, email: " ANA@Correo.co " }, base)).toEqual({});
    expect(contactPatch({ ...base, name: " Ana María ", email: "Nueva@Correo.co", country: "" }, base)).toEqual({
      name: "Ana María",
      email: "nueva@correo.co",
      country: null,
    });
    expect(contactPatch({ ...base, country: "pe" }, base)).toEqual({ country: "PE" });
  });
  it("maps duplicate and account errors to the email field", () => {
    expect(describeCustomerError({ status: 409, data: { code: "DUPLICATE_CUSTOMER" } })).toMatchObject({
      field: "email",
      message: expect.stringMatching(/otro cliente/),
    });
    expect(describeCustomerError({ status: 409, data: { code: "CUSTOMER_HAS_ACCOUNT" } }).field).toBe("email");
    expect(describeCustomerError({ status: 403, data: null }).message).toMatch(/permiso/);
  });
  it("captions latest rows against totals", () => {
    expect(latestCaption(0, 0)).toBe("Sin registros");
    expect(latestCaption(3, 3)).toBe("3 en total");
    expect(latestCaption(5, 12)).toBe("Mostrando las 5 más recientes de 12");
  });
});
