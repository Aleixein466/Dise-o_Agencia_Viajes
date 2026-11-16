# Tablero de seguimiento — Ricaurte Tours 3.0

Actualizado: 2026-11-15. Estados: **Pendiente** · **En desarrollo** · **En revisión** · **Bloqueado** · **Completado**.
"Completado" = fusionado en una rama de integración con lint, typecheck, unit, build y (si aplica) E2E en verde y revisión de un modelo distinto al autor. Nada está en `main` todavía (PR #1 y #2 sin fusionar por decisión del usuario).

## Lote 4 — cierre de la base

| Tarea                                            | Agente                 | Rama                    | Estado     |
| ------------------------------------------------ | ---------------------- | ----------------------- | ---------- |
| Bloquear despliegue automático de producción     | Claude                 | `integration/f1` (PR 1) | Completado |
| Formato masivo (commit aislado + blame-ignore)   | Claude                 | `integration/batch4`    | Completado |
| Contraste WCAG AA y quitar `test.fail()` de axe  | builder (Sonnet)       | `fix/f4-a11y-contrast`  | Completado |
| Esquema Prisma v2 + migración aditiva            | architect (Opus)       | `feat/f2-prisma-v2`     | Completado |
| Job CI `database`: migrar desde cero + sin drift | Claude                 | `integration/batch4`    | Completado |
| Dependabot (npm, actions, compose)               | Claude                 | `integration/batch4`    | Completado |
| Matriz ASVS 5.0 L2                               | builder (Sonnet)       | `docs/f1-asvs`          | Completado |
| Separación preview / staging / producción        | Usuario (panel Vercel) | —                       | Bloqueado  |

## Lotes funcionales (orden: 2 → 3 → 4 primero, según el usuario)

| #   | Lote                                                                         | Depende de | Estado                                                     |
| --- | ---------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| 1   | Arquitectura backend y contratos (ADR-0001: pnpm, Turborepo, NestJS/Fastify) | Lote 4     | En revisión                                                |
| 2   | Auth, usuarios, roles y permisos                                             | Prisma v2  | Parcial: PostgreSQL real validado; E2E/usuarios pendientes |
| 3   | Estructura del panel administrativo                                          | 2          | En desarrollo (API usuarios; UI pendiente)                 |
| 4   | CRUD de catálogo                                                             | 2, 3       | Pendiente                                                  |
| 5   | CRM y asesores                                                               | 2, 3       | Implementado (E2E 4)                                       |
| 6   | Constructor y motor de precios                                               | 4          | Pendiente (datos ficticios; PC-4)                          |
| 7   | Cotizaciones y reservas                                                      | 6          | Implementado; confirmación final ligada a pago (lote 9)    |
| 8   | Portal del cliente                                                           | 2, 7       | Implementado (E2E 5, IDOR, axe 360 px)                     |
| 9   | Finanzas y Wompi sandbox                                                     | 7          | Implementado (E2E finanzas); Wompi bloqueado (PC-5)        |
| 10  | PQR, comunicaciones y contenido                                              | 2, 3       | Pendiente (textos legales PC-6)                            |
| 11  | Reportes, pruebas integrales, prep. producción                               | todos      | Pendiente                                                  |

## Actualización: módulo de usuarios

| Tarea             | Estado            | Evidencia                                                                                     |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `/admin/usuarios` | Parcial funcional | UI conectada, API autorizada, PostgreSQL real; Playwright pendiente de estabilizar localmente |
| Catálogo editable | Pendiente         | El esquema existe; falta iniciar los endpoints/UI y obtener el portafolio comercial           |

## Inventario funcional

Actualización 2026-11-14: cotizaciones administrativas en desarrollo funcional: motor BigInt, instantáneas y líneas inmutables, estados DRAFT/REQUIRES_MANUAL_REVIEW, RBAC/MFA/CSRF, asistente /admin/cotizaciones y E2E persistente de Cartagena. No existe venta pública ni creación automática de reservas; menores, transporte o extras sin regla explícita bloquean el total y pasan a revisión comercial.

Actualización 2026-11-14: E2E aislado de Cartagena aprobado con PostgreSQL Docker, NestJS y Next.js compilado. El flujo cubre login y MFA inicial, paquete/hotel, edición y recarga de tarifa borrador, historial, CSRF, RBAC, carga y lectura privada de fotografía. La base de pruebas ricaurte_cartagena_e2e no contiene ni modifica el portafolio comercial.

Actualización 2026-11-13: la galería administrativa privada está implementada en la rama de trabajo. Permite cargar JPEG/PNG/WebP (máximo 5 MB), recodificarlos a WebP fuera del repositorio, ver miniaturas autenticadas, asociar/desvincular contenidos, establecer portada/orden, editar texto alternativo y reemplazar una asociación sin borrar un archivo compartido. Las tarifas tienen filtros combinables locales sobre los registros ya autorizados. La verificación E2E Cartagena sigue pendiente de credenciales de prueba y CLI Docker disponibles; no se declara aprobada.

Actualización 2026-11-13: **Destinos** está parcialmente funcional con CRUD de borradores, publicación/archivo RBAC y auditoría. Paquetes, hoteles, tours, tarifas y galería continúan pendientes; el portafolio comercial no está disponible localmente.

Actualización 2026-11-13: importación de portafolio validada en PostgreSQL aislado (6 destinos, 10 variantes, 21 hoteles, 35 tarifas borrador). La interfaz completa para paquetes, hoteles, tours, tarifas y galería sigue pendiente.

Actualización 2026-11-13: paquetes y hoteles ya tienen consulta/edición protegida en API y navegador. Tours, galería y administración independiente de tarifas siguen pendientes.

Actualización 2026-11-13: API para altas de paquetes, hoteles y tours está disponible como borrador; faltan sus interfaces dedicadas, galería y E2E de Cartagena.

Actualización 2026-11-13: tours y tarifas tienen rutas web protegidas; galería y el flujo E2E Cartagena permanecen pendientes.

Leyenda: **Implementado** (código + pruebas) · **Parcial** · **Ausente** · **Bloqueado por cliente**.

| Área                                                                  | Estado                 | Evidencia / nota                                                       |
| --------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Sitio público (inicio, destinos, detalle, contacto, legales)          | Parcial                | `apps/web/src/app/**`; contenido histórico, sin catálogo administrable |
| SEO técnico (robots, sitemap, canonical, OG, noindex)                 | Implementado           | `apps/web/src/lib/seo.ts`, `apps/web/src/app/robots.ts`, `sitemap.ts`  |
| Cabeceras de seguridad                                                | Implementado           | `apps/web/next.config.ts`; CSP con nonce pendiente (F1-09)             |
| Validación de entorno                                                 | Implementado           | `apps/web/src/lib/env.ts`                                              |
| Intake de cotizaciones                                                | Parcial (cerrado)      | `apps/web/src/app/api/quotes`; 503 hasta PC-6 + limitador compartido   |
| Máquinas de estado reserva/pago                                       | Implementado (dominio) | `packages/domain/src/**`; sin persistencia aún                         |
| Modelo de datos v2                                                    | Implementado           | `packages/db/prisma/schema.prisma`, `docs/data/DATA_MODEL.md`          |
| Auth, sesiones, MFA, RBAC                                             | Parcial                | API, dominio y UI; pendiente evidencia PostgreSQL/E2E y correo         |
| Panel administrativo (dashboard, catálogo, precios, cupos, auditoría) | Parcial                | Shell, rutas protegidas y vacíos reales; CRUD y métricas pendientes    |
| Panel de asesores / CRM                                               | Implementado           | `/admin/solicitudes`, `apps/api/src/crm`                               |
| Constructor de paquetes y motor de precios                            | Ausente                | Lote 6; tarifas reales bloqueadas por PC-4 (Excel)                     |
| Cotizaciones y reservas persistidas                                   | Implementado           | `/admin/reservas`, `apps/api/src/reservations`                         |
| Portal del cliente (código por correo)                                | Implementado           | `/mi-cuenta`, `apps/api/src/portal`; correo real sin proveedor         |
| Finanzas, abonos, conciliación Wompi                                  | Bloqueado por cliente  | Lote 9; PC-5 llaves                                                    |
| PQR                                                                   | Parcial                | Página informativa `apps/web/src/app/pqrs`; sin flujo                  |
| Textos legales, RNT, NIT, contactos                                   | Bloqueado por cliente  | PC-6; no se inventan                                                   |
| Identidad visual definitiva                                           | Bloqueado por cliente  | PC-1 (logo provisional), PC-3                                          |
| E2E + accesibilidad                                                   | Implementado           | `apps/web/e2e/**`; axe sin violaciones en 6 proyectos                  |
| CI, gitleaks, protección de `main`                                    | Implementado           | `.github/workflows/*`, protección verificada por API                   |
| Despliegue: producción manual                                         | Implementado           | `vercel.json`, `docs/operations/DEPLOYMENT.md`                         |
| Imagen Docker / Docker Hub                                            | Bloqueado por cliente  | Sin token; no se publica nada                                          |

## Storage audit (2026-11-14)

| Category                          | Status                         | Evidence / action                                                             |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `.claude/worktrees/admin`, `auth` | Protected                      | Uncommitted changes; retained.                                                |
| Clean integrated worktrees        | Recoverable                    | No exclusive commits; branches retained. `e2e` was removed.                   |
| `.claude/worktrees/api` residue   | Locally blocked                | No `.git`; Windows has open handles in `node_modules`. Do not force deletion. |
| Skills/MCP/sessions               | Not under repository `.claude` | No user configuration or Orchestra resource was touched.                      |

## PQRS y demo (2026-11-14)

- PQRS completo (API + web + E2E); radicación pública apagada por defecto (`PQRS_INTAKE_ENABLED`). Festivos en el plazo: pendiente legal.
- Demo local verificada en navegador: `scripts/start-demo.ps1 -Populate` / `scripts/stop-demo.ps1`. Ver `CODEX_HANDOFF.md`.

## Módulos Clientes, Cupos, Contenido y Configuración (2026-11-15)

| Módulo        | Estado                 | Evidencia                                                                     |
| ------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Clientes      | Implementado y probado | `apps/api/src/customers`, `/admin/clientes`, `public-admin-customers.spec.ts` |
| Cupos         | Implementado y probado | `apps/api/src/catalog/departures*`, `/admin/cupos`, migración aditiva         |
| Contenido     | Implementado y probado | `apps/api/src/content`, `/admin/contenido`, publicación con aprobación        |
| Configuración | Implementado y probado | `apps/api/src/settings`, `/admin/configuracion`, rechaza secretos             |
| QR de MFA     | Implementado y probado | `uqr` local, `auth-admin.spec.ts` con TOTP calculado                          |

- E2E aislado completo: **31/31 + auth 2/2** (PostgreSQL `ricaurte_cartagena_e2e_ci`, 1 worker). API 339/339, web 179/179.
- Siguiente: rediseño Tropical Premium. 21st.dev sigue sin conectar (sin MCP ni `API_KEY_21ST`).
- Incidencia aparte, no de la aplicación: el error de autoactualización de Claude Code se registra fuera del proyecto y no bloquea las pruebas.

## Rediseño Tropical Premium (2026-11-15, commit `95ceff7`)

| Área                                              | Estado                                | Evidencia                                                                            |
| ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Sistema visual + fuentes                          | Implementado y probado                | `globals.css`, `next/font/local` (DM Sans, Playfair autoalojadas)                    |
| Inicio, destinos, cotizar, contacto, PQRS, acceso | Revisado en navegador (360 y 1366 px) | 0 px de desborde, 0 errores de consola; capturas en `%TEMP%\ricaurte-redesign\after` |
| Portal y admin                                    | Implementado y probado                | `portal.css`, `admin.css`; barridos responsive y axe de la E2E                       |

- Historial de la E2E: 30/31 antes del arreglo (fallo `scrollable-region-focusable` en el cronograma de ahorro del portal). Con el arreglo, la suite completa dio 31/31 + auth 2/2 sobre `fdc62cf`. Los resultados vigentes están en la sección siguiente.
- 21st.dev **conectado** (plan gratuito: búsqueda libre, 2 recuperaciones de código/día, sin generación IA). Sus componentes asumen Tailwind/shadcn; se usan como referencia y se implementan en el CSS actual.
- Referencias TikTok: inaccesibles (página vacía sin JavaScript); no se describe su contenido.
- Auditoría independiente con Codex: ver la sección siguiente (la nota anterior de «CLI no disponible» era errónea: Codex 0.167.2 está instalado y autenticado).
- Docker Desktop estaba apagado: se arrancaron los contenedores existentes (PostgreSQL :5433, Mailpit); volúmenes intactos.

## Validación integral, contenido público y revisión visual (2026-11-15)

| Área                                                                                    | Estado                                                    | Evidencia                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite E2E completa (PostgreSQL aislado `ricaurte_cartagena_e2e`, 1 worker)              | **33/33 + auth 2/2** (5,0 min + 8 s; 21:50–21:55)         | Corrida única tras el último cambio de código (aviso de refresco), sin otra E2E en paralelo; compilación del lote anterior reutilizada (`-SkipBuild`), posterior a todo el código fuente; salida 0 |
| Contenido público en la web: portada, avisos, destacados, FAQ, contacto, WhatsApp y pie | Implementado y probado en navegador                       | `lib/public-content.ts`; `public-admin-content.spec.ts` y `public-admin-settings.spec.ts` publican, comprueban la web pública y retiran                                                            |
| Invalidación de caché desde el panel                                                    | Implementado y probado                                    | `POST /api/revalidate-content` (mismo origen, MFA, permiso, CSRF; `expire: 0`): 10 pruebas unitarias, E2E y sondeo real 403/403/401/403                                                            |
| Revisión visual en navegador real                                                       | Hecha: 32 pantallas × 360/768/1366/1920 px (128 capturas) | Hojas de contacto en `%TEMP%\ricaurte-redesign\sheets`; axe y desborde dentro de la E2E                                                                                                            |
| Demo local (`start-demo.ps1 -SkipBuild`)                                                | Verificada 21:11–21:12                                    | 6 páginas públicas × 360/1366 px: 0 px de desborde, fuentes cargadas, sin errores (solo el 401 esperado de `/mi-cuenta` sin sesión); detenida con `stop-demo.ps1`                                  |
| Staging local (Compose aparte, no desplegado)                                           | Verificado                                                | Imagen del API, migraciones desde cero, `/health` 200, `/auth/session` 401, `/public/*` 200 y la web de producción contra ese API; detalle en `docs/operations/STAGING.md`                         |
| Auditoría independiente                                                                 | Codex 0.167.2 (adversarial, 3 pasadas)                    | Hallazgos abajo; Codex **no** revisó el código posterior a sus correcciones                                                                                                                        |

- Defectos visuales hallados y corregidos: foco visible en el título del portal, cronograma de ahorro sin estilo, columna del portal desalineada, casilla «Solo vencidas» desalineada, botones de cabecera y de tabla que partían el texto, desalineación de entradas en Configuración (y entradas de ~80 px en tablet), tarjetas de PQRS pegadas entre sí y al texto, interlineado de los canales de contacto.
- Hallazgos de Codex sobre este lote:
  - Pasada 1, _Medio, corregido_: la caché de 15 s del pie obligaba a regenerar todas las rutas estáticas; ahora dura 1 h y se invalida por etiqueta.
  - Pasada 2, _Alto, corregido_: retirar contenido seguía sirviéndose una vez por «stale-while-revalidate»; ahora `expire: 0`.
  - Pasada 2, _Medio, decisión de diseño_: con 0 FAQ publicadas se mantiene el texto estático (sitio nuevo o todas retiradas) en vez de dejar la sección vacía. Está documentado y con prueba unitaria; el propietario puede pedir lo contrario.
  - Pasada 3 (diff `fdc62cf..eeda521`), _Alto, corregido_: si la invalidación fallaba (503, 403, red), el panel lo ignoraba y el sitio podía mostrar contenido retirado hasta 1 h. Ahora se reintenta (3 intentos ante red o 5xx), el panel muestra un aviso persistente que se borra con la siguiente actualización confirmada, y hay 5 pruebas unitarias y una E2E. Codex no revisó esta última corrección.
- Pruebas añadidas: ruta de revalidación (10), enlaces seguros y selección de FAQ (4), reintentos y aviso de refresco (5), y en la E2E de contenido los destinos destacados con revalidación y el aviso de refresco fallido (de 32 a 33 pruebas).
- Historial de la prueba nueva del aviso: en su primera ejecución falló por un selector ambiguo de la propia prueba (dos campos «Título», porque el borrador de la prueba anterior sigue en la lista). Se corrigió con `.last()` (el aviso nuevo se añade al final), el lote de catálogo y contenido dio 6/6 y después la suite completa 33/33 + auth 2/2.
- Pruebas unitarias del repositorio (2026-11-15, `turbo --force`, sin caché): domain 55, validation 2, API 339, web 198 (28 archivos). `lint` (5 tareas), `typecheck` (6) y `prettier --check .` en verde. Revisión de secretos sobre los archivos del cambio: sin coincidencias.
- Pendientes y límites conocidos:
  - El API no expone medios públicos: el hero y los avisos se muestran sin imagen.
  - Si el API cae durante una regeneración, esa copia usa el texto estático hasta la siguiente invalidación (máximo 1 h).
  - En 1920 px el panel usa todo el ancho; es legible, pero un tope de ancho en los formularios sería un detalle de pulido.
  - El texto del selector de archivos lo pone el navegador (inglés en Chromium sin configuración regional).
  - Bloqueos externos sin cambios: llaves sandbox de Wompi, correo real, tarifas aprobadas, textos legales y plazos de PQRS, hosting y dominio de staging, autorización de producción.

## Fuentes autoalojadas (2026-11-15)

| Área                                  | Estado                 | Evidencia                                                                                                                                               |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DM Sans y Playfair Display sin Google | Implementado y probado | `apps/web/src/app/layout.tsx` (`next/font/local`); WOFF2, licencias OFL y procedencia en `apps/web/src/app/fonts/`                                      |
| Carga real en navegador               | Probada                | `e2e/fonts.spec.ts` (suite smoke, también en CI): la familia aplicada tiene caras cargadas, los archivos son de este origen y hay 0 peticiones a Google |
| Sin regresión visual                  | Comprobada             | A/B con los archivos de Google en el mismo servidor y navegador: ≤ 0,010 % de píxeles distintos y ningún cambio de alto (36 capturas)                   |

- Causa: `next/font/google` descargaba DM Sans y Playfair Display en cada `next dev` y `next build`. Sin acceso a Google, el servidor de desarrollo imprimía errores y usaba fuentes alternativas, y `next build` podía fallar: la E2E de CI sobre `8c71229` falló en `pnpm build` por esa descarga y la de `6094b8e` pasó sin que cambiara nada de las fuentes (fallo intermitente).
- Cambio: `localFont` con los archivos `latin` variables de Fontsource 5.3.0 (SIL OFL 1.1; hashes y procedencia en `fonts/README.md`), con los mismos pesos y archivos que generaba el cargador de Google. No se tocó la CSP ni `next.config.ts`.
- Pruebas añadidas: `src/app/fonts.test.ts` (4: ninguna referencia a Google, archivos y licencias, hashes documentados, el layout carga exactamente esos archivos) y `e2e/fonts.spec.ts` (12 en la suite smoke: 2 rutas × 6 proyectos). Controles negativos: con los `.woff2` bloqueados, o con un enlace a Google Fonts inyectado, la prueba falla.
- Validación del árbol final: compilaciones sin red (proxy inalcanzable) con salida 0; suite smoke de CI 104 pasadas y 4 omitidas por diseño (menú móvil en pantallas anchas); `turbo --force` (lint, typecheck, unitarias; 14 tareas sin caché): domain 55, validation 2, API 339, web 202; E2E completa **33/33 + auth 2/2** en la instancia por defecto (compilación propia con las fuentes nuevas, 1 worker, 23:24–23:30), con barrido responsive y axe incluidos.
- Comparación visual: las 128 capturas del barrido frente a la línea base. Las pantallas públicas difieren en 41–175 píxeles por captura, las mismas cifras que el A/B de solo fuentes (bordes de unos pocos glifos). Las pantallas con listas del panel difieren por los datos de la base, no por la tipografía. `detalle` (móvil y tablet) cambia además en una fotografía: el A/B no la reproduce, así que no es tipográfica; no se investigó su origen.
- Advertencia de origen cruzado de Next.js: la URL «Network» que imprime `next dev` (`169.254.83.107` en este equipo, un adaptador de red virtual) se bloquea por diseño. Se abre `http://localhost:3000`; `allowedDevOrigins` no se configura porque no hace falta.
- Límite conocido de las E2E aisladas: las bases `ricaurte_cartagena_e2e` y `_ci` acumulan registros entre corridas (el reseed no los borra) y dos pruebas buscan su registro nuevo en la primera página de una lista. Con 25 PQRS o más (bandeja de 25) o 10 bandas de edad o más (página de 10) el registro nuevo cae en la página 2 y la prueba falla (`public-pqrs.spec.ts` y «age bands» de `public-admin-commercial-rules.spec.ts`, más 2 pruebas seriales del mismo archivo que no llegan a ejecutarse). La instancia `ci` terminó con 38 PQRS y 13 bandas (el registro nuevo quedó en la posición 34 de la bandeja y la 11 de las bandas) y dio 29 pasadas, 2 falladas y 2 sin ejecutar; la instancia por defecto tenía 16 y 6 y dio 33/33. El arreglo (que el reseed borre los restos de las pruebas, o que las pruebas busquen por nombre) queda pendiente. El CI de GitHub no corre esas pruebas.
