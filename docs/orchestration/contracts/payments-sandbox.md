# Contract: online abonos via the sandbox test adapter (milestone 5a)

No real charges. `PAYMENT_ADAPTER` is `disabled` (default) or `sandbox_test`; `sandbox_test` is refused when
`NODE_ENV=production`. Every sandbox payment uses provider `SANDBOX_TEST` and a reference starting with `TEST-`.
The shape mimics Wompi (checkout redirect → signed `transaction.updated` event → server-side transaction lookup) so
the real adapter can replace it once sandbox keys exist (PC-5). The browser and return URL are never the source of
truth: only a verified event plus a lookup moves money.

Money is integer cents as strings. All `/me/*` routes are scoped to the session customer (foreign id → 404) and
mutations need CSRF + Origin.

## Customer

`GET /api/v1/me/reservations/:id` — adds:

```json
{ "payment": { "paidCents": "0", "balanceCents": "100000000", "requiredDepositCents": "30000000",
  "canPay": true, "pending": { "reference": "TEST-…", "amountCents": "…", "checkoutUrl": "…" } | null },
  "payments": [{ "reference": "TEST-…", "amountCents": "…", "status": "PENDING|APPROVED|DECLINED|VOIDED|ERROR|REFUNDED",
  "provider": "SANDBOX_TEST", "createdAt": "…", "approvedAt": null }] }
```

`canPay` is true only when the adapter is enabled, status ∈ `PENDING_PAYMENT|PARTIALLY_PAID|CONFIRMED` and balance > 0.

`POST /api/v1/me/reservations/:id/payments` body `{ amountCents: string (digits), idempotencyKey: uuid }`

- 201 `{ reference, amountCents, checkoutUrl, status: "PENDING" }`; same idempotency key → 200 same payment.
- 409 when not payable, when another unexpired PENDING payment exists (it is returned in `payment.pending`), or
  amount < 1 or > balance. 503 when the adapter is disabled.

## Sandbox checkout (test only; 404 when the adapter is disabled)

- `GET /api/v1/payments/sandbox/:reference` → `{ reference, amountCents, currency, status, reservationId }`
  (requires the owning customer session).
- `POST /api/v1/payments/sandbox/:reference/decision` body `{ outcome: "APPROVED" | "DECLINED" }` (owning customer
  session + CSRF). Records the outcome in the sandbox provider table, then delivers a signed event to the same
  webhook pipeline. Returns `{ status }` of the payment after processing.
- `POST /api/v1/payments/webhooks/sandbox` — provider-facing. Wompi-style checksum:
  `sha256(values of signature.properties + timestamp + SANDBOX_PAYMENT_EVENTS_SECRET)`. Invalid → 401 and the
  event is stored with `checksumValid=false`. Duplicate `(provider, eventId)` → 200 no-op.

Processing: store event → look up transaction in the provider (sandbox table) → reference, amount and currency must
match → `applyPaymentEvent` (SYSTEM) → conditional update → `LedgerEntry PAYMENT_APPROVED` (unique per payment) →
`paidCents = SUM(ledger)` → reservation `PAYMENT_SETTLED` (SYSTEM) with history + audit.

## Staff

- `POST /api/v1/reservations/:id/events` accepts `CONFIRM` and, for `APPROVE_FOR_PAYMENT`, optional
  `requiredDepositCents` (string digits, ≤ total; staff decides it, nothing is invented). `CONFIRM` succeeds only
  when availability was validated and the deposit (if > 0) or the full total is paid.
- `GET /api/v1/reservations/:id` adds `payment` (same shape as above, without `pending.checkoutUrl`) and `payments`.

## Web

- `/mi-cuenta/reservas/[id]`: payment panel (paid, balance, deposit, amount input defaulting to the remaining
  deposit or balance, "Pagar en entorno de prueba"), payments list. Never shows a payment as approved based on the
  URL; after returning it reloads from the API.
- `/pagos/prueba/[reference]`: a banner "Entorno de prueba — no se realiza ningún cobro", amount, buttons
  "Simular pago aprobado" / "Simular pago rechazado", then a link back to the reservation.
- `/admin/reservas`: deposit input on "Confirmar disponibilidad", "Confirmar reserva" action, paid/balance and
  payments list in the detail.

## Hardening after review (2026-11-14)

- Webhook idempotency is on completion: a retried event whose earlier processing failed is processed again.
- A delivery that loses the conditional payment update is a no-op (no ledger entry, no error).
- The simulated provider refuses to capture an expired payment, a closed reservation, or more than the balance.
- CANCEL/REJECT voids PENDING (uncaptured) intents in the same transaction. Paid > total is flagged
  `payment.settlement_review` (`OVERPAID`). Webhook rate limit: 120/min per IP.
- Known limits (real adapter only, sandbox cannot void): a VOIDED event writes the negative ledger entry but does not
  re-evaluate the reservation; staff reconciles. Amounts are entered in whole pesos.
