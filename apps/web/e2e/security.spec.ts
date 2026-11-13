import { expect, test } from "@playwright/test";

test("security headers on /", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("POST /api/quotes is disabled (503)", async ({ request }) => {
  const res = await request.post("/api/quotes", { data: "{}", headers: { "content-type": "application/json" } });
  expect(res.status()).toBe(503);
});
