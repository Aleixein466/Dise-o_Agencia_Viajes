import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { CrmController } from "./crm.controller";

const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;

describe("CrmController contact gate", () => {
  it("does not allow contact details without customers:read", async () => {
    const auth = {
      cookieName: vi.fn(() => "rt_session"),
      requireReadPermission: vi.fn().mockResolvedValue({ permissions: ["quotes:read"] }),
      requirePermission: vi.fn(),
    };
    const crm = {
      get: vi.fn(),
      list: vi.fn(),
      advisors: vi.fn(),
      assign: vi.fn(),
      changeStatus: vi.fn(),
      addNote: vi.fn(),
      stats: vi.fn(),
    };
    const controller = new CrmController(auth as never, crm as never);

    await controller.get("00000000-0000-4000-8000-000000000001", request);

    expect(crm.get).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", false);
  });
});
