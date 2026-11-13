import { getServerEnv } from "@/lib/env";

export const PRIVATE_PATHS = ["/api/", "/admin", "/cuenta"];

export function siteUrl(): string {
  return getServerEnv().NEXT_PUBLIC_SITE_URL;
}

export function indexingAllowed(): boolean {
  try {
    return getServerEnv().SITE_INDEXING === "true";
  } catch {
    return false;
  }
}

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}
