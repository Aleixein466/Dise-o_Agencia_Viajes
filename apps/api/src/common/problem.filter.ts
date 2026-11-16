import { STATUS_CODES } from "node:http";
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import { PROBLEM_CONTENT_TYPE, problem } from "@ricaurte/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  // Errors raised by Fastify itself (body too large, bad content type, ...) carry their own status.
  const status = (exception as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : 500;
}

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only a validated error code and conflicting record id pass through; messages never do. */
function extensions(exception: unknown): { code?: string; conflictId?: string } {
  if (!(exception instanceof HttpException)) return {};
  const response = exception.getResponse();
  if (!response || typeof response !== "object") return {};
  const { code, conflictId } = response as Record<string, unknown>;
  return {
    ...(typeof code === "string" && CODE.test(code) ? { code } : {}),
    ...(typeof conflictId === "string" && UUID.test(conflictId) ? { conflictId } : {}),
  };
}

/**
 * Every error leaves as RFC 9457 problem+json. Only the status reason phrase and a validated error code / conflict id
 * are exposed: messages, stack traces and causes stay in the server log.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = statusOf(exception);

    // Deliberate HttpExceptions (e.g. 503 from readiness) are expected; anything else is a bug worth a stack in the log.
    if (status >= 500) {
      if (exception instanceof HttpException) request.log.warn({ status }, "request failed");
      else request.log.error({ err: exception }, "request failed");
    }

    const body = problem.parse({
      title: STATUS_CODES[status] ?? "Error",
      status,
      requestId: request.id,
      ...extensions(exception),
    });
    void reply.status(status).header("content-type", PROBLEM_CONTENT_TYPE).send(body);
  }
}
