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

## Storage audit: `.claude` (2026-11-14)

- The owner measured `.claude` at 4.45 GB. Its repository-local tree contains only `worktrees/`; no skills, MCP configuration, sessions, or Orchestra resources were found there.
- `admin` and `auth` have uncommitted changes and remain protected. `api`, `asvs`, `e2e`, `f4-02-seo`, `monorepo`, and `prisma-v2` had no exclusive commits; their HEADs are already ancestors of `codex/continue-auth-admin` and their branches remain intact.
- `e2e` was removed through `git worktree remove` without deleting its branch. `api` remains as an unregistered residue because Windows has open handles below `node_modules`; no force deletion or process termination was attempted.
- Only clean-worktree `node_modules`, `.next`, `dist`, `.turbo`, and test reports are low-risk and regenerable. Worktrees with changes, user-level configuration, and Docker volumes are explicitly out of scope.

## Actualización: constructor público y aprobación de tarifas (2026-11-14)

- Contrato: `docs/orchestration/contracts/public-quotes.md`. API pública (`apps/api/src/public/`): destinos/paquetes `PUBLISHED`, builder sin importes, preview, solicitud idempotente (`idempotencyKey` único; repetición → 200 misma referencia, sin código) y seguimiento (`trackingCode` de 128 bits, solo hash SHA-256, comparación en tiempo constante). Rate limit en memoria por IP.
- Precio público: solo reglas `active && !isFictitious` vigentes. Base = regla de paquete con `conditions.roomTypeId` de la acomodación; si no, la única regla de paquete sin vincular; varias → `REQUIRES_MANUAL_REVIEW`. Tours/transporte/adicionales por su propia regla (una regla = un destino, CHECK `price_rules_target_valid`).
- Envío cerrado por defecto: exige `PUBLIC_QUOTE_REQUESTS_ENABLED=true` **y** una `DATA_TREATMENT_AUTHORIZATION` `APPROVED`; el consentimiento queda ligado a esa versión. `consent_records` es append-only (trigger).
- Admin: `POST /catalog/price-rules/:id/approve|deactivate` (MFA, `catalog:publish`, CSRF, `expectedUpdatedAt` → 409, auditoría antes/después). `/admin/tarifas` y `/admin/paquetes` muestran Borrador/Aprobada/Desactivada; la edición de importe solo en borradores.
- Web: asistente de 10 pasos en `/cotizar` (`apps/web/src/components/public/`), `/seguimiento`. Migración aditiva `20261114_public_quote_requests`.
- E2E (`scripts/run-cartagena-e2e.ps1`): etapas con log en `%TEMP%\ricaurte-e2e\`, timeouts por etapa, parada del árbol de procesos y verificación de puertos. Causa del bloqueo anterior: salida retenida por `| tail` y servidores huérfanos (se mataba solo `cmd.exe`). Resultado: **3/3** (Cartagena + flujo público + 360 px).
- Siguiente: CRM (bandeja de solicitudes públicas, asignación, notas, cambio de estado) sobre `Quote`/`LeadAssignment`/`CrmNote`.

## Actualización: CRM de solicitudes (2026-11-14)

- Contrato `docs/orchestration/contracts/crm.md`. API `apps/api/src/crm/` (Codex): bandeja paginada con filtros (estado, asesor o `unassigned`, origen, referencia), detalle, asesores, asignación (`LeadAssignment`), estados, notas (`CrmNote` solo de agregar) y estadísticas. Mutaciones: MFA, `quotes:write`, CSRF y `expectedRevision` (409). El contacto se oculta sin `customers:read`. Auditoría `crm.*` sin PII.
- Transiciones de estado en el dominio puro `packages/domain/src/quotes/crm-status.ts`, probadas en los 64 pares.
- Web `/admin/solicitudes` (Sonnet): estadísticas, filtros, tabla, detalle, asignar, cambiar estado y nota. Navegación: módulo "Solicitudes".
- E2E 4 `apps/web/e2e/public-crm.spec.ts`: solicitud pública → bandeja → asignar → nota → "Propuesta enviada"; verifica en el servidor auditoría, 409 por revisión obsoleta y 403 sin CSRF. Reutiliza la sesión MFA que guarda la spec de Cartagena en `%TEMP%`. Runner: **4/4**.
- Siguiente: portal del cliente (consulta de solo sus solicitudes; IDOR) y reservas desde cotizaciones aceptadas (confirmación manual).

## Actualización: portal del cliente y reservas (2026-11-14)

- Contrato `docs/orchestration/contracts/portal-reservations.md`.
- Identidad: `POST /customer-auth/request-code` (respuesta genérica 202; código solo si existe un `Customer` con ese correo) y `POST /customer-auth/verify`. Código de 8 dígitos (`randomInt`), guardado como HMAC con `CUSTOMER_CODE_SECRET` (el valor por defecto se rechaza en producción), un solo uso, límites por IP y por correo (429). Las cuentas de personal se rechazan en esta ruta. El correo sale por `MailAdapter`: `disabled` (por defecto) o `file` (solo pruebas; se rechaza en producción). No hay proveedor de correo real configurado.
- Portal `/me/*` (`apps/api/src/portal`): cada consulta filtra por `customer.userId` de la sesión; un id ajeno responde 404, también al cancelar o decidir. Mutaciones con CSRF + Origin.
- Reservas (`apps/api/src/reservations`): solo desde una cotización `ACCEPTED` con total; una por cotización (`quoteId` único, carrera P2002 → misma reserva, 200). Copia comercial congelada en `priceSnapshot`. Personal: `START_VALIDATION`, `APPROVE_FOR_PAYMENT` (validación manual de disponibilidad, registra `availabilityValidatedAt`/`validatedById`), `REJECT`, `CANCEL`; versión optimista (409), historial y auditoría. `CONFIRMED` no se alcanza sin pago verificado (hito 5). Selects explícitos: nunca se devuelven filas `User` completas.
- Web: `/mi-cuenta` (login por código, solicitudes, decisión, solicitud de reserva, reservas, cancelación) y `/admin/reservas` (bandeja, filtros, detalle, acciones, notas, asignación, historial), enlazada desde `/admin/solicitudes`.
- Pruebas: API 55 (propiedad, transiciones, duplicados, versión, selects sin PII, adaptador de correo). E2E 5 `apps/web/e2e/public-portal.spec.ts`: solicitud pública → CRM `PROPOSAL_SENT` → cliente entra con código → acepta → solicita reserva → réplica 200 misma reserva → admin valida y confirma disponibilidad → cliente ve "Disponibilidad confirmada · pendiente de pago" → otro cliente recibe 404/409/403 → axe y 360 px. Runner: **5/5**. Verificado en PostgreSQL: historial `SUBMIT_REQUEST,START_VALIDATION,APPROVE_FOR_PAYMENT`, una reserva por cotización, auditoría `auth.customer_login`, `portal.quote_decision`, `reservation.*`.
- Siguiente: abonos, adaptador de pagos sandbox (adaptador de pruebas identificado como tal mientras no haya llaves Wompi, PC-5) y ahorro programado.

## Actualización: abonos en línea con adaptador de pruebas (2026-11-14)

- Contrato `docs/orchestration/contracts/payments-sandbox.md`. Sin cobros reales: `PAYMENT_ADAPTER=disabled` por defecto; `sandbox_test` se rechaza en producción (env, constructor y `enabled()`). Proveedor `SANDBOX_TEST`, referencias `TEST-…`. Migración aditiva `20261114_sandbox_payments` (valor de enum + tabla `sandbox_test_transactions`, el "proveedor" simulado).
- Flujo con la forma de Wompi: intención del cliente (dueño, bloqueo de fila, un pago vivo por reserva, 1..saldo, idempotente) → página `/pagos/prueba/[reference]` → evento `transaction.updated` firmado (checksum sha256 de propiedades + timestamp + secreto) → verificación → consulta al proveedor → `applyPaymentEvent` (SYSTEM) → `LedgerEntry` único por pago → `PAYMENT_SETTLED`. El abono nunca confirma: staff fija el abono mínimo al confirmar disponibilidad y usa `CONFIRM`.
- Revisión (Opus): sin hallazgos altos; 3 medios y 3 bajos corregidos con pruebas (ver "Hardening" en el contrato).
- Pruebas: API 77. E2E 5 ampliado: rechazo sin dinero, aprobación → "Pago parcial recibido", réplica de decisión, webhook falsificado 401, otro cliente 404 en el checkout, `CONFIRM` → "Reserva confirmada", axe en el checkout.
- Siguiente (5b): adaptador Wompi real cuando haya llaves sandbox (PC-5); abonos manuales con comprobante privado y aprobación FINANCE distinta de quien registra; ahorro programado (`SavingsPlan` + cuotas, saldo desde el ledger).

## Actualización: finanzas 5B, notificaciones 5C, revisión visual 6 y auditoría 7 (2026-11-14) — IMPLEMENTADO Y PROBADO

- Contratos `contracts/finance.md`, `contracts/notifications.md`. Migraciones aditivas `20261115_finance_notifications` (outbox, CHECK cuatro ojos, índice único parcial de referencia bancaria, un solo destino) y `20261115_abono_receipt_unique` (índice único parcial por SHA-256 del comprobante).
- API: abonos manuales (transferencia/efectivo) con comprobante privado validado por contenido; aprobación por un FINANCE distinto del registrador; ajustes (solo planes ACTIVE, nunca bajo cero); ledger inmutable; planes de ahorro con cronograma, cuotas PAID/PARTIAL/PENDING/OVERDUE, sin débitos automáticos; outbox transaccional + adaptadores disabled/file/smtp (Mailpit, perfil `mail`); Wompi sandbox preparado sin conectar (PC-5).
- Auditoría Codex (2 rondas). Corregido: comprobante duplicado concurrente (índice único), orden de bloqueos del webhook (reserva primero), ajuste positivo completa el plan, caducidad del OTP al consumir, piso de 750 ms y fallo de envío indistinguible de correo desconocido (anti-enumeración), PDF activo oculto con escapes `#xx` o en streams Flate, ajustes sobre planes cerrados, correo del admin en el log de bootstrap.
- Hallazgo propio (hito 6): los comprobantes (`media_assets` con clave `receipts/`) aparecían en la galería: listables, descargables, asociables a paquetes y borrables por roles de catálogo. Corregido en todas las consultas de `gallery.service.ts` + prueba.
- Hito 6: `e2e/zz-responsive-sweep.spec.ts` recorre 18 pantallas (públicas + admin) a 360/768/1366 px: sin scroll horizontal, sin imágenes rotas, axe WCAG 2.2 AA, sin errores de consola; capturas en `%TEMP%\ricaurte-e2e\sweep`. Corregido: rejillas admin con `minmax(0, 1fr)` y `.admin-table-wrap` como bloque contenedor (desbordes en finanzas, CRM, cotizaciones, galería y usuarios).
- Pruebas: API 136, web 96. E2E 8/8 (catálogo, constructor ×2, CRM, portal, finanzas, barrido responsive ×2) sobre PostgreSQL aislado.
- Demo (hito 9): `scripts/start-demo.ps1 [-Populate] [-Minutes 120] [-SkipBuild]` (PostgreSQL + Mailpit en loopback, semilla reproducible, datos ficticios, pagos simulados). `run-cartagena-e2e.ps1 -ServeOnly [-Mailpit]` probado.
- Bloqueos: llaves sandbox de Wompi (PC-5), proveedor de correo real (requiere `MAIL_REAL_DELIVERY_APPROVED`), textos legales para abrir solicitudes públicas, infraestructura de staging. PQRS: ver la sección siguiente.

## Actualización: PQRS completo y demo verificada (2026-11-14) — IMPLEMENTADO Y PROBADO

- Contrato `contracts/pqrs.md`. Migración aditiva `20261116_pqrs_intake` (hash del código de seguimiento, clave de idempotencia única, consentimiento, `version` para concurrencia, `consent_records.pqrs_ticket_id`).
- API `apps/api/src/pqrs/`: radicación pública (bandera `PQRS_INTAKE_ENABLED`, por defecto false → 503; 503 sin política de datos APROBADA; honeypot; idempotencia; 5/10 min por IP), seguimiento con referencia + código (404 uniforme, comparación en tiempo constante, 20/10 min), portal del cliente (solo sus PQRS; ajenas → 404; cerrada → 409), bandeja staff (`pqrs:read` / `pqrs:respond` con MFA + CSRF + Origin; FINANCE → 403), asignación solo a ADVISOR/ADMIN activos, notas internas nunca visibles al solicitante, transiciones validadas, `expectedVersion` (409 si cambió), auditoría `pqrs.*`, correos por outbox sin contenido de la respuesta ni código.
- Auditoría Codex: corregido el gate legal en la radicación del cliente y antes de la repetición idempotente, la repetición pública ya no revela PQRS del portal (409) y el portal ya no exige `WEB_ORIGIN` (usa `APP_ORIGIN` + CSRF).
- Plazo: `PQRS_RESPONSE_BUSINESS_DAYS` (15 días hábiles lun–vie). Festivos colombianos NO aplicados → **PENDIENTE DE CONFIRMACIÓN legal**. La radicación pública sigue apagada hasta aprobar textos legales; el runner E2E la enciende solo en la base aislada.
- Finanzas: el personal escribe el código `RES-…` y el correo del cliente en vez de UUID (`reservationCode`, `customerEmail`; correo ambiguo → 409).
- Revisión en navegador (demo `-Populate`): flujo ficticio completo cotización → CRM → OTP en Mailpit → reserva → abono sandbox → abono manual con cuatro ojos → plan de ahorro → confirmación; 10 correos en Mailpit; sin errores de consola ni peticiones fallidas. Corregido: foco y desplazamiento al abrir detalle (CRM, reservas, PQRS), botón estirado en formularios admin, tablas con enlaces, texto del pie sobre pagos de prueba, paneles de pago del portal.
- Pruebas: API 164, web 103. E2E 9/9 (incluye `public-pqrs.spec.ts` y `/admin/pqrs` en el barrido responsive).

### Demo local

- Iniciar: `powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1 -Populate` (o sin `-Populate`; `-Minutes 120`, `-SkipBuild`). Detener: `powershell -ExecutionPolicy Bypass -File scripts\stop-demo.ps1` (`-StopPostgres` opcional; nunca borra volúmenes).
- URLs (solo 127.0.0.1): web http://127.0.0.1:3201 · acceso staff http://127.0.0.1:3201/ingresar · API http://127.0.0.1:4100 · Mailpit http://127.0.0.1:8025.
- Credenciales de prueba: `%TEMP%\ricaurte-cartagena-e2e-credentials.json` (no se versionan ni se imprimen). Tras `-Populate` la semilla se reejecuta para que el primer ingreso staff enrole un autenticador nuevo (MFA obligatorio; se muestra la URL `otpauth`, sin QR).
- Pendiente visual: tarjetas del tablero "Sin datos todavía", módulos "en construcción" (Clientes, Contenido, Auditoría, Configuración, Transporte), QR de MFA, confirmaciones nativas del navegador en algunos gestores.

## Actualización: cierre de prioridades 1–8 (2026-11-14)

- **Instancia E2E aislada** (`0d84376`): `scripts/run-cartagena-e2e.ps1 -Instance ci`, con base `ricaurte_cartagena_e2e_ci`, API :4200, web :3301 y `NEXT_DIST_DIR=.next-ci`. Se ejecuta junto a la demo (:3201/:4100) sin tocarla.
- **PQRS** (`e439401`):
  - plazos configurables por tipo (`PQRS_RESPONSE_DAYS_BY_TYPE`);
  - festivos colombianos de la Ley 51/1983 (`PQRS_HOLIDAYS=colombia`) más `PQRS_EXTRA_HOLIDAYS`. Ver `docs/operations/PQRS_PLAZOS.md`; **los plazos están pendientes de confirmación legal**;
  - E2E del portal `public-pqrs-portal.spec.ts`: aislamiento entre clientes, estados y respuestas.
- **Seguridad** (`b559436`, `7cf1335`):
  - el login y la recuperación tienen límites por IP y por correo, y responden en tiempo uniforme;
  - el bloqueo de cuenta es atómico;
  - un sobrepago queda en `payment.requires_manual_review`;
  - los ajustes de crédito no pueden superar el saldo.
- **Reglas comerciales (hito 2b)** (`189493d`): temporadas, edades de niños, ocupación, vigencias y promociones autorizadas. Ver `contracts/pricing-rules.md`. No se inventó ninguna tarifa.
- **Staging** (`7cf1335`): `apps/api/Dockerfile`, `deploy/staging/` y `docs/operations/STAGING.md`, más la lista `GO_LIVE_CHECKLIST.md`.
  - Prueba local: health, ready y session respondieron lo esperado; después se bajó con sus propios volúmenes.
  - **No está desplegado.**
- **Wompi sandbox:**
  - `PAYMENT_ADAPTER=wompi_sandbox` exige llaves de prueba; una llave de producción detiene el arranque;
  - el Web Checkout va firmado y pasa por `GET /api/v1/payments/wompi/checkout/:reference`;
  - el webhook `POST /api/v1/payments/webhooks/wompi` verifica checksum, entorno y antigüedad, y consulta la transacción en el servidor.
  - **No se ha probado contra el sandbox real**: faltan llaves. Por defecto `PAYMENT_ADAPTER=disabled`.
- **Tablero admin:** `GET /api/v1/admin/dashboard` devuelve solo conteos y únicamente los bloques que el rol puede leer (`requireStaff` con MFA). La web muestra tarjetas con enlaces en lugar de "Sin datos todavía".
- **SEO y a11y:** `robots` excluye las rutas privadas reales y los botones de quitar cuota tienen nombre accesible.
- **Diálogos accesibles:** `components/admin/use-dialog.tsx` (`<dialog>` modal) reemplaza `window.confirm` y `window.prompt` en seis gestores.
- **E2E (ci, 2026-11-14):** 12/12 en `playwright.catalog.config.ts`, con los nuevos `public-pricing-rules.spec.ts` y la prueba del tablero por rol; `auth-admin.spec.ts` 2/2 en una instancia recién sembrada.
- **Pendiente visual:**
  - QR de MFA: no hay librería y no se agregó dependencia; se muestra la URL `otpauth`;
  - módulos "en construcción".

## Actualización: administración de reglas comerciales (2026-11-14)

- **API** (`apps/api/src/catalog/commercial-rules.*`; contrato `contracts/commercial-rules-admin.md`):
  - CRUD de temporadas (con alcance global, destino o paquete), bandas de edad y promociones;
  - campos comerciales de las tarifas: temporada, banda, acomodación, ocupación, límites, prioridad y vigencia;
  - ciclo borrador → aprobada → inactiva. Solo se editan y aprueban borradores, y nada se borra;
  - `expectedUpdatedAt` devuelve 409 si el registro cambió; la auditoría before/after va en la misma transacción.
- **Al aprobar:** se bloquean los solapes de temporadas o bandas y los empates de tarifas (`PRICE_RULE_AMBIGUOUS`), con `pg_advisory_xact_lock`.
- **Permisos:** escribir exige `catalog:write`; aprobar y desactivar exigen `catalog:publish`, siempre con MFA, CSRF y Origin. FINANCE recibe 403.
- **Migración aditiva `20261117_commercial_rules_admin`:** `seasons.package_id`, `seasons.active` y `age_rules.active`. Además, `schema.prisma` declara el índice `quotes(created_by_id, created_at)`, que CI marcaba como drift.
- **Cotizador público:** ignora temporadas y bandas inactivas y respeta el alcance por paquete.
- **Errores:** `ProblemFilter` ahora expone `code` y `conflictId` validados. Antes los descartaba y la web no podía explicar un 409. Los mensajes y las trazas siguen solo en el log.
- **Web** (`/admin/tarifas?tab=reglas|temporadas|edades|promociones`): tablas con filtros, estados y paginación; formularios con errores por campo; aprobación con el diálogo accesible; historial.
- **Auditoría Codex, dos pasadas:**
  - primera: carrera en `PATCH rates/:id` y reaprobación de tarifas desactivadas, ambas corregidas;
  - segunda (13 áreas): montos con ceros a la izquierda y limpieza paginada del E2E, ambas corregidas; el resto, limpio.
- **E2E automatizado:** `run-cartagena-e2e.ps1` siembra la base aislada en cada ejecución (`-SkipSeed` lo omite) y corre `auth-admin.spec.ts` con un ADMIN propio que se reinicia en cada siembra.
  - Resultado: **16/16 + auth 2/2**.
  - La configuración smoke de CI (`playwright.config.ts`) excluye las pruebas que necesitan base de datos.
- **PR borrador #5** (`codex/continue-auth-admin` → `integration/f2`): en la primera corrida, CI falló en `database` (drift del índice) y en `e2e` (pruebas con base de datos dentro del smoke). Ambas causas están corregidas en este lote.
- **21st.dev:** el MCP no está conectado (falta `API_KEY_21ST` y no hay herramientas disponibles). Se usaron los estilos existentes del panel y no se consumieron créditos.
