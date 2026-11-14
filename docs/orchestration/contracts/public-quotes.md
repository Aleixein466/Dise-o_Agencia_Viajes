# Contrato: constructor público y solicitudes de cotización (v1)

Base: `/api/v1` (Next lo reenvía a NestJS por la reescritura `API_INTERNAL_URL`). JSON. Importes: **strings decimales de centavos** (bigint) o `null`.

Regla de precio pública ("aprobada"): `active = true AND isFictitious = false AND (validFrom IS NULL OR validFrom <= now) AND (validTo IS NULL OR validTo >= now)`. Las reglas DRAFT/ficticias/inactivas nunca se exponen ni se usan públicamente. Solo se muestran destinos y paquetes `PUBLISHED`.

## GET /public/destinations

`200 [{ id, slug, name, summary: string|null, packages: [{ id, slug, name, durationDays: number|null, durationNights: number|null }] }]`

## GET /public/packages/:id/builder

`404` si no existe o no está publicado.
`200 { package: { id, slug, name, destinationName, durationDays, durationNights, inclusions: string[], exclusions: string[] }, hotels: [{ id, name, roomTypes: [{ id, name, occupancy: number|null }] }], transportOptions: [{ id, mode: "AIR"|"LAND"|..., label }], optionalTours: [{ id, name, description: string|null }], addOns: [{ id, name }], pricingAvailable: boolean }`
Sin importes. `pricingAvailable` = existe al menos una regla aprobada para el paquete.

## Selección (compartida)

`{ packageId: uuid, hotelId?: uuid, roomTypeId?: uuid, transportOptionId?: uuid, adults: 1..30, childAges: int[0..17] (máx 20), optionalTourIds: uuid[] (máx 20), addOnIds: uuid[] (máx 20) }`

## POST /public/quote-preview

Body: selección. `200 { status: "PRICED"|"REQUIRES_MANUAL_REVIEW", currency: "COP", totalCents: string|null, lines: [{ label, quantity, unitAmountCents, totalCents }], reasons: string[] }`. Si falta cualquier regla aprobada → `REQUIRES_MANUAL_REVIEW`, `totalCents: null`, sin importes inventados. Razones en español.

## POST /public/quote-requests

Body: selección + `{ travelDate?: "YYYY-MM-DD" (futura), contact: { name 2..120, email, phone 7..25 }, notes?: ≤2000, dataConsent: true, marketingConsent?: boolean, idempotencyKey: uuid, website?: "" (honeypot; si no está vacío → 201 falso sin persistir) }`

- `503 { message }` si `PUBLIC_QUOTE_REQUESTS_ENABLED !== "true"` (pendiente de aprobación legal de la política de datos).
- `403` si `Origin` existe y no coincide con `WEB_ORIGIN`. `429` por límite de tasa por IP. `400 { message, issues? }` si es inválido.
- `201 { reference, trackingCode, status }`. Repetir el mismo `idempotencyKey` → `200` con la misma `reference` y el mismo `status`, y `trackingCode: null`: el código solo se muestra una vez y no se crea un duplicado.
- El servidor recalcula el precio (ignora cualquier importe del cliente) y guarda Quote (`NEW` si `PRICED`, si no `REQUIRES_MANUAL_REVIEW`), Customer, ConsentRecord(s), `priceSnapshot` y QuoteLines; también un AuditLog `quote.public_requested` sin PII.
- `trackingCode`: 128 bits aleatorios en base32 (texto agrupado). Se guarda solo su hash SHA-256.

## POST /public/quote-requests/track

Body `{ reference, trackingCode }`. Rate limit. Comparación en tiempo constante. `404 { message }` genérico si falla.
`200 { reference, status, packageName: string|null, createdAt, travelDate: string|null, totalCents: string|null, currency }`. Sin PII.

## POST /catalog/price-rules/:id/approve · POST /catalog/price-rules/:id/deactivate (admin)

MFA + `catalog:publish` + CSRF + Origin. Body `{ expectedUpdatedAt: ISO }`; si está desactualizado → `409`. `approve` pone `active=true, isFictitious=false`; `deactivate` pone `active=false`. AuditLog `pricing.approved` / `pricing.deactivated` con actor y valores antes/después. `200 { id, active, isFictitious, updatedAt }`.
