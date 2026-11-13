# Despliegues — preview, staging y producción

Estado verificado (2026-11-13, API de GitHub): Vercel desplegó **Production** desde `main` (`99844b7`, 2026-10-15) y crea **Preview** por cada push a ramas de PR.

## Control vigente

- `vercel.json` → `git.deploymentEnabled.main = false`: un merge a `main` **ya no despliega a producción automáticamente**.
- Previews siguen activos en ramas de PR (URLs públicas de Vercel; el sitio emite `noindex` porque `SITE_INDEXING` no está en `true`).
- Producción solo por acción manual de una persona autorizada (ver abajo). Nadie del equipo de agentes ejecuta despliegues de producción.

## Ambientes objetivo

| Ambiente   | Origen                                                | Variables clave                                                             | Indexación             |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Preview    | Cualquier rama de PR                                  | `QUOTE_INTAKE_ENABLED=false`, `SITE_INDEXING=false`                         | No                     |
| Staging    | Rama `staging` (Preview con dominio propio protegido) | Wompi **sandbox**, BD de staging, `SITE_INDEXING=false`                     | No                     |
| Producción | Promoción manual de un despliegue verificado          | Wompi producción (PC-5), BD gestionada, `SITE_INDEXING=true` solo tras PC-6 | Sí, cuando se autorice |

## Configuración pendiente en el panel de Vercel (requiere al titular de la cuenta)

1. Settings → Environment Variables: separar valores por _Production_ / _Preview_; ningún secreto en `NEXT_PUBLIC_*`.
2. Settings → Deployment Protection: activar _Vercel Authentication_ (o contraseña) para Preview y Staging.
3. Domains: asignar el dominio de staging a la rama `staging`.
4. Mantener el dominio de producción sin cambios hasta la decisión de lanzamiento (F10).

## Procedimiento de lanzamiento manual (F10, con aprobación del cliente)

1. PR aprobado y fusionado en `main` con checks verdes (`verify`, `secrets`, `e2e`).
2. Despliegue de staging verificado (smoke + E2E contra la URL de staging).
3. La persona autorizada promueve el despliegue verificado a producción desde el panel de Vercel (_Promote to Production_) o con `vercel deploy --prod` en su equipo.
4. Smoke de producción y plan de rollback: _Instant Rollback_ al despliegue anterior en Vercel.
