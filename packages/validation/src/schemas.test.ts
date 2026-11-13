import { describe, expect, it } from "vitest";
import { healthResponse, problem } from "./index";

describe("healthResponse", () => {
  it("accepts only status ok", () => {
    expect(healthResponse.safeParse({ status: "ok" }).success).toBe(true);
    expect(healthResponse.safeParse({ status: "down" }).success).toBe(false);
    expect(healthResponse.safeParse({ status: "ok", leak: 1 }).success).toBe(false);
  });
});

describe("problem", () => {
  it("defaults type to about:blank and rejects non-error statuses", () => {
    expect(problem.parse({ title: "Not Found", status: 404 }).type).toBe("about:blank");
    expect(problem.safeParse({ title: "OK", status: 200 }).success).toBe(false);
  });
});
