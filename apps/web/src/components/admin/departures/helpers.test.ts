import { describe, expect, it } from "vitest";
import {
  createPayload,
  departureValues,
  describeDelta,
  describeDepartureError,
  editPayload,
  parseSeats,
  seatsSummary,
  validateDeparture,
  validateSeatChange,
} from "./helpers";

const current = { capacity: 10, heldSeats: 2, soldSeats: 3 };
const item = {
  startsAt: "2027-01-10T05:00:00.000Z",
  endsAt: "2027-01-14T05:00:00.000Z",
  availabilityStatus: "AVAILABLE",
  ...current,
};

describe("departures helpers", () => {
  it("parses whole seats only", () => {
    expect(parseSeats("12")).toBe(12);
    expect(parseSeats("0")).toBe(0);
    expect(parseSeats("0", 1)).toBeNull();
    expect(parseSeats("2.5")).toBeNull();
    expect(parseSeats("-1")).toBeNull();
    expect(parseSeats("10001")).toBeNull();
  });
  it("round-trips Colombian dates", () => {
    const values = departureValues(item);
    expect(values).toMatchObject({ startsOn: "2027-01-10", endsOn: "2027-01-14", capacity: "10" });
    expect(createPayload(values, "pkg")).toEqual({
      packageId: "pkg",
      startsAt: "2027-01-10T05:00:00Z",
      endsAt: "2027-01-14T05:00:00Z",
      capacity: 10,
      availabilityStatus: "AVAILABLE",
    });
  });
  it("never lets capacity go below held + sold and asks a reason when it changes", () => {
    const values = departureValues(item);
    expect(validateDeparture(values, current)).toEqual({});
    expect(validateDeparture({ ...values, capacity: "4" }, current).capacity).toMatch(/\(5\)/);
    expect(validateDeparture({ ...values, capacity: "8" }, current).reason).toBeDefined();
    expect(validateDeparture({ ...values, capacity: "8", reason: "Bus pequeño" }, current)).toEqual({});
    expect(validateDeparture({ ...values, endsOn: "2027-01-01" }).endsOn).toBeDefined();
    expect(validateDeparture({ ...values, startsOn: "" }).startsOn).toBeDefined();
  });
  it("edit payload carries only changes; the reason only with capacity", () => {
    const initial = departureValues(item);
    expect(editPayload(initial, initial)).toEqual({});
    expect(editPayload({ ...initial, reason: "x", availabilityStatus: "SOLD_OUT" }, initial)).toEqual({
      availabilityStatus: "SOLD_OUT",
    });
    expect(editPayload({ ...initial, capacity: "20", reason: " Bus grande " }, initial)).toEqual({
      capacity: 20,
      reason: "Bus grande",
    });
  });
  it("validates holds and releases against the visible limit", () => {
    expect(validateSeatChange("3", "Grupo", 5, "hold")).toEqual({});
    expect(validateSeatChange("6", "Grupo", 5, "hold").seats).toMatch(/5 cupos disponibles/);
    expect(validateSeatChange("3", "Grupo", 2, "release").seats).toMatch(/2 cupos retenidos/);
    expect(validateSeatChange("0", "", 5, "hold")).toEqual({ seats: expect.any(String), reason: expect.any(String) });
  });
  it("describes overbooking with the seats left", () => {
    expect(describeDepartureError({ status: 409, data: { code: "OVERBOOKING", available: 2 } })).toMatchObject({
      field: "seats",
      message: expect.stringMatching(/quedan 2/),
    });
    expect(describeDepartureError({ status: 409, data: { code: "CAPACITY_BELOW_COMMITTED" } }).field).toBe("capacity");
  });
  it("formats history rows", () => {
    expect(describeDelta("CREATED", 12)).toBe("Capacidad inicial 12");
    expect(describeDelta("HOLD", 1)).toBe("+1 cupo");
    expect(describeDelta("RELEASE", -2)).toBe("−2 cupos");
    expect(describeDelta("CAPACITY", -5)).toBe("−5 en capacidad");
    expect(seatsSummary({ capacityAfter: 10, heldAfter: 2, soldAfter: 3 })).toBe(
      "Capacidad 10 · retenidos 2 · vendidos 3 · libres 5",
    );
  });
});
