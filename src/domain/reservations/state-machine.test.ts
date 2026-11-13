import { describe, expect, it } from "vitest";
import {
  RESERVATION_EVENTS, RESERVATION_STATES, ROLES, TERMINAL_STATES, customerStatus, transitionReservation,
  type ReservationContext, type ReservationEventType, type Role,
} from "./state-machine";

const at = new Date("2026-11-13T12:00:00Z");
const unpaid: ReservationContext = { totalCents: 100_000_00, paidCents: 0, requiredDepositCents: 30_000_00, availabilityValidated: true };
const deposit: ReservationContext = { ...unpaid, paidCents: 30_000_00 };
const full: ReservationContext = { ...unpaid, paidCents: 100_000_00 };
const ev = (type: ReservationEventType, role: Role, reason = "motivo de prueba") => ({ type, actor: { role, id: `${role}-1` }, reason });

// Hand-written from requirements §10.4 — deliberately NOT derived from the implementation's table.
const S: Role[] = ["ADVISOR", "ADMIN"];
const SPEC: Record<string, Role[]> = {
  "DRAFT:SUBMIT_REQUEST": ["CUSTOMER"],
  "DRAFT:CHECKOUT": ["CUSTOMER"],
  "DRAFT:CANCEL": ["CUSTOMER", ...S],
  "REQUEST_RECEIVED:START_VALIDATION": S,
  "REQUEST_RECEIVED:REJECT": S,
  "REQUEST_RECEIVED:CANCEL": ["CUSTOMER", ...S],
  "PENDING_VALIDATION:APPROVE_FOR_PAYMENT": S,
  "PENDING_VALIDATION:REJECT": S,
  "PENDING_VALIDATION:CANCEL": ["CUSTOMER", ...S],
  "PENDING_PAYMENT:PAYMENT_SETTLED": ["SYSTEM", "FINANCE"],
  "PENDING_PAYMENT:REJECT": S,
  "PENDING_PAYMENT:CANCEL": ["CUSTOMER", ...S],
  "PARTIALLY_PAID:PAYMENT_SETTLED": ["SYSTEM", "FINANCE"],
  "PARTIALLY_PAID:CONFIRM": S,
  "PARTIALLY_PAID:REJECT": S,
  "PARTIALLY_PAID:CANCEL": S,
  "PAID:PAYMENT_SETTLED": ["SYSTEM", "FINANCE"],
  "PAID:CONFIRM": S,
  "PAID:REJECT": S,
  "PAID:CANCEL": S,
  "CONFIRMED:CANCEL": S,
  "CONFIRMED:COMPLETE": S,
  "REFUND_PENDING:REFUND_COMPLETED": ["FINANCE"],
};

