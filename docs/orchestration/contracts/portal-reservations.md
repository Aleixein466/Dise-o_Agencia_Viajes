# Contrato: portal del cliente y reservas (v1)

Base `/api/v1`. Importes en strings de centavos. Todas las mutaciones pasan por `AuthService.assertMutation`, que valida Origin y CSRF. Toda acción queda en `AuditLog`, sin PII. Ninguna reserva se confirma automáticamente.

## Identidad del cliente

- `POST /customer-auth/request-code` `{ email }` responde siempre `202 { message }` genérico, exista o no la cuenta. Tiene rate limit por IP y por email. Solo si existe algún `Customer` no borrado con ese email se crea un `OneTimeToken` (`MAGIC_LINK_LOGIN`, con `email`, y `tokenHash = HMAC-SHA256(secret, email + ":" + code)`) y se envía un código numérico de 8 dígitos a través de `MailAdapter`. Un código nuevo invalida los anteriores de ese email.
- `POST /customer-auth/verify` `{ email, code }`: consumo atómico del token (`usedAt`) y como máximo 5 fallos por email cada 15 minutos (`429`). Busca o crea un `User` con rol `CUSTOMER` y sin contraseña, y vincula a ese usuario todos los `Customer` con ese email que tengan `userId` nulo. Abre una sesión de tipo `customer` (la misma cookie y el mismo flujo CSRF que el personal; sin MFA) y devuelve `200` con la misma forma que `GET /auth/session`. Un fallo responde `400` genérico.
- Una cuenta de personal (rol distinto de `CUSTOMER`) nunca inicia sesión por esta vía: se responde `400` genérico.
- Guardas nuevas en `AuthService`:
  - `requireCustomer(token, permission)` para lecturas: rol `CUSTOMER` más el permiso indicado.
  - `requireCustomerMutation(token, csrf, origin, permission)` para mutaciones.
- La referencia pública y el código de seguimiento **no** dan acceso al portal: `/public/quote-requests/track` sigue igual.

## MailAdapter (`apps/api/src/notifications/mail.ts`)

`MAIL_ADAPTER = disabled | file` (por defecto `disabled`). `file` escribe un JSON por mensaje en `MAIL_SINK_DIR` y lanza un error al arrancar si `NODE_ENV=production`. Es un adaptador **de prueba** identificado como tal; los proveedores reales quedan para el hito de notificaciones. Mensaje: `{ to, subject, text, kind: "customer_login_code", createdAt }`.

## Portal — `/me` (rol CUSTOMER; propiedad = `Customer.userId === principal.user.id`)

Un recurso ajeno responde **404**, el mismo código que uno inexistente.

- `GET /me/quotes` → `[{ id, reference, status, packageName, destinationName, travelDate, adults, children, totalCents|null, currency, createdAt, reservation: { code, status }|null }]`
- `GET /me/quotes/:id` → lo anterior más `{ revision, lines[], inclusions[], exclusions[], hotelName|null, roomTypeName|null, reviewReasons[] }`, obtenidos del `priceSnapshot` y del catálogo actual sin importes nuevos.
- `POST /me/quotes/:id/decision` `{ decision: "ACCEPT"|"DECLINE", expectedRevision }`:
  - Solo se admite con estado `PROPOSAL_SENT` y `totalCents` no nulo para `ACCEPT`; en otro caso `409`.
  - `ACCEPT` pasa la cotización a `ACCEPTED` y `DECLINE` a `DECLINED`, ambas por la tabla CRM, y `revision` aumenta en 1.
  - Auditoría `portal.quote_decision`.
- `POST /me/quotes/:id/reservation` `{ startsOn: "YYYY-MM-DD" (futura), travelers: [{ fullName 2..160, category: "ADULT"|"CHILD"|"INFANT", ageYears?: 0..120 }] (1..30; los adultos deben coincidir con `quote.adults`y los menores con`quote.children`), notes?: ≤1000 }`:
  - Requiere la cotización en `ACCEPTED` y con `totalCents`. Si no → `409`.
  - Crea la `Reservation` en una transacción:
    - `code` aleatorio `RES-…`;
    - estado `DRAFT` y luego `SUBMIT_REQUEST` (máquina de estados del dominio, rol `CUSTOMER`), que la deja en `REQUEST_RECEIVED`;
    - `totalCents`, `pricingVersion` y `priceSnapshot` copiados de la cotización (instantánea más `{ conditions: inclusions/exclusions, acceptedAt }`);
    - filas `Traveler`, una fila de `ReservationStatusHistory` y la auditoría `reservation.requested`.
  - `quoteId` es único: si ya existe una reserva para esa cotización → `200` con la misma reserva, sin duplicar; la carrera por violación de unicidad también se trata.
  - Respuesta `201 { code, status }`.
- `GET /me/reservations` → `[{ id, code, status, packageName, startsOn, adults, children, totalCents, currency, availabilityValidatedAt|null, createdAt }]`
- `GET /me/reservations/:id` → lo anterior más `{ version, travelers: [{ fullName, category, ageYears }], history: [{ toStatus, at }], conditions: { inclusions, exclusions } }`
- `POST /me/reservations/:id/cancel` `{ reason 3..500, expectedVersion }` usa la máquina de estados con `CANCEL` y rol `CUSTOMER`; si no se permite → `409`.

## Admin — `/reservations` (MFA; lectura `reservations:read`, escritura `reservations:write`; contacto visible solo con `customers:read`)

- `GET /reservations?status=&q=&page=&pageSize≤50` → `{ items: [{ id, code, status, packageName, customerName|null, startsOn, travelers, totalCents, assignedAdvisor|null, quoteReference|null, createdAt }], total, page, pageSize, pages }`
- `GET /reservations/:id` → `{ id, code, status, version, package/destination names, startsOn, endsOn, totalCents, currency, priceSnapshot, travelers[], customer: { name, email, phone }|null, contactHidden, quote: { id, reference, status }, availabilityValidatedAt, validatedBy|null, assignedAdvisor|null, history: [{ fromStatus, toStatus, event, actor|null, role, reason, at }], notes: [{ id, body, author, createdAt }] }`
- `POST /reservations/:id/events` `{ event: "START_VALIDATION"|"APPROVE_FOR_PAYMENT"|"REJECT"|"CANCEL", expectedVersion, reason? }`:
  - Rol de dominio: `ADMIN` si el actor lo tiene, si no `ADVISOR`.
  - `APPROVE_FOR_PAYMENT` es la **confirmación manual de disponibilidad**: guarda `availabilityValidatedAt` y `validatedById`, y deja la reserva en `PENDING_PAYMENT`. `CONFIRM` sigue exigiendo un pago verificado (hito de finanzas).
  - Errores: dominio `INVALID_TRANSITION`/`GUARD_FAILED` → `409`, `FORBIDDEN` → `403`, `REASON_REQUIRED` → `400`. Si `version` no coincide → `409`; si coincide, `version` aumenta en 1.
  - Escribe `ReservationStatusHistory` y `AuditLog` `reservation.<event>`.
- `POST /reservations/:id/notes` `{ body 1..2000 }` crea una `CrmNote` con `reservationId`.
- `POST /reservations/:id/assign` `{ advisorId, expectedVersion }`.
- El detalle del CRM (`GET /crm/requests/:id`) añade `reservation: { id, code, status }|null`.
