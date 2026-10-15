import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

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
});

export async function POST(request: Request) {
  // Intake is deliberately disabled until the agency approves its privacy notice.
  if (process.env.QUOTE_INTAKE_ENABLED !== "true" || !process.env.DATABASE_URL) {
    return NextResponse.json({ message: "Las cotizaciones aún no están habilitadas. La agencia debe aprobar la política de datos y configurar la base de datos." }, { status: 503 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del formulario." }, { status: 400 });
  const data = parsed.data;
  const travelDate = data.travelDate ? new Date(`${data.travelDate}T12:00:00.000Z`) : null;
  if (travelDate && Number.isNaN(travelDate.getTime())) return NextResponse.json({ message: "Fecha de viaje inválida." }, { status: 400 });
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