describe("reservation state machine", () => {
  it("matches the written spec for every state × event × role", () => {
    for (const state of RESERVATION_STATES) for (const type of RESERVATION_EVENTS) for (const role of ROLES) {
      const allowed = SPEC[`${state}:${type}`];
      const result = transitionReservation(state, ev(type, role), full, at);
      if (!allowed) expect(result, `${state} ${type} ${role}`).toEqual({ ok: false, error: "INVALID_TRANSITION" });
      else if (!allowed.includes(role)) expect(result, `${state} ${type} ${role}`).toEqual({ ok: false, error: "FORBIDDEN" });
      else expect(result.ok, `${state} ${type} ${role}`).toBe(true);
    }
  });

  it("never leaves a terminal state", () => {
    for (const state of TERMINAL_STATES) for (const type of RESERVATION_EVENTS) for (const role of ROLES) {
      expect(transitionReservation(state, ev(type, role), full, at).ok).toBe(false);
    }
  });

  it("separates payment received from confirmation", () => {
    for (const ctx of [deposit, full]) {
      const settled = transitionReservation("PENDING_PAYMENT", ev("PAYMENT_SETTLED", "SYSTEM"), ctx, at);
      expect(settled.ok && settled.next).not.toBe("CONFIRMED");
    }
    expect(transitionReservation("PENDING_PAYMENT", ev("PAYMENT_SETTLED", "SYSTEM"), deposit, at)).toMatchObject({ ok: true, next: "PARTIALLY_PAID" });
    expect(transitionReservation("PENDING_PAYMENT", ev("PAYMENT_SETTLED", "SYSTEM"), full, at)).toMatchObject({ ok: true, next: "PAID" });
    expect(transitionReservation("PENDING_PAYMENT", ev("PAYMENT_SETTLED", "SYSTEM"), unpaid, at)).toEqual({ ok: false, error: "GUARD_FAILED" });
  });

  it("confirms only with validated availability and full payment or agreed deposit", () => {
    expect(transitionReservation("PAID", ev("CONFIRM", "ADVISOR"), { ...full, availabilityValidated: false }, at)).toEqual({ ok: false, error: "GUARD_FAILED" });
    expect(transitionReservation("PAID", ev("CONFIRM", "ADVISOR"), full, at)).toMatchObject({ ok: true, next: "CONFIRMED" });
    expect(transitionReservation("PARTIALLY_PAID", ev("CONFIRM", "ADMIN"), deposit, at)).toMatchObject({ ok: true, next: "CONFIRMED" });
    expect(transitionReservation("PARTIALLY_PAID", ev("CONFIRM", "ADMIN"), { ...deposit, paidCents: 29_999_99 }, at)).toEqual({ ok: false, error: "GUARD_FAILED" });
    expect(transitionReservation("PARTIALLY_PAID", ev("CONFIRM", "ADMIN"), { ...deposit, requiredDepositCents: 0 }, at)).toEqual({ ok: false, error: "GUARD_FAILED" });
  });

  it("routes rejection or cancellation with money held to refund", () => {
    expect(transitionReservation("PAID", ev("REJECT", "ADVISOR"), full, at)).toMatchObject({ ok: true, next: "REFUND_PENDING" });
    expect(transitionReservation("CONFIRMED", ev("CANCEL", "ADMIN"), deposit, at)).toMatchObject({ ok: true, next: "REFUND_PENDING" });
    expect(transitionReservation("REQUEST_RECEIVED", ev("REJECT", "ADVISOR"), unpaid, at)).toMatchObject({ ok: true, next: "REJECTED" });
    expect(transitionReservation("DRAFT", ev("CANCEL", "CUSTOMER"), unpaid, at)).toMatchObject({ ok: true, next: "CANCELLED" });
    expect(transitionReservation("REFUND_PENDING", ev("REFUND_COMPLETED", "FINANCE"), full, at)).toMatchObject({ ok: true, next: "REFUNDED" });
  });

  it("is idempotent for repeated settlement and never downgrades PAID", () => {
    expect(transitionReservation("PAID", ev("PAYMENT_SETTLED", "SYSTEM"), full, at)).toEqual({ ok: true, changed: false, next: "PAID" });
    expect(transitionReservation("PAID", ev("PAYMENT_SETTLED", "SYSTEM"), deposit, at)).toEqual({ ok: false, error: "GUARD_FAILED" });
    expect(transitionReservation("PARTIALLY_PAID", ev("PAYMENT_SETTLED", "SYSTEM"), deposit, at)).toEqual({ ok: true, changed: false, next: "PARTIALLY_PAID" });
  });

  it("requires a reason and records it in history", () => {
    expect(transitionReservation("PAID", ev("REJECT", "ADVISOR", "  "), full, at)).toEqual({ ok: false, error: "REASON_REQUIRED" });
    const result = transitionReservation("PAID", ev("REJECT", "ADVISOR", " sin cupo "), full, at);
    expect(result).toMatchObject({ ok: true, changed: true, history: { from: "PAID", to: "REFUND_PENDING", reason: "sin cupo", actorId: "ADVISOR-1", role: "ADVISOR", at } });
  });

  it("rejects non-integer, negative or unsafe amounts", () => {
    for (const bad of [-1, 10.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(transitionReservation("DRAFT", ev("CHECKOUT", "CUSTOMER"), { ...unpaid, totalCents: bad }, at)).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    }
  });

  it("completes only fully paid confirmed trips", () => {
    expect(transitionReservation("CONFIRMED", ev("COMPLETE", "ADMIN"), deposit, at)).toEqual({ ok: false, error: "GUARD_FAILED" });
    expect(transitionReservation("CONFIRMED", ev("COMPLETE", "ADMIN"), full, at)).toMatchObject({ ok: true, next: "COMPLETED" });
  });

  it("shows paid reservations as pending confirmation to the visitor", () => {
    expect(customerStatus("PAID")).toContain("pendiente de confirmación");
    expect(customerStatus("PARTIALLY_PAID")).toContain("pendiente de confirmación");
    for (const state of RESERVATION_STATES) expect(customerStatus(state)).toBeTruthy();
  });
});
