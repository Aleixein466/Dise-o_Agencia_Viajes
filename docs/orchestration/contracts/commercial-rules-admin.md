# Contrato: administración de reglas comerciales (staff)

Código: `apps/api/src/catalog/commercial-rules.{controller,service}.ts` (temporadas, bandas de edad, promociones) y
`apps/api/src/catalog/catalog-admin.{controller,service}.ts` (crear/editar tarifas). El motor no cambia
(`packages/domain/src/quotes/commercial-pricing.ts`, ver `pricing-rules.md`): estas rutas solo escriben los datos que el
motor ya lee. Migración: `20261117_commercial_rules_admin` (aditiva: `seasons.active`, `seasons.package_id`,
`age_rules.active`).

## Autorización

- Lectura (`GET`): sesión staff con MFA y `catalog:write` (ADVISOR, ADMIN). FINANCE → 403.
- Crear / editar borradores: `catalog:write` + CSRF (`x-csrf-token`) + `Origin` + MFA. ADVISOR y ADMIN.
- Aprobar / desactivar: `catalog:publish` + CSRF + `Origin` + MFA. Solo ADMIN; ADVISOR → 403.
- Sin cookie de sesión → 401.

## Ciclo de vida

| Estado     | Temporada / banda / promoción | Tarifa (`PriceRule`, codificación histórica) |
| ---------- | ----------------------------- | -------------------------------------------- |
| `draft`    | `active && isFictitious`      | `isFictitious` (y `active = false`)          |
| `approved` | `active && !isFictitious`     | `active && !isFictitious`                    |
| `inactive` | `!active`                     | `!active && !isFictitious`                   |

- Crear produce un borrador; el motor nunca usa borradores.
- Solo un borrador se edita (`PATCH`) o se aprueba, también en tarifas: una tarifa desactivada no se reactiva
  (`409 NOT_DRAFT`, auditoría Codex). Un aprobado no se edita: se desactiva y se crea otro, para que cotizaciones y
  auditoría conserven su significado. `PATCH /catalog/rates/:id` (monto del borrador) escribe y audita en una sola
  transacción y solo mientras la fila sigue siendo borrador.
- Nada se borra. Desactivar una temporada o banda pone además `isFictitious = true`, como defensa adicional (el cargador público
  también exige `active`); así las tarifas ligadas a ella dejan de usarse de inmediato. Desactivar una promoción pone
  `active = false` (el motor ya lo revisa).
- Concurrencia optimista: toda edición/transición exige `expectedUpdatedAt` (ISO) igual a `updatedAt`; si no → 409
  `STALE_UPDATE`.
- Cada mutación escribe `AuditLog` (`entity` = `season` | `age_rule` | `promotion` | `price_rule`) con `before`/`after`.
  Acciones: `<kind>.created|updated|approved|deactivated` (`seasons.*`, `age_rules.*`, `promotions.*`) y
  `pricing.draft_created|draft_updated|approved|deactivated`.
- Las cotizaciones existentes (`priceSnapshot`, `QuoteLine`) nunca se tocan.

## Endpoints (prefijo `/catalog`)

| Método | Ruta                                     | Permiso           | Cuerpo / query                                                             |
| ------ | ---------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| GET    | `seasons`, `age-rules`, `promotions`     | lectura           | `page`, `pageSize` (≤ 50), `status`, `scope`, `destinationId`, `packageId` |
| GET    | `{kind}/:id`                             | lectura           | —                                                                          |
| GET    | `{kind}/:id/history`                     | lectura           | —                                                                          |
| POST   | `{kind}`                                 | `catalog:write`   | campos de creación                                                         |
| PATCH  | `{kind}/:id`                             | `catalog:write`   | campos parciales + `expectedUpdatedAt`                                     |
| POST   | `{kind}/:id/approve`                     | `catalog:publish` | `{ expectedUpdatedAt }`                                                    |
| POST   | `{kind}/:id/deactivate`                  | `catalog:publish` | `{ expectedUpdatedAt }`                                                    |
| POST   | `price-rules`                            | `catalog:write`   | ver tarifas                                                                |
| PATCH  | `price-rules/:id`                        | `catalog:write`   | campos comerciales + `expectedUpdatedAt`                                   |
| POST   | `price-rules/:id/approve`, `/deactivate` | `catalog:publish` | `{ expectedUpdatedAt }` (existentes)                                       |
| GET    | `price-rules/:id/history`                | lectura           | auditoría completa de la tarifa                                            |

`{kind}` = `seasons` | `age-rules` | `promotions`. `status` = `draft` | `approved` | `inactive`; `scope` = `GLOBAL` |
`DESTINATION` | `PACKAGE`. Listas: `{ items, total, page, pageSize, pages }`. Cada ítem trae `status` y `scope`
derivados. Cuerpos estrictos: un campo desconocido → 400 `VALIDATION_FAILED`. En `PATCH`, enviar `destinationId` o
`packageId` reemplaza el ámbito completo.

### Temporada

