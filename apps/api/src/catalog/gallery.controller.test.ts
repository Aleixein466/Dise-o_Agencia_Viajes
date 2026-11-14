import { ForbiddenException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { GalleryController } from "./gallery.controller";

function controller() {
  const auth = {
    cookieName: vi.fn(() => "rt_session"),
    requireReadPermission: vi.fn(),
    requirePermission: vi.fn(),
  };
  const gallery = {
    list: vi.fn(),
    associate: vi.fn(),
    upload: vi.fn(),
    update: vi.fn(),
    detach: vi.fn(),
    read: vi.fn(),
    remove: vi.fn(),
  };
  return { auth, gallery, controller: new GalleryController(auth as never, gallery as never) };
}

describe("GalleryController authorization boundary", () => {
  it("rejects a private gallery request without a session before listing media", async () => {
    const value = controller();
    await expect(value.controller.list({ headers: {} } as FastifyRequest)).rejects.toMatchObject({ status: 401 });
    expect(value.gallery.list).not.toHaveBeenCalled();
  });

  it("does not associate media when the CSRF-protected permission check rejects", async () => {
    const value = controller();
    value.auth.requirePermission.mockRejectedValue(new ForbiddenException());
    await expect(
      value.controller.associate(
        "00000000-0000-4000-8000-000000000001",
        { type: "destination", id: "00000000-0000-4000-8000-000000000002" },
        { headers: { cookie: "rt_session=opaque" } } as FastifyRequest,
        "not-valid",
        "http://127.0.0.1:3101",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(value.gallery.associate).not.toHaveBeenCalled();
  });
});
