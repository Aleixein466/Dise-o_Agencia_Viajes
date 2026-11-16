-- Test-only simulated payment provider (milestone 5a). Additive.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'SANDBOX_TEST';

CREATE TABLE "sandbox_test_transactions" (
    "id" UUID NOT NULL,
    "payment_reference" VARCHAR(40) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "status" "PaymentStatusV2" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sandbox_test_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sandbox_test_transactions_payment_reference_key" ON "sandbox_test_transactions"("payment_reference");
