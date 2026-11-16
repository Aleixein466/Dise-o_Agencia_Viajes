import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

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

test("staff manages their own profile and security controls", async ({ page }) => {
  test.skip(!email || !password, "Requires the isolated AUTH_E2E account.");

  await page.goto("/ingresar?next=/admin/perfil");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/ingresar\/mfa/);

  await page.getByRole("button", { name: "Configurar una nueva aplicación de autenticación" }).click();
  const manualKey = (await page.locator(".admin-mfa-enroll .admin-code").textContent())?.trim() ?? "";
  if (Date.now() % 30_000 > 25_000) await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
  await page.getByLabel("Código de la aplicación de autenticación").fill(totp(manualKey));
  await page.getByRole("button", { name: "Verificar" }).click();

  await expect(page).toHaveURL(/\/admin\/perfil$/);
  await expect(page.getByRole("heading", { name: "Mi perfil y seguridad" })).toBeVisible();
  await expect(page.getByText("Cuenta protegida")).toBeVisible();

  const name = `Admin perfil E2E ${Date.now()}`;
  await page.getByLabel("Nombre visible").fill(name);
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("status")).toContainText("Nombre actualizado");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByLabel("Contraseña actual").last().fill(password!);
  await page.getByRole("button", { name: "Regenerar códigos" }).click();
  await expect(page.getByRole("region", { name: "Nuevos códigos de recuperación" })).toBeVisible();

  await page.getByRole("button", { name: "Cerrar otras sesiones" }).click();
  await expect(page.getByRole("status")).toContainText(/sesiones activas|sesión\(es\) cerrada/);
  await expect(page.getByRole("table")).toContainText("Esta sesión");

  await page.getByLabel("Nuevo correo").fill(`perfil-${Date.now()}@ricaurte.test`);
  await page.getByLabel("Contraseña actual").nth(1).fill(password!);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByRole("status")).toContainText("Código enviado");
  await expect(page.getByLabel("Código de 6 dígitos")).toBeVisible();
});
