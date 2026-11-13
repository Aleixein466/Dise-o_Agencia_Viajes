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

Restaurar el CLI Docker de Windows, validar `docker compose config`, levantar únicamente `postgres` y ejecutar migraciones, bootstrap y E2E de autenticación. Solo después debe avanzarse al CRUD del catálogo y CRM.
