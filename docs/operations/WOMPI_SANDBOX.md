# Wompi sandbox (cableado, NO VALIDADO contra el sandbox real)

**Estado: NO VALIDADO contra el sandbox real.** El adaptador `PAYMENT_ADAPTER=wompi_sandbox` está implementado y
probado solo con `fetch` inyectado y llaves falsas con formato de prueba. Ninguna prueba automática contacta a Wompi.
Este estado cambia únicamente cuando el dueño complete el plan manual de abajo con llaves sandbox reales y anote la
fecha y el resultado en la sección "Registro de validación".

- Valor por defecto: `PAYMENT_ADAPTER=disabled` (sin pagos en línea).
- Nunca hay cobros reales: solo existe la URL sandbox (`https://sandbox.wompi.co/v1`, fija en código) y la API no
  arranca si alguna llave tiene prefijo de producción (`pub_prod_`, `prv_prod_`, `prod_`), sea cual sea el adaptador.
- `wompi_sandbox` sí se permite con `NODE_ENV=production` (staging), porque solo habla con el sandbox. `sandbox_test`
  (simulador local) sigue prohibido en producción.

Documentación consultada el 2026-11-14:

- https://docs.wompi.co/docs/colombia/ambientes-y-llaves/ (URL sandbox y formato de llaves)
- https://docs.wompi.co/docs/colombia/widget-checkout-web/ (Web Checkout, firma de integridad, `expiration-time`)
- https://docs.wompi.co/docs/colombia/eventos/ (eventos, checksum, reintentos)
- https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/ (tarjetas, Nequi y PSE de prueba)
- https://docs.wompi.co/reference (`GET /v1/transactions/{id}`)

## 1. Obtener las llaves (dueño del comercio)

