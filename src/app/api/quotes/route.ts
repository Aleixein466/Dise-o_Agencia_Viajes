import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { quoteIntakeOpen } from "@/lib/env";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { checkRateLimit } from "@/lib/http/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().min(7).max(25),
  destination: z.string().trim().max(120).optional(),
  travelDate: z.string().optional(),
  travelers: z.coerce.number<number>().int().min(1).max(30),
  budget: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  dataConsent: z.literal("true"),
  marketingConsent: z.string().optional(),
  website: z.string().optional(),
});

export async function POST(request: Request) {
  // Intake is deliberately disabled until the agency approves its privacy notice.
  if (!quoteIntakeOpen()) {
    return NextResponse.json({ message: "Las cotizaciones aún no están habilitadas. La agencia debe aprobar la política de datos y configurar la base de datos." }, { status: 503 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "Tipo de contenido inválido." }, { status: 415 });
  const origin = request.headers.get("origin");
  if (origin) {
    let expectedOrigin: string;
    try { expectedOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin; }
    catch { expectedOrigin = new URL(request.url).origin; }
    if (origin !== expectedOrigin) return NextResponse.json({ message: "Origen inválido." }, { status: 403 });
  }
  // Missing Origin is allowed because same-origin fetch may omit it in some browsers.
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rate = checkRateLimit(clientIp);
  if (!rate.allowed) return NextResponse.json({ message: "Demasiadas solicitudes. Intenta más tarde." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const result = await readJsonLimited(request);
  if (!result.ok) return NextResponse.json({ message: result.status === 413 ? "La solicitud es demasiado extensa." : "Solicitud inválida." }, { status: result.status });
  const body = result.value;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Revisa los campos señalados.", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  // Honeypot: acknowledge automated submissions without storing personal data.
  if (data.website) return NextResponse.json({ message: "Solicitud recibida." }, { status: 202 });
  const travelDate = data.travelDate ? new Date(`${data.travelDate}T12:00:00.000Z`) : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  if (data.travelDate && (!/^\d{4}-\d{2}-\d{2}$/.test(data.travelDate) || Number.isNaN(travelDate?.getTime()) || travelDate?.toISOString().slice(0, 10) !== data.travelDate || data.travelDate < today)) {
    return NextResponse.json({ message: "La fecha tentativa debe ser válida y no anterior a hoy.", errors: { travelDate: ["Elige una fecha válida desde hoy."] } }, { status: 400 });
  }
  try {
    const quote = await getDb().quote.create({ data: {
      reference: `COT-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
      name: data.name, email: data.email, phone: data.phone, destination: data.destination || null,
      travelDate, travelers: data.travelers, budget: data.budget || null, notes: data.notes || null,
      dataConsentAt: new Date(), marketingConsentAt: data.marketingConsent === "true" ? new Date() : null,
    }, select: { reference: true } });
    return NextResponse.json({ message: `Solicitud registrada con referencia ${quote.reference}. La agencia deberá revisarla antes de responder.` }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "No se pudo registrar la solicitud. Intenta más tarde." }, { status: 503 });
  }
}
