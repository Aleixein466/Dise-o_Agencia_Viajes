import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.CARTAGENA_E2E_ADMIN_EMAIL;
const adminPassword = process.env.CARTAGENA_E2E_ADMIN_PASSWORD;
const restrictedEmail = process.env.CARTAGENA_E2E_RESTRICTED_EMAIL;
const restrictedPassword = process.env.CARTAGENA_E2E_RESTRICTED_PASSWORD;

async function loginAndCompleteInitialMfa(page: Page, email: string, password: string, next: string) {
  await page.goto(`/ingresar?next=${encodeURIComponent(next)}`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/ingresar\/mfa/);
  await page.getByRole("button", { name: /Configurar una nueva aplicación/ }).click();
  const code = (await page.locator(".admin-recovery-codes").textContent())
    ?.split(/(?:·|Â·)/)
    .map((value) => value.trim())
    .find(Boolean);
  expect(code).toBeTruthy();
  await page.getByRole("button", { name: /Usar un código de recuperación/ }).click();
  await page.locator("#mfa-recovery").fill(code!);
  await page.getByRole("button", { name: /Verificar/ }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}

test.describe("Cartagena E2E catalog", () => {
  test("persists a draft rate and keeps catalog media private", async ({ page, browser }) => {
    if (!adminEmail || !adminPassword || !restrictedEmail || !restrictedPassword)
      throw new Error("Cartagena E2E credentials are required.");
    await loginAndCompleteInitialMfa(page, adminEmail!, adminPassword!, "/admin/tarifas");
    await page.getByPlaceholder("Nombre o referencia").fill("Cartagena E2E");
    const cartagenaRow = page.getByRole("row", { name: /Cartagena E2E/ });
    await expect(cartagenaRow).toBeVisible();
    await cartagenaRow.getByRole("button", { name: /Editar y previsualizar/ }).click();
    await expect(page.getByRole("paragraph").filter({ hasText: "Hotel Cartagena E2E" })).toBeVisible();

    const fixture = await page.evaluate(async () => {
      const response = await fetch("/api/v1/catalog/packages?pageSize=50");
      const body = (await response.json()) as {
        items: Array<{ title: string; id: string; priceRules: Array<{ id: string; active?: boolean }> }>;
      };
      const pkg = body.items.find((item) => item.title.includes("Cartagena E2E"));
      if (!pkg?.priceRules[0]) throw new Error("Cartagena E2E fixture is missing");
      return { packageId: pkg.id, rateId: pkg.priceRules[0].id, active: pkg.priceRules[0].active };
    });
    expect(fixture.active).toBeFalsy();

    page.once("dialog", (dialog) => dialog.accept("123460000"));
    await page.getByRole("button", { name: /Editar tarifa/ }).click();
    await expect(page.getByRole("status")).toContainText(/Tarifa de borrador actualizada/);
    await page.reload();
    await page.getByPlaceholder("Nombre o referencia").fill("Cartagena E2E");
    await page
      .getByRole("row", { name: /Cartagena E2E/ })
      .getByRole("button", { name: /Editar y previsualizar/ })
      .click();
    await expect(page.getByText(/1[.,]234[.,]600/)).toBeVisible();
    await page.getByRole("button", { name: /Ver historial/ }).click();
    const history = page.getByRole("heading", { name: /Historial:/ }).locator("..");
    await expect(history.getByText(/Actor:/).first()).toBeVisible();
    await expect(history.getByText(/1[.,]234[.,]500/).first()).toBeVisible();
    await expect(history.getByText(/1[.,]234[.,]600/).first()).toBeVisible();

    const csrfAndRate = await page.evaluate(async (rateId) => {
      const session = await (await fetch("/api/v1/auth/session")).json();
      const preview = await (await fetch("/api/v1/catalog/packages?pageSize=50")).json();
      const pkg = preview.items.find((item: { id: string }) => item.id);
      const rejected = await fetch(`/api/v1/catalog/rates/${rateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": "invalid" },
        body: JSON.stringify({ amountCents: "123470000" }),
      });
      return { csrf: session.csrfToken as string, rejected: rejected.status, packageId: pkg.id as string };
    }, fixture.rateId);
    expect(csrfAndRate.rejected).toBe(403);

    await page.goto("/admin/galeria");
    await page.locator('select[name="owner"]').selectOption({ label: "Cartagena E2E" });
    await page.locator('input[name="altText"]').fill("Cartagena E2E privada");
    await page.locator('input[name="file"]').setInputFiles({
      name: "cartagena-e2e.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNgCN8BQhAKABrSBD0CaYszAAAAAElFTkSuQmCC",
        "base64",
      ),
    });
    const upload = page.waitForResponse((response) => response.url().includes("/api/v1/gallery/upload/"));
    await page.getByRole("button", { name: /Subir fotografía/ }).click();
    expect((await upload).status()).toBe(201);
    await expect(page.getByRole("status")).toContainText(/Fotografía privada subida/);
    await expect(page.locator('img[alt="Cartagena E2E privada"]')).toBeVisible();

    const asset = await page.evaluate(async () => {
      const destination = await (await fetch("/api/v1/catalog/destinations")).json();
      const cartagena = destination.find((item: { name: string }) => item.name === "Cartagena E2E");
      const assets = await (await fetch(`/api/v1/gallery?type=destination&ownerId=${cartagena.id}`)).json();
      return assets.find((item: { altText: string }) => item.altText === "Cartagena E2E privada").id as string;
    });

    const restricted = await browser.newContext();
    const restrictedPage = await restricted.newPage();
    await loginAndCompleteInitialMfa(restrictedPage, restrictedEmail!, restrictedPassword!, "/admin");
    const forbidden = await restrictedPage.evaluate(
      async ({ rateId, assetId }) => {
        const session = await (await fetch("/api/v1/auth/session")).json();
        const rate = await fetch(`/api/v1/catalog/rates/${rateId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
          body: JSON.stringify({ amountCents: "123470000" }),
        });
        const image = await fetch(`/api/v1/gallery/${assetId}`);
        return { rate: rate.status, image: image.status };
      },
      { rateId: fixture.rateId, assetId: asset },
    );
    expect(forbidden.rate).toBe(403);
    expect(forbidden.image).toBe(403);
    await restricted.close();
  });
});
