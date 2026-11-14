-- Administrative quotes may be created before collecting traveller contact data.
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'REQUIRES_MANUAL_REVIEW';

ALTER TABLE "quotes"
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "data_consent_at" DROP NOT NULL,
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "review_reasons" JSONB,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "quotes_created_by_id_created_at_idx" ON "quotes"("created_by_id", "created_at");
