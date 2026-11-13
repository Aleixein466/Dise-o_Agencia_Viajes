# Ricaurte Tours · rediseño premium V2

Sitio responsive en Next.js para explorar viajes anteriores y preparar una idea de viaje. El catálogo presenta **viajes documentados** por Ricaurte Tours en publicaciones que el cliente compartió: Eje Cafetero (2026), Atacames (2025), Excursión Chévere (2024), Cartagena (2022), San Andrés (2022) y Parque de las Aguas (2021). Esas publicaciones no representan paquetes, tarifas, fechas ni disponibilidad futura. El rediseño V2 incorpora el logo oficial, una portada propia, mosaico de fotografías ampliables y estados claros para funciones aún no activadas. Véase [auditoría V2](docs/auditoria-v2.md).

## Estado

- Fase 1: diagnóstico, arquitectura, mapa de navegación y diseño visual inicial.
- Fase 2: inicio, catálogo filtrable, detalle de destino y formulario de cotización.
- Fase 3: esquema relacional Prisma y endpoint de cotizaciones preparado. La recepción está deshabilitada hasta aprobar la política de datos y configurar PostgreSQL.
- Fases 4 a 6: reservas, autenticación, panel, pagos sandbox, PQRS completo y pruebas de producción pendientes. No se muestran como funcionalidades operativas.

## Ejecución local

Monorepo pnpm + Turborepo (`apps/web`, `packages/db`). Requiere Node.js 20.19+ (se probó con Node 24) y pnpm, que se activa con Corepack (`corepack enable`; la versión exacta está fijada en `packageManager` de `package.json`).

```powershell
pnpm install
pnpm dev
```

Abrir `http://localhost:3000`. Para preparar PostgreSQL, copiar `.env.example` a `.env` **en la raíz del repositorio** (lo leen `apps/web` y `packages/db`) y reemplazar `REPLACE_WITH_LOCAL_DEV_PASSWORD` (en `POSTGRES_PASSWORD` y `DATABASE_URL`) por una contraseña local única. `docker-compose.yml` exige esa variable, publica PostgreSQL solo en `127.0.0.1` y es exclusivo para desarrollo local:

```powershell
docker compose up -d
pnpm db:generate
pnpm db:migrate
```

La API solo acepta y guarda solicitudes cuando existe `DATABASE_URL`, las migraciones están aplicadas, `QUOTE_INTAKE_ENABLED=true` y `PRIVACY_POLICY_APPROVED=true`. **Antes de activar ambas variables se debe sustituir la página provisional de privacidad por la política aprobada por la agencia.** En el estado actual, `/cotizar` solo permite explorar destino, fecha y viajeros; no pide datos personales. Docker no estaba instalado en el entorno donde se preparó el proyecto; por ello no se ejecutó una migración contra una base real.

## Verificaciones

```powershell
pnpm --filter @ricaurte/db validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod
```

## Estructura

- `apps/web`: aplicación Next.js (paquete `@ricaurte/web`).
  - `apps/web/src/app`: rutas públicas y API de cotizaciones.
  - `apps/web/src/components`: navegación, pie, tarjetas, portada fotográfica y galería accesible.
  - `apps/web/src/content/historical-trips.ts`: contenido editorial reemplazable.
  - `apps/web/e2e`: pruebas Playwright.
- `packages/db`: Prisma (`@ricaurte/db`): `prisma/schema.prisma` (modelo de datos), migraciones y cliente generado en `src/generated/` (ignorado por git; `pnpm db:generate`).
- `apps/api`: API NestJS + Fastify (`@ricaurte/api`), prefijo `/api/v1`; `GET /api/v1/health` (liveness) y `/api/v1/health/ready` (PostgreSQL). `pnpm --filter @ricaurte/api dev` (puerto 4000, solo loopback). Web la expone mismo-origen con `API_INTERNAL_URL` (rewrite `/api/v1/*`, leído en `next build`).
- `packages/domain`: dominio puro en TypeScript (`@ricaurte/domain`): máquinas de estado de reserva/pago y dinero en centavos.
- `packages/validation`: esquemas Zod compartidos (`@ricaurte/validation`): `healthResponse`, `problem` (RFC 9457).
- `docs/propuesta.md`: arquitectura y plan inicial.
- `docs/auditoria-v2.md`: hallazgos verificados, benchmark, decisiones y QA del rediseño.

Las fotografías de portada, tarjetas, sitios turísticos, galerías y cierre se obtuvieron de [publicaciones específicas de Ricaurte Tours](https://www.facebook.com/ricaurtetours) compartidas por el cliente, con enlaces a cada publicación original. La ficha de cada viaje incluye su propia galería. Cuatro afiches promocionales antiguos aparecen en un archivo plegable y se identifican como no vigentes. Antes de publicar el sitio, conviene revisar la selección final de fotografías con la agencia, incluidas las imágenes de menores y de la interacción con delfines.
