# Handoff de Codex — recuperación y Lote A

Actualizado: 2026-11-13. Rama de continuación: `codex/continue-auth-admin`, creada desde `integration/f2` (`c6c8be8`). No se trabajó sobre `main`, no se fusionó ningún PR y no hubo despliegues.

## Estado recuperado

- Los PR #1–#4 permanecen abiertos como borradores y apilados: `integration/f1` → `integration/batch3` → `integration/batch4` → `integration/f2`.
- La rama activa al iniciar estaba limpia. Los worktrees de Claude se preservaron y no se limpiaron.
- `feat/l2-auth` tenía cambios locales sin commit: dependencias Argon2/TOTP y un paquete de dominio para roles, permisos, propiedad, expiración y contraseña.
- `feat/l3-admin-shell` tenía 20 archivos locales sin commit: acceso del personal, login, MFA, recuperación, layout protegido, navegación por permisos y shell responsive del panel.
- No se encontró `Portafolio_Ricaurte_Tours.docx` en el repositorio. La especificación disponible es `docs/requirements/requisitos_plataforma_ricaurte_tours_v2.0.md`.
- Docker Desktop tiene su distribución WSL2 en ejecución, pero el CLI `docker.exe` no está presente en el PATH ni en las rutas de instalación habituales de Windows. Por ello no se pudieron ejecutar `docker version`, `docker compose config`, migraciones ni pruebas de integración contra PostgreSQL desde esta terminal.
- La configuración Compose fue inspeccionada estáticamente: usa PostgreSQL 16 en loopback, volumen `ricaurte_data`, contraseña obligatoria desde `.env` y healthcheck `pg_isready`. No se modificó `.env` ni se levantó ningún contenedor.
- Vercel se vinculó al proyecto `agencia-viajes`, con `Root Directory = apps/web`, Next.js y Node 24.x. El Preview de `codex/continue-auth-admin` construyó correctamente y está listo; no incluye API ni datos de autenticación.
- PostgreSQL 16 fue levantado localmente en `127.0.0.1:5433` porque el puerto 5432 está ocupado por un PostgreSQL local existente. Las dos migraciones aplicaron y una base aislada validó login, rechazo CSRF, enrolamiento/verificación TOTP, logout revocable y auditoría. La prueba reveló y corrigió el caso válido `delta = 0` de OTPAuth.
- El API ya expone gestión protegida de personal (`/api/v1/users`): listado/búsqueda, alta, edición/desactivación y roles. Requiere sesión MFA y permisos `staff:read`, `staff:write` o `roles:assign`; impide autoasignación y revoca sesiones al cambiar roles. La interfaz `/admin/usuarios`, pruebas de integración de esos endpoints y catálogo siguen pendientes.

## Cambios recuperados en esta rama

- `packages/domain/src/auth/`: catálogo RBAC, restricciones de roles, reglas de propiedad para evitar IDOR, política de sesiones/bloqueo y contraseña.
- `apps/web/src/app/(auth)/`, `apps/web/src/app/admin/`, `apps/web/src/components/admin/`, `apps/web/src/lib/auth/` y `apps/web/src/proxy.ts`: interfaz de acceso y panel base. La autorización se verifica en layout y página; el proxy solo aporta la ruta y evita caché, conforme a Next 16.
- Se añadieron `@node-rs/argon2` y `otpauth` al API y se actualizó el lockfile.
- Se corrigió navegación interna tras login/MFA/logout para usar el router de Next y refrescar el estado de sesión; no hay enlaces visuales que sustituyan la autorización de servidor.

## Verificación ejecutada

| Comprobación                                     | Resultado                                            |
| ------------------------------------------------ | ---------------------------------------------------- |
| `corepack pnpm --filter @ricaurte/domain test`   | 26 pruebas aprobadas                                 |
| `corepack pnpm --filter @ricaurte/web lint`      | aprobado                                             |
| `corepack pnpm --filter @ricaurte/web typecheck` | aprobado                                             |
| generación Prisma + `next build`                 | aprobado; 23 rutas, incluidas `/ingresar` y `/admin` |
| `corepack pnpm --filter @ricaurte/api typecheck` | aprobado                                             |
| `corepack pnpm --filter @ricaurte/api test`      | 10 pruebas aprobadas                                 |

