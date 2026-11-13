import { cache } from "react";
import { headers } from "next/headers";
import { sessionSchema, type SessionResult } from "./types";

/** Server-only: API_INTERNAL_URL is never exposed to the browser. */
export function apiInternalUrl(): string | undefined {
  const raw = process.env.API_INTERNAL_URL;
  if (!raw || !URL.canParse(raw)) return undefined;
  const url = new URL(raw);
  return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
}

export const getSessionResult = cache(async (): Promise<SessionResult> => {
  const base = apiInternalUrl();
  if (!base) return { status: "error" };
  const cookie = (await headers()).get("cookie");
  if (!cookie) return { status: "anonymous" };
  try {
    const response = await fetch(`${base}/api/v1/auth/session`, {
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return { status: "anonymous" };
    if (!response.ok) return { status: "error" };
    const parsed = sessionSchema.safeParse(await response.json());
    return parsed.success ? { status: "ok", session: parsed.data } : { status: "error" };
  } catch {
    return { status: "error" };
  }
});

/** Set by src/proxy.ts (layouts cannot read the URL). */
export async function currentPathname(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "/admin";
}
