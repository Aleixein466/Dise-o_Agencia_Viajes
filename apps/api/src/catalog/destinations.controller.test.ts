import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { DestinationsController } from "./destinations.controller";

const ID = "00000000-0000-4000-8000-000000000001";
const STAMP = "2026-11-16T12:00:00.000Z";
const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;

function setup() {
  const auth = {
    cookieName: vi.fn(() => "rt_session"),
    requirePermission: vi.fn(async () => ({ user: { id: "staff" } })),
    requireReadPermission: vi.fn(async () => ({ user: { id: "staff" } })),
  };
  const destinations = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
  return {
    destinations,
    controller: new DestinationsController(auth as never, destinations as never, {} as never),
  };
}

describe("DestinationsController", () => {
  it("forwards guarded edits with their optimistic-lock timestamp", async () => {
    const { controller, destinations } = setup();
    await controller.update(
      ID,
      { name: "Providencia", description: "Mar y naturaleza", expectedUpdatedAt: STAMP },
      request,
      "csrf",
      "http://localhost:3000",
    );
    expect(destinations.update).toHaveBeenCalledWith(
      ID,
      { name: "Providencia", description: "Mar y naturaleza" },
      new Date(STAMP),
      "staff",
    );
  });

  it("requires a timestamp for edits and publication transitions", async () => {
    const { controller, destinations } = setup();
    await expect(
      controller.update(ID, { name: "Providencia" }, request, "csrf", "http://localhost:3000"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(controller.publish(ID, {}, request, "csrf", "http://localhost:3000")).rejects.toMatchObject({
      status: 400,
    });
    expect(destinations.update).not.toHaveBeenCalled();
    expect(destinations.setStatus).not.toHaveBeenCalled();
  });

  it("publishes, unpublishes and archives explicitly", async () => {
    const { controller, destinations } = setup();
    const body = { expectedUpdatedAt: STAMP };
    await controller.publish(ID, body, request, "csrf", "http://localhost:3000");
    await controller.unpublish(ID, body, request, "csrf", "http://localhost:3000");
    await controller.archive(ID, body, request, "csrf", "http://localhost:3000");
    expect(destinations.setStatus.mock.calls.map((call) => call[1])).toEqual(["PUBLISHED", "DRAFT", "ARCHIVED"]);
  });

  it("validates UUIDs before reading history", async () => {
    const { controller, destinations } = setup();
    await expect(controller.history("not-an-id", request)).rejects.toMatchObject({ status: 400 });
    expect(destinations.history).not.toHaveBeenCalled();
  });
});
