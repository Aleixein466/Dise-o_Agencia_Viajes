# Backlog priorizado

Agentes: **C** = Claude (orquestador/arquitectura), **CX** = Codex (implementación; requiere sandbox con red/refs), **R** = revisor distinto al autor. Estado: ✅ hecho en rama · ⏳ siguiente · ⛔ bloqueado.

| ID | P | Tarea | Depende | Agente | Archivos | Pruebas | PR / rama | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1-01 | P0 | Ignorar generados; compose local sin `change-me`, bind 127.0.0.1 | — | C | `.gitignore`, `docker-compose.yml`, `.env.example`, README | build | `chore/f1-repo-hygiene` | ✅ |
| F1-02 | P0 | Cabeceras de seguridad base, sin `x-powered-by` | — | C | `next.config.ts` | curl cabeceras, rutas 200 | `feat/f1-security-headers` | ✅ |
| F1-03 | P0 | ESLint + Vitest + CI (lint, types, test, build, audit, gitleaks) | — | C (CX falló) | `eslint.config.mjs`, `vitest.config.ts`, `.github/workflows/ci.yml` | 5 tests | `chore/f1-quality-tooling` | ✅ |
| F0-DOC | P0 | Baseline, gaps, riesgos, amenazas, ADR | — | C | `docs/**` | — | `docs/f0-baseline` | ✅ |
| F1-04 | P0 | Validación de entorno con Zod (`src/lib/env.ts`), fallo temprano en prod | F1-03 | CX | `src/lib/env.ts`, `db.ts` | unit | `feat/f1-env` | ⏳ |
| F1-05 | P0 | Protección de rama `main`, PR obligatorio, checks requeridos, Dependabot | F1-03, gh login | C (usuario) | `.github/dependabot.yml` | — | `chore/f1-repo-policy` | ⛔ gh sin sesión |
| F1-06 | P0 | Prettier + Husky/lint-staged + commitlint | F1-03 | CX | configs | hook local | `chore/f1-format` | ⏳ |
| F1-07 | P0 | Endurecer `api/quotes`: lectura acotada por stream, check `Origin`, rate limit, `/cotizar` dinámica respecto a flags | F1-03 | CX + R | `api/quotes/*`, `cotizar/page.tsx` | unit 413/403/429 | `fix/f1-quotes-hardening` | ⏳ |
| F1-08 | P0 | Docker de pruebas: Postgres efímero + `prisma migrate deploy` + test integración | Docker instalado | CX | `docker-compose.yml` (perfil test), `vitest.integration` | integración | `chore/f1-test-db` | ⛔ sin Docker |
| F1-09 | P1 | CSP con nonce vía `proxy` (Next 16) para scripts/estilos | F1-02 | C | `src/proxy.ts`, `next.config.ts` | E2E consola limpia | `feat/f1-csp-nonce` | ⏳ |
| F1-10 | P1 | Separar datos históricos (`content/history`) de catálogo; tipado explícito `HistoricalTrip` | — | CX | `src/lib/demo-data.ts` → `src/content/` | unit | `refactor/f1-history` | ⏳ |
| F2-01 | P0 | ADR-0001 aprobado: estrategia monorepo/NestJS | Usuario | C | `docs/adr/` | — | `docs/f0-baseline` | ⏳ revisión |
| F2-02 | P0 | Esquema v2: estados de reserva/pago del requisito, ledger, `ConsentRecord`, `LegalDocument`, `PaymentWebhookEvent` | F2-01, F1-08 | C + R | `prisma/**` | migrate from zero | `feat/f2-schema-v2` | ⏳ |
| F2-03 | P0 | Máquina de estados reserva/pago pura + tests exhaustivos | F2-02 | C | `src/domain/reservations/*` | unit + property | `feat/f2-state-machine` | ⏳ |
| F2-04 | P0 | Auth: Argon2id, sesión cookie, MFA admin, RBAC + ownership | F2-01 | C + R | `auth/**` | 401/403/IDOR | `feat/f2-auth` | ⏳ |
| F2-05 | P1 | OpenAPI + esquemas Zod compartidos | F2-01 | CX | `packages/validation` o `src/contracts` | contrato | `feat/f2-contracts` | ⏳ |
| F3-01 | P1 | Admin catálogo con Borrador/Publicada y auditoría | F2-04 | CX + R | `(admin)/**` | E2E | `feat/f3-catalog` | ⏳ |
| F4-01 | P1 | Tema oscuro, tokens semánticos, `brand.config.ts`, `lang=es-CO` | PC-1, PC-3 | C | `globals.css`, `layout.tsx` | visual 4 anchos | `feat/f4-theme` | ⛔ PC-1/PC-3 |
| F4-02 | P1 | SEO técnico: sitemap, robots, canonical (noindex hasta lanzamiento) | — | CX | `src/app/sitemap.ts`, `robots.ts` | unit | `feat/f4-seo` | ⏳ |
| F5-01 | P0 | `PricingService` puro en centavos COP, con datos **ficticios marcados** | F2-02 | C + R | `src/domain/pricing/*` | golden ficticio + property | `feat/f5-pricing-core` | ⛔ PC-4 (solo estructura) |
| F6-01 | P0 | Intake de cotización con consentimiento versionado + correo | F1-07, F2-02 | CX + R | quotes | integración | `feat/f6-quotes` | ⛔ PC-6 |
| F7-01 | P0 | `PaymentProvider` + `WompiAdapter` sandbox: firma integridad, webhook, idempotencia | F2-02, F2-03 | C + R (CX) | `src/domain/payments/*` | adversarias webhook | `feat/f7-wompi-sandbox` | ⛔ llaves sandbox |
| F9-01 | P0 | E2E Playwright + axe a 375/768/1280/1440 claro/oscuro | PC-2 | CX | `e2e/**` | E2E | `test/f9-e2e` | ⛔ PC-2 |
| F9-02 | P1 | Dockerfile multietapa web (no root, healthcheck) + push a Docker Hub desde CI por digest | F1-03, token Docker Hub | C | `Dockerfile`, workflow | Trivy | `ci/f9-image` | ⛔ secreto `DOCKERHUB_TOKEN` |
| F9-03 | P1 | Backups + prueba de restauración | hosting ADR | C | runbook | restore real | — | ⛔ |
