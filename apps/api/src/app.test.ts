import "reflect-metadata";
import { Writable } from "node:stream";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { healthResponse, problem } from "@ricaurte/validation";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT_BYTES, configureApp, createAdapter } from "./app.factory";
import { AppModule } from "./app.module";
import { DbService } from "./db/db.service";
import { AuthService } from "./auth/auth.service";
import { parseEnv, type ApiEnv } from "./config/env";

const apps: NestFastifyApplication[] = [];

async function boot(
  overrides: Record<string, string> = {},
  options: { db?: Pick<DbService, "isReady">; auth?: Partial<AuthService>; logStream?: Writable } = {},
): Promise<NestFastifyApplication> {
  const env: ApiEnv = parseEnv({ LOG_LEVEL: options.logStream ? "info" : "silent", ...overrides });
  let builder = Test.createTestingModule({ imports: [AppModule.register(env)] });
  if (options.db) builder = builder.overrideProvider(DbService).useValue(options.db);
  if (options.auth) builder = builder.overrideProvider(AuthService).useValue(options.auth);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(env, options.logStream), {
    logger: false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /api/v1/health", () => {
  it("returns 200 with the shared schema and hardening headers, without a database", async () => {
    const app = await boot();
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode, response.body).toBe(200);
    expect(healthResponse.parse(response.json())).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ignores a client-supplied request id", async () => {
    const app = await boot();
    const response = await app.inject({ method: "GET", url: "/api/v1/health", headers: { "x-request-id": "evil" } });
    expect(response.headers["x-request-id"]).not.toBe("evil");
  });
});

describe("GET /api/v1/health/ready", () => {
  it("returns 503 problem+json when DATABASE_URL is missing", async () => {
    const app = await boot();
    const response = await app.inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(problem.parse(response.json())).toMatchObject({ status: 503, title: "Service Unavailable" });
  });

  it("returns 503 without leaking the cause when the database is unreachable", async () => {
    const app = await boot({ DATABASE_URL: "postgresql://user:s3cret@127.0.0.1:1/none" });
    const response = await app.inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toMatch(/s3cret|ECONNREFUSED|127\.0\.0\.1/);
  });

  it("returns 200 when the database answers", async () => {
    const app = await boot({}, { db: { isReady: async () => true } });
    const response = await app.inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(healthResponse.parse(response.json())).toEqual({ status: "ok" });
  });
});

describe("error handling", () => {
  it("answers unknown routes with problem+json 404", async () => {
    const app = await boot();
    const response = await app.inject({ method: "GET", url: "/api/v1/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    const body = problem.parse(response.json());
    expect(body).toMatchObject({ status: 404, title: "Not Found", type: "about:blank" });
    expect(body.requestId).toBe(response.headers["x-request-id"]);
    expect(response.body).not.toMatch(/stack|at .*\(/);
  });

  it("rejects bodies over 16 KB with problem+json 413", async () => {
    const app = await boot();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/health",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ filler: "x".repeat(BODY_LIMIT_BYTES) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(problem.parse(response.json())).toMatchObject({ status: 413 });
  });
});

describe("logging", () => {
  it("redacts authorization and cookie headers", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const app = await boot({}, { logStream });
    app
      .getHttpAdapter()
      .getInstance()
      .log.info({ headers: { authorization: "Bearer top-secret", cookie: "sid=top-secret" } }, "probe");

    const output = lines.join("");
    expect(output).toContain("probe");
    expect(output).not.toContain("top-secret");
    expect(output).toContain("[Redacted]");
  });
});

describe("parseEnv", () => {
  it("applies defaults and treats an empty DATABASE_URL as unset", () => {
    const env = parseEnv({ DATABASE_URL: "" });
    expect(env).toMatchObject({ PORT: 4000, HOST: "127.0.0.1", TRUST_PROXY_HOPS: 0 });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("names invalid variables without echoing their values", () => {
    expect(() => parseEnv({ PORT: "99999", DATABASE_URL: "mysql://secret" })).toThrow(
      /Invalid environment configuration: PORT, DATABASE_URL$/,
    );
  });
});

describe("authentication HTTP contract", () => {
  it("sets an opaque HttpOnly session cookie after a successful login", async () => {
    const app = await boot(
      {},
      {
        auth: {
          cookieName: () => "__Host-rt_session",
          secureCookie: () => true,
          login: async () => ({ token: "opaque-token", mfaRequired: true }),
        },
      },
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "staff@example.com", password: "a-password-long-enough" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ mfaRequired: true });
    expect(response.headers["set-cookie"]).toContain(
      "__Host-rt_session=opaque-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200; Secure",
    );
  });

  it("does not accept a malformed login request", async () => {
    const app = await boot({}, { auth: { login: async () => ({ token: "never", mfaRequired: false }) } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "not-an-email", password: "x" },
    });
    expect(response.statusCode).toBe(400);
    expect(problem.parse(response.json())).toMatchObject({ status: 400 });
  });

  it("requires the opaque cookie before exposing session data", async () => {
    const app = await boot({}, { auth: { cookieName: () => "__Host-rt_session", session: async () => ({}) as never } });
    const response = await app.inject({ method: "GET", url: "/api/v1/auth/session" });
    expect(response.statusCode, response.body).toBe(401);
  });
});
