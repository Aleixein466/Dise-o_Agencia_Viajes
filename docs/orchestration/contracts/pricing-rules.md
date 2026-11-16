# Contrato: reglas comerciales de tarifas (catálogo público)

Motor puro: `packages/domain/src/quotes/commercial-pricing.ts` (`calculateCommercialQuote`). Montos en centavos `bigint`, sin
E/S, determinista. Lo usa `PublicCatalogService.pricing` (vista previa y solicitud pública). La cotización administrativa
(`AdminQuotesService`) sigue usando `calculateDraftQuote` con reglas borrador explícitas y no cambia.

## Principio

Nunca se inventa una tarifa. Todo lo que no esté cubierto por una regla persistida y aprobada termina en
`REQUIRES_MANUAL_REVIEW` con un código de motivo. Ningún precio se deriva de otro (no existe "niño = 50 % del adulto").

Regla aprobada (`PriceRule`): `active`, `!isFictitious`, ahora dentro de `[validFrom, validTo]`, unidad `PER_PERSON` o
`PER_BOOKING` (las unidades por noche aún no se cotizan en público). Si tiene `seasonId`, la temporada debe ser real
(`!isFictitious`) y global o del destino del paquete. Si tiene `ageRuleId`, la regla de edad debe ser real.

## 1. Vigencia de venta vs. ventana de viaje

- `validFrom`/`validTo`: ventana de **venta**; se compara con el momento de la cotización.
- Las ventanas de **viaje** son temporadas (`Season.startsOn`/`endsOn`, solo fecha, inclusivas), comparadas con la fecha
  tentativa de viaje (`travelDate`, `YYYY-MM-DD`).

## 2. Selección de la regla (por ítem y por categoría de viajero)

Ítems: paquete (obligatorio), transporte, cada tour opcional, cada adicional. Para cada uno se filtran las reglas:

1. Categoría: `ageRuleId` nulo = adulto; si no, la categoría del menor.
2. Acomodación: `conditions.roomTypeId` debe coincidir con la acomodación elegida (si existe).
3. Grupo: `occupancy` (personas que comparten la habitación) debe ser igual al tamaño del grupo; `minTravelers` /
   `maxTravelers` acotan el grupo. Tamaño del grupo = adultos + menores.
4. Temporada: si alguna candidata tiene temporada y no hay fecha → `TRAVEL_DATE_REQUIRED` (la tarifa no se puede
   determinar sin fecha, aunque exista una regla sin temporada). Con fecha, se descartan temporadas que no la contienen.

Entre las restantes gana la más específica (vinculada a acomodación + vinculada a temporada), luego la de mayor
`priority`. Empate → `PRICE_RULE_AMBIGUOUS`. Sin candidatas → motivo de faltante del ítem.

Una regla adulta `PER_BOOKING` cubre al grupo completo (sus límites de viajeros ya cuentan a los menores); en ese ítem no
se buscan tarifas de menores.

## 3. Menores

- Se clasifican con `AgeRule` sin `tourId`, en el ámbito más específico que tenga alguna regla: paquete, si no destino, si
  no global (los ámbitos no se mezclan). Solo `isFictitious = false`.
- Solo base `AGE_YEARS`; si el ámbito usa `HEIGHT_CM` → `AGE_RULE_BASIS_UNSUPPORTED`.
- Exactamente una banda debe contener la edad: ninguna → `CHILD_PRICE_RULE_REQUIRED`; varias → `AGE_RULE_AMBIGUOUS`.
- El precio sale de una regla aprobada con ese `ageRuleId` y las mismas restricciones de acomodación, grupo y temporada;
  si falta → `CHILD_PRICE_RULE_REQUIRED`. Aplica también a transporte, tours y adicionales por persona.
- Monto 0 solo es válido en reglas de categoría `INFANT`; en cualquier otro caso → `PRICE_RULE_INVALID:<id>`.

## 4. Ocupación

Si el grupo supera `RoomType.maxOccupancy` de la acomodación elegida → `OCCUPANCY_EXCEEDED` (no se reparte en varias
habitaciones; lo resuelve un asesor).

## 5. Promociones

- Solo por código ingresado por el cliente (`promotionCode`, sin distinguir mayúsculas). Nunca automáticas.
- Válida si: `active`, `!isFictitious`, ahora dentro de `[startsAt, endsAt]`, ámbito del paquete o de su destino (o
  global), y `redemptionCount < maxRedemptions` (o sin tope).
- `PERCENT` (`percentBps`, redondeo hacia abajo) o `FIXED_AMOUNT` (`amountOffCents`), una sola vez sobre el subtotal, nunca
  por debajo de 0. Se muestra como línea negativa `Promoción <nombre>` (`QuoteLine.kind = PROMOTION`).
- Código desconocido, vencido, fuera de ámbito o agotado: **no** falla la cotización; se ignora y se agrega un aviso no
  bloqueante (`notices`), nunca un motivo de revisión. Si la cotización requiere revisión, la promoción no se aplica
  (aviso `PROMOTION_REQUIRES_REVIEW`).
- Redención: solo al crear una solicitud pública con promoción aplicada, dentro de la misma transacción, con un
  `UPDATE ... WHERE redemption_count < max_redemptions` condicional. Si no afecta filas (carrera), se recalcula sin la
  promoción (aviso `PROMOTION_EXHAUSTED`) y se guarda la solicitud. `priceSnapshot.promotion` registra id, código, tipo,
  valor y descuento aplicado (o `null`).

## Códigos

Motivos (`REQUIRES_MANUAL_REVIEW`): `ADULT_COUNT_INVALID`, `CHILD_AGE_INVALID`, `BASE_RATE_REQUIRED`,
`TRANSPORT_PRICE_RULE_REQUIRED`, `OPTIONAL_PRICE_RULE_REQUIRED:<id>`, `CHILD_PRICE_RULE_REQUIRED`, `AGE_RULE_AMBIGUOUS`,
`AGE_RULE_BASIS_UNSUPPORTED`, `TRAVEL_DATE_REQUIRED`, `PRICE_RULE_AMBIGUOUS`, `OCCUPANCY_EXCEEDED`, `PRICE_RULE_INVALID:<id>`.

Avisos (no bloquean): `PROMOTION_CODE_INVALID`, `PROMOTION_EXHAUSTED`, `PROMOTION_REQUIRES_REVIEW`.

Los textos públicos en español están en `publicReasons` / `publicNotices` de `public-catalog.service.ts`.

## API pública

`POST /public/quote-preview` y `POST /public/quote-requests` aceptan además `travelDate?` (`YYYY-MM-DD`) y
`promotionCode?` (texto ≤ 100; un formato inválido solo produce aviso). La vista previa responde además:
`travelDateRequired: boolean`, `notices: string[]` (español) y `promotion: { code, name, discountCents } | null`.
`priceSnapshot` de la solicitud guarda `reasonCodes`, `noticeCodes`, `subtotalCents` y `promotion`.

## Pendiente (fuera de alcance)

- ~~CRUD administrativo de temporadas, reglas de edad, promociones y campos comerciales de las tarifas~~: API hecha, ver
  `commercial-rules-admin.md` (falta la UI del panel). Desactivar una temporada/banda pone `isFictitious = true`, así
  que los filtros de este documento la excluyen sin cambios en el cargador.
- Unidades `PER_PERSON_NIGHT` / `PER_ROOM_NIGHT` y reparto en varias habitaciones.
