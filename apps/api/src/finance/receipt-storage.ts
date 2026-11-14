import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { BadRequestException } from "@nestjs/common";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const receiptsDir = () =>
  join(
    process.env.MEDIA_STORAGE_DIR ||
      join(process.env.LOCALAPPDATA || process.env.TEMP || "C:\\Temp", "RicaurteTours", "private-media"),
    "receipts",
  );

// Active content has no place in a bank receipt; rejecting it avoids storing a weaponised PDF for staff to open.
const PDF_FORBIDDEN = [
  /\/JavaScript/,
  /\/JS\b/,
  /\/Launch/,
  /\/EmbeddedFile/,
  /\/OpenAction/,
  /\/AA\b/,
  /\/RichMedia/,
  /\/XFA/,
];

/** Hex escapes in names ("/Java#53cript" = "/JavaScript") are decoded so they cannot hide forbidden keys. */
const decodeNames = (text: string) =>
  text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** The file itself plus every Flate stream inflated (object streams can hide /OpenAction etc.). Bounded. */
function pdfTexts(raw: Buffer): string[] {
  const text = raw.toString("latin1");
  const texts = [decodeNames(text)];
  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  let budget = 50 * 1024 * 1024;
  while ((match = streams.exec(text)) && texts.length < 500) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    try {
      const inflated = inflateSync(raw.subarray(start, end), { maxOutputLength: 10 * 1024 * 1024 });
      budget -= inflated.length;
      if (budget < 0) throw new BadRequestException("PDF demasiado complejo");
      texts.push(decodeNames(inflated.toString("latin1")));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // Not a Flate stream (images, other filters): nothing to scan.
    }
    streams.lastIndex = end;
  }
  return texts;
}

export type StoredReceipt = {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width?: number;
  height?: number;
};

/**
 * Validates by content (magic bytes), never by name or declared type. Images are re-encoded (strips metadata and
 * any trailing payload); PDFs are kept byte-for-byte but must be structurally plausible and free of active content.
 * `sha256` is of the uploaded bytes, so the same receipt uploaded twice is detected.
 */
export async function validateReceipt(
  raw: Buffer,
): Promise<{ data: Buffer; mimeType: string; sha256: string; width?: number; height?: number }> {
  if (raw.length === 0 || raw.length > RECEIPT_MAX_BYTES)
    throw new BadRequestException("Comprobante vacío o mayor a 5 MB");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const kind = await fileTypeFromBuffer(raw);
  if (kind?.mime === "application/pdf") {
    const head = raw.subarray(0, 5).toString("latin1");
    const tail = raw.subarray(Math.max(0, raw.length - 1024)).toString("latin1");
    if (head !== "%PDF-" || !tail.includes("%%EOF")) throw new BadRequestException("PDF inválido");
    if (PDF_FORBIDDEN.some((pattern) => pdfTexts(raw).some((text) => pattern.test(text))))
      throw new BadRequestException("El PDF contiene contenido activo no permitido");
    return { data: raw, mimeType: "application/pdf", sha256 };
  }
  if (!kind || !["image/jpeg", "image/png", "image/webp"].includes(kind.mime))
    throw new BadRequestException("Formato no permitido: usa PDF, JPEG, PNG o WebP");
  try {
    const image = sharp(raw, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width > 8000 || meta.height > 8000) throw new Error("dimensions");
    const data = await image.rotate().webp({ quality: 85 }).toBuffer();
    return { data, mimeType: "image/webp", sha256, width: meta.width, height: meta.height };
  } catch {
    throw new BadRequestException("Imagen corrupta o con dimensiones no permitidas");
  }
}

export async function storeReceipt(validated: { data: Buffer; mimeType: string }): Promise<string> {
  const key = `receipts/${randomUUID()}.${validated.mimeType === "application/pdf" ? "pdf" : "webp"}`;
  await mkdir(receiptsDir(), { recursive: true });
  await writeFile(join(receiptsDir(), key.slice("receipts/".length)), validated.data, { flag: "wx" });
  return key;
}

export async function removeReceipt(objectKey: string): Promise<void> {
  await unlink(join(receiptsDir(), objectKey.slice("receipts/".length))).catch(() => undefined);
}

export async function readReceipt(objectKey: string): Promise<Buffer> {
  if (!/^receipts\/[0-9a-f-]{36}\.(pdf|webp)$/.test(objectKey)) throw new BadRequestException();
  return readFile(join(receiptsDir(), objectKey.slice("receipts/".length)));
}
