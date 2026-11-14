# Contract: notifications (milestone 5C)

No real messages without authorization. `MAIL_ADAPTER`: `disabled` (default) | `file` (tests) | `smtp`.
`smtp` uses `SMTP_URL` (e.g. `smtp://127.0.0.1:1025` for Mailpit in development; a real provider later via
`smtps://user:pass@host:465`), `MAIL_FROM`. `file` is refused in production; `smtp` to a non-loopback host is refused
unless `MAIL_REAL_DELIVERY_APPROVED=true` (explicit commercial approval switch, default false).

## Pieces (apps/api/src/notifications)

- `MailAdapter.send({ to, subject, text, html? , kind })` — transport only. Never logs bodies or codes; logs
  `kind` and a hashed recipient only.
- `NotificationsService.enqueue(kind, to, data, dedupeKey)` — writes `notification_outbox` (unique `dedupeKey`,
  duplicates are no-ops). `data` must not contain secrets; enqueue rejects keys named like `code|token|password|secret`.
  Can run inside a caller's Prisma transaction (`enqueue(..., tx)`).
- `NotificationsService.dispatch(limit)` — claims due PENDING rows (`FOR UPDATE SKIP LOCKED`), renders the
  template, sends, marks SENT, or retries with backoff (max 5 attempts → FAILED). Never throws on one bad row.
- Templates (Spanish, text + minimal HTML, escaped): `quote.received`, `quote.proposal_ready`,
  `quote.status_changed`, `reservation.requested`, `reservation.status_changed`, `reservation.confirmed`,
  `payment.approved`, `savings.installment_reminder`, `pqrs.received`. Links use `WEB_ORIGIN`; no PII beyond the
  recipient's own first name and references.
- `savings` reminder scan: `NotificationsService.enqueueInstallmentReminders(now)` — for ACTIVE plans, installments
  due in ≤ 3 days and not fully paid → one reminder per (plan, sequence) via dedupe key. Informational only.
- CLI: `pnpm --filter @ricaurte/api notifications:dispatch` (one pass, exits, hard timeout 60 s).
- Login codes (OTP) stay synchronous through `MailAdapter` (never in the outbox, never in logs).

## Dev

- `docker compose --profile mail up -d mailpit` → SMTP 127.0.0.1:1025, UI http://127.0.0.1:8025.
