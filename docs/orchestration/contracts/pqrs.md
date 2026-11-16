# Contract: PQRS (peticiones, quejas, reclamos, sugerencias)

Status: API by Claude, web by builder. Base path `/api/v1`. Money-free. All texts in Spanish.

## Gating and legal

- `PQRS_INTAKE_ENABLED` (default `"false"`): public and customer creation return **503** "Servicio no disponible" while
  false. Also 503 when no APPROVED `DATA_TREATMENT_AUTHORIZATION` legal document exists (same rule as quotes).
  Staff routes and tracking work regardless (existing tickets must stay answerable).
- Plazos: `PQRS_RESPONSE_BUSINESS_DAYS` (default 15), `PQRS_RESPONSE_DAYS_BY_TYPE`, `PQRS_HOLIDAYS` (`none` | `colombia`),
  `PQRS_EXTRA_HOLIDAYS`; días hábiles en hora de Colombia. Ver `docs/operations/PQRS_PLAZOS.md` (**PENDIENTE DE CONFIRMACIÓN legal**).
- E2E runner sets `PQRS_INTAKE_ENABLED=true` on the isolated database only.

## Types / statuses

- `type`: `PETITION | COMPLAINT | CLAIM | SUGGESTION` (labels: Petición, Queja, Reclamo, Sugerencia).
- `status`: `RECEIVED → IN_REVIEW → (WAITING_FOR_CUSTOMER ⇄ IN_REVIEW) → ANSWERED → CLOSED`; `ANSWERED → IN_REVIEW`
  allowed (reopen). `CLOSED` is terminal. `ANSWERED` requires ≥ 1 public staff message. Labels: Recibida, En revisión,
  Esperando tu respuesta, Respondida, Cerrada.

## Public (no session; Origin must equal WEB_ORIGIN when sent)

- `POST /public/pqrs` body
  `{ type, subject(5..160), description(20..5000), name(2..120), email, phone?(7..25), dataConsent: true,
 idempotencyKey: uuid, website: "" }` (honeypot `website` non-empty → fake 201 with empty reference).
  → **201** `{ reference: "PQR-XXXXXXXXXXXX", trackingCode: "XXXX-XXXX-…", status: "RECEIVED", responseDueAt: ISO }`.
  Replay of the same `idempotencyKey` → **200** same reference, `trackingCode: null`. Rate limit 5 / 10 min per IP → 429.
  The tracking code is shown once; only its SHA-256 is stored; it is never emailed.
- `POST /public/pqrs/track` `{ reference, trackingCode }` → **200**
  `{ reference, type, status, subject, createdAt, responseDueAt, messages: [{ author: "AGENCY"|"REQUESTER", message, createdAt }] }`.
  Wrong reference or code → **404** (same body, constant-time compare). Rate limit 20 / 10 min per IP.
  Internal notes are never returned.

## Customer portal (session `rt_session`, CUSTOMER role; mutations need `x-csrf-token` + Origin)

- `GET /me/pqrs` → `{ items: [{ id, reference, type, status, subject, createdAt, responseDueAt }] }` (own only).
- `GET /me/pqrs/:id` → same shape as track + `id`. Not own / not found → **404**.
- `POST /me/pqrs` `{ type, subject, description, idempotencyKey }` → **201** `{ id, reference, status, responseDueAt }`
  (requester name/email taken from the customer record; no tracking code needed).
- `POST /me/pqrs/:id/messages` `{ message(2..5000) }` → **201**. CLOSED → **409**. If status was
  `WAITING_FOR_CUSTOMER` it becomes `IN_REVIEW`.

## Staff (MFA session; read `pqrs:read`, mutations `pqrs:respond` + CSRF + Origin)

ADMIN and ADVISOR have both permissions; FINANCE has none (→ 403).

- `GET /pqrs?status=&overdue=true&page=1` → `{ items: [{ id, reference, type, status, subject, requesterName,
assignedTo: { id, displayName } | null, createdAt, responseDueAt, overdue: boolean }], page, total }` (25 per page,
  oldest due first).
- `GET /pqrs/:id` → ticket + `requesterEmail`, `requesterPhone`, `customerId`, `version`, `firstRespondedAt`,
  `resolvedAt`, `closedAt`, `messages: [{ id, author: "AGENCY"|"REQUESTER", internal, authorName, message, createdAt }]`,
  `assignableStaff: [{ id, displayName }]`.
- `POST /pqrs/:id/assign` `{ assigneeId: uuid | null }` → 200. Assignee must be ACTIVE staff with `pqrs:respond` (else 400).
- `POST /pqrs/:id/messages` `{ message(2..5000), internal: boolean }` → 201. Public message on a CLOSED ticket → 409.
  First public message sets `firstRespondedAt` and notifies the requester (`pqrs.answered`, no content in mail, link only).
- `POST /pqrs/:id/status` `{ status, expectedVersion: int }` → 200 `{ status, version }`. Invalid transition → 409;
  stale `expectedVersion` → 409 "La PQRS cambió; recarga". Requester notified (`pqrs.status_changed`).
- Every staff mutation writes `audit_logs` (`pqrs.*`). Messages are append-only (no edit/delete routes).

## Errors

400 invalid body · 401 no session · 403 missing permission/CSRF/Origin · 404 not found/not own · 409 conflict ·
429 rate limit · 503 intake disabled.
