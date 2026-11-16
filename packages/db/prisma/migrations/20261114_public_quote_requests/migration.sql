-- Public quote intake: values are additive and preserve all existing quote rows.
DO $$ BEGIN
  CREATE TYPE "QuoteSource" AS ENUM ('ADMIN', 'PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "tracking_code_hash" CHAR(64),
  ADD COLUMN IF NOT EXISTS "idempotency_key" UUID,
  ADD COLUMN IF NOT EXISTS "source" "QuoteSource" NOT NULL DEFAULT 'ADMIN';

CREATE UNIQUE INDEX IF NOT EXISTS "quotes_tracking_code_hash_key" ON "quotes"("tracking_code_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_idempotency_key_key" ON "quotes"("idempotency_key");
