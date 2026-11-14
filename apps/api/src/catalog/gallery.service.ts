import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { DbService } from "../db/db.service";
const base = () =>
  process.env.MEDIA_STORAGE_DIR ||
  join(process.env.LOCALAPPDATA || process.env.TEMP || "C:\\Temp", "RicaurteTours", "private-media");
@Injectable()
export class GalleryService {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  async upload(
    owner: { type: "destination" | "hotel" | "package"; id: string },
    altText: string,
    raw: Buffer,
    actorId: string,
  ) {
    if (raw.length === 0 || raw.length > 5 * 1024 * 1024) throw new BadRequestException();
    const kind = await fileTypeFromBuffer(raw);
    if (!kind || !["image/jpeg", "image/png", "image/webp"].includes(kind.mime)) throw new BadRequestException();
    let image;
    try {
      image = sharp(raw, { limitInputPixels: 20_000_000 });
      const m = await image.metadata();
      if (!m.width || !m.height || m.width > 6000 || m.height > 6000) throw new Error();
    } catch {
      throw new BadRequestException();
    }
    const encoded = await image.rotate().webp({ quality: 88 }).toBuffer();
    const key = `${randomUUID()}.webp`;
    await mkdir(base(), { recursive: true });
    await writeFile(join(base(), key), encoded, { flag: "wx" });
    const client = await this.db.client();
    const data =
      owner.type === "destination"
        ? { destinationId: owner.id }
        : owner.type === "hotel"
          ? { hotelId: owner.id }
          : null;
    const asset = await client.$transaction(async (tx) => {
      const a = await tx.mediaAsset.create({
        data: {
          objectKey: key,
          altText,
          mimeType: "image/webp",
          visibility: "PRIVATE",
          sizeBytes: encoded.length,
          sha256: createHash("sha256").update(encoded).digest("hex"),
          uploadedById: actorId,
        },
      });
      if (owner.type === "package")
        await tx.packageImage.create({ data: { packageId: owner.id, assetId: a.id, sortOrder: 0 } });
      else await tx.mediaAttachment.create({ data: { assetId: a.id, ...data! } });
      await tx.auditLog.create({ data: { actorId, action: "gallery.uploaded", entity: "media", entityId: a.id } });
      return a;
    });
    return asset;
  }
  async read(id: string) {
    const c = await this.db.client();
    const a = await c.mediaAsset.findFirst({ where: { id, deletedAt: null, visibility: "PRIVATE" } });
    if (!a) throw new NotFoundException();
    return { asset: a, body: await readFile(join(base(), a.objectKey)) };
  }
  async remove(id: string, actorId: string) {
    const c = await this.db.client();
    const a = await c.mediaAsset.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    await c.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    await c.auditLog.create({ data: { actorId, action: "gallery.removed", entity: "media", entityId: id } });
    try {
      await unlink(join(base(), a.objectKey));
    } catch {}
  }
}
