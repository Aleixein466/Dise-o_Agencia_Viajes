# STATE — Ricaurte Tours 3.0

Actualizado: 2026-11-13. Reanudar leyendo este archivo, `BACKLOG.md`, `RISK_REGISTER.md` y `docs/adr/`.
Requisitos: `docs/requirements/requisitos_plataforma_ricaurte_tours_v2.0.md`.

## Estado

- `main` = `99844b7` (sin cambios). **Protegida en GitHub**: PR obligatorio, checks `verify` + `secrets` requeridos (strict), `enforce_admins`, sin force-push ni borrado (verificado por API).
- PR #1 `integration/f1` → `main` (borrador): F0 + F1 lotes 1–2. CI verde (verify, secrets). No fusionado.
- PR #2 `integration/batch3` → `integration/f1` (borrador, apilado): lote 3.
- PR #3 `integration/batch4` → `integration/batch3` (borrador): lote 4. Vercel: producción automática desde `main` **desactivada** (`vercel.json`); ver `docs/operations/DEPLOYMENT.md`. Tablero: `BOARD.md`.
- Repo **público**: todo lo versionado (incluida la copia de requisitos) es visible.

## Protección local

- `.git/hooks/pre-commit`: bloquea commits en `main` en cualquier rama/worktree y delega en `.husky/pre-commit` (lint-staged) si existe.
- `.git/hooks/commit-msg`: commitlint si la rama tiene `commitlint.config.mjs`.
- `.git/hooks/pre-push`: bloquea push a `main`; lint + typecheck + test.
- `core.hooksPath` **sin definir a propósito**: con Husky activo, `main` (sin `.husky/`) quedaba sin guard (probado). Pasar a Husky estándar solo tras fusionar en `main`.

## Lote 3 (en `integration/batch3`)

| Rama                     | Autor                                 | Contenido                                                                                       |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `feat/f1-trusted-ip`     | Claude                                | `client-ip.ts`, `RateLimitStore`, gate de producción en `env.ts`, ADR-0002                      |
| `feat/f2-state-machine`  | Codex (borrador) → Claude (reescrito) | `packages/domain/src/**` reserva/pago                                                           |
| `feat/f4-seo`            | orchestra:builder (Sonnet)            | robots, sitemap, canonical, OG, `es-CO`                                                         |
| `chore/f1-format`        | Claude                                | Prettier, Husky, lint-staged, commitlint, `.gitattributes` + correcciones de revisión `70cba38` |
| `test/f9-e2e-playwright` | orchestra:builder (Sonnet)            | Playwright, axe, `e2e.yml`, servicio Docker `tools`                                             |

Verificación local de `integration/batch3`: lint 0 · tsc OK · unit 76/76 · build OK · E2E 92 passed / 4 skipped / 0 failed. Revisión Sonnet: IP APPROVE; dominio/SEO/F1-06 con cambios obligatorios → corregidos.

## Lecciones de orquestación

- Sandbox de Codex: no escribe refs git ni usa red npm; Vitest y `next build` fallan con `node_modules` enlazado; una vez **perdió todas sus escrituras** (F4-02) y otra introdujo mojibake (F1-07). Claude verifica cada entrega y hace el commit. Worktrees para Codex dentro de `.claude/worktrees/`.
- Turbopack no compila en worktrees con junction: E2E usa worktree con `npm ci` propio.
- Worktrees antiguos en `C:\Users\alexi\Desktop\rt-wt\` contienen junctions a `node_modules` real: **no borrar recursivamente**; quitar primero el junction con `rmdir`.

## Decisiones

- Fijadas por requisitos: Wompi, COP, es-CO, disponibilidad manual v1, stack §27.
- ADR-0001 **aceptado** (monorepo incremental + NestJS). ADR-0002 propuesto (IP confiable + limitador PostgreSQL).
- PC-1: logo del repo como referencia **provisional**. PC-2: Playwright local ahora; Docker/CI preparados.

## Bloqueadores

- PC-1 confirmación de logo · PC-3 dirección visual · PC-4 Excel de costos · PC-5 Wompi · PC-6 textos legales.
- Docker no instalado localmente; migraciones probadas en CI (job `database`, PostgreSQL 16) y con `prisma dev`.
- Docker Hub: sin token; no se publicó nada.

## Lote 4 (en `integration/batch4`) — completado

Formato masivo aislado, contraste WCAG AA (axe sin violaciones), esquema Prisma v2 + migración aditiva `20261113_schema_v2` (revisión Sonnet: APPROVE), job CI `database`, Dependabot, matriz ASVS, tablero e inventario. Verificación local: lint 0 · tsc OK · unit 80/80 · build OK.

## Siguiente

1. F2-a: pnpm + Turborepo, `apps/web`, `packages/db` (requiere cambiar _Root Directory_ de Vercel a `apps/web`: acción del usuario).
2. F2-b: `apps/api` NestJS/Fastify + `packages/{domain,validation}`.
3. Lote 2 auth → lote 3 panel admin → lote 4 catálogo.
