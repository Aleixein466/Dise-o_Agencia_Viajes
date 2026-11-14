# Plan maestro — Ricaurte Tours 3.0 (2026-11-14)

Estados: **IMPLEMENTADO Y PROBADO** · **EN CURSO** · **PENDIENTE** · **PENDIENTE DE CONFIGURACIÓN** · **PENDIENTE DE APROBACIÓN** · **BLOQUEADO**.
Base: `codex/continue-auth-admin`. Coordinación: Claude. Agentes: Codex (`codex:codex-rescue`) y subagentes `orchestra:*`.

| Hito | Alcance                                                        | Depende de | Responsable                          | Estado                                                       | Aceptación                                                                                    |
| ---- | -------------------------------------------------------------- | ---------- | ------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 0    | Git, herramientas, contexto                                    | —          | Claude                               | IMPLEMENTADO Y PROBADO                                       | HEAD `ee97529` limpio; Codex 0.167.2 autenticado; Docker 29.9.3                               |
| 1    | Limpieza de `.claude`                                          | 0          | Claude                               | IMPLEMENTADO Y PROBADO                                       | `docs/operations/DISK_USAGE_REPORT.md`; 30/30 pruebas de dominio                              |
| 2a   | Aprobación auditada de tarifas (approve/deactivate)            | 1          | Codex (API) + builder (UI) + Claude  | IMPLEMENTADO Y PROBADO                                       | 409 por concurrencia, auditoría antes/después, RBAC `catalog:publish`                         |
| 3    | Constructor público, preview, solicitud, seguimiento           | 2a         | Codex (API) + builder (web) + Claude | IMPLEMENTADO Y PROBADO (envío PENDIENTE DE APROBACIÓN legal) | Contrato `contracts/public-quotes.md`; E2E 3 en Playwright                                    |
| 2b   | Reglas por temporada, edad, ocupación y promociones            | 3          | —                                    | PENDIENTE                                                    | Pruebas de dominio por cada regla                                                             |
| 4    | CRM (bandeja, asignación, notas, estados) + portal del cliente | 3          | Claude                               | EN CURSO                                                     | E2E 4, prueba IDOR                                                                            |
| 4b   | Reservas con confirmación manual                               | 4          | —                                    | PENDIENTE                                                    | E2E 5                                                                                         |
| 5    | Wompi sandbox, abonos, ahorro, notificaciones                  | 4b         | —                                    | PENDIENTE DE CONFIGURACIÓN                                   | Faltan llaves sandbox de Wompi (PC-5); se usará un adaptador de pruebas identificado como tal |
| 6    | CMS, UX, seguridad, rendimiento, CI y staging                  | todos      | —                                    | PENDIENTE                                                    | E2E 1–10; staging separado (BLOQUEADO: panel de Vercel y hosting del API)                     |

Aprobaciones del propietario pendientes:

- Política de datos y textos legales: `PUBLIC_QUOTE_REQUESTS_ENABLED` sigue en false hasta que se aprueben.
- Tarifas reales del portafolio: todas siguen en DRAFT/ficticias.
- Llaves sandbox de Wompi.
- Hosting del API y de PostgreSQL para staging.
