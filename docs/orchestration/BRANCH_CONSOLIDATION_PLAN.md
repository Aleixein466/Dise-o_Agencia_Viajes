# Plan seguro de consolidación de ramas

Estado: pendiente de aprobación y de pruebas PostgreSQL/E2E. No ejecutar todavía.

## Evidencia de partida

- `codex/continue-auth-admin` deriva directamente de `integration/f2` (`c6c8be8`) con tres commits propios: `dcd441e`, `53f96e9` y `4fbf6c3`.
- Los PR #1–#4 siguen abiertos, apilados y sin modificar: `integration/f1` → `integration/batch3` → `integration/batch4` → `integration/f2`.
- Se preservaron todos los worktrees existentes. La etiqueta local `backup/codex-continue-auth-admin-4fbf6c3` conserva el punto de recuperación actual.

## Secuencia propuesta

1. Restaurar el acceso al CLI Docker, levantar PostgreSQL aislado y ejecutar migraciones, bootstrap y E2E de autenticación.
2. Abrir un PR de `codex/continue-auth-admin` hacia `integration/f2`; no rebasear ni reescribir los PR apilados.
3. Con checks verdes y revisión, fusionar el PR en `integration/f2` mediante GitHub.
4. Después de que toda la cadena de PR esté revisada y fusionada en orden, crear `develop` desde el commit de integración resultante y protegerla con los checks obligatorios.
5. Cambiar nuevos trabajos a `feat/*` con PR hacia `develop`. Mantener `main` protegida y sin despliegue automático.

No se cerrarán PR, eliminarán ramas ni cambiarán referencias remotas sin aprobación explícita del propietario.
