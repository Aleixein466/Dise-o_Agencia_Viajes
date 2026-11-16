import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "../content/test-db";
import { PublicAgencyController, SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

const ACTOR = "00000000-0000-4000-8000-0000000000ff";
const MEDIA = "00000000-0000-4000-8000-0000000000a1";
const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;
const ORIGIN = "http://localhost:3000";

function controllerFor(role: RoleCode) {
  const granted = permissionsForRoles([role]) as ReadonlySet<string>;
  const check = (permission: string) => {
    if (!granted.has(permission)) throw new ForbiddenException();
    return { user: { id: "staff" } };
  };
  const auth = {
    cookieName: vi.fn(() => "rt_session"),
    requirePermission: vi.fn(async (_t: string, _c?: string, _o?: string, permission = "") => check(permission)),
    requireReadPermission: vi.fn(async (_t: string, permission: string) => check(permission)),
  };
  const settings = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
  return { auth, settings, controller: new SettingsController(auth as never, settings as never) };
}

describe("SettingsController", () => {
  it("only settings:write can read or write", async () => {
    const { controller, settings } = controllerFor("FINANCE");
    await expect(controller.get(request)).rejects.toMatchObject({ status: 403 });
    await expect(
      controller.update({ tradeName: "X", expectedUpdatedAt: null }, request, "csrf", ORIGIN),
    ).rejects.toMatchObject({ status: 403 });
    expect(settings.update).not.toHaveBeenCalled();
  });
  it("normalises valid input", async () => {
    const { controller, settings, auth } = controllerFor("ADMIN");
    await controller.update(
      {
        expectedUpdatedAt: null,
        tradeName: " Ricaurte <b>Tours</b> ",
        phone: "+57 (300) 123-4567",
        contactEmail: " Info@Example.COM ",
        facebookUrl: "https://facebook.com/agencia",
        city: "",
      },
      request,
      "csrf",
      ORIGIN,
    );
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "settings:write");
    expect(settings.update).toHaveBeenCalledWith(
      {
        tradeName: "Ricaurte Tours",
        phone: "+573001234567",
        contactEmail: "info@example.com",
        facebookUrl: "https://facebook.com/agencia",
        city: null,
      },
      null,
      "staff",
    );
  });
  it("rejects bad emails, non-http urls, bad phones, overlong text, unknown fields and empty patches", async () => {
    const { controller, settings } = controllerFor("ADMIN");
    const bad: Record<string, unknown>[] = [
      { contactEmail: "no-es-correo" },
      { facebookUrl: "javascript:alert(1)" },
      { instagramUrl: "ftp://x.co/a" },
      { youtubeUrl: "https://user:pw@youtube.com" },
      { phone: "abc123" },
      { whatsapp: "+57 300" },
      { address: "x".repeat(251) },
      { nit: "NIT 123" },
      { rntValidUntil: "30/12/2027" },
      { logoMediaId: "https://x.co/logo.png" },
      { unknownField: "x" },
      {},
    ];
    for (const patch of bad)
      await expect(
        controller.update({ ...patch, expectedUpdatedAt: null }, request, "csrf", ORIGIN),
      ).rejects.toMatchObject({ status: 400 });
    expect(settings.update).not.toHaveBeenCalled();
  });
  it("refuses anything that looks like a secret by key name", async () => {
    const { controller, settings } = controllerFor("ADMIN");
    for (const key of ["apiKey", "wompi_secret", "authToken", "smtpPassword", "PRIVATE_KEY"])
      await expect(
        controller.update({ [key]: "x", tradeName: "Agencia", expectedUpdatedAt: null }, request, "csrf", ORIGIN),
      ).rejects.toMatchObject({
        response: { code: "SECRETS_NOT_ALLOWED" },
      });
    expect(settings.update).not.toHaveBeenCalled();
  });
});

function serviceSetup(seed = {}) {
  const fake = fakeDb({
    mediaAsset: [
      {
        id: MEDIA,
        altText: "Logo",
        mimeType: "image/webp",
        objectKey: "l.webp",
        visibility: "PUBLIC",
        deletedAt: null,
      },
    ],
    ...seed,
  });
  return { ...fake, service: new SettingsService(fake.db) };
}

