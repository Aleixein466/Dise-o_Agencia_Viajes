import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { historicalTrips } from "@/content/historical-trips";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { absoluteUrl, indexingAllowed } from "@/lib/seo";

beforeEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("robots", () => {
  it("blocks everything when indexing is off", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("allows public paths and lists the sitemap when indexing is on", () => {
    vi.stubEnv("SITE_INDEXING", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/cuenta"] },
      sitemap: "https://example.com/sitemap.xml",
    });
  });
});

describe("sitemap", () => {
  it("lists public pages and trips only", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const urls = sitemap().map((entry) => entry.url);
    expect(historicalTrips).toHaveLength(6);
    for (const trip of historicalTrips) expect(urls).toContain(`https://example.com/destinos/${trip.slug}`);
    expect(urls).toEqual(expect.arrayContaining(["https://example.com/", "https://example.com/destinos", "https://example.com/contacto"]));
    for (const path of ["/privacidad", "/terminos", "/pqrs", "/cotizar"]) expect(urls).not.toContain(`https://example.com${path}`);
    expect(urls).toHaveLength(9);
  });
});

describe("seo helpers", () => {
  it("builds absolute URLs from NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    expect(absoluteUrl("/destinos")).toBe("https://example.com/destinos");
  });

  it("disallows indexing on invalid env", () => {
    vi.stubEnv("SITE_INDEXING", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(indexingAllowed()).toBe(false);
  });
});
