import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

// RFC 6238 (SHA-1, 30 s, 6 digits), the parameters the API advertises in its otpauth URL.
function totp(base32: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.replace(/[\s=]/g, "")) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

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
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  });

  test("requires MFA enrollment and manages an employee end to end", async ({ page }) => {
    await page.goto("/ingresar?next=/admin/usuarios");
    await page.getByLabel("Correo electrónico").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/ingresar\/mfa/);

    await page.getByRole("button", { name: "Configurar una nueva aplicación de autenticación" }).click();
    const qr = page.getByRole("img", { name: /Código QR para agregar la cuenta/ });
    await expect(qr).toBeVisible();
    expect(await qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml;/);
    const manualKey = (await page.locator(".admin-mfa-enroll .admin-code").textContent())?.trim() ?? "";
    expect(manualKey).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/);
    await expect(page.locator(".admin-recovery-codes")).not.toBeEmpty();
    // Avoid a code that expires between typing and verifying.
    if (Date.now() % 30_000 > 25_000) await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
    await page.getByLabel("Código de la aplicación de autenticación").fill(totp(manualKey));
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

    // Target the new employee's row: the shared E2E database also lists customer accounts (staff may not disable those).
    await page
      .getByRole("row", { name: new RegExp(`Asesora E2E ${suffix}`) })
      .getByRole("button", { name: "Desactivar" })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("status")).toContainText("sesiones revocadas");
  });
});
