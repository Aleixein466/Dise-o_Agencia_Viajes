-- Same proof of payment can back at most one live abono, even under concurrent submissions. Additive.
ALTER TABLE "manual_abonos" ADD COLUMN "receipt_sha256" CHAR(64);
CREATE UNIQUE INDEX "manual_abonos_receipt_sha256_live_key" ON "manual_abonos"("receipt_sha256")
  WHERE "receipt_sha256" IS NOT NULL AND "status" <> 'REJECTED';
