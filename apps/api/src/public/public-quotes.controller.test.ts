import { describe, expect, it } from "vitest";
import { selection } from "./public-quotes.controller";

const base = { packageId: "00000000-0000-4000-8000-000000000001", adults: 2 };
const tour = "00000000-0000-4000-8000-0000000000a1";

describe("public selection schema (Codex pricing review)", () => {
  it("refuses duplicated optional tours or add-ons (they would be charged once per repetition)", () => {
    expect(selection.safeParse({ ...base, optionalTourIds: [tour, tour] }).success).toBe(false);
    expect(selection.safeParse({ ...base, addOnIds: [tour, tour] }).success).toBe(false);
    expect(selection.safeParse({ ...base, optionalTourIds: [tour] }).success).toBe(true);
  });
});
