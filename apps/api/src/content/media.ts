import type { PrismaClient } from "@ricaurte/db";
import { badRequest, type Tx } from "../catalog/commercial-rules.service";

type Client = PrismaClient | Tx;
// Only public gallery images (never receipts / private evidence) may be referenced from content or settings.
const referable = { deletedAt: null, visibility: "PUBLIC", NOT: { objectKey: { startsWith: "receipts/" } } } as const;

export async function listReferableMedia(client: Client) {
  return client.mediaAsset.findMany({
    where: referable,
    select: { id: true, altText: true, mimeType: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 200,
  });
}

export async function assertReferableMedia(tx: Client, id: string | null | undefined, field = "imageId") {
  if (!id) return;
  const found = await tx.mediaAsset.findFirst({ where: { id, ...referable }, select: { id: true } });
  if (!found) throw badRequest("MEDIA_NOT_FOUND", `La imagen de ${field} no existe o no es pública`);
}
