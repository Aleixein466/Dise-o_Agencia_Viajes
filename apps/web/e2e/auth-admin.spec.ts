import { expect, test } from "@playwright/test";

const email = process.env.AUTH_E2E_EMAIL;
const password = process.env.AUTH_E2E_PASSWORD;
const enabled = Boolean(email && password && process.env.AUTH_E2E_RUN === "1");

test.describe("authentication and staff administration", () => {
  test.skip(!enabled, "Requires an isolated database and AUTH_E2E_* credentials.");
  test.describe.configure({ mode: "serial" });

  test("rejects anonymous access and incorrect credentials", async ({ page, request }) => {
    const anonymous = await request.get("/api/v1/users");
    expect(anonymous.status()).toBe(401);
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/ingresar/);
    await page.getByLabel("Correo electrónico").fill(email!);
    await page.getByLabel("Contraseña").fill("incorrect-password");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.locator(".admin-form-error")).toContainText("Correo o contraseña incorrectos");
  });

  test("requires MFA enrollment and manages an employee end to end", async ({ page }) => {
    await page.goto("/ingresar?next=/admin/usuarios");
    await page.getByLabel("Correo electrónico").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/ingresar\/mfa/);

    await page.getByRole("button", { name: "Configurar una nueva aplicación de autenticación" }).click();
    const codesText = await page.locator(".admin-recovery-codes").textContent();
    const recoveryCode = codesText
      ?.split("·")
      .map((code) => code.trim())
      .find(Boolean);
    expect(recoveryCode).toBeTruthy();
    await page.getByRole("button", { name: "Usar un código de recuperación" }).click();
    await page.getByLabel("Código de recuperación").fill(recoveryCode!);
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

    const suffix = Date.now();
    await page.getByLabel("Nombre").fill(`Asesora E2E ${suffix}`);
    await page.getByLabel("Correo").fill(`asesora-${suffix}@ricaurte.test`);
    await page.getByLabel("Contraseña temporal").fill("E2e-temporary-password-2026");
    await page.getByRole("button", { name: "Crear empleado" }).click();
    await expect(page.getByRole("status")).toContainText("Empleado creado");
    await expect(page.getByText(`Asesora E2E ${suffix}`)).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Desactivar" }).last().click();
    await expect(page.getByRole("status")).toContainText("sesiones revocadas");
  });
});
