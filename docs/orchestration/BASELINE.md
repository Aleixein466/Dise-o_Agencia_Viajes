# Baseline F0 — Ricaurte Tours

Fecha: 2026-11-13 · Rama: `main` · SHA: `99844b7f9050e50b2eb9df47b5ebd74b8dd16a85` · `git status`: limpio.
Remoto: `github.com/Aleixein466/Dise-o_Agencia_Viajes`. Requisitos: `docs/requirements/requisitos_plataforma_ricaurte_tours_v2.0.md` (copia literal del archivo entregado, v2.0).

## Entorno verificado

| Herramienta            | Estado                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node / npm             | v24.15.0 / 11.12.1                                                                                                                                                                                                 |
| Docker CLI             | **No instalado** en este equipo (`docker: command not found`)                                                                                                                                                      |
| GitHub CLI             | Instalado, **sin sesión** (`gh auth status`: not logged in) → no se pudo leer Actions, protección de ramas ni PR                                                                                                   |
| GitHub Actions         | No existía `.github/` en `main`                                                                                                                                                                                    |
| Playwright             | No está en el proyecto; hay un binario ajeno en otro entorno Python. PC-2 pendiente                                                                                                                                |
| Codex CLI              | 0.167.2, sesión iniciada; su sandbox bloqueó escritura de refs git y red npm (ver STATE)                                                                                                                           |
| Docker Hub `alexisfer` | API pública: 5 repos públicos (`programita`, `sistema-experto`, `helpdesk-net`, `proyectouno`, `byteshop`). **Ninguno es de Ricaurte Tours.** Tags, digests y vulnerabilidades no auditados (sin CLI/credenciales) |

## Resultados reproducibles (sin modificar archivos)

| Comando                                          | Resultado                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                         | OK                                                                                                                              |
| `npx prisma validate --config prisma7.config.ts` | OK (con `DATABASE_URL` ficticia)                                                                                                |
| `npm run typecheck` antes de `prisma generate`   | **FALLA**: `src/lib/db.ts(2,30)` no encuentra `@/generated/prisma/client` (cliente generado e ignorado por git)                 |
| `npm run build` (incluye `prisma generate`)      | OK; 16 páginas, 6 fichas SSG, `/api/quotes` dinámica                                                                            |
| `npm run typecheck` tras generate                | OK                                                                                                                              |
| `npm audit` / `--omit=dev`                       | 1 moderada: `fast-uri` (vía `prisma` → `@prisma/dev` → `ajv`), GHSA-333x-w4r6-6crp. Herramienta de desarrollo; sin alta/crítica |
| lint / test / E2E                                | **No existían** en `main`                                                                                                       |
| Migraciones contra PostgreSQL real               | **No ejecutado** (sin Docker)                                                                                                   |

Efecto secundario: `npm run build`/`typecheck` reescriben `tsconfig.tsbuildinfo` versionado (corregido en F1-01).

## Inventario

- Rutas: `/`, `/destinos`, `/destinos/[slug]` (6 viajes históricos), `/cotizar`, `/contacto`, `/pqrs`, `/privacidad`, `/terminos`, `POST /api/quotes`.
- `src/lib/demo-data.ts`: viajes **históricos** documentados (2021–2026) con fuente Facebook. No son oferta vigente.
- Prisma: 1 migración (`20261015_initial`), 21 modelos; roles `SUPERADMIN/ADMIN/ADVISOR/CUSTOMER`; dinero en `Decimal(14,2)`.
- Config Prisma en `prisma7.config.ts` (nombre no estándar; los comandos deben pasar `--config` o lo resuelve por convención — verificar en F1).
- `docker-compose.yml`: solo PostgreSQL 16, contraseña `change-me`, puerto `5432` en todas las interfaces.
- Sin cabeceras de seguridad, sin `x-powered-by` deshabilitado, `lang="es"` (requisito: `es-CO`), metadata `robots: noindex` (correcto para prototipo).
- Imágenes: `public/images/` con logo `ricaurte-logo.jpg` y fotos de publicaciones (8 entradas). Derechos/consentimiento de menores sin confirmar.

## Qué funciona realmente vs. qué es esquema/mock

| Funciona                                                                                                   | Solo esquema / mock / bloqueado                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Sitio público estático: home, catálogo histórico filtrable, fichas con galería accesible, menú con teclado | Catálogo comercial, paquetes, salidas, precios (modelos Prisma sin UI ni datos) |
| `/cotizar` explora destino/fecha/viajeros sin pedir PII                                                    | Cotizaciones: API devuelve 503 (cerrada por 3 condiciones)                      |
| `POST /api/quotes` valida con Zod y se mantiene cerrada                                                    | Reservas, pagos, abonos, Wompi, auth, panel, PQR, correo: inexistentes          |
| Build y typecheck                                                                                          | Lint, tests, CI, E2E: inexistentes en `main`                                    |
