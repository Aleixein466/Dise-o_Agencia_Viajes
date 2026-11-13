# ADR-0001 — Evolución incremental hacia monorepo (pnpm + Turborepo) y API NestJS/Fastify

Estado: **Propuesto** (requiere aprobación del usuario) · Fecha: 2026-11-13

## Contexto

- Requisito §13 y §27: monolito modular, `apps/web` (Next.js) + `apps/api` (NestJS + Fastify), `packages/{ui,shared,validation,config}`, pnpm + Turborepo.
- Estado real: una app Next.js 16.4.2 con npm, sin backend de dominio, 1 migración Prisma, sin tests en `main`, sin Docker local, sin CI previa.
- Mover todo ahora mezclaría cambio de gestor de paquetes, estructura y lógica sin red de seguridad.

## Decisión

Migrar en **tres pasos reversibles**, cada uno en PR propio con CI verde:

1. **F1 (ahora):** endurecer el repo actual (lint, tests, CI, cabeceras, compose). Sin mover archivos.
2. **F2-a:** convertir a pnpm workspaces + Turborepo moviendo la app tal cual a `apps/web` (`git mv`, conserva historia). Prisma pasa a `packages/db`. Mismas rutas públicas: cero cambio de URL. Lockfile `pnpm-lock.yaml` reemplaza `package-lock.json` en el mismo PR.
3. **F2-b:** crear `apps/api` (NestJS + Fastify, `/api/v1`, `GET /api/v1/health`) y `packages/validation` (Zod compartido, decisión: **Zod** en vez de class-validator para un solo lenguaje de esquemas, con OpenAPI generado). Los endpoints nuevos (auth, pricing, quotes, reservations, payments) nacen en la API. `src/app/api/quotes` de Next queda cerrado y se retira cuando su equivalente en la API pase seguridad.

El dominio (pricing, máquina de estados, firmas Wompi) se escribe como **TypeScript puro sin framework** en `packages/domain` para probarlo en aislamiento y no atarlo a Nest.

## Alternativas

| Opción                                   | Pros                                                 | Contras                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A. Seguir con Next solo (route handlers) | Menos piezas, despliegue único                       | Contradice §13/§27; guards, módulos y jobs menos estructurados; webhook y panel en el mismo proceso que SSR |
| **B. Incremental (elegida)**             | Cumple el requisito sin romper; cada paso reversible | Dos procesos a desplegar; algo más de infraestructura                                                       |
| C. Big-bang monorepo + API               | Llega antes a la estructura final                    | Alto riesgo, PR enorme, imposible de revisar                                                                |

## Costos y riesgos

- Hosting: dos servicios (web + api) + PostgreSQL gestionado; decisión de proveedor en ADR-0002.
- CI más larga (Turborepo cache lo mitiga).
- Riesgo de romper build en el paso 2: mitigado con PR que solo mueve archivos y verifica rutas 200.

## Rollback

Cada paso es un PR; revertir el merge restaura el estado anterior. No hay migraciones de datos en los pasos 2–3.

## Aprobación requerida

Confirmar B antes de ejecutar F2-a. Sin aprobación, F1 continúa sin cambiar estructura.