`{ name (2–120), startsOn, endsOn (YYYY-MM-DD, inclusivas), notes?, destinationId?, packageId? }`. Con `packageId`, el
`destinationId` se deriva del paquete (si se envía, debe coincidir). Respuesta con fechas `YYYY-MM-DD`.

### Banda de edad

`{ name, category (CHILD | INFANT | ADULT), basis? (solo AGE_YEARS), minValue, maxValue (0–17, min ≤ max),
destinationId? | packageId? }` (uno solo). Las bandas por estatura y las de tour no se gestionan aquí.

### Promoción

`{ code, name, description?, discountType (PERCENT | FIXED_AMOUNT), percentBps?, amountOffCents? (string de centavos),
startsAt, endsAt (ISO), maxRedemptions?, destinationId? | packageId? }`. El código se normaliza a mayúsculas y debe
cumplir `^[A-Z0-9_-]{1,40}$`; es único sin distinguir mayúsculas y no se reutiliza (las filas no se borran).
`redemptionCount` es de solo lectura. **Sin combinaciones**: una cotización acepta un solo código y se aplica una sola
vez sobre el subtotal; no hay promociones automáticas ni acumulables.

### Tarifa (`price-rules`)

Crear: `{ name, unit (PER_PERSON | PER_BOOKING | PER_PERSON_NIGHT | PER_ROOM_NIGHT), amountCents (string),
ruleSetVersion (^[A-Za-z0-9._-]{1,40}$), packageId | tourId | transportOptionId | addOnId (exactamente uno), priority?,
seasonId?, ageRuleId?, roomTypeId?, occupancy? (1–50), minTravelers?, maxTravelers? (1–99), validFrom?, validTo? (ISO) }`.
Editar: los mismos campos salvo el destino y `ruleSetVersion`; `null` limpia un campo opcional. `roomTypeId` es la
acomodación y se guarda en `conditions.roomTypeId` (la columna `room_type_id` es un destino de precio). La respuesta trae
`roomTypeId` (acomodación), `targetRoomTypeId` (columna), `amountCents` como string y `status`. Las unidades por noche se
guardan pero la cotización pública no las usa. `PATCH rates/:id` (solo monto) sigue igual.

## Errores (cuerpo `{ statusCode, code, message[, conflictId] }`)

400: `VALIDATION_FAILED`, `DATE_RANGE_INVALID`, `SCOPE_NOT_FOUND`, `SCOPE_INVALID`, `AGE_RANGE_INVALID`,
`AGE_RULE_CATEGORY_INVALID`, `AGE_RULE_BASIS_UNSUPPORTED`, `DISCOUNT_INVALID` (PERCENT: `percentBps` 1–10000 sin monto;
FIXED_AMOUNT: `amountOffCents` > 0 sin porcentaje), `PROMOTION_CODE_INVALID`, `MAX_REDEMPTIONS_INVALID`
(≥ 1 y ≥ `redemptionCount`), `TARGET_INVALID`, `SEASON_NOT_FOUND`, `SEASON_SCOPE_MISMATCH`, `AGE_RULE_NOT_FOUND`,
`AGE_RULE_SCOPE_MISMATCH`, `ROOM_TYPE_NOT_FOUND`, `ROOM_TYPE_SCOPE_MISMATCH` (la acomodación no es de un hotel del
paquete), `TRAVELERS_RANGE_INVALID`, `AMOUNT_INVALID` (> 0; 0 solo con banda `INFANT`).

404: `NOT_FOUND` (también para un id que no es UUID).

409: `STALE_UPDATE`, `NOT_DRAFT`, `ALREADY_INACTIVE`, `PROMOTION_CODE_TAKEN`, `SEASON_OVERLAP`, `AGE_RULE_OVERLAP`,
`SEASON_NOT_APPROVED`, `AGE_RULE_NOT_APPROVED`, `PRICE_RULE_AMBIGUOUS` (con `conflictId`).

## Prevención de ambigüedad (al aprobar)

Cada aprobación corre en una transacción con `pg_advisory_xact_lock(hashtext('commercial_rules:<kind>'))`: dos
aprobaciones concurrentes del mismo tipo se serializan y la segunda ve la primera.

- Temporadas: no puede haber dos aprobadas y activas que se crucen (fechas inclusivas) en el mismo ámbito (mismo
  paquete; mismo destino sin paquete; o ambas globales) → `SEASON_OVERLAP`.
- Bandas: no puede haber dos aprobadas y activas que se crucen en el mismo ámbito → `AGE_RULE_OVERLAP`.
- Tarifas: la temporada y la banda ligadas deben estar aprobadas. Luego se compara con las tarifas aprobadas y activas
  del mismo ítem, misma banda y misma prioridad (ignorando las ligadas a temporada/banda retiradas): hay conflicto si
  existe un contexto en que `selectCommercialRule` las vería igual de específicas — misma acomodación o una sin
  acomodación con igual rango (acomodación + temporada), temporadas que se cruzan, ocupación compatible, rangos de
  viajeros que se intersectan y ventanas de venta que se cruzan → `PRICE_RULE_AMBIGUOUS`. Esto cubre el empate exacto
  en todas las dimensiones y también los cruces parciales que el motor resolvería como ambiguos.
