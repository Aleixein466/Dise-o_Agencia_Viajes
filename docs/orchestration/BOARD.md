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

| #   | Lote                                                                         | Depende de | Estado                            |
| --- | ---------------------------------------------------------------------------- | ---------- | --------------------------------- |
| 1   | Arquitectura backend y contratos (ADR-0001: pnpm, Turborepo, NestJS/Fastify) | Lote 4     | Pendiente                         |
| 2   | Auth, usuarios, roles y permisos                                             | Prisma v2  | Pendiente                         |
| 3   | Estructura del panel administrativo                                          | 2          | Pendiente                         |
| 4   | CRUD de catálogo                                                             | 2, 3       | Pendiente                         |
| 5   | CRM y asesores                                                               | 2, 3       | Pendiente                         |
| 6   | Constructor y motor de precios                                               | 4          | Pendiente (datos ficticios; PC-4) |
| 7   | Cotizaciones y reservas                                                      | 6          | Pendiente                         |
| 8   | Portal del cliente                                                           | 2, 7       | Pendiente                         |
| 9   | Finanzas y Wompi sandbox                                                     | 7          | Bloqueado (llaves sandbox, PC-5)  |
| 10  | PQR, comunicaciones y contenido                                              | 2, 3       | Pendiente (textos legales PC-6)   |
| 11  | Reportes, pruebas integrales, prep. producción                               | todos      | Pendiente                         |

## Inventario funcional

Leyenda: **Implementado** (código + pruebas) · **Parcial** · **Ausente** · **Bloqueado por cliente**.

| Área                                                                  | Estado                 | Evidencia / nota                                              |
| --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| Sitio público (inicio, destinos, detalle, contacto, legales)          | Parcial                | `src/app/**`; contenido histórico, sin catálogo administrable |
| SEO técnico (robots, sitemap, canonical, OG, noindex)                 | Implementado           | `src/lib/seo.ts`, `src/app/robots.ts`, `sitemap.ts`           |
| Cabeceras de seguridad                                                | Implementado           | `next.config.ts`; CSP con nonce pendiente (F1-09)             |
| Validación de entorno                                                 | Implementado           | `src/lib/env.ts`                                              |
| Intake de cotizaciones                                                | Parcial (cerrado)      | `src/app/api/quotes`; 503 hasta PC-6 + limitador compartido   |
| Máquinas de estado reserva/pago                                       | Implementado (dominio) | `src/domain/**`; sin persistencia aún                         |
| Modelo de datos v2                                                    | Implementado           | `prisma/schema.prisma`, `docs/data/DATA_MODEL.md`             |
| Auth, sesiones, MFA, RBAC                                             | Ausente                | Lote 2                                                        |
| Panel administrativo (dashboard, catálogo, precios, cupos, auditoría) | Ausente                | Lotes 3–4                                                     |
| Panel de asesores / CRM                                               | Ausente                | Lote 5                                                        |
| Constructor de paquetes y motor de precios                            | Ausente                | Lote 6; tarifas reales bloqueadas por PC-4 (Excel)            |
| Cotizaciones y reservas persistidas                                   | Ausente                | Lote 7                                                        |
| Portal del cliente y enlaces mágicos                                  | Ausente                | Lote 8                                                        |
| Finanzas, abonos, conciliación Wompi                                  | Bloqueado por cliente  | Lote 9; PC-5 llaves                                           |
| PQR                                                                   | Parcial                | Página informativa `src/app/pqrs`; sin flujo                  |
| Textos legales, RNT, NIT, contactos                                   | Bloqueado por cliente  | PC-6; no se inventan                                          |
| Identidad visual definitiva                                           | Bloqueado por cliente  | PC-1 (logo provisional), PC-3                                 |
| E2E + accesibilidad                                                   | Implementado           | `e2e/**`; axe sin violaciones en 6 proyectos                  |
| CI, gitleaks, protección de `main`                                    | Implementado           | `.github/workflows/*`, protección verificada por API          |
| Despliegue: producción manual                                         | Implementado           | `vercel.json`, `docs/operations/DEPLOYMENT.md`                |
| Imagen Docker / Docker Hub                                            | Bloqueado por cliente  | Sin token; no se publica nada                                 |
