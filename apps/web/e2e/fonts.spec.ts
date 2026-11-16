import { expect, test } from "@playwright/test";

// The brand fonts are self-hosted (src/app/fonts). In a real browser the family that the CSS really applies must have
// LOADED faces (a CSS variable that points at a family nobody declares falls back to Arial without any error), the
// font files must come from this origin and nothing may be requested from Google. Needs no API or database, so it runs
// in the CI smoke job right after `pnpm build`, which is where a build-time font download used to fail.
for (const path of ["/", "/ingresar"]) {
  test(`brand fonts are self-hosted and applied ${path}`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const fontFiles = new Set<string>();
    const google: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (request.resourceType() === "font") fontFiles.add(url);
      if (/^https?:\/\/[^/]*(google|gstatic)/i.test(url)) google.push(url);
    });

    await page.goto(path);
    const applied = () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const named = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const first = getComputedStyle(element).fontFamily.split(",")[0]!.replace(/["']/g, "").trim();
          const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, "") === first);
          return { first, declared: faces.length, loaded: faces.filter((face) => face.status === "loaded").length };
        };
        return { body: named("body"), accent: named("h1 em, h2 em") };
      });

    await expect.poll(async () => (await applied()).body?.loaded ?? 0).toBeGreaterThan(0);
    const { body, accent } = await applied();
    expect(body?.first, "body font family").not.toMatch(/Fallback$/);
    expect(body?.declared, "faces declared for the body family").toBeGreaterThan(0);
    expect(accent, "headline accent (h1 em / h2 em) is present").not.toBeNull();
    await expect.poll(async () => (await applied()).accent?.loaded ?? 0).toBeGreaterThan(0);
    expect(accent?.first, "the headline accent uses the display family").not.toBe(body?.first);

    expect(fontFiles.size, "font files requested").toBeGreaterThanOrEqual(2);
    for (const url of fontFiles) {
      expect(new URL(url).origin, `font served from this origin: ${url}`).toBe(origin);
      expect(new URL(url).pathname).toMatch(/^\/_next\/static\/media\/.+\.woff2$/);
    }
    expect(google, "no request to Google").toEqual([]);
  });
}
