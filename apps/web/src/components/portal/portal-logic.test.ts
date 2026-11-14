import { describe, expect, it } from "vitest";
import {
  QUOTE_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  buildReservationBody,
  buildTravelerRows,
  canCancelReservation,
  hasFormErrors,
  minStartDate,
  quoteStatusLabel,
  reservationStatusLabel,
  validateCancelReason,
  validateReservationForm,
} from "./portal-logic";

// Mirrors packages/db prisma enums; update both together.
const QUOTE_ENUM = [
  "DRAFT",
  "REQUIRES_MANUAL_REVIEW",
  "NEW",
  "ASSIGNED",
  "PROPOSAL_SENT",
  "ACCEPTED",
  "DECLINED",
  "CLOSED",
];
const RESERVATION_ENUM = [
  "DRAFT",
  "REQUEST_RECEIVED",
  "PENDING_VALIDATION",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAID",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "COMPLETED",
];

describe("status labels", () => {
  it("covers every QuoteStatus with a non-empty Spanish label", () => {
    expect(Object.keys(QUOTE_STATUS_LABELS).sort()).toEqual([...QUOTE_ENUM].sort());
    for (const status of QUOTE_ENUM) expect(quoteStatusLabel(status).length).toBeGreaterThan(3);
  });

  it("covers every ReservationStatus with a non-empty Spanish label", () => {
    expect(Object.keys(RESERVATION_STATUS_LABELS).sort()).toEqual([...RESERVATION_ENUM].sort());
    for (const status of RESERVATION_ENUM) expect(reservationStatusLabel(status).length).toBeGreaterThan(3);
    expect(reservationStatusLabel("REQUEST_RECEIVED")).toBe("Solicitud recibida");
    expect(reservationStatusLabel("PENDING_VALIDATION")).toBe("Validando disponibilidad");
    expect(reservationStatusLabel("PENDING_PAYMENT")).toBe("Disponibilidad confirmada · pendiente de pago");
  });

  it("falls back for unknown statuses without exposing the raw value", () => {
    expect(quoteStatusLabel("MYSTERY")).toBe("Estado en revisión");
    expect(reservationStatusLabel("MYSTERY")).toBe("Estado en revisión");
  });
});

describe("traveler rows", () => {
  it("sizes rows from adults and children, adults first", () => {
    const rows = buildTravelerRows(2, 3);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.category)).toEqual(["ADULT", "ADULT", "CHILD", "CHILD", "CHILD"]);
    expect(buildTravelerRows(1, 0)).toHaveLength(1);
    expect(buildTravelerRows(0, 0)).toHaveLength(0);
  });

  it("validates names, minor ages and the start date, and builds the payload", () => {
    const rows = buildTravelerRows(1, 1);
    const empty = validateReservationForm({ startsOn: "2026-01-01", rows, notes: "" }, "2026-06-02");
    expect(hasFormErrors(empty)).toBe(true);
    expect(empty.startsOn).toBeDefined();
    expect(empty.rows[0]?.fullName).toBeDefined();
    expect(empty.rows[1]?.ageYears).toBeDefined();

    const filled = [
      { ...rows[0], fullName: " Ana Pérez " },
      { ...rows[1], fullName: "Luis Pérez", ageYears: "7" },
    ];
    const input = { startsOn: "2026-06-02", rows: filled, notes: "  " };
    expect(hasFormErrors(validateReservationForm(input, "2026-06-02"))).toBe(false);
    expect(buildReservationBody(input)).toEqual({
      startsOn: "2026-06-02",
      travelers: [
        { fullName: "Ana Pérez", category: "ADULT" },
        { fullName: "Luis Pérez", category: "CHILD", ageYears: 7 },
      ],
    });
  });

  it("computes tomorrow in Bogota time", () => {
    expect(minStartDate(new Date("2026-06-01T12:00:00Z"))).toBe("2026-06-02");
    expect(minStartDate(new Date("2026-06-01T03:00:00Z"))).toBe("2026-06-01");
  });
});

describe("cancel rules", () => {
  it("allows cancelling only before payment and confirmation", () => {
    for (const status of ["DRAFT", "REQUEST_RECEIVED", "PENDING_VALIDATION", "PENDING_PAYMENT"]) {
      expect(canCancelReservation(status)).toBe(true);
    }
    for (const status of RESERVATION_ENUM.filter(
      (s) => !["DRAFT", "REQUEST_RECEIVED", "PENDING_VALIDATION", "PENDING_PAYMENT"].includes(s),
    )) {
      expect(canCancelReservation(status)).toBe(false);
    }
  });

  it("requires a reason between 3 and 500 characters", () => {
    expect(validateCancelReason("  ab ")).not.toBeNull();
    expect(validateCancelReason("abc")).toBeNull();
    expect(validateCancelReason("x".repeat(501))).not.toBeNull();
  });
});
