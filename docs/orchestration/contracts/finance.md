# Contract: finance — manual abonos, adjustments, savings plans (milestone 5B)

Money is integer cents as strings. Staff routes need MFA, the permission named, CSRF + Origin on mutations.
No automatic debits ever: savings plans are schedules the customer pays against, nothing is charged by the system.
Ledger (`ledger_entries`, append-only) is the only source of paid amounts.

## Manual abonos (transfer / cash)

- `POST /api/v1/finance/abonos` — `payments:register_abono` (FINANCE). multipart: file `receipt` (PDF, JPEG, PNG or
  WebP, ≤ 5 MB, verified by magic bytes; images re-encoded, PDFs must start with `%PDF-` and contain `%%EOF`;
  stored PRIVATE) + fields `reservationId` | `savingsPlanId` (exactly one), `amountCents`, `method`
  (`BANK_TRANSFER` | `CASH`), `bankReference` (required for BANK_TRANSFER, ≤ 120), `paidAt` (YYYY-MM-DD, not future).
  → 201 `{ id, status: "SUBMITTED" }`.
  409: duplicate bank reference for the method (DB partial unique), duplicate receipt (same SHA-256 already on a
  non-rejected abono), amount > balance of the target, target not payable (reservation states
  `PENDING_PAYMENT|PARTIALLY_PAID|CONFIRMED`; savings plan `ACTIVE`).
- `GET /api/v1/finance/abonos?status=SUBMITTED|APPROVED|REJECTED&page=` — `payments:read`. Items:
  `{ id, status, amountCents, method, bankReference, paidAt, target: { type: "RESERVATION"|"SAVINGS_PLAN", id, code }, customerName,
registeredBy {id,name}, approvedBy {id,name}|null, rejectionReason, createdAt }`.
- `GET /api/v1/finance/abonos/:id/receipt` — `payments:read`; streams the private file, `Cache-Control: no-store`,
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- `POST /api/v1/finance/abonos/:id/approve` — `payments:approve`, approver ≠ registrar (403, and DB CHECK).
  Creates `Payment{provider: MANUAL, status: APPROVED, verifiedAt}`, `LedgerEntry MANUAL_ABONO` (unique per abono),
  settles the reservation (`PAYMENT_SETTLED`, role FINANCE) or the savings plan; re-checks balance at approval.
  Concurrent approvals: exactly one wins (conditional update on `status = SUBMITTED`), the other gets 409.
- `POST /api/v1/finance/abonos/:id/reject` `{ reason }` — `payments:approve`, approver ≠ registrar.

## Adjustments

- `POST /api/v1/finance/adjustments` — `payments:approve`. `{ reservationId | savingsPlanId, amountCents (signed,
non-zero), reason (≥ 10 chars) }`. Writes `LedgerEntry ADJUSTMENT` with `createdById` and description; a
  negative adjustment may not drive the paid amount below 0. Audited. It never changes reservation state by itself.

## Ledger / balances

- `GET /api/v1/finance/ledger?reservationId=|savingsPlanId=` — `payments:read`: entries (kind, amountCents,
  description, createdAt, createdBy name) + `{ paidCents, balanceCents }`.

## Savings plans (ahorro programado)

- `POST /api/v1/finance/savings-plans` — `payments:approve` (staff creates it with the customer).
  `{ customerId, name, goalCents, reservationId?, packageId?, installments: [{ dueOn, amountCents }] (1..60,
increasing dates, sum = goal) }`.
- `GET /api/v1/finance/savings-plans?customerId=` / `GET /api/v1/finance/savings-plans/:id` — `payments:read`.
- `POST /api/v1/finance/savings-plans/:id/cancel` `{ reason }` — `payments:approve`; status CANCELLED; money held
  stays in the ledger for refund handling (audited, no automatic refund).
- Customer: `GET /api/v1/me/savings-plans`, `GET /api/v1/me/savings-plans/:id` (owner-scoped, foreign → 404).
- Plan view: `{ id, name, status, goalCents, paidCents, balanceCents, nextDue: {sequence, dueOn, amountCents}|null,
installments: [{ sequence, dueOn, amountCents, paidCents, status: PAID|PARTIAL|PENDING|OVERDUE }] }`.
  Allocation: ledger total applied to installments in sequence order. The plan becomes COMPLETED when paid ≥ goal.

## Web

- `/admin/finanzas` (module "Finanzas", resource `payments`): tabs Abonos (register form with file input, list with
  filter, approve/reject — buttons hidden for the registrar), Planes de ahorro (create with installment rows,
  detail with schedule, cancel), Ajustes (form). Reservation detail in `/admin/reservas` links to its ledger.
- `/mi-cuenta`: section "Mis planes de ahorro" + `/mi-cuenta/ahorro/[id]` with the schedule and statuses.
