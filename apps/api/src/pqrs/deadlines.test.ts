import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  colombianHolidays,
  easterSunday,
  parseDaysByType,
  parseHolidayList,
  responseDueAt,
} from "./deadlines";

const base = { defaultDays: 15, daysByType: {}, holidays: "none" as const, extraHolidays: [] };

describe("PQRS deadlines", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });

  it("lists the 18 national holidays of Colombia for 2026 (Ley 51 de 1983)", () => {
    expect(colombianHolidays(2026)).toEqual([
      "2026-01-01",
      "2026-01-12",
      "2026-03-23",
      "2026-04-02",
      "2026-04-03",
      "2026-05-01",
      "2026-05-18",
      "2026-06-08",
      "2026-06-15",
      "2026-06-29",
      "2026-07-20",
      "2026-08-07",
      "2026-08-17",
      "2026-10-12",
      "2026-11-02",
      "2026-11-16",
      "2026-12-08",
      "2026-12-25",
    ]);
  });

  it("counts business days in Bogotá local time, from the day after filing", () => {
    // Friday 2026-11-13 22:00 Bogotá = Saturday 03:00Z: still Friday locally → next business day Monday.
    expect(addBusinessDays(new Date("2026-11-14T03:00:00Z"), 1).toISOString()).toBe("2026-11-17T03:00:00.000Z");
  });

  it("skips Colombian holidays only when enabled", () => {
    const filed = new Date("2026-11-13T15:00:00Z"); // Friday; Monday 16 is a holiday
    expect(responseDueAt(base, "PETITION", filed).toISOString().slice(0, 10)).toBe("2026-12-04");
    expect(
      responseDueAt({ ...base, holidays: "colombia" }, "PETITION", filed)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-12-07");
  });

  it("applies per-type terms and extra decreed holidays", () => {
    const filed = new Date("2026-11-16T15:00:00Z");
    const config = {
      ...base,
      daysByType: parseDaysByType("SUGGESTION=10"),
      extraHolidays: parseHolidayList("2026-11-17"),
    };
    expect(responseDueAt(config, "SUGGESTION", filed).toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(responseDueAt(config, "CLAIM", filed).toISOString().slice(0, 10)).toBe("2026-12-08");
  });

  it("rejects malformed configuration", () => {
    expect(() => parseDaysByType("PETITION=0")).toThrow();
    expect(() => parseDaysByType("OTHER=5")).toThrow();
    expect(() => parseHolidayList("2026-02-30")).toThrow();
    expect(parseDaysByType("")).toEqual({});
  });
});
