-- Milestone 5B/5C. Additive only.
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "recipient_email" VARCHAR(254) NOT NULL,
    "template_data" JSONB NOT NULL,
    "dedupe_key" VARCHAR(160) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "last_error" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_outbox_dedupe_key_key" ON "notification_outbox"("dedupe_key");
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox"("status", "next_attempt_at");

ALTER TABLE "savings_plans" ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancellation_reason" VARCHAR(300),
  ADD COLUMN "created_by_id" UUID;

-- Four-eyes rule enforced by the database too: the approver can never be the registrar.
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_four_eyes"
  CHECK ("approved_by_id" IS NULL OR "approved_by_id" <> "registered_by_id");
-- Reconciliation: a bank reference counts once per method unless that abono was rejected.
CREATE UNIQUE INDEX "manual_abonos_method_bank_reference_live_key" ON "manual_abonos"("method", "bank_reference")
  WHERE "bank_reference" IS NOT NULL AND "status" <> 'REJECTED';
-- Every abono targets exactly one destination of money.
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_single_target"
  CHECK (("reservation_id" IS NULL) <> ("savings_plan_id" IS NULL));
