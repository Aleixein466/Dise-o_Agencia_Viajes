import { describe, expect, it } from "vitest";
import {
  QUOTE_STATUSES,
  STATUS_LABELS,
  actionLabel,
  allowedNextStatuses,
  selectableNextStatuses,
  statusLabel,
} from "./crm-status";

describe("allowedNextStatuses", () => {
  it("matches the CRM contract transition table", () => {
    const table: Record<string, string[]> = {
      NEW: ["ASSIGNED", "DECLINED", "CLOSED"],
      REQUIRES_MANUAL_REVIEW: ["ASSIGNED", "DECLINED", "CLOSED"],
      ASSIGNED: ["PROPOSAL_SENT", "DECLINED", "CLOSED"],
      PROPOSAL_SENT: ["ACCEPTED", "DECLINED", "ASSIGNED"],
      ACCEPTED: ["CLOSED"],
      DECLINED: ["CLOSED"],
      DRAFT: [],
      CLOSED: [],
    };
    for (const status of QUOTE_STATUSES) expect([...allowedNextStatuses(status)]).toEqual(table[status]);
  });

  it("returns nothing for unknown statuses", () => {
    expect(allowedNextStatuses("OTHER")).toEqual([]);
  });

  it("leaves assigning from intake states to the assign action", () => {
    expect(selectableNextStatuses("NEW")).toEqual(["DECLINED", "CLOSED"]);
    expect(selectableNextStatuses("PROPOSAL_SENT")).toContain("ASSIGNED");
  });
});

describe("status labels", () => {
  it("covers every QuoteStatus value with a Spanish label", () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...QUOTE_STATUSES].sort());
    for (const status of QUOTE_STATUSES) expect(statusLabel(status)).not.toBe(status);
  });

  it("falls back to the raw value", () => {
    expect(statusLabel("OTHER")).toBe("OTHER");
    expect(actionLabel("crm.assigned")).toBe("Asignación");
    expect(actionLabel("x")).toBe("x");
  });
});
