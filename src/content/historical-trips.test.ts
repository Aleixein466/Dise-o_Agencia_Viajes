import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { historicalTrips } from "./historical-trips";

describe("historical trip archive", () => {
  it("marks all trips as historical", () => {
    expect(historicalTrips.length).toBe(6);
    expect(historicalTrips.every((trip) => trip.kind === "historical")).toBe(true);
  });

  it("uses unique kebab-case slugs", () => {
    const slugs = historicalTrips.map(({ slug }) => slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true);
  });

  it("links sources to Ricaurte Tours Facebook posts", () => {
    for (const trip of historicalTrips) {
      expect(trip.sourceUrl.startsWith("https://www.facebook.com/ricaurtetours/")).toBe(true);
      for (const photo of trip.photos) {
        expect(photo.sourceUrl.startsWith("https://www.facebook.com/ricaurtetours/")).toBe(true);
      }
    }
  });

  it("references existing public images", () => {
    for (const trip of historicalTrips) {
      expect(existsSync(resolve(process.cwd(), "public", trip.image.slice(1)))).toBe(true);
      for (const photo of trip.photos) {
        expect(existsSync(resolve(process.cwd(), "public", photo.image.slice(1)))).toBe(true);
      }
    }
  });

  it("contains no commercial price or availability fields", () => {
    const forbiddenKeys = new Set(["price", "precio", "availability", "cupos"]);
    for (const trip of historicalTrips) {
      expect(Object.keys(trip).some((key) => forbiddenKeys.has(key))).toBe(false);
    }
  });
});
