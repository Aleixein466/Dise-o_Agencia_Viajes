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
  - `API_INTERNAL_URL` debe apuntar al API de staging por HTTPS y definirse **en el build** (la regla de
    reescritura se fija en `next build`) **y en tiempo de ejecución** (el servidor de Next lee el contenido público
    desde ahí; ver «Contenido público y caché»).
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

## Contenido público y caché

El inicio (titular y botón del hero, avisos, destinos destacados), las preguntas frecuentes, `/contacto` y el pie leen
el contenido **publicado** del API (`GET /api/v1/public/content` y `/public/agency`). El API solo devuelve lo
publicado; los borradores nunca llegan a la web.

- **Sin API o con error:** la web muestra el texto estático aprobado (sin avisos ni destacados; contacto con la página
  de Facebook). Ninguna página falla por esto, así que las vistas previas sin API siguen funcionando. Si el API no
  respondía durante `next build`, las páginas se generan con ese texto estático y pasan al contenido publicado al
  guardar algo en el panel o, a más tardar, 1 hora después de generarse: conviene compilar con el API arriba.
- **Caché:** cada lectura se guarda 1 hora y lleva la etiqueta `public-content`. Al guardar o publicar en
  `/admin/contenido` o `/admin/configuracion`, el navegador del administrador llama a `POST /api/revalidate-content`,
  que **expira** la etiqueta al instante (`expire: 0`, sin «stale-while-revalidate»): la siguiente visita reconstruye la
  página con el contenido nuevo y nunca se vuelve a servir algo que el personal acaba de retirar.
  - La ruta exige mismo origen, sesión de personal con MFA, el permiso `content:write` o `settings:write` y el token
    CSRF de la sesión. No recibe contenido: solo invalida.
  - Si la web no confirma la actualización (se reintenta 3 veces ante errores de red o 5xx), el panel muestra un
    aviso persistente: el cambio ya está guardado, pero el sitio puede tardar hasta 1 hora en reflejarlo. Volver a
    guardar o publicar lo reintenta y, al confirmarse, el aviso desaparece.
  - Un cambio hecho directamente en la base o el API, sin pasar por el panel, tarda **hasta 1 hora** en verse.
  - Si el API cae justo cuando se regenera una página, esa copia se genera con el texto estático y se queda hasta la
    siguiente invalidación o, a más tardar, 1 hora.
- **Preguntas frecuentes:** con al menos una pregunta publicada se muestran solo las publicadas. Sin ninguna (sitio
  nuevo o todas retiradas) se mantiene el texto estático aprobado, para no dejar la sección vacía; para ocultar una
  pregunta estática hay que publicar las propias.
- **Imágenes:** el API aún no expone medios públicos, así que el hero y los avisos se muestran sin imagen. Las fotos
  quedarán disponibles cuando exista ese endpoint y haya fotografías con derechos de uso (`GO_LIVE_CHECKLIST.md`, A).
- **Comprobación en staging:** publicar un aviso en `/admin/contenido`; el inicio debe mostrarlo en unos segundos y
  desaparecer al retirarlo. Con el API apagado, `/` y `/contacto` responden 200 con el texto estático.

## Límites conocidos (antes de producción)

- **Límites de peticiones en memoria** (`PublicRateLimiter`): valen por proceso. Con más de una réplica hace falta un
  almacén compartido (Redis o PostgreSQL). En staging se usa **una sola réplica**.
- **Despacho de notificaciones:** corre dentro del proceso del API. Con varias réplicas conviene un proceso único o un
  bloqueo.
- **Respaldos:** `pg_dump` diario más copia del volumen `staging_media`. Hay que probar la restauración antes del
  lanzamiento.
- **Imagen base:** `node:24-bookworm-slim` sin digest. Al aprobar staging, fijar el digest (`node:24-bookworm-slim@sha256:…`).

## Respaldo y restauración (procedimiento)

Todos los comandos corren en el servidor de staging, dentro de `deploy/staging/` y con las variables del `.env` de
staging cargadas. Ninguno borra volúmenes. **No se aplican a producción** sin autorización escrita.

1. **Respaldo diario de la base** (formato custom, comprimido):

   ```sh
   docker compose -f docker-compose.staging.yml exec -T postgres      sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/pg-$(date +%F).dump"
   ```

2. **Copia de los medios** (volumen `staging_media`, en solo lectura; Compose le antepone el nombre del proyecto, así que el nombre real se confirma con `docker volume ls`):

   ```sh
   docker run --rm -v staging_media:/data:ro -v "$PWD/backups:/out" alpine      tar czf "/out/media-$(date +%F).tgz" -C /data .
   ```

3. **Retención:** conservar 14 diarios y 8 semanales fuera del servidor (almacenamiento cifrado del proveedor). Los
   archivos contienen datos personales: se tratan según la política de datos y nunca se suben al repositorio.
4. **Prueba de restauración** (mensual y antes del lanzamiento), sobre una base **nueva**, nunca encima de la actual:

   ```sh
   docker compose -f docker-compose.staging.yml exec -T postgres      sh -c 'createdb -U "$POSTGRES_USER" ricaurte_restore_check'
   docker compose -f docker-compose.staging.yml exec -T postgres      sh -c 'pg_restore -U "$POSTGRES_USER" -d ricaurte_restore_check --no-owner' < backups/pg-AAAA-MM-DD.dump
   ```

   Verificar los conteos de `users`, `quotes`, `reservations`, `payments` y `audit_logs` contra la base actual, y
   anotar el resultado y la fecha en `CODEX_HANDOFF.md`. Luego borrar solo la base de prueba
   (`dropdb ricaurte_restore_check`).

5. **Restauración real** (incidente): detener `api` y `web`, restaurar sobre una base nueva, apuntar
   `POSTGRES_DB` a ella, reiniciar y verificar. La base anterior se conserva hasta confirmar.

## Verificación local realizada

- `docker compose -f deploy/staging/docker-compose.staging.yml config` es válido. Sin secretos, Compose se niega a
  iniciar.
- 2026-11-15, en la máquina de desarrollo, con un proyecto Compose aparte (`ricaurte-staging-check`) y secretos de prueba desechables fuera del repositorio:
  - `up -d --build` construyó la imagen del API y levantó PostgreSQL y el API;
  - `run --rm migrate` aplicó todas las migraciones desde cero;
  - los smoke tests respondieron `/health` 200, `/health/ready` 200, `/auth/session` 401, y `/public/content` y `/public/agency` 200 sin datos;
  - la web de producción (`next start`) apuntando a ese API sirvió `/`, `/contacto`, `/ingresar`, `/pqrs` y `/destinos` con 200, con el texto estático de respaldo (sin canales inventados), y `/api/revalidate-content` respondió 401 sin sesión.
  - Se detuvo todo con `down`, sin borrar volúmenes: quedan `ricaurte-staging-check_staging_pg` y `ricaurte-staging-check_staging_media` (datos de prueba; se borran con `docker volume rm` si no hacen falta).
  - No se desplegó nada público ni se usaron llaves de pago ni correo reales.