Los comandos raíz de Turbo y el script de build del paquete web no pudieron invocar `pnpm` directamente porque no está en el PATH. `corepack enable` tampoco pudo crear los shims por falta de permisos sobre `C:\Program Files\nodejs`. La misma build se verificó mediante `corepack pnpm` y el binario local de Next. No se ejecutaron migraciones: no hay PostgreSQL local configurado.

## Autenticación implementada

- `POST /api/v1/auth/login`, `GET /auth/session`, cierre de una o todas las sesiones, recuperación y restablecimiento de contraseña, alta/verificación TOTP y código de recuperación.
- La cookie contiene un token opaco de 256 bits; PostgreSQL solo recibe su SHA-256. Las contraseñas se procesan con Argon2id y la clave TOTP se cifra con AES-256-GCM usando `MFA_ENCRYPTION_KEY`.
- Toda mutación autenticada exige `Origin` igual a `APP_ORIGIN` y un token CSRF ligado a la sesión. El login invalida sesiones previas; el restablecimiento invalida todas.
- `apps/api/src/auth/bootstrap.ts` siembra roles/permisos y crea el primer ADMIN solo fuera de producción y solo con las tres variables `BOOTSTRAP_ADMIN_*`. No hay registro público de personal.

## Riesgos y tareas pendientes

1. Ejecutar las pruebas de integración con PostgreSQL y E2E para login, MFA, 401/403 e IDOR. Docker no está instalado localmente y no hay una base configurada, por lo que esto no se ha declarado verificado.
2. Conectar un adaptador de correo transaccional aprobado: por seguridad el endpoint de recuperación guarda solo el hash y nunca devuelve el token; aún no existe entrega de correo.
3. Añadir guards de permiso/propiedad a los módulos de recursos cuando se implementen y probar IDOR por recurso.
4. Conectar estadísticas reales y CRUD antes de marcar módulos del panel como funcionales. Los estados vacíos actuales son deliberados.
5. Solicitar al propietario una copia local no versionada de `Portafolio_Ricaurte_Tours.docx` si contiene datos comerciales privados, por ejemplo en `docs/input/` ignorado por Git.

## Próximo paso desbloqueado

## Actualización: cotizaciones administrativas (2026-11-14)

- Se reutilizaron Quote, QuoteLine y PriceRule; la migración 20261114_admin_quotes añade creador, revisión optimista, razones de revisión y los estados DRAFT/REQUIRES_MANUAL_REVIEW. Las cotizaciones internas no exigen PII ni consentimiento y no se convierten en reservas.
- Motor puro en packages/domain/src/quotes/pricing.ts: cantidades en bigint, líneas y total únicamente desde reglas explícitas. Niños, transporte o tours/adicionales sin precio generan REQUIRES_MANUAL_REVIEW; no hay prorrateo ni precio inventado.
- API protegida: GET/POST /api/v1/quotes, POST /preview, GET /catalog/:packageId, GET /:id, GET /:id/history y POST /:id/recalculate. Mutaciones exigen MFA, quotes:write, Origin y CSRF; recálculo exige revisión esperada y rechaza sobrescrituras concurrentes.
- /admin/cotizaciones permite seleccionar paquete, hotel, regla de borrador, viajeros y tours, ver desglose o razones y guardar una cotización real. Los datos de catálogo siguen siendo borradores internos.
- PostgreSQL E2E confirmó una fila ADM-FD2E610E-0|DRAFT|123460000|1|true con instantánea. La E2E Cartagena 1/1 incluye creación/recarga de la cotización, además del flujo de catálogo previo.

## Actualización: E2E Cartagena y Docker (2026-11-14)

