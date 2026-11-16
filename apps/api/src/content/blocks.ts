import { z } from "zod";
import { isSafeHref, sanitizeText } from "./sanitize";

/** Home blocks live in SiteSetting rows: { draft, published, ... }. */
export const BLOCKS = {
  hero: "content.home.hero",
  featuredDestinations: "content.home.featuredDestinations",
  banners: "content.banners",
} as const;
export type BlockName = keyof typeof BLOCKS;
export const BLOCK_NAMES = Object.keys(BLOCKS) as BlockName[];

const plain = (max: number, min = 0) =>
  z
    .string()
    .max(max * 4)
    .transform(sanitizeText)
    .pipe(z.string().min(min).max(max));
const optPlain = (max: number) =>
  z
    .union([z.null(), plain(max)])
    .optional()
    .transform((value) => value || null);
const href = z
  .union([z.null(), z.string().trim().max(300)])
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || isSafeHref(value), "href");
const mediaId = z
  .union([z.null(), z.uuid()])
  .optional()
  .transform((value) => value ?? null);

const hero = z
  .object({
    headline: plain(120, 3),
    subheadline: optPlain(300),
    ctaLabel: optPlain(40),
    ctaHref: href,
    imageId: mediaId,
  })
  .strict()
  .refine((value) => (value.ctaLabel === null) === (value.ctaHref === null), "cta");

const featuredDestinations = z
  .object({
    title: optPlain(120),
    items: z
      .array(z.object({ destinationId: z.uuid() }).strict())
      .min(1)
      .max(6)
      .refine((items) => new Set(items.map((i) => i.destinationId)).size === items.length, "unique"),
  })
  .strict();

const banners = z
  .object({
    items: z
      .array(z.object({ title: plain(100, 2), text: optPlain(300), href, imageId: mediaId }).strict())
      .min(1)
      .max(5),
  })
  .strict();

export const blockSchemas = { hero, featuredDestinations, banners } as const;
export type BlockValue = Record<string, unknown>;
export type BlockRecord = {
  draft: BlockValue | null;
  published: BlockValue | null;
  publishedAt: string | null;
  publishedById: string | null;
};
export const isBlockName = (value: string): value is BlockName => Object.hasOwn(BLOCKS, value);

/** Parse a stored value defensively: a malformed row reads as empty instead of breaking the page. */
export function readRecord(value: unknown): BlockRecord {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const obj = (item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item) ? (item as BlockValue) : null;
  return {
    draft: obj(raw.draft),
    published: obj(raw.published),
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
    publishedById: typeof raw.publishedById === "string" ? raw.publishedById : null,
  };
}

const ids = (list: unknown, field: string) =>
  (Array.isArray(list) ? list : [])
    .map((item) => (item as Record<string, unknown>)[field])
    .filter((x): x is string => typeof x === "string");

/** Image and destination ids a block value points at. */
export function referencesOf(block: BlockName, value: BlockValue): { mediaIds: string[]; destinationIds: string[] } {
  if (block === "hero")
    return { mediaIds: typeof value.imageId === "string" ? [value.imageId] : [], destinationIds: [] };
  if (block === "banners") return { mediaIds: ids(value.items, "imageId"), destinationIds: [] };
  return { mediaIds: [], destinationIds: ids(value.items, "destinationId") };
}
