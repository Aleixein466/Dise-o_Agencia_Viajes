# Contrato: CRM de solicitudes (v1)

Base `/api/v1/crm`. Lecturas con `quotes:read` mediante `AuthService.requireReadPermission`; mutaciones con MFA, `quotes:write`, CSRF y Origin mediante `requirePermission`. Ningún dato de contacto se envía sin `customers:read`: `contact` sale como `null` y `contactHidden: true`. Las mutaciones exigen `expectedRevision` (`Quote.revision`): si no coincide → `409`; si coincide, `revision` aumenta en 1. Cada mutación registra un `AuditLog` con actor y valores antes/después, sin PII.

## Transiciones (dominio puro: `packages/domain/src/quotes/crm-status.ts`)

`NEW → ASSIGNED | DECLINED | CLOSED` · `REQUIRES_MANUAL_REVIEW → ASSIGNED | DECLINED | CLOSED` · `ASSIGNED → PROPOSAL_SENT | DECLINED | CLOSED` · `PROPOSAL_SENT → ACCEPTED | DECLINED | ASSIGNED` · `ACCEPTED → CLOSED` · `DECLINED → CLOSED`. `DRAFT` (borrador interno) y `CLOSED` no tienen salidas en el CRM. Una transición inválida → `400` con un mensaje en español. Asignar a alguien una solicitud `NEW` o `REQUIRES_MANUAL_REVIEW` la pasa a `ASSIGNED`.

## GET /crm/requests?status=&assigneeId=(uuid|unassigned)&source=&q=&page=&pageSize=

`q` busca por referencia; si el usuario tiene `customers:read`, también por email. `pageSize` ≤ 50. La lista se ordena por `createdAt` descendente.
`200 { items: [{ id, reference, status, source: "PUBLIC"|"ADMIN", packageName|null, destinationName|null, travelers, travelDate|null, totalCents: string|null, createdAt, assignee: { id, name }|null }], total, page, pageSize, pages }`

## GET /crm/requests/:id

`404` si no existe. `200 { id, reference, status, revision, source, packageName, destinationName, adults, children, travelDate, totalCents, currency, reviewReasons: string[], lines: [{ description, quantity, unitPriceCents, totalCents }], contact: { name, email, phone }|null, contactHidden: boolean, notes: string|null, assignee|null, assignments: [{ advisor: {id,name}, assignedAt, unassignedAt|null }], crmNotes: [{ id, body, author: {id,name}, createdAt }], history: [{ action, actor: {id,name}|null, createdAt, before, after }] }`

## GET /crm/advisors

Usuarios `ACTIVE` con rol `ADVISOR` o `ADMIN`. `200 [{ id, name }]`

## POST /crm/requests/:id/assign

Body `{ advisorId: uuid, expectedRevision, reason?: ≤300 }`. Cierra la asignación abierta (`unassignedAt`) y crea un `LeadAssignment` nuevo; actualiza `Quote.assignedToId`. El asesor debe estar activo y ser `ADVISOR`/`ADMIN`; si no → `400`. Auditoría: `crm.assigned`.

## POST /crm/requests/:id/status

Body `{ status, expectedRevision }`. Auditoría: `crm.status_changed`.

## POST /crm/requests/:id/notes

Body `{ body: 1..2000 }`. Crea una `CrmNote` (solo de agregar; no se edita ni se borra). No modifica `revision`. Auditoría `crm.note_added` sin el texto de la nota.

## GET /crm/stats

`200 { byStatus: { [status]: number }, unassigned: number, last7Days: number }`. Excluye `DRAFT`.