- Docker Desktop fue verificado en C:\\Users\\alexi\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe: Engine 29.9.3, Docker Desktop 4.99.0 y Compose 5.7.0. PostgreSQL local estaba sano y limitado a 127.0.0.1:5433.
- Se creó la base exclusivamente E2E ricaurte_cartagena_e2e, migrada con las dos migraciones Prisma. Tiene un administrador temporal y un usuario FINANCE temporal sin catalog:write; las credenciales se escriben sólo en %TEMP%, nunca en Git.
- El sembrador crea Cartagena E2E, hotel, acomodación, paquete y tarifa inactiva/ficticia; elimina solamente sesiones, MFA y auditoría de esas entidades temporales para repetición determinista.
- Playwright contra next build + next start y NestJS aislado aprobó 1/1 escenario: MFA, acceso a Cartagena, hotel, edición de tarifa, persistencia, historial con actor y antes/después, CSRF 403, galería privada, RBAC 403 y lectura privada 403. PostgreSQL confirmó 123460000|false|true y una auditoría pricing.draft_updated.
- Comandos Windows reproducibles: .\\scripts\\provision-cartagena-e2e.ps1; .\\scripts\\seed-cartagena-e2e.ps1; .\\scripts\\run-cartagena-e2e.ps1. El runner construye API/Web, inicia puertos 4100/3201 y los detiene al terminar.

## Actualización: galería privada y filtros de tarifa (2026-11-13)

- Se amplió la API existente de galería, sin crear un catálogo paralelo: GET /api/v1/gallery, asociación, actualización de metadatos/orden/portada y desvinculación. Todas las mutaciones conservan MFA, catalog:write, CSRF y auditoría; las lecturas de binarios siguen exigiendo sesión autorizada y emiten Cache-Control: private, no-store.
- GalleryService valida propietario antes de persistir, conserva el archivo si el activo tiene otras asociaciones y sólo permite borrado físico una vez sin referencias. El almacenamiento local permanece fuera de public/ y Git.
- /admin/galeria ahora carga, filtra y visualiza miniaturas privadas, permite alt text, portada, orden, asociación, retiro confirmado y reemplazo seguro. /admin/tarifas añade filtros por paquete, destino, hotel, duración y estado sin reconstruir el historial.
- Pruebas añadidas: 7 casos binarios (JPEG/PNG/WebP válidos y ejecutable, SVG, corrupción y tamaño rechazados) y 2 límites de controlador (401 y rechazo de mutación antes de asociación). Resultado actual: **26 API**, **55 web**; API lint/typecheck/build pasan, web lint/typecheck/build pasan.
- E2E Cartagena no se ejecutó en este lote: no hay AUTH_E2E_* en el entorno, docker.exe no está disponible mediante PATH ni en las ubicaciones habituales, aunque se detectaron servidores locales existentes. No se usó una prueba omitida como resultado satisfactorio.

Restaurar el CLI Docker de Windows, validar `docker compose config`, levantar únicamente `postgres` y ejecutar migraciones, bootstrap y E2E de autenticación. Solo después debe avanzarse al CRUD del catálogo y CRM.

## Actualización: usuarios conectados (2026-11-13)

- El Docker local y PostgreSQL están disponibles. Se creó la base exclusiva `ricaurte_users_e2e`; no se modificó la base ni la cuenta administrativa local.
- `/admin/usuarios` consume `GET/POST/PATCH/PUT /api/v1/users`, con búsqueda, filtro, alta, edición, cambios de roles, activación/desactivación confirmada, MFA y auditoría según `audit:read`.
- Se añadió `GET /api/v1/users/:id/activity`. El API valida el permiso, no expone tokens ni información privada adicional y devuelve 404 para cuentas inexistentes.
- Contra PostgreSQL/Nest reales se verificaron: 401 sin sesión, 403 sin CSRF, MFA inicial obligatorio, alta, búsqueda, desactivación/revocación y fila de auditoría. Migraciones y bootstrap no productivo completaron correctamente.
- `apps/web/e2e/auth-admin.spec.ts` y `playwright.auth.config.ts` dejan preparado el flujo aislado de login fallido, MFA, alta y desactivación. La ejecución bajo `next dev` quedó bloqueada por una incidencia local de hidratación/HMR, por lo que Playwright no se declara aprobado todavía.
- Lint/typecheck API/Web, 16 pruebas API, 55 pruebas Web y build de producción Web pasaron. El script build usa `corepack pnpm` para funcionar en Windows.
- `Portafolio_Ricaurte_Tours.docx` sigue ausente; no se importaron ni publicaron datos o tarifas comerciales.

