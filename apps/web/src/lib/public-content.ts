import { z } from "zod";
import { apiInternalUrl } from "@/lib/auth/server";

/**
 * Server-only readers for the API's public read model (`/public/agency`, `/public/content`). The API already
 * returns only PUBLISHED rows; this layer additionally validates the shape, refuses unsafe links and degrades to
 * `null` on any failure so pages keep their static, approved fallback copy (also on previews without an API).
 */
export const PUBLIC_CONTENT_TAG = "public-content";
/** Long TTL on purpose: a short one makes every static route (they all share the footer) re-prefetch constantly.
 * Admin changes invalidate the tag on demand (`/api/revalidate-content`), so this is only a safety net. */
const REVALIDATE_SECONDS = 3600;

const nullableText = z.union([z.string(), z.null()]).optional().default(null);

const agencySchema = z.object({
  tradeName: nullableText,
  address: nullableText,
  city: nullableText,
  phone: nullableText,
  whatsapp: nullableText,
  contactEmail: nullableText,
  businessHours: nullableText,
  facebookUrl: nullableText,
  instagramUrl: nullableText,
  tiktokUrl: nullableText,
  youtubeUrl: nullableText,
});
export type AgencyProfile = z.infer<typeof agencySchema>;

const faqSchema = z.object({ id: z.string(), question: z.string().min(1), answer: z.string().min(1) });
const heroSchema = z.object({
  headline: z.string().min(1),
  subheadline: nullableText,
  ctaLabel: nullableText,
  ctaHref: nullableText,
});
const contentSchema = z.object({
  faq: z.array(faqSchema).default([]),
  home: z
    .object({
      hero: heroSchema.nullable().default(null),
      featuredDestinations: z
        .object({
          title: nullableText,
          items: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string().min(1) })).default([]),
        })
        .nullable()
        .default(null),
      banners: z
        .object({
          items: z.array(z.object({ title: z.string().min(1), text: nullableText, href: nullableText })).default([]),
        })
        .nullable()
        .default(null),
    })
    .default({ hero: null, featuredDestinations: null, banners: null }),
});
export type PublicContent = z.infer<typeof contentSchema>;

async function readPublic<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const base = apiInternalUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/v1${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_TAG] },
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const getAgencyProfile = () => readPublic("/public/agency", agencySchema);
export const getPublicContent = () => readPublic("/public/content", contentSchema);

export type FaqItem = { q: string; a: string };
/** Published FAQ rows replace the static copy. With none published (fresh site, or every row retired) or no API,
 * the approved static copy stays, so the home never shows an empty FAQ section. */
export function faqItemsFor(content: PublicContent | null, fallback: readonly FaqItem[]): readonly FaqItem[] {
  return content && content.faq.length > 0 ? content.faq.map((f) => ({ q: f.question, a: f.answer })) : fallback;
}

/** Only same-site paths and http(s) URLs are ever rendered as links. */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** wa.me link from a stored phone number; digits only, otherwise no link. */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 20 ? `https://wa.me/${digits}` : null;
}

export function telHref(phone: string | null | undefined): string | null {
  const value = (phone ?? "").replace(/[^\d+]/g, "");
  return /^\+?\d{7,20}$/.test(value) ? `tel:${value}` : null;
}

export function mailHref(email: string | null | undefined): string | null {
  return email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? `mailto:${email}` : null;
}
