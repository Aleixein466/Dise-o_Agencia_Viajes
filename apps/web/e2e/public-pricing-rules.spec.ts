import { expect, test, type Page } from "@playwright/test";

// Commercial pricing rules against the isolated E2E database: approved 500.000 COP/adult rule (double room, max 2)
// and the authorized test promotion E2E10 (10 %), both seeded by scripts/seed-cartagena-e2e.ps1. No age rules exist.
const next = (page: Page) =>
  page.getByRole("button", { name: /^(Siguiente|Ver valor estimado|Continuar con mis datos)/ }).click();

type Preview = {
  status: string;
  totalCents: string | null;
  reasons: string[];
  notices: string[];
  promotion: { code: string; discountCents: string } | null;
};

test("pricing rules: authorized promotion, invalid code, minors and occupancy", async ({ page }) => {
  await page.goto("/cotizar");
  await page.getByLabel("Destino Público E2E").check();
  await next(page);
  await page.getByLabel(/Paquete Público E2E 3 días/).check();
  await next(page);
  await page.getByLabel(/Hotel Público E2E/).check();
  await page.getByLabel(/Doble Público E2E/).check();
  await next(page);
  await page.getByLabel("Adultos").selectOption("2");
  await next(page);
  for (let i = 0; i < 2 && !(await page.getByRole("button", { name: "Ver valor estimado" }).isVisible()); i++)
    await next(page);
  const [first] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/v1/public/quote-preview")),
    next(page),
  ]);
  await expect(page.getByText(/1\.000\.000/).first()).toBeVisible();

  // The customer types the code; the server recalculates: 1.000.000 − 10 % = 900.000.
  await page.getByLabel("Código promocional (opcional)").fill("e2e10");
  const [promoResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/v1/public/quote-preview")),
    page.getByRole("button", { name: "Aplicar" }).click(),
  ]);
  expect((await promoResponse.json()) as Preview).toMatchObject({
    status: "PRICED",
    totalCents: "90000000",
    promotion: { code: "E2E10", discountCents: "10000000" },
  });
  await expect(page.locator("#wz-promo-status")).toContainText("Promoción aplicada: Promoción E2E 10 %");
  await expect(page.getByText(/900\.000/).first()).toBeVisible();

  const base = first.request().postDataJSON() as Record<string, unknown>;
  const preview = async (patch: Record<string, unknown>) => {
    const response = await page.request.post("/api/v1/public/quote-preview", { data: { ...base, ...patch } });
    expect(response.status()).toBe(200);
    return (await response.json()) as Preview;
  };

  // Unknown code never fails the quote: price unchanged, non-blocking notice.
  const invalid = await preview({ promotionCode: "NO-EXISTE" });
  expect(invalid).toMatchObject({ status: "PRICED", totalCents: "100000000", promotion: null });
  expect(invalid.notices.join(" ")).toMatch(/no es válido/);

  // A minor without an approved age rule is never priced from the adult rate.
  const minor = await preview({ adults: 1, childAges: [5], promotionCode: "E2E10" });
  expect(minor).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null, promotion: null });
  expect(minor.reasons.join(" ")).toMatch(/menores/);

  // Three travellers in a double room: an advisor proposes the distribution.
  const crowded = await preview({ adults: 3 });
  expect(crowded).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null });
  expect(crowded.reasons.join(" ")).toMatch(/capacidad/);
});
