import { describe, expect, it } from "vitest";
import {
  RESERVATION_ACTION_LABELS,
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  actionRequiresReason,
  allowedReservationActions,
  reservationStatusLabel,
} from "./reservation-status";

describe("reservation status labels", () => {
  it("covers every state", () => {
    for (const status of RESERVATION_STATUSES) expect(RESERVATION_STATUS_LABELS[status]).toBeTruthy();
    expect(Object.keys(RESERVATION_STATUS_LABELS).sort()).toEqual([...RESERVATION_STATUSES].sort());
  });
  it("falls back to the raw value", () => {
    expect(reservationStatusLabel("OTHER")).toBe("OTHER");
  });
  it("labels every action", () => {
    expect(Object.keys(RESERVATION_ACTION_LABELS)).toHaveLength(4);
  });
});

describe("allowedReservationActions", () => {
  it("matches staff rules", () => {
    const table: Record<string, string[]> = {
      DRAFT: ["CANCEL"],
      REQUEST_RECEIVED: ["START_VALIDATION", "REJECT", "CANCEL"],
      PENDING_VALIDATION: ["APPROVE_FOR_PAYMENT", "REJECT", "CANCEL"],
      PENDING_PAYMENT: ["REJECT", "CANCEL"],
      PARTIALLY_PAID: ["REJECT", "CANCEL"],
      PAID: ["REJECT", "CANCEL"],
      CONFIRMED: ["CANCEL"],
      REJECTED: [],
      CANCELLED: [],
      REFUND_PENDING: [],
      REFUNDED: [],
      COMPLETED: [],
    };
    for (const status of RESERVATION_STATUSES) expect(allowedReservationActions(status)).toEqual(table[status]);
  });
  it("returns nothing for unknown statuses", () => {
    expect(allowedReservationActions("X")).toEqual([]);
  });
  it("requires reasons only for reject and cancel", () => {
    expect(actionRequiresReason("REJECT")).toBe(true);
    expect(actionRequiresReason("CANCEL")).toBe(true);
    expect(actionRequiresReason("START_VALIDATION")).toBe(false);
    expect(actionRequiresReason("APPROVE_FOR_PAYMENT")).toBe(false);
  });
});
