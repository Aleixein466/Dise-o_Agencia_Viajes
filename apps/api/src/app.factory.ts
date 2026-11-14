import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { FastifyServerOptions } from "fastify";
import { ProblemFilter } from "./common/problem.filter";
import type { ApiEnv } from "./config/env";

export const API_PREFIX = "api/v1";
export const BODY_LIMIT_BYTES = 16 * 1024;

type LoggerOptions = Exclude<NonNullable<FastifyServerOptions["logger"]>, boolean>;

export function loggerOptions(env: ApiEnv, stream?: LoggerOptions["stream"]): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    // Defence in depth: headers are not logged by default, but a future serializer must not leak credentials.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "headers.authorization",
        "headers.cookie",
      ],
      censor: "[Redacted]",
    },
    ...(stream ? { stream } : {}),
  };
}

export function createAdapter(env: ApiEnv, stream?: LoggerOptions["stream"]): FastifyAdapter {
  return new FastifyAdapter({
    logger: loggerOptions(env, stream),
    bodyLimit: BODY_LIMIT_BYTES,
    // Never trust a client-supplied id: always mint our own.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? (_address, hop) => hop < env.TRUST_PROXY_HOPS : false,
  });
}

/** Shared by main.ts and the tests so both exercise the same pipeline. Call before `init()`/`listen()`. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemFilter());

  // No CORS on purpose: the browser only talks to the web origin, which proxies /api/v1.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 4, parts: 5 } });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id);
    void reply.header("cache-control", "no-store");
  });
}
