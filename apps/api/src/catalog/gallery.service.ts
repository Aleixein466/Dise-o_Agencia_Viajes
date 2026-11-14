import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { fileTypeFromBuffer } from "file-type";
import sharp, { type Metadata, type Sharp } from "sharp";
import { DbService } from "../db/db.service";

export type GalleryOwner = { type: "destination" | "hotel" | "package"; id: string };
const base = () =>
  process.env.MEDIA_STORAGE_DIR ||
  join(process.env.LOCALAPPDATA || process.env.TEMP || "C:\\Temp", "RicaurteTours", "private-media");

@Injectable()
export class GalleryService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  private async requireOwner(client: Awaited<ReturnType<DbService["client"]>>, owner: GalleryOwner) {
    const exists =
      owner.type === "destination"
        ? await client.destination.findFirst({ where: { id: owner.id, deletedAt: null }, select: { id: true } })
        : owner.type === "hotel"
          ? await client.hotel.findFirst({ where: { id: owner.id, deletedAt: null }, select: { id: true } })
          : await client.tourPackage.findFirst({ where: { id: owner.id, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException();
  }

  private attachmentWhere(owner: Exclude<GalleryOwner, { type: "package" }>) {
    return owner.type === "destination" ? { destinationId: owner.id } : { hotelId: owner.id };
  }

  async upload(owner: GalleryOwner, altText: string, raw: Buffer, actorId: string) {
    if (raw.length === 0 || raw.length > 5 * 1024 * 1024)
      throw new BadRequestException("Archivo demasiado grande o vacío");
    const kind = await fileTypeFromBuffer(raw);
    if (!kind || !["image/jpeg", "image/png", "image/webp"].includes(kind.mime))
      throw new BadRequestException("Formato de imagen no permitido");
    let image: Sharp;
    let metadata: Metadata;
    try {
      image = sharp(raw, { limitInputPixels: 20_000_000, failOn: "error" });
      metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000) throw new Error();
    } catch {
      throw new BadRequestException("Imagen corrupta o con dimensiones no permitidas");
    }
    const client = await this.db.client();
    await this.requireOwner(client, owner);
    let encoded: Buffer;
    try {
      encoded = await image.rotate().webp({ quality: 88 }).toBuffer();
    } catch {
      throw new BadRequestException("Imagen corrupta o con recursos no permitidos");
    }
    const key = `${randomUUID()}.webp`;
    await mkdir(base(), { recursive: true });
    await writeFile(join(base(), key), encoded, { flag: "wx" });
    try {
      return await client.$transaction(async (tx) => {
        const asset = await tx.mediaAsset.create({
          data: {
            objectKey: key,
            altText: altText.trim() || "Imagen sin descripción",
            mimeType: "image/webp",
            visibility: "PRIVATE",
            sizeBytes: encoded.length,
            width: metadata.width,
            height: metadata.height,
            sha256: createHash("sha256").update(encoded).digest("hex"),
            uploadedById: actorId,
          },
        });
        if (owner.type === "package") {
          const last = await tx.packageImage.aggregate({ where: { packageId: owner.id }, _max: { sortOrder: true } });
          await tx.packageImage.create({
            data: { packageId: owner.id, assetId: asset.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
          });
        } else {
          const last = await tx.mediaAttachment.aggregate({
            where: this.attachmentWhere(owner),
            _max: { sortOrder: true },
          });
          await tx.mediaAttachment.create({
            data: { assetId: asset.id, ...this.attachmentWhere(owner), sortOrder: (last._max.sortOrder ?? -1) + 1 },
          });
        }
        await tx.auditLog.create({
          data: { actorId, action: "gallery.uploaded", entity: "media", entityId: asset.id },
        });
        return asset;
      });
    } catch (error) {
      await unlink(join(base(), key)).catch(() => undefined);
      throw error;
    }
  }

  async list(owner?: GalleryOwner) {
    const client = await this.db.client();
    if (owner) await this.requireOwner(client, owner);
    const assets = await client.mediaAsset.findMany({
      where: {
        deletedAt: null,
        visibility: "PRIVATE",
        ...(owner?.type === "package" ? { packageImages: { some: { packageId: owner.id } } } : {}),
        ...(owner?.type === "destination" ? { attachments: { some: { destinationId: owner.id } } } : {}),
        ...(owner?.type === "hotel" ? { attachments: { some: { hotelId: owner.id } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        altText: true,
        mimeType: true,
        sizeBytes: true,
        width: true,
        height: true,
        createdAt: true,
        packageImages: { select: { packageId: true, sortOrder: true, package: { select: { title: true } } } },
        attachments: {
          select: {
            destinationId: true,
            hotelId: true,
            sortOrder: true,
            destination: { select: { name: true } },
            hotel: { select: { name: true } },
          },
        },
      },
    });
    return assets.map((asset) => ({
      ...asset,
      owners: [
        ...asset.packageImages.map((x) => ({
          type: "package" as const,
          id: x.packageId,
          name: x.package.title,
          sortOrder: x.sortOrder,
        })),
        ...asset.attachments.map((x) =>
          x.destinationId
            ? {
                type: "destination" as const,
                id: x.destinationId,
                name: x.destination?.name ?? "Destino",
                sortOrder: x.sortOrder,
              }
            : { type: "hotel" as const, id: x.hotelId!, name: x.hotel?.name ?? "Hotel", sortOrder: x.sortOrder },
        ),
      ],
    }));
  }

  async associate(assetId: string, owner: GalleryOwner, actorId: string) {
    const client = await this.db.client();
    await this.requireOwner(client, owner);
    const asset = await client.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null, visibility: "PRIVATE" },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException();
    await client
      .$transaction(async (tx) => {
        if (owner.type === "package") {
          const last = await tx.packageImage.aggregate({ where: { packageId: owner.id }, _max: { sortOrder: true } });
          await tx.packageImage.create({
            data: { assetId, packageId: owner.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
          });
        } else {
          const last = await tx.mediaAttachment.aggregate({
            where: this.attachmentWhere(owner),
            _max: { sortOrder: true },
          });
          await tx.mediaAttachment.create({
            data: { assetId, ...this.attachmentWhere(owner), sortOrder: (last._max.sortOrder ?? -1) + 1 },
          });
        }
        await tx.auditLog.create({
          data: { actorId, action: "gallery.associated", entity: "media", entityId: assetId },
        });
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === "P2002") throw new ConflictException("La imagen ya está asociada");
        throw error;
      });
  }

  async update(
    assetId: string,
    input: { altText?: string; owner?: GalleryOwner; sortOrder?: number; cover?: boolean },
    actorId: string,
  ) {
    const client = await this.db.client();
    const asset = await client.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null, visibility: "PRIVATE" },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException();
    await client.$transaction(async (tx) => {
      if (input.altText !== undefined)
        await tx.mediaAsset.update({
          where: { id: assetId },
          data: { altText: input.altText.trim() || "Imagen sin descripción" },
        });
      if (input.owner) {
        if (input.owner.type === "package") {
          const where = { packageId_assetId: { packageId: input.owner.id, assetId } };
          if (input.cover)
            await tx.packageImage.updateMany({
              where: { packageId: input.owner.id, assetId: { not: assetId } },
              data: { sortOrder: { increment: 1 } },
            });
          await tx.packageImage.update({ where, data: { sortOrder: input.cover ? 0 : input.sortOrder } });
        } else {
          const link = await tx.mediaAttachment.findFirst({
            where: { assetId, ...this.attachmentWhere(input.owner) },
            select: { id: true },
          });
          if (!link) throw new NotFoundException();
          if (input.cover)
            await tx.mediaAttachment.updateMany({
              where: { ...this.attachmentWhere(input.owner), assetId: { not: assetId } },
              data: { sortOrder: { increment: 1 } },
            });
          await tx.mediaAttachment.update({
            where: { id: link.id },
            data: { sortOrder: input.cover ? 0 : input.sortOrder },
          });
        }
      }
      await tx.auditLog.create({ data: { actorId, action: "gallery.updated", entity: "media", entityId: assetId } });
    });
    return { ok: true };
  }

  async detach(assetId: string, owner: GalleryOwner, actorId: string) {
    const client = await this.db.client();
    await client.$transaction(async (tx) => {
      if (owner.type === "package")
        await tx.packageImage.delete({ where: { packageId_assetId: { packageId: owner.id, assetId } } });
      else {
        const link = await tx.mediaAttachment.findFirst({
          where: { assetId, ...this.attachmentWhere(owner) },
          select: { id: true },
        });
        if (!link) throw new NotFoundException();
        await tx.mediaAttachment.delete({ where: { id: link.id } });
      }
      await tx.auditLog.create({ data: { actorId, action: "gallery.detached", entity: "media", entityId: assetId } });
    });
  }

  async read(id: string) {
    const client = await this.db.client();
    const asset = await client.mediaAsset.findFirst({ where: { id, deletedAt: null, visibility: "PRIVATE" } });
    if (!asset) throw new NotFoundException();
    return { asset, body: await readFile(join(base(), asset.objectKey)) };
  }

  async remove(id: string, actorId: string) {
    const client = await this.db.client();
    const asset = await client.mediaAsset.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, objectKey: true, _count: { select: { attachments: true, packageImages: true } } },
    });
    if (!asset) throw new NotFoundException();
    if (asset._count.attachments + asset._count.packageImages > 0)
      throw new ConflictException("Primero desvincula la imagen de sus contenidos");
    await client.$transaction([
      client.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } }),
      client.auditLog.create({ data: { actorId, action: "gallery.removed", entity: "media", entityId: id } }),
    ]);
    await unlink(join(base(), asset.objectKey)).catch(() => undefined);
  }
}
