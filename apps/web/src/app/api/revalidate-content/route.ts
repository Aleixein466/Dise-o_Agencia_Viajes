import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { PUBLIC_CONTENT_TAG } from "@/lib/public-content";
import { getSessionResult } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/nav";

/**
 * Called by the admin UI right after a content or settings change succeeds, so the public pages (cached for a long
 * time) refresh at once. Requires an MFA-verified staff session with a content/settings write permission, the same
 * origin and the session's CSRF token; it only expires one cache tag and never reads or returns data.
 */
const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A missing, opaque (`null`) or malformed Origin is a refusal, never a 500. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { error: "origin" });
  const result = await getSessionResult();
  if (result.status !== "ok") return json(result.status === "anonymous" ? 401 : 503, { error: "session" });
  const { session } = result;
  if (!session.mfaCompleted) return json(403, { error: "mfa" });
  const allowed =
    hasPermission(session.permissions, "content:write") || hasPermission(session.permissions, "settings:write");
  if (!allowed) return json(403, { error: "forbidden" });
  const csrf = request.headers.get("x-csrf-token") ?? "";
  if (!csrf || !sameToken(csrf, session.csrfToken)) return json(403, { error: "csrf" });
  // `expire: 0` (not stale-while-revalidate): the next visit rebuilds the page first, so a retired FAQ, banner or
  // hero is never served once more after the staff unpublished it.
  revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 });
  return json(200, { ok: true });
}
