import { Inject, Injectable } from "@nestjs/common";
import { redact } from "../audit/redact";
import { badRequest, conflict, notFound, stale, type Tx } from "../catalog/commercial-rules.service";
import { DbService } from "../db/db.service";
import { assertStamp, toJson, writeAudit } from "./audit";
import {
  BLOCKS,
  BLOCK_NAMES,
  readRecord,
  referencesOf,
  type BlockName,
  type BlockRecord,
  type BlockValue,
} from "./blocks";
import { assertReferableMedia, listReferableMedia } from "./media";

const ENTITY = "content_block";
const noDraft = () => conflict("NO_DRAFT", "No hay borrador para publicar");
const notPublished = () => conflict("NOT_PUBLISHED", "El bloque no está publicado");

async function assertReferences(tx: Tx, block: BlockName, value: BlockValue) {
  const { mediaIds, destinationIds } = referencesOf(block, value);
  for (const id of mediaIds) await assertReferableMedia(tx, id);
  for (const id of destinationIds) {
    const found = await tx.destination.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!found) throw badRequest("DESTINATION_NOT_FOUND", "Un destino elegido ya no existe");
  }
}

const present = (block: BlockName, row: { value: unknown; updatedAt: Date } | null) => {
  const record = readRecord(row?.value);
  return {
    block,
    key: BLOCKS[block],
    draft: record.draft,
    published: record.published,
    publishedAt: record.publishedAt,
    hasUnpublishedChanges: record.draft !== null && JSON.stringify(record.draft) !== JSON.stringify(record.published),
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };
};

@Injectable()
export class ContentBlocksService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async media() {
    return listReferableMedia(await this.db.client());
  }

  async list() {
    const client = await this.db.client();
    const rows = await client.siteSetting.findMany({ where: { key: { in: BLOCK_NAMES.map((n) => BLOCKS[n]) } } });
    return BLOCK_NAMES.map((name) => present(name, rows.find((r) => r.key === BLOCKS[name]) ?? null));
  }

  async history(block: BlockName) {
    const client = await this.db.client();
    const rows = await client.auditLog.findMany({
      where: { entity: ENTITY, entityId: BLOCKS[block] },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, actorId: true, action: true, before: true, after: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, before: redact(row.before), after: redact(row.after) }));
  }

  /** Saves the DRAFT only. The published copy is never touched here. */
  async saveDraft(block: BlockName, draft: BlockValue, expectedUpdatedAt: Date | null, actorId: string) {
    const client = await this.db.client();
    const key = BLOCKS[block];
    try {
      return await client.$transaction(async (tx) => {
        await assertReferences(tx, block, draft);
        const old = await tx.siteSetting.findUnique({ where: { key } });
        if (old) {
          if (!expectedUpdatedAt) throw stale();
          assertStamp(old, expectedUpdatedAt, stale);
        } else if (expectedUpdatedAt) throw stale();
        const record = { ...readRecord(old?.value), draft };
        if (old && expectedUpdatedAt) {
          const changed = await tx.siteSetting.updateMany({
            where: { key, updatedAt: expectedUpdatedAt },
            data: { value: toJson(record) },
          });
          if (changed.count !== 1) throw stale();
        } else await tx.siteSetting.create({ data: { key, value: toJson(record) } });
        const row = await tx.siteSetting.findUniqueOrThrow({ where: { key } });
        await writeAudit(tx, {
          actorId,
          action: "content_blocks.draft_saved",
          entity: ENTITY,
          entityId: key,
          before: old ? { draft: readRecord(old.value).draft } : null,
          after: { draft },
        });
        return present(block, row);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw stale();
      throw error;
    }
  }

  /** Copies draft -> published. The caller has already confirmed the commercial approval. */
  async publish(block: BlockName, expectedUpdatedAt: Date, actorId: string) {
    return this.mutate(block, expectedUpdatedAt, actorId, "content_blocks.published", async (tx, record) => {
      if (!record.draft) throw noDraft();
      await assertReferences(tx, block, record.draft);
      return { ...record, published: record.draft, publishedAt: new Date().toISOString(), publishedById: actorId };
    });
  }

  async unpublish(block: BlockName, expectedUpdatedAt: Date, actorId: string) {
    return this.mutate(block, expectedUpdatedAt, actorId, "content_blocks.unpublished", async (_tx, record) => {
      if (!record.published) throw notPublished();
      return { ...record, published: null, publishedAt: null, publishedById: null };
    });
  }

  /** Throws away the draft and starts again from what is live (or from nothing). */
  async discardDraft(block: BlockName, expectedUpdatedAt: Date, actorId: string) {
    return this.mutate(block, expectedUpdatedAt, actorId, "content_blocks.draft_discarded", async (_tx, record) => {
      if (!record.draft) throw noDraft();
      return { ...record, draft: record.published };
    });
  }

  private async mutate(
    block: BlockName,
    expectedUpdatedAt: Date,
    actorId: string,
    action: string,
    next: (tx: Tx, record: BlockRecord) => Promise<BlockRecord>,
  ) {
    const client = await this.db.client();
    const key = BLOCKS[block];
    return client.$transaction(async (tx) => {
      const old = await tx.siteSetting.findUnique({ where: { key } });
      if (!old) throw notFound();
      assertStamp(old, expectedUpdatedAt, stale);
      const before = readRecord(old.value);
      const after = await next(tx, before);
      const changed = await tx.siteSetting.updateMany({
        where: { key, updatedAt: expectedUpdatedAt },
        data: { value: toJson(after) },
      });
      if (changed.count !== 1) throw stale();
      const row = await tx.siteSetting.findUniqueOrThrow({ where: { key } });
      await writeAudit(tx, {
        actorId,
        action,
        entity: ENTITY,
        entityId: key,
        before,
        after,
        details: action.endsWith(".published") ? { approvalConfirmed: true } : undefined,
      });
      return present(block, row);
    });
  }
}