En el Dashboard de Wompi (https://comercios.wompi.co/), con el comercio en **modo pruebas / Sandbox**:

1. Llaves de API: llave pública (`pub_test_...`) y llave privada (`prv_test_...`).
2. "Mi cuenta" > "Secretos para integración técnica": secreto de eventos (`test_events_...`) y secreto de integridad
   (`test_integrity_...`).

Nunca se commitean, nunca se pegan en tickets ni chats, y nunca se usan las de producción.

## 2. Variables de entorno

| Variable                 | Valor                        |
| ------------------------ | ---------------------------- |
| `PAYMENT_ADAPTER`        | `wompi_sandbox`              |
| `WOMPI_PUBLIC_KEY`       | `pub_test_...`               |
| `WOMPI_PRIVATE_KEY`      | `prv_test_...`               |
| `WOMPI_EVENTS_SECRET`    | `test_events_...`            |
| `WOMPI_INTEGRITY_SECRET` | `test_integrity_...`         |
| `WEB_ORIGIN`             | origen público HTTPS del web |

Con `wompi_sandbox` las cuatro llaves son obligatorias; si falta una o el prefijo no coincide, la API no arranca y el
error nombra solo la variable (nunca el valor). En staging se ponen en `deploy/staging/.env.staging` (ver
`deploy/staging/.env.staging.example`); `docker-compose.staging.yml` ya las pasa al contenedor `api`.

## 3. Webhook a registrar

En el Dashboard (modo pruebas), URL de eventos:

```
<WEB_ORIGIN>/api/v1/payments/webhooks/wompi      (p. ej. https://staging.ejemplo.co/api/v1/payments/webhooks/wompi)
```

El web reenvía `/api/v1/*` a la API. La ruta no usa sesión: se valida con el checksum (`WOMPI_EVENTS_SECRET`).
Responde 404 si el adaptador no es `wompi_sandbox`; `/api/v1/payments/webhooks/sandbox` queda solo para `sandbox_test`.

## 4. Cómo funciona

1. **Intento** (`POST /api/v1/me/reservations/:id/payments`): igual que el simulador (bloqueo de la reserva, saldo
   verificado, un solo pago pendiente vivo, idempotencia). Se guarda un `Payment` con `provider=WOMPI`, referencia
   `TEST-<16 hex>` y `expiresAt = ahora + PENDING_TTL_MS` (30 min). Devuelve `checkoutUrl` del mismo origen:
   `/api/v1/payments/wompi/checkout/:reference`.
2. **Salto a Wompi** (`GET /api/v1/payments/wompi/checkout/:reference`, sesión de cliente, solo el dueño): reconstruye
   desde la base de datos la URL de Web Checkout (`https://checkout.wompi.co/p/`) con `public-key`, `currency`,
   `amount-in-cents`, `reference`, `expiration-time` (= `expiresAt` en ISO8601 UTC), `redirect-url`
   (`<WEB_ORIGIN>/mi-cuenta/reservas/<id>`) y `signature:integrity =
sha256(reference + amountInCents + currency + expirationTime + integritySecret)`. Monto y moneda salen solo del
   servidor. Si el pago venció, ya no está pendiente o la reserva ya no admite ese valor, redirige a la reserva.
3. **Evento** (`POST /api/v1/payments/webhooks/wompi`):
   - checksum `sha256(valores de signature.properties + timestamp + eventsSecret)` sobre el cuerpo crudo, comparación en
     tiempo constante; deben estar firmados `transaction.id`, `transaction.status` y `transaction.amount_in_cents`;
     `environment` debe ser `test`;
   - frescura: `timestamp` como máximo 25 h en el pasado (Wompi reintenta hasta 3 veces en 24 h) y 5 min en el futuro;
   - inválido → 401 y se guarda con id `invalid:*` (no ocupa el lugar de idempotencia del evento genuino);
   - consulta `GET https://sandbox.wompi.co/v1/transactions/{id}` con la llave privada (timeout 10 s). Si referencia,
     estado, monto o moneda no coinciden con el evento → `EVENT_LOOKUP_MISMATCH`, no se mueve dinero. Error HTTP del
     proveedor → 500 para que Wompi reintente;
   - luego el mismo pipeline del simulador: `applyPaymentEvent`, bloqueo de la reserva, recálculo de sobrepago bajo el
     bloqueo (`payment.requires_manual_review`), actualización condicional del pago, un asiento de ledger,
     `settleReservation`, notificación. Un reenvío ya procesado responde `duplicate`.

## 5. Plan de prueba manual (primer uso real)

Requisitos: staging con HTTPS público, llaves sandbox cargadas, webhook registrado, una reserva en
`PENDING_PAYMENT` de un cliente de prueba. Datos de prueba: https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/
(tarjeta aprobada, tarjeta rechazada, Nequi y PSE de prueba; usar exactamente los de esa página).

1. Arranque: la API inicia con `PAYMENT_ADAPTER=wompi_sandbox`. Cambiar una llave a `pub_prod_x...` → no arranca.
2. Portal: "Pagar abono" lleva a `checkout.wompi.co` mostrando el monto exacto del intento y el modo de pruebas.
3. Pagar con la tarjeta de prueba **aprobada**. Esperar el retorno a `/mi-cuenta/reservas/<id>`.
4. Verificar en base de datos: `payment_webhook_events` con `checksum_valid=true` y `processed_at` sin
   `processing_error`; `payments.status=APPROVED` con `provider_transaction_id`; **un** asiento `PAYMENT_APPROVED`;
   reserva en `PARTIALLY_PAID` (o `CONFIRMED` según el flujo de staff).
5. Nuevo intento con la tarjeta **rechazada**: pago `DECLINED`, sin asiento de ledger.
6. Reenviar un evento desde el Dashboard (si lo permite) → respuesta `duplicate`, sin segundo asiento.
7. `curl` al webhook con un checksum alterado → 401.
8. Dejar vencer un intento (30 min) y abrir su enlace → vuelve a la reserva sin ir a Wompi.

Confirmar en esa primera corrida (supuestos aún no verificados):

- forma de la respuesta de `GET /v1/transactions/{id}` (`data.{id,reference,amount_in_cents,currency,status}`);
- que los reintentos de Wompi conservan el `timestamp` original (si no, revisar la ventana de 25 h);
- que Web Checkout acepta `expiration-time` en el formato `2026-11-14T20:30:00.000Z` con la firma que lo incluye;
- que `redirect-url` regresa al portal con `?id=<transacción>`.

## Registro de validación

| Fecha | Quién | Resultado                                              |
| ----- | ----- | ------------------------------------------------------ |
| —     | —     | NO VALIDADO: pendiente de llaves sandbox reales (PC-5) |
