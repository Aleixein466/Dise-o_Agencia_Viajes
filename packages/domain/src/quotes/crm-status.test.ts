import { describe, expect, it } from "vitest";
import { CRM_QUOTE_STATUSES, canTransitionCrmStatus } from "./crm-status";

// Written directly from docs/orchestration/contracts/crm.md, not derived from the transition table.
const allowed: Record<string, readonly string[]> = {
  NEW: ["ASSIGNED", "DECLINED", "CLOSED"],
  REQUIRES_MANUAL_REVIEW: ["ASSIGNED", "DECLINED", "CLOSED"],
  ASSIGNED: ["PROPOSAL_SENT", "DECLINED", "CLOSED"],
  PROPOSAL_SENT: ["ACCEPTED", "DECLINED", "ASSIGNED"],
  ACCEPTED: ["CLOSED"],
  DECLINED: ["CLOSED"],
  DRAFT: [],
  CLOSED: [],
};

describe("CRM quote status transitions", () => {
  it("allows and forbids every status pair from the written contract", () => {
    for (const from of CRM_QUOTE_STATUSES)
      for (const to of CRM_QUOTE_STATUSES)
        expect(canTransitionCrmStatus(from, to), `${from} -> ${to}`).toBe(allowed[from].includes(to));
  });
});
