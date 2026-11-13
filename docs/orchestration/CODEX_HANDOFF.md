# Handoff de Codex — recuperación y Lote A

Actualizado: 2026-11-13. Rama de continuación: `codex/continue-auth-admin`, creada desde `integration/f2` (`c6c8be8`). No se trabajó sobre `main`, no se fusionó ningún PR y no hubo despliegues.

## Estado recuperado

- Los PR #1–#4 permanecen abiertos como borradores y apilados: `integration/f1` → `integration/batch3` → `integration/batch4` → `integration/f2`.
- La rama activa al iniciar estaba limpia. Los worktrees de Claude se preservaron y no se limpiaron.
- `feat/l2-auth` tenía cambios locales sin commit: dependencias Argon2/TOTP y un paquete de dominio para roles, permisos, propiedad, expiración y contraseña.
- `feat/l3-admin-shell` tenía 20 archivos locales sin commit: acceso del personal, login, MFA, recuperación, layout protegido, navegación por permisos y shell responsive del panel.
- No se encontró `Portafolio_Ricaurte_Tours.docx` en el repositorio. La especificación disponible es `docs/requirements/requisitos_plataforma_ricaurte_tours_v2.0.md`.

## Cambios recuperados en esta rama

- `packages/domain/src/auth/`: catálogo RBAC, restricciones de roles, reglas de propiedad para evitar IDOR, política de sesiones/bloqueo y contraseña.
- `apps/web/src/app/(auth)/`, `apps/web/src/app/admin/`, `apps/web/src/components/admin/`, `apps/web/src/lib/auth/` y `apps/web/src/proxy.ts`: interfaz de acceso y panel base. La autorización se verifica en layout y página; el proxy solo aporta la ruta y evita caché, conforme a Next 16.
- Se añadieron `@node-rs/argon2` y `otpauth` al API y se actualizó el lockfile. Aún no se exponen endpoints de autenticación: el API existente contiene solo salud.
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

## Riesgos y tareas pendientes

1. Implementar el módulo Nest `auth`: hash Argon2id, cookie opaca `__Host-rt_session`, CSRF, rate limit, tokens de recuperación, MFA cifrado y auditoría.
2. Crear una migración/seed versionada para los roles y permisos de `packages/domain`; el esquema v2 ya contiene las tablas, pero no los datos.
3. Agregar pruebas de integración con PostgreSQL y E2E para login, MFA, 401/403 e IDOR; actualmente el panel es una interfaz integrada a contratos aún no expuestos.
4. Conectar estadísticas reales y CRUD antes de marcar módulos del panel como funcionales. Los estados vacíos actuales son deliberados.
5. Solicitar al propietario una copia local no versionada de `Portafolio_Ricaurte_Tours.docx` si contiene datos comerciales privados, por ejemplo en `docs/input/` ignorado por Git.

## Próximo paso desbloqueado

Completar los contratos y endpoints de autenticación del API con pruebas contra PostgreSQL. Solo después debe avanzarse al CRUD del catálogo y CRM.
