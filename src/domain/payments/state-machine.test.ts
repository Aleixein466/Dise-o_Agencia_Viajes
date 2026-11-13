import { describe, expect, it } from "vitest";
import { applyPaymentEvent, PAYMENT_STATUSES, type Payment, type PaymentStatus } from "./state-machine";

const base: Payment = { reference: "RT-2026-000123-P1", amountCents: 250_000_00, currency: "COP", status: "PENDING", processedEventIds: [] };
const evt = (eventId: string, status: PaymentStatus, patch: Partial<{ amountCents: number; currency: string; reference: string }> = {}) =>
  ({ eventId, status, amountCents: base.amountCents, currency: "COP", reference: base.reference, ...patch });
const SYSTEM = { role: "SYSTEM" as const };
const FINANCE = { role: "FINANCE" as const };

describe("payment state machine", () => {
  it("approves once and ignores a replayed event", () => {
    const first = applyPaymentEvent(base, evt("e1", "APPROVED"), SYSTEM);
    expect(first).toMatchObject({ ok: true, changed: true, effect: "APPROVED", payment: { status: "APPROVED", processedEventIds: ["e1"] } });
    if (!first.ok) throw new Error("expected ok");
    const replay = applyPaymentEvent(first.payment, evt("e1", "APPROVED"), SYSTEM);
    expect(replay).toEqual({ ok: true, changed: false, payment: first.payment });
  });

  it("does not mutate the input payment", () => {
    const snapshot = structuredClone(base);
    applyPaymentEvent(base, evt("e1", "APPROVED"), SYSTEM);
    expect(base).toEqual(snapshot);
  });

  it("rejects tampered amount, currency or reference", () => {
    for (const patch of [{ amountCents: base.amountCents - 1 }, { amountCents: base.amountCents + 1 }, { currency: "USD" }, { reference: "RT-OTHER" }]) {
      expect(applyPaymentEvent(base, evt("e1", "APPROVED", patch), SYSTEM)).toEqual({ ok: false, error: "MISMATCH" });
    }
  });

  it("records out-of-order events without downgrading", () => {
    const approved = { ...base, status: "APPROVED" as const, processedEventIds: ["e1"] };
    for (const stale of ["PENDING", "ERROR", "APPROVED"] as const) {
      expect(applyPaymentEvent(approved, evt(`late-${stale}`, stale), SYSTEM)).toMatchObject({ ok: true, changed: false, payment: { status: "APPROVED" } });
    }
  });

  it("surfaces conflicting final statuses instead of ignoring them", () => {
    const declined = { ...base, status: "DECLINED" as const };
    expect(applyPaymentEvent(declined, evt("e2", "APPROVED"), SYSTEM)).toEqual({ ok: false, error: "INVALID_TRANSITION" });
    expect(applyPaymentEvent({ ...base, status: "VOIDED" }, evt("e2", "REFUNDED"), FINANCE)).toEqual({ ok: false, error: "INVALID_TRANSITION" });
  });

  it("allows ERROR to resolve to a final status", () => {
    expect(applyPaymentEvent({ ...base, status: "ERROR" }, evt("e2", "APPROVED"), SYSTEM)).toMatchObject({ ok: true, changed: true, effect: "APPROVED" });
  });

  it("restricts actors: refunds by finance only, provider statuses by system only, others forbidden", () => {
    const approved = { ...base, status: "APPROVED" as const };
    expect(applyPaymentEvent(approved, evt("r1", "REFUNDED"), SYSTEM)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(applyPaymentEvent(approved, evt("r1", "REFUNDED"), FINANCE)).toMatchObject({ ok: true, effect: "REFUNDED", payment: { status: "REFUNDED" } });
    expect(applyPaymentEvent(base, evt("e1", "APPROVED"), FINANCE)).toEqual({ ok: false, error: "FORBIDDEN" });
    for (const role of ["CUSTOMER", "ADVISOR", "ADMIN"] as const) {
      expect(applyPaymentEvent(base, evt("e1", "APPROVED"), { role })).toEqual({ ok: false, error: "FORBIDDEN" });
    }
  });

  it("validates amounts and event identity", () => {
    for (const bad of [-1, 2.5, Number.NaN]) expect(applyPaymentEvent(base, evt("e1", "APPROVED", { amountCents: bad }), SYSTEM)).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    expect(applyPaymentEvent(base, evt(" ", "APPROVED"), SYSTEM)).toEqual({ ok: false, error: "INVALID_EVENT" });
    expect(applyPaymentEvent(base, { ...evt("e1", "APPROVED"), status: "PAID" as PaymentStatus }, SYSTEM)).toEqual({ ok: false, error: "INVALID_EVENT" });
  });

  it("never reaches a final status from a terminal one", () => {
    for (const terminal of ["DECLINED", "VOIDED", "REFUNDED"] as const) for (const status of PAYMENT_STATUSES) {
      const result = applyPaymentEvent({ ...base, status: terminal }, evt(`x-${status}`, status), status === "REFUNDED" ? FINANCE : SYSTEM);
      if (result.ok) expect(result.changed).toBe(false);
    }
  });
});
