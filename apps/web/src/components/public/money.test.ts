import { describe, expect, it } from "vitest";
import { formatCop } from "./money";

const normalize = (value: string | null) => value?.replace(/ /g, " ");

describe("formatCop", () => {
  it("formats cents strings as COP pesos", () => {
    expect(normalize(formatCop("123456700"))).toBe("$ 1.234.567");
    expect(normalize(formatCop("0"))).toBe("$ 0");
  });

  it("keeps precision beyond Number.MAX_SAFE_INTEGER", () => {
    expect(normalize(formatCop("900719925474099300"))).toBe("$ 9.007.199.254.740.993");
  });

  it("rounds half up to whole pesos and handles negatives", () => {
    expect(normalize(formatCop("150"))).toBe("$ 2");
    expect(normalize(formatCop("149"))).toBe("$ 1");
    expect(normalize(formatCop("-250000"))).toBe("-$ 2.500");
  });

  it("returns null for missing or malformed amounts", () => {
    expect(formatCop(null)).toBeNull();
    expect(formatCop(undefined)).toBeNull();
    expect(formatCop("12.5")).toBeNull();
    expect(formatCop("abc")).toBeNull();
    expect(formatCop("")).toBeNull();
  });
});
