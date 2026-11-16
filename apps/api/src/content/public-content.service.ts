import { Inject, Injectable } from "@nestjs/common";
import { notFound } from "../catalog/commercial-rules.service";
import { DbService } from "../db/db.service";
import { BLOCKS, readRecord, referencesOf, type BlockName, type BlockValue } from "./blocks";

/**
 * Public read model. Only PUBLISHED rows and the `published` copy of each block are ever returned: drafts,
 * archived items and unapproved promotions never leave the admin API.
 */
@Injectable()
export class PublicContentService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async content() {
    const client = await this.db.client();
    const [faq, pages, settings] = await Promise.all([
      client.faqItem.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, question: true, answer: true, topic: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
      client.contentPage.findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        select: {
          slug: true,
          kind: true,
          title: true,
          excerpt: true,
          seoTitle: true,
          seoDescription: true,
          noindex: true,
          publishedAt: true,
        },
        orderBy: [{ title: "asc" }, { id: "asc" }],
      }),
      client.siteSetting.findMany({ where: { key: { in: Object.values(BLOCKS) } } }),
    ]);
    const published = (name: BlockName): BlockValue | null =>
      readRecord(settings.find((row) => row.key === BLOCKS[name])?.value).published;
    const hero = published("hero");
    const featured = published("featuredDestinations");
    const banners = published("banners");

    const mediaIds = [hero, banners].flatMap((value, index) =>
      value ? referencesOf(index === 0 ? "hero" : "banners", value).mediaIds : [],
    );
    const destinationIds = featured ? referencesOf("featuredDestinations", featured).destinationIds : [];
    const [media, destinations] = await Promise.all([
      mediaIds.length
        ? client.mediaAsset.findMany({
            where: {
              id: { in: mediaIds },
              deletedAt: null,
              visibility: "PUBLIC",
              NOT: { objectKey: { startsWith: "receipts/" } },
            },
            select: { id: true, altText: true },
          })
        : [],
      destinationIds.length
        ? client.destination.findMany({
            where: { id: { in: destinationIds }, deletedAt: null, status: "PUBLISHED" },
            select: { id: true, slug: true, name: true },
          })
        : [],
    ]);
    const image = (id: unknown) => {
      const found = typeof id === "string" ? media.find((m) => m.id === id) : undefined;
      return found ? { id: found.id, alt: found.altText } : null;
    };
    return {
      faq,
      pages,
      home: {
        hero: hero ? { ...hero, image: image(hero.imageId) } : null,
        featuredDestinations: featured
          ? {
              title: featured.title ?? null,
              items: ((featured.items as { destinationId: string }[]) ?? []).flatMap((item) => {
                const destination = destinations.find((d) => d.id === item.destinationId);
                return destination ? [destination] : [];
              }),
            }
          : null,
        banners: banners
          ? {
              items: ((banners.items as Record<string, unknown>[]) ?? []).map((item) => ({
                ...item,
                image: image(item.imageId),
              })),
            }
          : null,
      },
    };
  }

  async page(slug: string) {
    const client = await this.db.client();
    const row = await client.contentPage.findFirst({
      where: { slug, status: "PUBLISHED", deletedAt: null },
      select: {
        slug: true,
        kind: true,
        title: true,
        excerpt: true,
        body: true,
        seoTitle: true,
        seoDescription: true,
        noindex: true,
        publishedAt: true,
      },
    });
    if (!row) throw notFound();
    return row;
  }
}
