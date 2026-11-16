import { BadRequestException, ConflictException, InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProblemFilter } from "./problem.filter";

function run(exception: unknown) {
  const send = vi.fn();
  const reply = { status: vi.fn(() => reply), header: vi.fn(() => reply), send };
  const request = { id: "req-1", log: { warn: vi.fn(), error: vi.fn() } };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }) };
  new ProblemFilter().catch(exception, host as never);
  return send.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe("ProblemFilter", () => {
  it("passes a stable code and conflict id, never the message", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const body = run(new ConflictException({ code: "SEASON_OVERLAP", message: "Se cruza con X", conflictId: id }));
    expect(body).toMatchObject({ status: 409, code: "SEASON_OVERLAP", conflictId: id });
    expect(JSON.stringify(body)).not.toContain("Se cruza");
  });

  it("drops malformed codes and anything from non-HTTP errors", () => {
    expect(run(new BadRequestException({ code: "drop table; --" }))).not.toHaveProperty("code");
    const crash = run(Object.assign(new Error("secret"), { code: "SECRET_CODE" }));
    expect(crash).toMatchObject({ status: 500 });
    expect(crash).not.toHaveProperty("code");
    expect(run(new InternalServerErrorException())).toMatchObject({ status: 500 });
  });
});
