import { describe, expect, it } from "vitest";
import { dashboardCards } from "./dashboard-summary";

describe("dashboardCards", () => {
  it("shows only the blocks returned for the role and flags pending work", () => {
    const cards = dashboardCards({ payments: { abonosToApprove: 3 }, pqrs: { open: 2, overdue: 0 } });
    expect(cards.map((card) => [card.key, card.value, card.alert])).toEqual([
      ["payments", 3, true],
      ["pqrs", 2, false],
    ]);
  });

  it("is empty for an empty summary", () => {
    expect(dashboardCards({})).toEqual([]);
  });
});
