import { describe, expect, it, vi } from "vitest";
import { ReservationsController } from "./reservations.controller";

describe("ReservationsController events", () => {
  it("passes the staff-decided deposit through as cents", async () => {
    const auth = {
      cookieName: () => "rt_session",
      requirePermission: vi.fn().mockResolvedValue({ user: { id: "u1" }, roles: ["ADMIN"], permissions: [] }),
    };
    const reservations = { staffEvent: vi.fn(), adminDetail: vi.fn().mockResolvedValue({}) };
    const controller = new ReservationsController(auth as never, reservations as never);
    const id = "00000000-0000-4000-8000-000000000002";
    await controller.event(
      id,
      { event: "APPROVE_FOR_PAYMENT", expectedVersion: 1, requiredDepositCents: "20000000" },
      { headers: { cookie: "rt_session=t" } } as never,
      "csrf",
      "http://localhost:3000",
    );
    expect(reservations.staffEvent).toHaveBeenCalledWith(
      id,
      { id: "u1", role: "ADMIN" },
      "APPROVE_FOR_PAYMENT",
      1,
      undefined,
      20000000n,
    );
  });
});
