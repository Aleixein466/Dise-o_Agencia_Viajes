import { Inject, Injectable } from "@nestjs/common";
import { redact } from "../audit/redact";
import { stale, type Tx } from "../catalog/commercial-rules.service";
import { assertStamp, writeAudit } from "../content/audit";
import { assertReferableMedia, listReferableMedia } from "../content/media";
import { DbService } from "../db/db.service";
import { AGENCY_FIELDS, PUBLIC_FIELDS, type AgencyField } from "./agency-schema";

const ENTITY = "agency_setting";
export const LOGO_KEY = "agency.logoMediaId";
type Values = Record<AgencyField, string | null>;
export type AgencyPatch = Partial<Values>;
type Row = Partial<Record<AgencyField, string | Date | null>> & { updatedAt: Date };

const asDate = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

function logoId(value: unknown): string | null {
  const id = value && typeof value === "object" ? (value as Record<string, unknown>).mediaId : null;
  return typeof id === "string" ? id : null;
}
function snapshot(row: Row | null, logo: string | null): Values {
  const out = {} as Values;
  for (const field of AGENCY_FIELDS) {
    const raw = field === "logoMediaId" ? logo : (row?.[field] ?? null);
    out[field] = raw instanceof Date ? raw.toISOString().slice(0, 10) : (raw as string | null);
  }
  return out;
}

@Injectable()
export class SettingsService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  private async load(client: Tx | Awaited<ReturnType<DbService["client"]>>) {
    const [row, logo] = await Promise.all([
      client.agencySetting.findUnique({ where: { id: 1 } }),
      client.siteSetting.findUnique({ where: { key: LOGO_KEY } }),
    ]);
    return { row: row as Row | null, logo: logoId(logo?.value) };
  }

  async media() {
    return listReferableMedia(await this.db.client());
  }

  async get() {
    const client = await this.db.client();
    const { row, logo } = await this.load(client);
    const values = snapshot(row, logo);
    const asset = logo
      ? await client.mediaAsset.findFirst({
          where: { id: logo, deletedAt: null, visibility: "PUBLIC" },
          select: { id: true, altText: true },
        })
      : null;
    return {
      ...values,
      logo: asset ? { id: asset.id, altText: asset.altText } : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async update(patch: AgencyPatch, expectedUpdatedAt: Date | null, actorId: string) {
    const client = await this.db.client();
    try {
      await client.$transaction(async (tx) => {
        if (patch.logoMediaId) await assertReferableMedia(tx, patch.logoMediaId, "logo");
        const { row, logo } = await this.load(tx);
        if (row) {
          if (!expectedUpdatedAt) throw stale();
          assertStamp(row, expectedUpdatedAt, stale);
        } else if (expectedUpdatedAt) throw stale();
        const before = snapshot(row, logo);
        const after: Values = { ...before };
        for (const field of AGENCY_FIELDS) if (patch[field] !== undefined) after[field] = patch[field] ?? null;
        const { logoMediaId, rntValidUntil, ...plain } = after;
        const data = { ...plain, rntValidUntil: asDate(rntValidUntil) };
        if (row && expectedUpdatedAt) {
          const changed = await tx.agencySetting.updateMany({ where: { id: 1, updatedAt: expectedUpdatedAt }, data });
          if (changed.count !== 1) throw stale();
        } else await tx.agencySetting.create({ data: { id: 1, ...data } });
        if (logoMediaId !== before.logoMediaId) {
          if (logoMediaId)
            await tx.siteSetting.upsert({
              where: { key: LOGO_KEY },
              create: { key: LOGO_KEY, value: { mediaId: logoMediaId } },
              update: { value: { mediaId: logoMediaId } },
            });
          else await tx.siteSetting.deleteMany({ where: { key: LOGO_KEY } });
        }
        const changedFields = AGENCY_FIELDS.filter((field) => before[field] !== after[field]);
        await writeAudit(tx, {
          actorId,
          action: row ? "agency_settings.updated" : "agency_settings.created",
          entity: ENTITY,
          entityId: "1",
          before: row ? before : null,
          after,
          details: { changedFields },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw stale();
      throw error;
    }
    return this.get();
  }

  async history() {
    const client = await this.db.client();
    const rows = await client.auditLog.findMany({
      where: { entity: ENTITY, entityId: "1" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, actorId: true, action: true, details: true, before: true, after: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, before: redact(row.before), after: redact(row.after) }));
  }

  /** Non-sensitive profile for the website. Every value is nullable: nothing is invented. */
  async publicProfile() {
    const client = await this.db.client();
    const { row, logo } = await this.load(client);
    const values = snapshot(row, logo);
    const asset = logo
      ? await client.mediaAsset.findFirst({
          where: { id: logo, deletedAt: null, visibility: "PUBLIC" },
          select: { id: true, altText: true },
        })
      : null;
    const out: Record<string, unknown> = {};
    for (const field of PUBLIC_FIELDS) out[field] = values[field];
    return { ...out, logo: asset ? { id: asset.id, alt: asset.altText } : null };
  }
}
