import { describe, expect, it } from "vitest";
import { PortfolioImportService } from "./portfolio-import.service";

describe("PortfolioImportService preview", () => {
  it("reports the complete owner portfolio and flags the Eje Cafetero discrepancy", () => {
    const report = new PortfolioImportService({} as never).preview();
    expect(report).toMatchObject({ destinations: 6, packages: 10, hotels: 21, rates: 35, dryRun: true });
    expect(report.warnings).toHaveLength(2);
    expect(report.warnings.join(" ")).toContain("Eje Cafetero");
  });
});
