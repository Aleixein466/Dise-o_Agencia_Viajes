import { isIP } from "node:net";
import type { ServerEnv } from "@/lib/env";

/**
 * Resolve the client IP only from a header that a proxy we control overwrites.
 * Client-supplied values are never trusted: with CLIENT_IP_SOURCE="none" this returns null.
 *
 * - "x-real-ip" / "cf-connecting-ip": single value set by the edge (e.g. Vercel, Cloudflare).
 * - "x-forwarded-for": take the entry appended by the first trusted proxy, counting
 *   TRUSTED_PROXY_HOPS from the right. Entries to the left of it are attacker-controlled.
 */
export function getClientIp(
  headers: Headers,
  env: Pick<ServerEnv, "CLIENT_IP_SOURCE" | "TRUSTED_PROXY_HOPS">,
): string | null {
  switch (env.CLIENT_IP_SOURCE) {
    case "none":
      return null;
    case "x-real-ip":
    case "cf-connecting-ip":
      return validIp(headers.get(env.CLIENT_IP_SOURCE));
    case "x-forwarded-for": {
      const entries = (headers.get("x-forwarded-for") ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      return validIp(entries[entries.length - env.TRUSTED_PROXY_HOPS]);
    }
  }
}

function validIp(value: string | null | undefined): string | null {
  const ip = value?.trim();
  return ip && isIP(ip) !== 0 ? ip : null;
}
