import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAYMENT_STATUSES } from "./payments/state-machine";
import { RESERVATION_EVENTS, RESERVATION_STATES, ROLES } from "./reservations/state-machine";

const schema = readFileSync(fileURLToPath(new URL("../../db/prisma/schema.prisma", import.meta.url)), "utf8");

function enumValues(name: string): string[] {
  const block = new RegExp(`^enum ${name} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  if (!block) throw new Error(`enum ${name} not found in packages/db/prisma/schema.prisma`);
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line !== "" && !line.startsWith("@@"));
}

describe("Prisma enums match the domain state machines", () => {
  it("ReservationStatus equals RESERVATION_STATES", () => {
    expect(enumValues("ReservationStatus")).toEqual([...RESERVATION_STATES]);
  });

  it("PaymentStatus equals PAYMENT_STATUSES", () => {
    expect(enumValues("PaymentStatus")).toEqual([...PAYMENT_STATUSES]);
  });

  it("ReservationEventType equals RESERVATION_EVENTS", () => {
    expect(enumValues("ReservationEventType")).toEqual([...RESERVATION_EVENTS]);
  });

  it("ActorRole equals ROLES and RoleCode is ROLES without SYSTEM", () => {
    expect(enumValues("ActorRole")).toEqual([...ROLES]);
    expect(enumValues("RoleCode")).toEqual(ROLES.filter((role) => role !== "SYSTEM"));
  });
});
