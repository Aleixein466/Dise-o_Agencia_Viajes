# Transport options admin (API + web)

Staff CRUD for `TransportOption` (no schema change). Prices are NOT here: they are price rules of each package.
Options are never deleted; they are deactivated and can be activated again.

All routes live under `/api/v1/catalog/transport-options`, require `catalog:write` (reads too; mutations also CSRF + Origin).
Errors are problem+json with a stable `code`.

| Method | Path              | Notes                                                                                                                                                                                                  |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/`               | Query `destinationId`, `mode` (GROUND/AIR/SEA), `status` (active/inactive), `page`, `pageSize` (<= 50, default 20). Excludes `deletedAt`. Returns `{items,total,page,pageSize,pages}` ordered by name. |
| GET    | `/:id`            | One option. 404 `NOT_FOUND`.                                                                                                                                                                           |
| GET    | `/:id/history`    | AuditLog rows (`entity = "transport_option"`), newest first: `{id,actorId,action,before,after,createdAt}`.                                                                                             |
| POST   | `/`               | Body (strict): `destinationId` (uuid), `mode`, `name` (trimmed 2-120), `description?`, `conditions?` (trimmed, <= 2000, empty -> null).                                                                |
| PATCH  | `/:id`            | Body (strict): `expectedUpdatedAt` + at least one of `mode`, `name`, `description`, `conditions`. The destination cannot change.                                                                       |
| POST   | `/:id/deactivate` | Body `{expectedUpdatedAt}`.                                                                                                                                                                            |
| POST   | `/:id/activate`   | Body `{expectedUpdatedAt}`.                                                                                                                                                                            |

Item shape: `{id,destinationId,destination:{id,name},mode,name,description,conditions,active,status:"active"|"inactive",createdAt,updatedAt}`.

Error codes: `VALIDATION_FAILED` (400), `DESTINATION_NOT_FOUND` (400), `NOT_FOUND` (404),
`STALE_UPDATE` (409, `expectedUpdatedAt` differs), `TRANSPORT_NAME_TAKEN` (409; unique per destination + mode + name,
compared ignoring case), `ALREADY_ACTIVE` / `ALREADY_INACTIVE` (409),
`TRANSPORT_IN_USE` (409, extra field `count`: package components of PUBLISHED, non-deleted packages that use the option,
whether or not `included`; deactivation is refused until they are removed).

Audit (same transaction, `before`/`after` = the item shape): `transport_options.created|updated|activated|deactivated`.

Web: `/admin/transporte` (server page checks `catalog:write`, else "Sin permiso"); `components/admin/transport/**`.
E2E: `apps/web/e2e/public-transport-options.spec.ts`.
