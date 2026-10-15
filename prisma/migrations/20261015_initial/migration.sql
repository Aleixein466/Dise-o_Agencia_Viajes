-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'ADVISOR', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'PENDING_CONFIRMATION', 'PENDING_PAYMENT', 'PARTIALLY_PAID', 'CONFIRMED', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NEW', 'ASSIGNED', 'PROPOSAL_SENT', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PqrsType" AS ENUM ('PETITION', 'COMPLAINT', 'CLAIM', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "PqrsStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'WAITING_FOR_CUSTOMER', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(25) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "region" VARCHAR(100),
    "description" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_packages" (
    "id" UUID NOT NULL,
    "destination_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "duration_days" INTEGER,
    "base_price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "includes" JSONB,
    "excludes" JSONB,
    "cancellation_terms" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "alt_text" VARCHAR(250) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_images" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_days" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departures" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "held_seats" INTEGER NOT NULL DEFAULT 0,
    "confirmed_seats" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "departures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "customer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "departure_id" UUID NOT NULL,
    "travelers_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "accepted_terms_snapshot" JSONB NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "hold_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_travelers" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "booking_travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(25) NOT NULL,
    "destination" VARCHAR(120),
    "travel_date" TIMESTAMP(3),
    "travelers" INTEGER NOT NULL,
    "budget" VARCHAR(80),
    "notes" TEXT,
    "data_consent_at" TIMESTAMP(3) NOT NULL,
    "marketing_consent_at" TIMESTAMP(3),
    "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
    "assigned_to_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "deposit" DECIMAL(14,2) NOT NULL,
    "status" "PaymentPlanStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "payment_plan_id" UUID NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_plans" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "goal_amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "status" "PaymentPlanStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "savings_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_movements" (
    "id" UUID NOT NULL,
    "savings_plan_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "external_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_reference" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "content" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_acceptances" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pqrs_tickets" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "customer_id" UUID NOT NULL,
    "booking_id" UUID,
    "type" "PqrsType" NOT NULL,
    "status" "PqrsStatus" NOT NULL DEFAULT 'RECEIVED',
    "subject" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pqrs_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pqrs_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pqrs_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity" VARCHAR(120) NOT NULL,
    "entity_id" VARCHAR(120) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "destinations_slug_key" ON "destinations"("slug");

-- CreateIndex
CREATE INDEX "destinations_status_country_idx" ON "destinations"("status", "country");

-- CreateIndex
CREATE UNIQUE INDEX "tour_packages_slug_key" ON "tour_packages"("slug");

-- CreateIndex
CREATE INDEX "tour_packages_destination_id_status_idx" ON "tour_packages"("destination_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "package_images_package_id_asset_id_key" ON "package_images"("package_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_days_package_id_day_key" ON "itinerary_days"("package_id", "day");

-- CreateIndex
CREATE INDEX "departures_package_id_starts_at_published_idx" ON "departures"("package_id", "starts_at", "published");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE INDEX "bookings_departure_id_status_idx" ON "bookings"("departure_id", "status");

-- CreateIndex
CREATE INDEX "bookings_customer_id_created_at_idx" ON "bookings"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_reference_key" ON "quotes"("reference");

-- CreateIndex
CREATE INDEX "quotes_status_created_at_idx" ON "quotes"("status", "created_at");

-- CreateIndex
CREATE INDEX "quotes_email_idx" ON "quotes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_booking_id_key" ON "payment_plans"("booking_id");

-- CreateIndex
CREATE INDEX "installments_payment_plan_id_due_at_idx" ON "installments"("payment_plan_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "savings_movements_external_reference_key" ON "savings_movements"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_booking_id_status_idx" ON "payments"("booking_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_version_key" ON "agreements"("version");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_acceptances_booking_id_agreement_id_key" ON "agreement_acceptances"("booking_id", "agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "pqrs_tickets_reference_key" ON "pqrs_tickets"("reference");

-- CreateIndex
CREATE INDEX "pqrs_tickets_status_created_at_idx" ON "pqrs_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_created_at_idx" ON "audit_logs"("entity", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_images" ADD CONSTRAINT "package_images_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_images" ADD CONSTRAINT "package_images_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_travelers" ADD CONSTRAINT "booking_travelers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "payment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_plans" ADD CONSTRAINT "savings_plans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_movements" ADD CONSTRAINT "savings_movements_savings_plan_id_fkey" FOREIGN KEY ("savings_plan_id") REFERENCES "savings_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_tickets" ADD CONSTRAINT "pqrs_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_tickets" ADD CONSTRAINT "pqrs_tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_messages" ADD CONSTRAINT "pqrs_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "pqrs_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guardrails for capacity and financial amounts. Booking transactions must still
-- update held/confirmed seats atomically in the later reservation module.
ALTER TABLE "departures" ADD CONSTRAINT "departures_capacity_check" CHECK ("capacity" >= 0 AND "held_seats" >= 0 AND "confirmed_seats" >= 0 AND "held_seats" + "confirmed_seats" <= "capacity");
ALTER TABLE "departures" ADD CONSTRAINT "departures_price_check" CHECK ("price" >= 0);
ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_price_check" CHECK ("base_price" IS NULL OR "base_price" >= 0);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amount_check" CHECK ("travelers_count" > 0 AND "total_amount" >= 0);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_travelers_check" CHECK ("travelers" > 0);
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_deposit_check" CHECK ("deposit" >= 0);
ALTER TABLE "installments" ADD CONSTRAINT "installments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "savings_plans" ADD CONSTRAINT "savings_plans_goal_check" CHECK ("goal_amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);
