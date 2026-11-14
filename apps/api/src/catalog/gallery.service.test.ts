import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { GalleryService } from "./gallery.service";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  delete process.env.MEDIA_STORAGE_DIR;
});

function service() {
  const mediaAssets: { objectKey?: string; mimeType?: string }[] = [];
  const client = {
    destination: { findFirst: async () => ({ id: "destination" }) },
    hotel: { findFirst: async () => ({ id: "hotel" }) },
    tourPackage: { findFirst: async () => ({ id: "package" }) },
    $transaction: async (work: (tx: object) => Promise<unknown>) => work(client),
    mediaAsset: {
      create: async ({ data }: { data: { objectKey: string; mimeType: string } }) => {
        mediaAssets.push(data);
        return { id: "asset-1", ...data };
      },
    },
    mediaAttachment: {
      aggregate: async () => ({ _max: { sortOrder: null } }),
      create: async () => ({ id: "attachment-1" }),
    },
    packageImage: {
      aggregate: async () => ({ _max: { sortOrder: null } }),
      create: async () => ({ id: "package-image-1" }),
    },
    auditLog: { create: async () => ({ id: "audit-1" }) },
  };
  return { service: new GalleryService({ client: async () => client } as never), mediaAssets };
}

describe("GalleryService binary validation", () => {
  it.each(["jpeg", "png", "webp"] as const)("recodes a valid %s image into private WebP storage", async (format) => {
    const directory = await mkdtemp(join(tmpdir(), "ricaurte-gallery-"));
    directories.push(directory);
    process.env.MEDIA_STORAGE_DIR = directory;
    const input = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#0057b8" } })
      [format]()
      .toBuffer();
    const fake = service();
    const asset = await fake.service.upload({ type: "destination", id: "destination" }, "Cartagena", input, "actor");
    expect(asset.mimeType).toBe("image/webp");
    expect(fake.mediaAssets).toHaveLength(1);
    const output = await readFile(join(directory, fake.mediaAssets[0].objectKey!));
    expect((await sharp(output).metadata()).format).toBe("webp");
  });

  it.each([
    ["disfrazado ejecutable", Buffer.from("MZ\x90\x00 this is not an image")],
    ["SVG activo", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["imagen corrupta", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
    ["archivo superior a 5 MB", Buffer.alloc(5 * 1024 * 1024 + 1)],
  ])("rejects %s before persistence", async (_label, value) => {
    const fake = service();
    await expect(
      fake.service.upload({ type: "destination", id: "destination" }, "x", value, "actor"),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(fake.mediaAssets).toHaveLength(0);
  });
});
