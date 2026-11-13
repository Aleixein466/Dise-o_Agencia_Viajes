import { getServerEnv } from "@/lib/env";

export const PRIVATE_PATHS = ["/api/", "/admin", "/cuenta"];
const FALLBACK_SITE_URL = "http://localhost:3000";

/**
 * Never throws: an invalid environment (e.g. the production intake gate) must not take the whole
 * public site down. Falls back to the raw variable when it is a valid URL, else localhost.
 */
export function siteUrl(): string {
  try {
    return getServerEnv().NEXT_PUBLIC_SITE_URL;
  } catch {
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    return raw && URL.canParse(raw) ? raw : FALLBACK_SITE_URL;
  }
}

/** Indexing needs an explicit opt-in AND a public https origin (never localhost canonicals). */
export function indexingAllowed(): boolean {
  try {
    const env = getServerEnv();
    const url = new URL(env.NEXT_PUBLIC_SITE_URL);
    return env.SITE_INDEXING === "true" && url.protocol === "https:" && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

/** Open Graph defaults repeated on pages that override openGraph (Next replaces, not merges). */
export const OPEN_GRAPH_DEFAULTS = { siteName: "Ricaurte Tours", locale: "es_CO", type: "website" } as const;
