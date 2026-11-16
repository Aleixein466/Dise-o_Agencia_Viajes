import { Inject, Injectable } from "@nestjs/common";
import { redact } from "../audit/redact";
import { conflict, notFound, stale, type Tx } from "../catalog/commercial-rules.service";
import { DbService } from "../db/db.service";
import { assertStamp, writeAudit } from "./audit";

/**
 * FAQ items and content pages. New items are DRAFT; only an explicit, audited publish makes them public, and a
 * PUBLISHED item cannot be edited in place (unpublish first), so approved text never changes silently.
 */
export type PublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type StatusAction = "publish" | "unpublish" | "archive" | "restore";
export type FaqInput = { question: string; answer: string; topic?: string | null; sortOrder?: number };
export type PageKind = "PAGE" | "ARTICLE" | "GUIDE";
export type PageInput = {
  slug: string;
  kind: PageKind;
  title: string;
  excerpt?: string | null;
  body: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  noindex?: boolean;
};
export type PagePatch = Partial<Omit<PageInput, "slug">> & { slug?: string };

const faqSelect = {
  id: true,
  question: true,
  answer: true,
  topic: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;
const pageSelect = {
  id: true,
  slug: true,
  kind: true,
  title: true,
  excerpt: true,
  body: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  noindex: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const TARGET: Record<StatusAction, { from: PublicationStatus[]; to: PublicationStatus }> = {
  publish: { from: ["DRAFT"], to: "PUBLISHED" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT" },
  archive: { from: ["DRAFT", "PUBLISHED"], to: "ARCHIVED" },
  restore: { from: ["ARCHIVED"], to: "DRAFT" },
};
const notEditable = () =>
  conflict("NOT_EDITABLE", "Solo se pueden editar borradores. Despublica el contenido para editarlo");
const badTransition = (action: StatusAction) =>
  conflict("INVALID_TRANSITION", `La acción ${action} no aplica al estado actual`);
const slugTaken = () => conflict("SLUG_TAKEN", "Ya existe una página con ese enlace");

type Kind = {
  entity: string;
  prefix: string;
  find: (tx: Tx, id: string) => Promise<{ status: PublicationStatus; updatedAt: Date } | null>;
  apply: (tx: Tx, id: string, expected: Date, data: Record<string, unknown>) => Promise<number>;
  reload: (tx: Tx, id: string) => Promise<object>;
};
const FAQ: Kind = {
  entity: "faq_item",
  prefix: "content_faq",
  find: (tx, id) => tx.faqItem.findFirst({ where: { id }, select: faqSelect }),
  apply: async (tx, id, expected, data) =>
    (await tx.faqItem.updateMany({ where: { id, updatedAt: expected }, data })).count,
  reload: (tx, id) => tx.faqItem.findUniqueOrThrow({ where: { id }, select: faqSelect }),
};
const PAGE: Kind = {
  entity: "content_page",
  prefix: "content_pages",
  find: (tx, id) => tx.contentPage.findFirst({ where: { id, deletedAt: null }, select: pageSelect }),
  apply: async (tx, id, expected, data) =>
    (await tx.contentPage.updateMany({ where: { id, deletedAt: null, updatedAt: expected }, data })).count,
  reload: (tx, id) => tx.contentPage.findUniqueOrThrow({ where: { id }, select: pageSelect }),
};

@Injectable()
export class ContentService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  // FAQ ---------------------------------------------------------------------------------------------------------

  async listFaq(filter: { status?: PublicationStatus; topic?: string }, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.topic ? { topic: { equals: filter.topic, mode: "insensitive" as const } } : {}),
    };
    const [total, items] = await client.$transaction([
      client.faqItem.count({ where }),
      client.faqItem.findMany({
        where,
        select: faqSelect,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page: current, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async getFaq(id: string) {
    const client = await this.db.client();
    const row = await client.faqItem.findFirst({ where: { id }, select: faqSelect });
    if (!row) throw notFound();
    return row;
  }

  async createFaq(input: FaqInput, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const row = await tx.faqItem.create({
        data: {
          question: input.question,
          answer: input.answer,
          topic: input.topic ?? null,
          sortOrder: input.sortOrder ?? 0,
          status: "DRAFT",
        },
        select: faqSelect,
      });
      await writeAudit(tx, {
        actorId,
        action: "content_faq.created",
        entity: FAQ.entity,
        entityId: row.id,
        after: row,
      });
      return row;
    });
  }

  async updateFaq(id: string, patch: Partial<FaqInput>, expectedUpdatedAt: Date, actorId: string) {
    return this.edit(FAQ, id, expectedUpdatedAt, actorId, patch);
  }

  // Pages -------------------------------------------------------------------------------------------------------

  async listPages(filter: { status?: PublicationStatus; kind?: PageKind }, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
    };
    const [total, items] = await client.$transaction([
      client.contentPage.count({ where }),
      client.contentPage.findMany({
        where,
        select: pageSelect,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page: current, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async getPage(id: string) {
    const client = await this.db.client();
    const row = await client.contentPage.findFirst({ where: { id, deletedAt: null }, select: pageSelect });
    if (!row) throw notFound();
    return row;
  }

  async createPage(input: PageInput, actorId: string) {
    const client = await this.db.client();
    try {
      return await client.$transaction(async (tx) => {
        // The unique index also covers soft-deleted rows, so the check does not filter on deletedAt.
        if (await tx.contentPage.findFirst({ where: { slug: input.slug }, select: { id: true } })) throw slugTaken();
        const row = await tx.contentPage.create({
          data: {
            slug: input.slug,
            kind: input.kind,
            title: input.title,
            excerpt: input.excerpt ?? null,
            body: input.body,
            seoTitle: input.seoTitle ?? null,
            seoDescription: input.seoDescription ?? null,
            noindex: input.noindex ?? false,
            status: "DRAFT",
          },
          select: pageSelect,
        });
        await writeAudit(tx, {
          actorId,
          action: "content_pages.created",
          entity: PAGE.entity,
          entityId: row.id,
          after: row,
        });
        return row;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw slugTaken();
      throw error;
    }
  }

  async updatePage(id: string, patch: PagePatch, expectedUpdatedAt: Date, actorId: string) {
    try {
      return await this.edit(PAGE, id, expectedUpdatedAt, actorId, patch, async (tx) => {
        if (
          patch.slug &&
          (await tx.contentPage.findFirst({ where: { slug: patch.slug, id: { not: id } }, select: { id: true } }))
        )
          throw slugTaken();
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw slugTaken();
      throw error;
    }
  }

  // Shared ------------------------------------------------------------------------------------------------------

  private async edit(
    kind: Kind,
    id: string,
    expectedUpdatedAt: Date,
    actorId: string,
    patch: Record<string, unknown>,
    check?: (tx: Tx) => Promise<void>,
  ) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const old = await kind.find(tx, id);
      if (!old) throw notFound();
      assertStamp(old, expectedUpdatedAt, stale);
      if (old.status !== "DRAFT") throw notEditable();
      await check?.(tx);
      const data = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
      if ((await kind.apply(tx, id, expectedUpdatedAt, data)) !== 1) throw stale();
      const after = await kind.reload(tx, id);
      await writeAudit(tx, {
        actorId,
        action: `${kind.prefix}.updated`,
        entity: kind.entity,
        entityId: id,
        before: old,
        after,
      });
      return after;
    });
  }

  faqStatus(id: string, action: StatusAction, expectedUpdatedAt: Date, actorId: string) {
    return this.setStatus(FAQ, id, action, expectedUpdatedAt, actorId);
  }
  pageStatus(id: string, action: StatusAction, expectedUpdatedAt: Date, actorId: string) {
    return this.setStatus(PAGE, id, action, expectedUpdatedAt, actorId);
  }

  private async setStatus(kind: Kind, id: string, action: StatusAction, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const old = await kind.find(tx, id);
      if (!old) throw notFound();
      assertStamp(old, expectedUpdatedAt, stale);
      const rule = TARGET[action];
      if (!rule.from.includes(old.status)) throw badTransition(action);
      const data: Record<string, unknown> = { status: rule.to };
      if (kind === PAGE) data.publishedAt = action === "publish" ? new Date() : null;
      if ((await kind.apply(tx, id, expectedUpdatedAt, data)) !== 1) throw stale();
      const after = await kind.reload(tx, id);
      await writeAudit(tx, {
        actorId,
        action: `${kind.prefix}.${action === "publish" ? "published" : action === "unpublish" ? "unpublished" : action === "archive" ? "archived" : "restored"}`,
        entity: kind.entity,
        entityId: id,
        before: old,
        after,
        details: action === "publish" ? { approvalConfirmed: true } : undefined,
      });
      return after;
    });
  }

  async history(entity: "faq_item" | "content_page", id: string) {
    const client = await this.db.client();
    const exists =
      entity === "faq_item"
        ? await client.faqItem.findFirst({ where: { id }, select: { id: true } })
        : await client.contentPage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) throw notFound();
    const rows = await client.auditLog.findMany({
      where: { entity, entityId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, actorId: true, action: true, before: true, after: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, before: redact(row.before), after: redact(row.after) }));
  }
}