describe("SettingsService", () => {
  it("reads an empty profile with every field null (nothing invented)", async () => {
    const { service } = serviceSetup();
    const empty = await service.get();
    expect(empty).toMatchObject({ tradeName: null, nit: null, rnt: null, logo: null, updatedAt: null });
  });
  it("creates the singleton once, audits changed fields and then requires the current stamp", async () => {
    const { service, tables } = serviceSetup();
    const created = await service.update(
      { tradeName: "Ricaurte Tours", city: "Bogotá", rntValidUntil: "2027-03-31" },
      null,
      ACTOR,
    );
    expect(created).toMatchObject({ tradeName: "Ricaurte Tours", rntValidUntil: "2027-03-31" });
    expect(tables.agencySetting!.rows).toHaveLength(1);
    expect(tables.auditLog!.rows).toMatchObject([
      {
        action: "agency_settings.created",
        entity: "agency_setting",
        entityId: "1",
        details: { changedFields: ["tradeName", "rntValidUntil", "city"] },
      },
    ]);
    await expect(service.update({ city: "Cali" }, null, ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    await expect(service.update({ city: "Cali" }, new Date(0), ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    const next = await service.update({ city: "Cali" }, new Date(created.updatedAt!), ACTOR);
    expect(next).toMatchObject({ city: "Cali", tradeName: "Ricaurte Tours" });
    const last = tables.auditLog!.rows.at(-1)!;
    expect(last).toMatchObject({ action: "agency_settings.updated", details: { changedFields: ["city"] } });
    expect((last.before as { city: string }).city).toBe("Bogotá");
  });
  it("stores the logo as an existing public media id, replaces it and clears it", async () => {
    const { service, tables } = serviceSetup();
    const first = await service.update({ tradeName: "Agencia" }, null, ACTOR);
    await expect(
      service.update({ logoMediaId: "00000000-0000-4000-8000-0000000000b9" }, new Date(first.updatedAt!), ACTOR),
    ).rejects.toMatchObject({
      response: { code: "MEDIA_NOT_FOUND" },
    });
    const withLogo = await service.update({ logoMediaId: MEDIA }, new Date(first.updatedAt!), ACTOR);
    expect(withLogo.logo).toEqual({ id: MEDIA, altText: "Logo" });
    expect(tables.siteSetting!.rows).toMatchObject([{ key: "agency.logoMediaId", value: { mediaId: MEDIA } }]);
    const cleared = await service.update({ logoMediaId: null }, new Date(withLogo.updatedAt!), ACTOR);
    expect(cleared.logo).toBeNull();
    expect(tables.siteSetting!.rows).toHaveLength(0);
  });
  it("redacts contact data in history but keeps the list of changed fields", async () => {
    const { service } = serviceSetup();
    await service.update({ contactEmail: "info@example.com", phone: "+573001234567" }, null, ACTOR);
    const rows = (await service.history()) as unknown as {
      after: Record<string, unknown>;
      details: { changedFields: string[] };
    }[];
    expect(JSON.stringify(rows)).not.toContain("info@example.com");
    expect(JSON.stringify(rows)).not.toContain("3001234567");
    expect(rows[0]!.details.changedFields).toEqual(["phone", "contactEmail"]);
  });
  it("public profile omits the internal bookings mailbox and has no id or audit data", async () => {
    const { service } = serviceSetup();
    await service.update(
      {
        tradeName: "Agencia",
        contactEmail: "info@example.com",
        bookingsEmail: "reservas@example.com",
        logoMediaId: MEDIA,
      },
      null,
      ACTOR,
    );
    const profile = await new PublicAgencyController(service).profile();
    expect(profile).toMatchObject({
      tradeName: "Agencia",
      contactEmail: "info@example.com",
      logo: { id: MEDIA, alt: "Logo" },
    });
    expect(JSON.stringify(profile)).not.toContain("reservas@example.com");
    expect(profile).not.toHaveProperty("bookingsEmail");
    expect(profile).not.toHaveProperty("updatedAt");
  });
});
