import { expect, test, type Page } from "@playwright/test";

// Runs against the isolated E2E database seeded by scripts/seed-cartagena-e2e.ps1 (published "Destino Público E2E").
const next = (page: Page) =>
  page.getByRole("button", { name: /^(Siguiente|Ver valor estimado|Continuar con mis datos)/ }).click();

test("public builder: approved price, request, tracking, idempotency", async ({ page }) => {
  await page.goto("/cotizar");
  await expect(page.getByLabel("Destino Público E2E")).toBeVisible();
  // Draft catalog must never be public.
  await expect(page.getByText("Cartagena E2E", { exact: true })).toHaveCount(0);

  await page.getByLabel("Destino Público E2E").check();
  await next(page);
  await page.getByLabel(/Paquete Público E2E 3 días/).check();
  await next(page);
  await page.getByLabel(/Hotel Público E2E/).check();
  await page.getByLabel(/Doble Público E2E/).check();
  await next(page);
  // No transport configured: the wizard goes straight to travellers.
  await page.getByLabel("Adultos").selectOption("2");
  await next(page);
  // Optional-extras step may be skipped when the package has none; advance at most twice.
  for (let i = 0; i < 2 && !(await page.getByRole("button", { name: "Ver valor estimado" }).isVisible()); i++)
    await next(page);
  await expect(page.getByRole("button", { name: "Ver valor estimado" })).toBeVisible();
  await expect(page.getByText("Alojamiento de prueba")).toBeVisible();
  await expect(page.getByText("Gastos personales")).toBeVisible();
  await next(page);

  // 2 adults × 500.000 COP approved rule, recalculated by the API.
  await expect(page.getByText(/1\.000\.000/).first()).toBeVisible();
  await next(page);

  await page.getByLabel(/Nombre completo/).fill("Viajera Prueba");
  await page.getByLabel(/Correo electrónico/).fill("viajera@publico-e2e.ricaurte.test");
  await page.getByLabel(/WhatsApp o teléfono/).fill("3000000000");
  await page.getByLabel(/Autorizo el tratamiento/).check();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/v1/public/quote-requests") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Enviar solicitud" }).click(),
  ]);
  expect(response.status()).toBe(201);
  const sent = response.request().postDataJSON() as { idempotencyKey: string } & Record<string, unknown>;
  const body = (await response.json()) as { reference: string; trackingCode: string; status: string };
  expect(body.status).toBe("NEW");
  await expect(page.getByText(body.reference)).toBeVisible();
  await expect(page.getByText(body.trackingCode)).toBeVisible();

  // Replaying the same idempotency key returns the same reference, never a new quote or the code again.
  const replay = await page.request.post("/api/v1/public/quote-requests", {
    data: sent,
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ reference: body.reference, trackingCode: null });

  // Client-side amounts are ignored: the server recalculates.
  const { packageId, hotelId, roomTypeId, adults, childAges, optionalTourIds, addOnIds } = sent;
  const tampered = await page.request.post("/api/v1/public/quote-preview", {
    data: { packageId, hotelId, roomTypeId, adults, childAges, optionalTourIds, addOnIds, totalCents: "1" },
  });
  if (tampered.status() === 200) expect(await tampered.json()).toMatchObject({ totalCents: "100000000" });
  else expect(tampered.status()).toBe(400);

  await page.goto("/seguimiento");
  await page.locator('input[name="reference"]').fill(body.reference);
  await page.locator('input[name="trackingCode"]').fill("WRONG-CODE-0000");
  await page.getByRole("button", { name: /Consultar/ }).click();
  // Next.js also renders an (empty) route announcer with role=alert; target the form's message.
  await expect(page.getByRole("alert").filter({ hasText: "No encontramos" })).toBeVisible();
  await page.locator('input[name="trackingCode"]').fill(body.trackingCode);
  await page.getByRole("button", { name: /Consultar/ }).click();
  await expect(page.getByRole("definition").filter({ hasText: /^Recibida$/ })).toBeVisible();
  await expect(page.getByText("Paquete Público E2E 3 días")).toBeVisible();
});

test("public builder is usable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/cotizar");
  await expect(page.getByLabel("Destino Público E2E")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel("Destino Público E2E").check();
  await next(page);
  await expect(page.getByLabel(/Paquete Público E2E 3 días/)).toBeVisible();
});
