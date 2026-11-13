import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, absoluteUrl, indexingAllowed } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }, sitemap: absoluteUrl("/sitemap.xml") };
}
