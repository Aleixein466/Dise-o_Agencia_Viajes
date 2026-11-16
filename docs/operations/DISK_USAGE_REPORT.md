# Informe de uso de disco — `.claude/` (2026-11-14)

## Medición

| Elemento                                         |    Antes |   Después |
| ------------------------------------------------ | -------: | --------: |
| `.claude/` según el Explorador                   |  4,45 GB |         — |
| `.claude/` en bytes reales, sin seguir junctions | ~2,73 GB | **33 MB** |
| Espacio libre ganado en C:                       |        — | **~0 MB** |

¿Por qué no se liberó espacio físico?

- 1,65 GB del total eran dos **junctions**: `f4-02-seo/node_modules` y `prisma-v2/node_modules`, que apuntan al `node_modules` principal. El Explorador contaba ese contenido dos veces.
- Los ~2,7 GB restantes eran `node_modules` de pnpm hechos de **hardlinks** al almacén global de pnpm. Al borrarlos el proyecto pesa menos, pero los bytes siguen en ese almacén, que está fuera del proyecto y no se tocó.

## Acciones (todas regenerables con `corepack pnpm install`)

| Ruta                                                                   | Acción                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `worktrees/f4-02-seo/node_modules`, `worktrees/prisma-v2/node_modules` | Se eliminó solo el enlace junction (`rmdir` sin `/s`); el destino no se tocó      |
| `worktrees/{admin,auth,api,monorepo}/node_modules`                     | Se eliminaron con `robocopy /MIR /XJ` + `rmdir /s`, sin seguir junctions          |
| `worktrees/agent-a1f3b3d1982f76ec9`                                    | Se eliminó: solo contenía un archivo `.git` que apuntaba a metadatos inexistentes |

## Conservado (pendiente de revisión del propietario)

- `admin` (`feat/l3-admin-shell`) y `auth` (`feat/l2-auth`): worktrees registrados **con cambios sin confirmar**. Sus ramas ya no tienen commits sin integrar en `codex/continue-auth-admin`. Si el código equivalente ya está en la rama, se pueden quitar con `git worktree remove`.
- `api`, `monorepo`, `f4-02-seo`, `prisma-v2`: restos de código (<15 MB) de worktrees ya desregistrados. Se dejaron por si contienen algo útil.
- Worktrees en `C:\Users\alexi\Desktop\rt-wt\*`: están fuera del proyecto y no se tocaron.

## Incidente detectado y corregido

La limpieza anterior de `worktrees/e2e` (2026-11-14 11:05) había vaciado cuatro paquetes del almacén virtual principal: `axe-core`, `js-tokens`, `picocolors` y `playwright-core`. La causa probable es un borrado que siguió una junction. En consecuencia faltaba `node_modules/.bin` y los hooks de commit fallaban (`lint-staged`, `commitlint`). Se repararon sin red con `corepack pnpm install --offline --frozen-lockfile --force`.

## Verificación posterior

- Git: el árbol principal está limpio y los worktrees `admin`/`auth` conservan sus cambios.
- pnpm 12.18.0: funciona. Pruebas de dominio: 30/30.
- El `node_modules` principal está intacto (437 entradas antes y después).

## Prevención

- Quitar los worktrees con `git worktree remove <ruta>` y después `git worktree prune`. Si Windows bloquea `node_modules`, borrarlo primero con `robocopy <vacío> <ruta> /MIR /XJ`.
- Nunca usar `Remove-Item -Recurse` (PS 5.1) sobre árboles con junctions: puede seguir el enlace y borrar el destino.
- Para recuperar espacio físico real: `corepack pnpm store prune`. Afecta al almacén global, fuera del proyecto; ejecutarlo solo con la autorización del propietario.
