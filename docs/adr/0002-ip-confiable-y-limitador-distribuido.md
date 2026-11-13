# ADR-0002 — IP de cliente confiable y limitador distribuido

Estado: **Propuesto** · Fecha: 2026-11-13 · Relacionado: THREAT_MODEL (D: abuso de formularios), F1-07.

## Contexto

- `x-forwarded-for` lo envía el cliente: su primera entrada es falsificable y permitía rotar cubetas del limitador.
- El limitador en memoria es por instancia; en Vercel/serverless cada instancia tiene su propio contador.
- El repositorio ya despliega previews en Vercel (check «Vercel» en PR #1).

## Decisión

1. **IP solo desde cabecera de proxy controlado** (`src/lib/http/client-ip.ts`), configurada por `CLIENT_IP_SOURCE`:
   - `none` (predeterminado): no se confía en ninguna cabecera; todos comparten una cubeta conservadora.
   - `x-real-ip` → Vercel (la plataforma la sobrescribe). `cf-connecting-ip` → detrás de Cloudflare.
   - `x-forwarded-for` + `TRUSTED_PROXY_HOPS` → VPS con Caddy/nginx; se toma la entrada añadida por el primer proxy confiable contando desde la derecha.
   - Valor inválido (no IP) → tratado como no verificado.
2. **Contrato `RateLimitStore`** (`consume(key, now)`), implementación `memory` para desarrollo.
3. **Almacén compartido previsto: PostgreSQL** (ya está en el stack; Redis solo si el volumen lo justifica, §13.8):
   - Tabla `rate_limit_buckets(key_hash text pk, window_start timestamptz, count int)`.
   - Operación atómica `INSERT … ON CONFLICT (key_hash) DO UPDATE SET count = CASE WHEN window_start < now() - interval THEN 1 ELSE count + 1 END, window_start = … RETURNING count, window_start`.
   - `key_hash = HMAC-SHA256(secreto, ruta + ip)`: no se almacenan IP en claro (minimización de PII).
   - Limpieza periódica de filas vencidas.
4. **Puerta en el entorno**: en `production`, `QUOTE_INTAKE_ENABLED=true` es inválido si `CLIENT_IP_SOURCE=none` o `RATE_LIMIT_STORE=memory` → `quoteIntakeOpen()` falla cerrado (503). `RATE_LIMIT_STORE=postgres` responde 503 hasta que exista la implementación.
5. Turnstile server-side se suma antes de abrir el intake (F6), no sustituye al limitador.

## Consecuencias

- Hoy no es posible abrir cotizaciones en producción por accidente.
- Implementar el almacén PostgreSQL requiere migración nueva (F2-02) y test de integración con BD real (F1-08, requiere Docker o servicio PostgreSQL en CI).
