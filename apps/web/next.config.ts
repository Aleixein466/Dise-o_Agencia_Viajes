import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// The single local .env lives at the monorepo root (see .env.example); Next only reads apps/web by default.
loadEnvConfig(resolve(process.cwd(), "../.."));

// Baseline security headers (ASVS V3/V14). Script/style CSP with nonces is tracked as backlog F1-09:
// it needs a proxy-based nonce and is not safe to add blindly to statically rendered pages.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Same-origin access to the API (no CORS): /api/v1/* is proxied server-side. The route manifest is built at
// `next build`, so API_INTERNAL_URL must be set at build time. Existing Next routes such as /api/quotes are untouched.
function apiRewrites() {
  const raw = process.env.API_INTERNAL_URL;
  if (!raw) return [];
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("API_INTERNAL_URL must be http(s)");
  return [{ source: "/api/v1/:path*", destination: `${url.origin}/api/v1/:path*` }];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@ricaurte/db"],
  async rewrites() {
    return apiRewrites();
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