## Actualización: E2E y catálogo (2026-11-13)

- Causa raíz E2E: en HTTP local el navegador rechazaba `__Host-rt_session` porque el prefijo exige el atributo `Secure`. El login respondía 200 pero la siguiente lectura de sesión devolvía 401. El WebSocket HMR fallido de la sesión de desarrollo no fue la causa de autenticación.
- Corrección: producción conserva `__Host-rt_session; Secure; HttpOnly; SameSite=Lax`; desarrollo y E2E HTTP usan el nombre aislado `rt_session`, también HttpOnly y SameSite=Lax. El controlador de usuarios usa el nombre emitido por AuthService.
- Playwright contra `next build` + `next start`: 2/2 aprobadas (anónimo/login incorrecto, MFA, navegación, alta y desactivación). No se añadieron skips para ocultar fallos ni esperas artificiales.
- Inicio de catálogo: `/api/v1/catalog/destinations` y `/admin/destinos` permiten listar, crear borradores y publicar/archivar según RBAC, con auditoría. Paquetes, hoteles, tours, tarifas y galería quedan pendientes como siguientes verticales, sin pantallas simuladas.
- El portafolio llegó a `docs/input/Portafolio_Ricaurte_Tours.docx` y fue leído: Nariño Encantador, Eje Cafetero, Medellín, Cartagena, Santa Marta y San Andrés. La importación aún no se ejecuta: debe preservar variantes, hoteles, itinerarios y tarifas como borradores pendientes de aprobación comercial.

## Actualización: importación de portafolio (2026-11-13)

- `pnpm --filter @ricaurte/api catalog:import` ofrece vista previa sin escritura; `--apply` exige un actor ADMIN activo y ejecuta una única transacción PostgreSQL.
- Dos ejecuciones contra `ricaurte_users_e2e` dejaron exactamente 6 destinos, 10 paquetes, 21 hoteles y 35 reglas de precio. Los datos creados son `DRAFT`, reglas inactivas/ficticias y sin salidas ni reservas.
- Claves estables (slugs y nombres `portfolio-2026:*`) hacen el proceso repetible y no actualizan filas existentes: una edición administrativa posterior prevalece.
- Advertencias pendientes: diferencias de acomodación doble del Eje Cafetero (tabla vs. adicional por noche) y sus valores siguen pendientes de aprobación comercial.

## Actualización: paquetes y hoteles (2026-11-13)

- `/api/v1/catalog/packages` y `/api/v1/catalog/hotels` ofrecen búsqueda, filtros por destino, paginación de hasta 50 filas y consultas de detalles. Las mutaciones requieren sesión MFA, CSRF y `catalog:write`.
- `/admin/paquetes` muestra hoteles, itinerarios y reglas de borrador; permite editar metadatos y tarifas en centavos. `/admin/hoteles` permite consultar y editar hoteles importados. Todas las mutaciones quedan en `audit_logs`.
- La vista previa protegida `/api/v1/catalog/packages/:id/preview` entrega el conjunto persistido sin activar publicación ni reservas.

## Actualización: altas y tours (2026-11-13)

- El API de catálogo acepta ahora crear paquetes y hoteles borrador, asociar hoteles existentes a paquetes y crear tours opcionales o incluidos con relación a paquete. Todas las rutas exigen MFA, CSRF y `catalog:write`.
- Cada cambio de precio de borrador conserva `before`/`after` en `audit_logs`; las reglas importadas no se activan ni modifican reservas.
- Las pantallas dedicadas de tours, tarifas y galería y la E2E integral Cartagena siguen pendientes antes de declarar el catálogo completo.

## Actualización: panel tours y tarifas (2026-11-13)

- `/admin/tours` crea y lista tours borrador, mostrando si están incluidos, opcionales o sin asociación comercial. `/admin/tarifas` reutiliza la vista protegida de reglas de borrador y no expone una acción de activación.
- Galería, aprobación comercial, historial visible de tarifas y la E2E Cartagena todavía no están terminados; no se declaran verificados.
