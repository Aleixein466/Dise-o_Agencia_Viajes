# STATE — Ricaurte Tours 3.0

Actualizado: 2026-11-13. Reanudar leyendo este archivo, `BACKLOG.md`, `RISK_REGISTER.md` y `docs/adr/`.

## Estado

- Fase actual: **F0 cerrada · F1 tanda 1 en ramas locales (sin push, sin merge)**.
- `main` = `99844b7` (sin cambios).
- Requisitos: `docs/requirements/requisitos_plataforma_ricaurte_tours_v2.0.md`.

## Ramas locales (cada una 1 commit sobre `main`)

| Rama | Contenido | Verificación |
| --- | --- | --- |
| `docs/f0-baseline` | Este set de docs F0 + copia de requisitos | — |
| `feat/f1-security-headers` | Cabeceras de seguridad, `poweredByHeader: false` | build OK; curl muestra 7 cabeceras; `/`, `/destinos/cartagena`, `/cotizar` 200; `POST /api/quotes` 503 |
| `chore/f1-repo-hygiene` | Ignora `tsconfig.tsbuildinfo`/`next-env.d.ts`; compose con contraseña obligatoria y 127.0.0.1 | build OK; `docker compose config` **no ejecutado** (sin Docker) |
| `chore/f1-quality-tooling` | ESLint 9.39.5 + eslint-config-next 16.4.2, Vitest 5.1.0, 5 tests, CI GitHub Actions | lint 0 problemas, typecheck OK, 5/5 tests, build OK; CI **no ejecutada** en GitHub |

Conflicto esperado al integrar: ninguno entre archivos (conjuntos disjuntos), salvo que `chore/f1-quality-tooling` cambia `site-header.tsx` y `postcss.config.mjs` para pasar lint.

## Decisiones

- Wompi, COP, español, disponibilidad manual v1, stack §27: fijadas por requisitos (no se preguntan).
- ADR-0001 (propuesto): migración incremental a monorepo + NestJS en 3 pasos.
- Zod como único lenguaje de validación (propuesto en ADR-0001).

## Bloqueadores / puntos de control

- PC-1 logo definitivo · PC-2 Playwright Docker/local · PC-3 dirección visual · PC-4 Excel de costos · PC-5 Wompi · PC-6 textos legales.
- Docker no instalado → sin integración con PostgreSQL ni Playwright en contenedor.
- `gh` sin sesión → sin push/PR/protección de rama.
- Docker Hub: sin credenciales/CLI; solo inventario público (ningún repo de Ricaurte).
- Codex: su sandbox no escribe refs git ni accede a npm; F1-03 lo hizo Claude.

## Próximo paso

1. Usuario: aprobar ADR-0001, responder PC-2, `gh auth login` para push/PR.
2. Tanda 2 (segura): F1-04 env, F1-07 endurecer quotes, F1-10 separar histórico.
