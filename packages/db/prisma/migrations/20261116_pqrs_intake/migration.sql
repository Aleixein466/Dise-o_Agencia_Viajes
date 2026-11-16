-- PQRS intake (additive). Tracking code stored only as SHA-256; idempotent public creation; optimistic version.
ALTER TABLE "pqrs_tickets" ADD COLUMN "tracking_code_hash" CHAR(64);
ALTER TABLE "pqrs_tickets" ADD COLUMN "idempotency_key" UUID;
ALTER TABLE "pqrs_tickets" ADD COLUMN "data_consent_at" TIMESTAMP(3);
ALTER TABLE "pqrs_tickets" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "pqrs_tickets_idempotency_key_key" ON "pqrs_tickets"("idempotency_key");

ALTER TABLE "consent_records" ADD COLUMN "pqrs_ticket_id" UUID;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_pqrs_ticket_id_fkey"
  FOREIGN KEY ("pqrs_ticket_id") REFERENCES "pqrs_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "consent_records_pqrs_ticket_id_idx" ON "consent_records"("pqrs_ticket_id");
