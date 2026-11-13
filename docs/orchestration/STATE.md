# STATE — Ricaurte Tours 3.0

Actualizado: 2026-11-13. Reanudar leyendo este archivo, `BACKLOG.md`, `RISK_REGISTER.md` y `docs/adr/`.

## Estado

- Fase actual: **F0 cerrada · F1 lote 1 aprobado por revisor (Sonnet) e integrado en `integration/f1` · F1 lote 2 en curso (Codex)**.
- `main` = `99844b7` (sin cambios). `integration/f1` = merge de las 4 ramas; lint 0, typecheck OK, 5/5 tests, build OK.
- Protección local de `main` (sin `gh`): `.git/hooks/pre-commit` bloquea commits en `main`; `.git/hooks/pre-push` bloquea push a `main` y exige lint+typecheck+test. Probado: commit en `main` rechazado. Protección en GitHub (PR + checks requeridos) pendiente de `gh auth login`.
- Lote 2 en worktrees `C:\Users\alexi\Desktop\rt-wt\{f1-07-quotes-hardening,f1-04-env,f1-10-history}` (ramas `fix/f1-quotes-hardening`, `feat/f1-env`, `refactor/f1-history`, base `integration/f1`). Codex edita; Claude hace commit; revisor distinto revisa.
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

## Lote 2 (integrado en integration/f1, revisado por Sonnet: APPROVE)

- F1-07 fix/f1-quotes-hardening: lectura por stream con tope 16 KB (413), 415, 403 por Origin, 429 por IP, /cotizar evalúa flags por petición. Codex introdujo mojibake UTF-8; Claude lo reparó y añadió src/encoding.test.ts.
- F1-04 feat/f1-env: src/lib/env.ts (Zod), errores sin valores, quoteIntakeOpen() falla cerrado.
- F1-10 refactor/f1-history: src/content/historical-trips.ts con kind "historical" y tests de integridad.
- Verificación integration/f1: 38/38 tests, lint 0, tsc OK, build OK, 8 rutas 200, POST /api/quotes 503.
- Deuda conocida (baja, endpoint cerrado): IP del limitador viene de XFF controlable por cliente; usar IP de proxy confiable + store compartido antes de abrir intake.
- Codex: su sandbox no ejecuta Vitest ni next build en worktrees con node_modules enlazado; Claude verifica y hace commit.

## Próximo paso

1. Usuario: gh auth login (push + PR de integration/f1 a main + protección en GitHub), PC-2, aprobar ADR-0001, PC-1.
2. Lote 3 desbloqueado: F1-06 Prettier/Husky/commitlint, F4-02 SEO técnico (noindex), F2-03 máquina de estados pura (dominio, sin BD).
