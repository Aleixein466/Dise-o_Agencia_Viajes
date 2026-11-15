# Tablero de seguimiento — Ricaurte Tours 3.0

Actualizado: 2026-11-13. Estados: **Pendiente** · **En desarrollo** · **En revisión** · **Bloqueado** · **Completado**.
"Completado" = fusionado en una rama de integración con lint, typecheck, unit, build y (si aplica) E2E en verde y revisión de un modelo distinto al autor. Nada está en `main` todavía (PR #1 y #2 sin fusionar por decisión del usuario).

## Lote 4 — cierre de la base

| Tarea                                            | Agente                 | Rama                    | Estado     |
| ------------------------------------------------ | ---------------------- | ----------------------- | ---------- |
| Bloquear despliegue automático de producción     | Claude                 | `integration/f1` (PR 1) | Completado |
| Formato masivo (commit aislado + blame-ignore)   | Claude                 | `integration/batch4`    | Completado |
| Contraste WCAG AA y quitar `test.fail()` de axe  | builder (Sonnet)       | `fix/f4-a11y-contrast`  | Completado |
| Esquema Prisma v2 + migración aditiva            | architect (Opus)       | `feat/f2-prisma-v2`     | Completado |
| Job CI `database`: migrar desde cero + sin drift | Claude                 | `integration/batch4`    | Completado |
| Dependabot (npm, actions, compose)               | Claude                 | `integration/batch4`    | Completado |
| Matriz ASVS 5.0 L2                               | builder (Sonnet)       | `docs/f1-asvs`          | Completado |
| Separación preview / staging / producción        | Usuario (panel Vercel) | —                       | Bloqueado  |

## Lotes funcionales (orden: 2 → 3 → 4 primero, según el usuario)

| #   | Lote                                                                         | Depende de | Estado                                                     |
| --- | ---------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| 1   | Arquitectura backend y contratos (ADR-0001: pnpm, Turborepo, NestJS/Fastify) | Lote 4     | En revisión                                                |
| 2   | Auth, usuarios, roles y permisos                                             | Prisma v2  | Parcial: PostgreSQL real validado; E2E/usuarios pendientes |
| 3   | Estructura del panel administrativo                                          | 2          | En desarrollo (API usuarios; UI pendiente)                 |
| 4   | CRUD de catálogo                                                             | 2, 3       | Pendiente                                                  |
| 5   | CRM y asesores                                                               | 2, 3       | Implementado (E2E 4)                                       |
| 6   | Constructor y motor de precios                                               | 4          | Pendiente (datos ficticios; PC-4)                          |
| 7   | Cotizaciones y reservas                                                      | 6          | Implementado; confirmación final ligada a pago (lote 9)    |
| 8   | Portal del cliente                                                           | 2, 7       | Implementado (E2E 5, IDOR, axe 360 px)                     |
| 9   | Finanzas y Wompi sandbox                                                     | 7          | Implementado (E2E finanzas); Wompi bloqueado (PC-5)        |
| 10  | PQR, comunicaciones y contenido                                              | 2, 3       | Pendiente (textos legales PC-6)                            |
| 11  | Reportes, pruebas integrales, prep. producción                               | todos      | Pendiente                                                  |

## Actualización: módulo de usuarios

| Tarea             | Estado            | Evidencia                                                                                     |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `/admin/usuarios` | Parcial funcional | UI conectada, API autorizada, PostgreSQL real; Playwright pendiente de estabilizar localmente |
| Catálogo editable | Pendiente         | El esquema existe; falta iniciar los endpoints/UI y obtener el portafolio comercial           |

## Inventario funcional

Actualización 2026-11-14: cotizaciones administrativas en desarrollo funcional: motor BigInt, instantáneas y líneas inmutables, estados DRAFT/REQUIRES_MANUAL_REVIEW, RBAC/MFA/CSRF, asistente /admin/cotizaciones y E2E persistente de Cartagena. No existe venta pública ni creación automática de reservas; menores, transporte o extras sin regla explícita bloquean el total y pasan a revisión comercial.

Actualización 2026-11-14: E2E aislado de Cartagena aprobado con PostgreSQL Docker, NestJS y Next.js compilado. El flujo cubre login y MFA inicial, paquete/hotel, edición y recarga de tarifa borrador, historial, CSRF, RBAC, carga y lectura privada de fotografía. La base de pruebas ricaurte_cartagena_e2e no contiene ni modifica el portafolio comercial.

Actualización 2026-11-13: la galería administrativa privada está implementada en la rama de trabajo. Permite cargar JPEG/PNG/WebP (máximo 5 MB), recodificarlos a WebP fuera del repositorio, ver miniaturas autenticadas, asociar/desvincular contenidos, establecer portada/orden, editar texto alternativo y reemplazar una asociación sin borrar un archivo compartido. Las tarifas tienen filtros combinables locales sobre los registros ya autorizados. La verificación E2E Cartagena sigue pendiente de credenciales de prueba y CLI Docker disponibles; no se declara aprobada.

Actualización 2026-11-13: **Destinos** está parcialmente funcional con CRUD de borradores, publicación/archivo RBAC y auditoría. Paquetes, hoteles, tours, tarifas y galería continúan pendientes; el portafolio comercial no está disponible localmente.

Actualización 2026-11-13: importación de portafolio validada en PostgreSQL aislado (6 destinos, 10 variantes, 21 hoteles, 35 tarifas borrador). La interfaz completa para paquetes, hoteles, tours, tarifas y galería sigue pendiente.

Actualización 2026-11-13: paquetes y hoteles ya tienen consulta/edición protegida en API y navegador. Tours, galería y administración independiente de tarifas siguen pendientes.

Actualización 2026-11-13: API para altas de paquetes, hoteles y tours está disponible como borrador; faltan sus interfaces dedicadas, galería y E2E de Cartagena.

Actualización 2026-11-13: tours y tarifas tienen rutas web protegidas; galería y el flujo E2E Cartagena permanecen pendientes.

Leyenda: **Implementado** (código + pruebas) · **Parcial** · **Ausente** · **Bloqueado por cliente**.

| Área                                                                  | Estado                 | Evidencia / nota                                                       |
| --------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Sitio público (inicio, destinos, detalle, contacto, legales)          | Parcial                | `apps/web/src/app/**`; contenido histórico, sin catálogo administrable |
| SEO técnico (robots, sitemap, canonical, OG, noindex)                 | Implementado           | `apps/web/src/lib/seo.ts`, `apps/web/src/app/robots.ts`, `sitemap.ts`  |
| Cabeceras de seguridad                                                | Implementado           | `apps/web/next.config.ts`; CSP con nonce pendiente (F1-09)             |
| Validación de entorno                                                 | Implementado           | `apps/web/src/lib/env.ts`                                              |
| Intake de cotizaciones                                                | Parcial (cerrado)      | `apps/web/src/app/api/quotes`; 503 hasta PC-6 + limitador compartido   |
| Máquinas de estado reserva/pago                                       | Implementado (dominio) | `packages/domain/src/**`; sin persistencia aún                         |
| Modelo de datos v2                                                    | Implementado           | `packages/db/prisma/schema.prisma`, `docs/data/DATA_MODEL.md`          |
| Auth, sesiones, MFA, RBAC                                             | Parcial                | API, dominio y UI; pendiente evidencia PostgreSQL/E2E y correo         |
| Panel administrativo (dashboard, catálogo, precios, cupos, auditoría) | Parcial                | Shell, rutas protegidas y vacíos reales; CRUD y métricas pendientes    |
| Panel de asesores / CRM                                               | Implementado           | `/admin/solicitudes`, `apps/api/src/crm`                               |
| Constructor de paquetes y motor de precios                            | Ausente                | Lote 6; tarifas reales bloqueadas por PC-4 (Excel)                     |
| Cotizaciones y reservas persistidas                                   | Implementado           | `/admin/reservas`, `apps/api/src/reservations`                         |
| Portal del cliente (código por correo)                                | Implementado           | `/mi-cuenta`, `apps/api/src/portal`; correo real sin proveedor         |
| Finanzas, abonos, conciliación Wompi                                  | Bloqueado por cliente  | Lote 9; PC-5 llaves                                                    |
| PQR                                                                   | Parcial                | Página informativa `apps/web/src/app/pqrs`; sin flujo                  |
| Textos legales, RNT, NIT, contactos                                   | Bloqueado por cliente  | PC-6; no se inventan                                                   |
| Identidad visual definitiva                                           | Bloqueado por cliente  | PC-1 (logo provisional), PC-3                                          |
| E2E + accesibilidad                                                   | Implementado           | `apps/web/e2e/**`; axe sin violaciones en 6 proyectos                  |
| CI, gitleaks, protección de `main`                                    | Implementado           | `.github/workflows/*`, protección verificada por API                   |
| Despliegue: producción manual                                         | Implementado           | `vercel.json`, `docs/operations/DEPLOYMENT.md`                         |
| Imagen Docker / Docker Hub                                            | Bloqueado por cliente  | Sin token; no se publica nada                                          |

## Storage audit (2026-11-14)

| Category                          | Status                         | Evidence / action                                                             |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `.claude/worktrees/admin`, `auth` | Protected                      | Uncommitted changes; retained.                                                |
| Clean integrated worktrees        | Recoverable                    | No exclusive commits; branches retained. `e2e` was removed.                   |
| `.claude/worktrees/api` residue   | Locally blocked                | No `.git`; Windows has open handles in `node_modules`. Do not force deletion. |
| Skills/MCP/sessions               | Not under repository `.claude` | No user configuration or Orchestra resource was touched.                      |

## PQRS y demo (2026-11-14)

- PQRS completo (API + web + E2E); radicación pública apagada por defecto (`PQRS_INTAKE_ENABLED`). Festivos en el plazo: pendiente legal.
- Demo local verificada en navegador: `scripts/start-demo.ps1 -Populate` / `scripts/stop-demo.ps1`. Ver `CODEX_HANDOFF.md`.

## Módulos Clientes, Cupos, Contenido y Configuración (2026-11-15)

| Módulo        | Estado                 | Evidencia                                                                     |
| ------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Clientes      | Implementado y probado | `apps/api/src/customers`, `/admin/clientes`, `public-admin-customers.spec.ts` |
| Cupos         | Implementado y probado | `apps/api/src/catalog/departures*`, `/admin/cupos`, migración aditiva         |
| Contenido     | Implementado y probado | `apps/api/src/content`, `/admin/contenido`, publicación con aprobación        |
| Configuración | Implementado y probado | `apps/api/src/settings`, `/admin/configuracion`, rechaza secretos             |
| QR de MFA     | Implementado y probado | `uqr` local, `auth-admin.spec.ts` con TOTP calculado                          |

- E2E aislado completo: **31/31 + auth 2/2** (PostgreSQL `ricaurte_cartagena_e2e_ci`, 1 worker). API 339/339, web 179/179.
- Siguiente: rediseño Tropical Premium. 21st.dev sigue sin conectar (sin MCP ni `API_KEY_21ST`).
- Incidencia aparte, no de la aplicación: el error de autoactualización de Claude Code se registra fuera del proyecto y no bloquea las pruebas.
