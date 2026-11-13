import type { MetadataRoute } from "next";
import { historicalTrips } from "@/content/historical-trips";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/destinos", "/contacto", ...historicalTrips.map(({ slug }) => `/destinos/${slug}`)];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
