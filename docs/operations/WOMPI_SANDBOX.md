# Wompi sandbox (preparado, NO habilitado)

Consultado el 2026-11-14:

- https://docs.wompi.co/docs/colombia/widget-checkout-web/ (firma de integridad y Web Checkout)
- https://docs.wompi.co/docs/colombia/eventos/ (eventos y checksum)
- https://docs.wompi.co/docs/colombia/ambientes-y-llaves/ (URL sandbox y formato de llaves)
- https://docs.wompi.co/reference (GET /v1/transactions/{id}). No se pudo leer el detalle de la respuesta; la forma `data.{id,reference,amount_in_cents,currency,status}` es la esperada y debe confirmarse con la primera llamada real.

## Llaves necesarias

Todas de sandbox. El adaptador rechaza (lanza error) cualquier llave de producción.

| Variable               | Prefijo           |
| ---------------------- | ----------------- |
| WOMPI_PUBLIC_KEY       | `pub_test_`       |
| WOMPI_PRIVATE_KEY      | `prv_test_`       |
| WOMPI_EVENTS_SECRET    | `test_events_`    |
| WOMPI_INTEGRITY_SECRET | `test_integrity_` |
| WOMPI_ENVIRONMENT      | `sandbox`         |

Se obtienen en el Dashboard de Wompi (comercio en modo pruebas): "Mi cuenta" > "Secretos para integración técnica" (eventos e integridad) y la sección de llaves de API (pública y privada). Nunca se commitean ni se inventan.

## Parámetros fijos

- API sandbox: `https://sandbox.wompi.co/v1`
- Web Checkout: `https://checkout.wompi.co/p/` (GET con `public-key`, `currency`, `amount-in-cents`, `reference`, `signature:integrity`; opcionales `redirect-url`, `expiration-time`).
- Firma de integridad: `sha256(reference + amountInCents + currency [+ expirationTime] + integritySecret)`.
- Checksum de evento: `sha256(valores de signature.properties + timestamp + eventsSecret)`.

## Webhook a registrar

En el Dashboard (modo pruebas), URL de eventos: `https://<dominio-api>/api/v1/payments/webhooks/wompi` (ruta prevista; hoy solo existe `/api/v1/payments/webhooks/sandbox` para el simulador. Crear la ruta `wompi` al cablear el adaptador con llaves reales de prueba).

## Pendiente / bloqueado

- PC-5: faltan las llaves sandbox reales y el registro del webhook. El adaptador `apps/api/src/payments/wompi-gateway.ts` no está conectado a `app.module` ni a `env.ts`.
- Al cablear: variables en `env.ts`, selector de adaptador y pruebas contra el sandbox real.
