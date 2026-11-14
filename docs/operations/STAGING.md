# Staging reproducible

Estado: **PREPARADO, NO DESPLEGADO**. Para desplegar se necesitan:

- un servidor para el API y PostgreSQL;
- un dominio de staging;
- protección de acceso en Vercel;
- la autorización del propietario.

Nada de lo descrito activa cobros ni correos reales.

## Arquitectura

```
Navegador ──HTTPS──> Web Next.js (Vercel, rama `staging`, protegida) ──/api/v1/* (rewrite)──> API NestJS (contenedor)
                                                                                                  │
                                                                                     PostgreSQL 16 (contenedor, sin puerto público)
```

- **Web:** el proyecto de Vercel ya existe (Root Directory `apps/web`; ver `DEPLOYMENT.md`).
  - `API_INTERNAL_URL` debe apuntar al API de staging por HTTPS y definirse **en el build**, porque la regla de
    reescritura se fija en `next build`.
  - `SITE_INDEXING=false`.
- **API y BD:** `deploy/staging/docker-compose.staging.yml` (imagen `apps/api/Dockerfile`).
  - El API escucha solo en 127.0.0.1 del servidor.
  - Delante debe ir un proxy TLS (Caddy, Nginx o el balanceador del proveedor), con `TRUST_PROXY_HOPS=1`.
- **Archivos privados** (comprobantes): volumen `staging_media` en `/data/private-media`. Hay que respaldarlo junto con la
  base de datos.

## Pasos (en el servidor de staging)

1. Instalar Docker Engine y Compose v2, y clonar la rama `staging`.
2. Preparar el entorno: `cp deploy/staging/.env.staging.example deploy/staging/.env.staging`. Completar los secretos,
   generados en el servidor. El archivo está ignorado por Git.
3. Construir e iniciar:
   `docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging up -d --build`.
4. Aplicar las migraciones (solo `migrate deploy`, nunca `reset`):
   `docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging run --rm migrate`.
5. Crear el primer administrador: `… run --rm bootstrap`, con `BOOTSTRAP_ADMIN_*` definidos temporalmente. Al primer
   ingreso se enrola MFA. Después hay que borrar esos valores del archivo.
6. Configurar el proxy TLS para que `https://api-staging.<dominio>` llegue a `127.0.0.1:4000`.
7. Configurar Vercel para la rama `staging`: `API_INTERNAL_URL=https://api-staging.<dominio>`, `SITE_INDEXING=false`,
   Deployment Protection activa y dominio `staging.<dominio>`. `APP_ORIGIN` y `WEB_ORIGIN` del API deben ser ese mismo
   origen.
8. Comprobar con smoke tests:
   - `GET /api/v1/health` → 200;
   - `GET /api/v1/health/ready` → 200;
   - `GET /api/v1/auth/session` → 401;
   - la web `/ingresar` → 200.

   Después, ejecutar el E2E contra la URL de staging con datos ficticios.

## Variables

| Variable                                                         | Staging                              | Nota                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                       | `production`                         | Activa las salvaguardas de producción: rechaza `sandbox_test` y el secreto de códigos de desarrollo.                   |
| `DATABASE_URL`                                                   | la arma Compose                      | Rol propio de staging; nunca la base de producción.                                                                    |
| `APP_ORIGIN` / `WEB_ORIGIN`                                      | `https://staging.<dominio>`          | CSRF y Origin dependen de que coincidan exactamente.                                                                   |
| `MFA_ENCRYPTION_KEY`, `CUSTOMER_CODE_SECRET`                     | 32 bytes aleatorios en base64        | Distintos de los de producción. Rotar la llave de MFA invalida los autenticadores.                                     |
| `PAYMENT_ADAPTER`                                                | `disabled`                           | Hasta tener las llaves sandbox de Wompi (`WOMPI_SANDBOX.md`). `sandbox_test` está prohibido con `NODE_ENV=production`. |
| `MAIL_ADAPTER`                                                   | `disabled`                           | O `smtp` hacia un buzón de pruebas. Un proveedor real exige `MAIL_REAL_DELIVERY_APPROVED=true` y autorización escrita. |
| `PUBLIC_QUOTE_REQUESTS_ENABLED`, `PQRS_INTAKE_ENABLED`           | `false`                              | Se abren solo con los textos legales aprobados (`GO_LIVE_CHECKLIST.md`).                                               |
| `PQRS_HOLIDAYS`                                                  | `colombia`                           | Ver `PQRS_PLAZOS.md`.                                                                                                  |
| `NOTIFICATIONS_DISPATCH_INTERVAL_MS`                             | `0`                                  | Con el correo desactivado no hay nada que despachar.                                                                   |
| Web: `API_INTERNAL_URL`, `SITE_INDEXING`, `NEXT_PUBLIC_SITE_URL` | URL del API, `false`, URL de staging | Ningún secreto en `NEXT_PUBLIC_*`.                                                                                     |

## Límites conocidos (antes de producción)

- **Límites de peticiones en memoria** (`PublicRateLimiter`): valen por proceso. Con más de una réplica hace falta un
  almacén compartido (Redis o PostgreSQL). En staging se usa **una sola réplica**.
- **Despacho de notificaciones:** corre dentro del proceso del API. Con varias réplicas conviene un proceso único o un
  bloqueo.
- **Respaldos:** `pg_dump` diario más copia del volumen `staging_media`. Hay que probar la restauración antes del
  lanzamiento.
- **Imagen base:** `node:24-bookworm-slim` sin digest. Al aprobar staging, fijar el digest (`node:24-bookworm-slim@sha256:…`).

## Verificación local realizada

- `docker compose -f deploy/staging/docker-compose.staging.yml config` es válido. Sin secretos, Compose se niega a
  iniciar.
- `docker build -f apps/api/Dockerfile .` produce la imagen. El resultado del arranque local se anota en `CODEX_HANDOFF.md`.
