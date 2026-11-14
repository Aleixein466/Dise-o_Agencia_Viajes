# Plan maestro — Ricaurte Tours 3.0 (2026-11-14)

Estados: **IMPLEMENTADO Y PROBADO** · **EN CURSO** · **PENDIENTE** · **PENDIENTE DE CONFIGURACIÓN** · **PENDIENTE DE APROBACIÓN** · **BLOQUEADO**.
Base: `codex/continue-auth-admin`. Coordinación: Claude. Agentes: Codex (`codex:codex-rescue`) y subagentes `orchestra:*`.

| Hito | Alcance                                                                  | Depende de | Responsable                                  | Estado                                                                   | Aceptación                                                                                   |
| ---- | ------------------------------------------------------------------------ | ---------- | -------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 0    | Git, herramientas, contexto                                              | —          | Claude                                       | IMPLEMENTADO Y PROBADO                                                   | HEAD `ee97529` limpio; Codex 0.167.2 autenticado; Docker 29.9.3                              |
| 1    | Limpieza de `.claude`                                                    | 0          | Claude                                       | IMPLEMENTADO Y PROBADO                                                   | `docs/operations/DISK_USAGE_REPORT.md`; 30/30 pruebas de dominio                             |
| 2a   | Aprobación auditada de tarifas (approve/deactivate)                      | 1          | Codex (API) + builder (UI) + Claude          | IMPLEMENTADO Y PROBADO                                                   | 409 por concurrencia, auditoría antes/después, RBAC `catalog:publish`                        |
| 3    | Constructor público, preview, solicitud, seguimiento                     | 2a         | Codex (API) + builder (web) + Claude         | IMPLEMENTADO Y PROBADO (envío PENDIENTE DE APROBACIÓN legal)             | Contrato `contracts/public-quotes.md`; E2E 3 en Playwright                                   |
| 2b   | Reglas por temporada, edad, ocupación y promociones                      | 3          | —                                            | PENDIENTE                                                                | Pruebas de dominio por cada regla                                                            |
| 4    | CRM (bandeja, asignación, notas, estados) + portal del cliente           | 3          | Claude + Codex (API) + builder (web)         | IMPLEMENTADO Y PROBADO                                                   | E2E 4 y 5; IDOR 404 entre clientes; login por código al correo                               |
| 4b   | Reservas con confirmación manual                                         | 4          | Claude                                       | IMPLEMENTADO Y PROBADO (CONFIRMED exige pago, hito 5)                    | E2E 5; validación manual = `APPROVE_FOR_PAYMENT` → `PENDING_PAYMENT`                         |
| 5a   | Abonos en línea con adaptador de pruebas (sin cobros)                    | 4b         | Claude (API) + builder (web) + reviewer opus | IMPLEMENTADO Y PROBADO                                                   | E2E 5 con pago rechazado/aprobado, webhook falsificado 401, CONFIRM manual tras abono mínimo |
| 5b   | Abonos manuales con comprobante, cuatro ojos, ajustes, ahorro programado | 5a         | Claude + builder (web) + Codex (auditoría)   | IMPLEMENTADO Y PROBADO (Wompi: PENDIENTE DE CONFIGURACIÓN, PC-5)         | E2E finanzas: cuatro ojos 403, duplicados 409, doble aprobación concurrente, IDOR, CSRF      |
| 5c   | Notificaciones (outbox, Mailpit, OTP seguro)                             | 5b         | Claude + builder                             | IMPLEMENTADO Y PROBADO (envío real PENDIENTE DE APROBACIÓN)              | Correo `payment.approved`; ningún código en otros correos ni logs                            |
| 6    | Revisión visual, a11y, seguridad, staging                                | todos      | Claude + Codex                               | EN CURSO (barrido responsive 8/8; staging BLOQUEADO)                     | `zz-responsive-sweep` 360/768/1366 px; staging requiere hosting autorizado                   |
| 7b   | PQRS (radicación, seguimiento, portal, bandeja staff)                    | 4          | Claude (API) + builder (web)                 | IMPLEMENTADO Y PROBADO (radicación pública apagada hasta textos legales) | API 164 pruebas; E2E `public-pqrs.spec.ts`                                                   |

Aprobaciones del propietario pendientes:

- Política de datos y textos legales: `PUBLIC_QUOTE_REQUESTS_ENABLED` sigue en false hasta que se aprueben.
- Tarifas reales del portafolio: todas siguen en DRAFT/ficticias.
- Llaves sandbox de Wompi.
- Hosting del API y de PostgreSQL para staging.
