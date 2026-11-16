import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

function service() {
  const count = vi.fn(async () => 2);
  const client = {
    quote: { count },
    reservation: { count },
    manualAbono: { count },
    pqrsTicket: { count },
  };
  return { count, value: new DashboardService({ client: async () => client } as never) };
}

describe("DashboardService", () => {
  it("returns only the blocks the role may read (FINANCE: payments only)", async () => {
    const { value } = service();
    await expect(value.summary(["payments:read", "payments:approve"])).resolves.toEqual({
      payments: { abonosToApprove: 2 },
    });
  });

  it("returns every block for a role with all read permissions", async () => {
    const { value } = service();
    const out = await value.summary(["quotes:read", "reservations:read", "payments:read", "pqrs:read"]);
    expect(Object.keys(out).sort()).toEqual(["payments", "pqrs", "quotes", "reservations"]);
  });

  it("queries nothing without permissions", async () => {
    const { value, count } = service();
    await expect(value.summary([])).resolves.toEqual({});
    expect(count).not.toHaveBeenCalled();
  });
});

describe("AuthService.requireStaff", () => {
  async function check(roles: string[], mfaVerifiedAt: Date | null) {
    const { AuthService } = await import("../auth/auth.service");
    const auth = Object.create(AuthService.prototype) as InstanceType<typeof AuthService>;
    (auth as unknown as { principal: () => Promise<unknown> }).principal = async () => ({
      roles,
      permissions: [],
      session: { id: "s", mfaVerifiedAt },
    });
    return auth.requireStaff("token");
  }

  it("accepts an MFA-verified staff session", async () => {
    await expect(check(["FINANCE"], new Date())).resolves.toMatchObject({ roles: ["FINANCE"] });
  });

  it("rejects customers and sessions without MFA", async () => {
    await expect(check(["CUSTOMER"], new Date())).rejects.toThrow();
    await expect(check(["ADMIN"], null)).rejects.toThrow();
  });
});
