import { describe, expect, it } from "vitest";
import {
  PQRS_UNAVAILABLE,
  allowedTransitions,
  normalizeTicket,
  pqrsErrorMessage,
  pqrsStatusLabel,
  pqrsTypeLabel,
  validateIntake,
  validateMessage,
} from "./pqrs-logic";

describe("pqrs-logic", () => {
  it("labels types and statuses", () => {
    expect(pqrsTypeLabel("CLAIM")).toBe("Reclamo");
    expect(pqrsStatusLabel("WAITING_FOR_CUSTOMER")).toBe("Esperando tu respuesta");
    expect(pqrsStatusLabel("???")).toBe("Estado en revisión");
  });
  it("allows only contract transitions", () => {
    expect(allowedTransitions("RECEIVED")).toEqual(["IN_REVIEW"]);
    expect(allowedTransitions("ANSWERED")).toContain("IN_REVIEW");
    expect(allowedTransitions("CLOSED")).toEqual([]);
    expect(allowedTransitions("nope")).toEqual([]);
  });
  it("maps 503 to the intake-disabled message", () => {
    expect(pqrsErrorMessage(503, null, "x")).toBe(PQRS_UNAVAILABLE);
    expect(pqrsErrorMessage(409, { message: "La PQRS cambió; recarga" }, "x")).toBe("La PQRS cambió; recarga");
    expect(pqrsErrorMessage(500, null, "fallback")).toBe("fallback");
  });
  it("validates intake limits", () => {
    const ok = { type: "CLAIM", subject: "Asunto ok", description: "d".repeat(20), name: "Ana", email: "a@b.co" };
    expect(validateIntake(ok, true)).toEqual({});
    expect(Object.keys(validateIntake({ ...ok, subject: "abc", email: "x" }, true)).sort()).toEqual([
      "email",
      "subject",
    ]);
    expect(validateIntake({ ...ok, name: "", email: "" }, false)).toEqual({});
  });
  it("validates messages", () => {
    expect(validateMessage(" a ")).not.toBeNull();
    expect(validateMessage("hola")).toBeNull();
  });
  it("normalizes tickets", () => {
    expect(normalizeTicket(null)).toBeNull();
    expect(normalizeTicket({ reference: "PQR-1", status: "RECEIVED" })?.messages).toEqual([]);
  });
});
