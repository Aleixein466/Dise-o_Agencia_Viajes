-- Schema v2 (additive). Generated with `prisma migrate diff --from-schema <v1 schema> --to-schema prisma/schema.prisma --script`,
-- plus a hand-written section at the end. No DROP TABLE/COLUMN; the only ALTER COLUMNs are DROP NOT NULL
-- (departures.price, savings_plans.goal_amount, pqrs_tickets.customer_id). See docs/data/DATA_MODEL.md.

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('CUSTOMER', 'ADVISOR', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('CUSTOMER', 'ADVISOR', 'FINANCE', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP');

-- CreateEnum
CREATE TYPE "OneTimeTokenPurpose" AS ENUM ('MAGIC_LINK_LOGIN', 'PASSWORD_RESET', 'EMAIL_VERIFICATION', 'RESERVATION_ACCESS');

-- CreateEnum
CREATE TYPE "DestinationCategory" AS ENUM ('NACIONAL', 'INTERNACIONAL', 'PASADIA', 'ESPECIAL');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('GROUND', 'AIR', 'SEA');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'TO_CONFIRM');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PackageComponentType" AS ENUM ('HOTEL', 'ROOM_TYPE', 'TOUR', 'TRANSPORT', 'ADD_ON');

-- CreateEnum
CREATE TYPE "TravelerCategory" AS ENUM ('ADULT', 'CHILD', 'INFANT', 'SENIOR');

-- CreateEnum
CREATE TYPE "AgeRuleBasis" AS ENUM ('AGE_YEARS', 'HEIGHT_CM');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('PER_PERSON', 'PER_PERSON_NIGHT', 'PER_ROOM_NIGHT', 'PER_BOOKING');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PriceLineKind" AS ENUM ('PACKAGE', 'TRANSPORT', 'HOTEL_ROOM', 'TOUR', 'ADD_ON', 'SEASON_SUPPLEMENT', 'PROMOTION', 'TAX', 'FEE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('DRAFT', 'REQUEST_RECEIVED', 'PENDING_VALIDATION', 'PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReservationEventType" AS ENUM ('SUBMIT_REQUEST', 'CHECKOUT', 'START_VALIDATION', 'APPROVE_FOR_PAYMENT', 'PAYMENT_SETTLED', 'CONFIRM', 'REJECT', 'CANCEL', 'REFUND_COMPLETED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "PaymentStatusV2" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('WOMPI', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerEntryKind" AS ENUM ('PAYMENT_APPROVED', 'PAYMENT_VOIDED', 'MANUAL_ABONO', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ManualAbonoStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS', 'PRIVACY_POLICY', 'DATA_TREATMENT_AUTHORIZATION', 'CANCELLATION_POLICY', 'COOKIES_POLICY', 'ESCNNA_NOTICE', 'WITHDRAWAL_POLICY');

-- CreateEnum
CREATE TYPE "LegalDocumentStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('DATA_PROCESSING', 'MARKETING', 'TERMS_ACCEPTANCE', 'COOKIES_ANALYTICS');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('PAGE', 'ARTICLE', 'GUIDE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "document_number" VARCHAR(40),
ADD COLUMN     "document_type" VARCHAR(20),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "destinations" ADD COLUMN     "category" "DestinationCategory",
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "noindex" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seo_description" VARCHAR(170),
ADD COLUMN     "seo_title" VARCHAR(70),
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tour_packages" ADD COLUMN     "base_price_cents" BIGINT,
ADD COLUMN     "customizable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "is_fictitious" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "noindex" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seo_description" VARCHAR(170),
ADD COLUMN     "seo_title" VARCHAR(70);

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "sha256" CHAR(64),
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "uploaded_by_id" UUID,
ADD COLUMN     "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "departures" ADD COLUMN     "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'TO_CONFIRM',
ADD COLUMN     "is_fictitious" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "price_cents" BIGINT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "children" INTEGER,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
ADD COLUMN     "customer_id" UUID,
ADD COLUMN     "departure_id" UUID,
ADD COLUMN     "destination_id" UUID,
ADD COLUMN     "is_fictitious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "package_id" UUID,
ADD COLUMN     "price_snapshot" JSONB,
ADD COLUMN     "pricing_version" VARCHAR(40),
ADD COLUMN     "total_cents" BIGINT,
ADD COLUMN     "transport_option_id" UUID,
ADD COLUMN     "valid_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "savings_plans" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "goal_cents" BIGINT,
ADD COLUMN     "name" VARCHAR(160),
ADD COLUMN     "package_id" UUID,
ADD COLUMN     "reservation_id" UUID,
ADD COLUMN     "target_date" DATE,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "goal_amount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pqrs_tickets" ADD COLUMN     "assigned_to_id" UUID,
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "first_responded_at" TIMESTAMP(3),
ADD COLUMN     "first_response_due_at" TIMESTAMP(3),
ADD COLUMN     "requester_email" VARCHAR(254),
ADD COLUMN     "requester_name" VARCHAR(120),
ADD COLUMN     "requester_phone" VARCHAR(25),
ADD COLUMN     "reservation_id" UUID,
ADD COLUMN     "resolution_due_at" TIMESTAMP(3),
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "customer_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pqrs_messages" ADD COLUMN     "author_id" UUID,
ADD COLUMN     "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_role" "ActorRole",
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "ip_hash" CHAR(64),
ADD COLUMN     "request_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "roles" (
    "code" "RoleCode" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_code" "RoleCode" NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_code","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_code" "RoleCode" NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_code")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "mfa_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "MfaFactorType" NOT NULL DEFAULT 'TOTP',
    "label" VARCHAR(80),
    "secret_encrypted" TEXT NOT NULL,
    "last_used_step" BIGINT,
    "confirmed_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_tokens" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "purpose" "OneTimeTokenPurpose" NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(254),
    "reservation_id" UUID,
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "one_time_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "destination_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "stars" INTEGER,
    "address" VARCHAR(250),
    "amenities" JSONB,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(170),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "max_occupancy" INTEGER NOT NULL,
    "max_adults" INTEGER,
    "max_children" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_options" (
    "id" UUID NOT NULL,
    "destination_id" UUID NOT NULL,
    "mode" "TransportMode" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "conditions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tours" (
    "id" UUID NOT NULL,
    "destination_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "duration_hours" INTEGER,
    "includes" JSONB,
    "excludes" JSONB,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(170),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_ons" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_components" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "type" "PackageComponentType" NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT false,
    "hotel_id" UUID,
    "room_type_id" UUID,
    "tour_id" UUID,
    "transport_option_id" UUID,
    "add_on_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "destination_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "notes" TEXT,
    "is_fictitious" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "age_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" "TravelerCategory" NOT NULL,
    "basis" "AgeRuleBasis" NOT NULL DEFAULT 'AGE_YEARS',
    "min_value" INTEGER,
    "max_value" INTEGER,
    "destination_id" UUID,
    "package_id" UUID,
    "tour_id" UUID,
    "is_fictitious" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "age_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "rule_set_version" VARCHAR(40) NOT NULL,
    "unit" "PriceUnit" NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "package_id" UUID,
    "departure_id" UUID,
    "room_type_id" UUID,
    "tour_id" UUID,
    "transport_option_id" UUID,
    "add_on_id" UUID,
    "season_id" UUID,
    "age_rule_id" UUID,
    "min_travelers" INTEGER,
    "max_travelers" INTEGER,
    "occupancy" INTEGER,
    "conditions" JSONB,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_fictitious" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40),
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "percent_bps" INTEGER,
    "amount_off_cents" BIGINT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "max_redemptions" INTEGER,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "destination_id" UUID,
    "package_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_fictitious" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "cop_per_unit" DECIMAL(14,4) NOT NULL,
    "source" VARCHAR(120),
    "effective_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_attachments" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "destination_id" UUID,
    "hotel_id" UUID,
    "tour_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "kind" "PriceLineKind" NOT NULL,
    "component_id" UUID,
    "price_rule_id" UUID,
    "description" VARCHAR(250) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" BIGINT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "pricing_version" VARCHAR(40) NOT NULL,
    "is_fictitious" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "customer_id" UUID NOT NULL,
    "quote_id" UUID,
    "destination_id" UUID,
    "package_id" UUID,
    "departure_id" UUID,
    "transport_option_id" UUID,
    "status" "ReservationStatus" NOT NULL DEFAULT 'DRAFT',
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "starts_on" DATE,
    "ends_on" DATE,
    "total_cents" BIGINT NOT NULL,
    "required_deposit_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "display_currency" VARCHAR(3),
    "display_rate" DECIMAL(14,4),
    "display_rate_at" TIMESTAMP(3),
    "pricing_version" VARCHAR(40) NOT NULL,
    "price_snapshot" JSONB NOT NULL,
    "is_fictitious" BOOLEAN NOT NULL DEFAULT false,
    "hold_expires_at" TIMESTAMP(3),
    "availability_validated_at" TIMESTAMP(3),
    "validated_by_id" UUID,
    "assigned_advisor_id" UUID,
    "invoice_number" VARCHAR(60),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travelers" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "category" "TravelerCategory" NOT NULL DEFAULT 'ADULT',
    "is_responsible" BOOLEAN NOT NULL DEFAULT false,
    "full_name" VARCHAR(160),
    "age_years" INTEGER,
    "height_cm" INTEGER,
    "birth_date" DATE,
    "document_type" VARCHAR(20),
    "document_number" VARCHAR(40),
    "nationality" VARCHAR(2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_status_history" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "from_status" "ReservationStatus",
    "to_status" "ReservationStatus" NOT NULL,
    "event" "ReservationEventType",
    "actor_id" UUID,
    "role" "ActorRole" NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "customer_id" UUID NOT NULL,
    "reservation_id" UUID,
    "savings_plan_id" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod",
    "provider_transaction_id" VARCHAR(120),
    "idempotency_key" VARCHAR(120) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "status" "PaymentStatusV2" NOT NULL DEFAULT 'PENDING',
    "status_reason" VARCHAR(300),
    "expires_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'WOMPI',
    "provider_event_id" VARCHAR(160) NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payment_id" UUID,
    "provider_transaction_id" VARCHAR(120),
    "reported_status" VARCHAR(40),
    "checksum_valid" BOOLEAN NOT NULL,
    "payload_sha256" CHAR(64) NOT NULL,
    "payload" JSONB,
    "provider_sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_error" VARCHAR(500),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "kind" "LedgerEntryKind" NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "customer_id" UUID NOT NULL,
    "reservation_id" UUID,
    "savings_plan_id" UUID,
    "payment_id" UUID,
    "manual_abono_id" UUID,
    "refund_id" UUID,
    "description" VARCHAR(300),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_abonos" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reservation_id" UUID,
    "savings_plan_id" UUID,
    "payment_id" UUID,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "method" "PaymentMethod" NOT NULL,
    "bank_reference" VARCHAR(120),
    "paid_at" TIMESTAMP(3) NOT NULL,
    "receipt_media_id" UUID NOT NULL,
    "status" "ManualAbonoStatus" NOT NULL DEFAULT 'SUBMITTED',
    "registered_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_abonos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "reservation_id" UUID,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "provider_refund_id" VARCHAR(120),
    "requested_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_plan_installments" (
    "id" UUID NOT NULL,
    "savings_plan_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "due_on" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_plan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "status" "LegalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "effective_from" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "legal_document_id" UUID NOT NULL,
    "legal_document_version" VARCHAR(40) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "user_id" UUID,
    "customer_id" UUID,
    "email" VARCHAR(254),
    "quote_id" UUID,
    "reservation_id" UUID,
    "source" VARCHAR(80) NOT NULL,
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "legal_name" VARCHAR(200),
    "trade_name" VARCHAR(200),
    "nit" VARCHAR(30),
    "rnt" VARCHAR(30),
    "rnt_valid_until" DATE,
    "address" VARCHAR(250),
    "city" VARCHAR(100),
    "phone" VARCHAR(25),
    "whatsapp" VARCHAR(25),
    "contact_email" VARCHAR(254),
    "bookings_email" VARCHAR(254),
    "business_hours" VARCHAR(300),
    "facebook_url" VARCHAR(300),
    "instagram_url" VARCHAR(300),
    "tiktok_url" VARCHAR(300),
    "youtube_url" VARCHAR(300),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pages" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "kind" "ContentKind" NOT NULL DEFAULT 'PAGE',
    "title" VARCHAR(200) NOT NULL,
    "excerpt" VARCHAR(500),
    "body" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(170),
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "answer" TEXT NOT NULL,
    "topic" VARCHAR(80),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignments" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "advisor_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "reason" VARCHAR(300),
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_tasks" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assignee_id" UUID NOT NULL,
    "created_by_id" UUID,
    "quote_id" UUID,
    "reservation_id" UUID,
    "customer_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_notes" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "quote_id" UUID,
    "reservation_id" UUID,
    "customer_id" UUID,
    "pqrs_ticket_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_roles_role_code_idx" ON "user_roles"("role_code");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "mfa_factors_user_id_idx" ON "mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "one_time_tokens_token_hash_key" ON "one_time_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "one_time_tokens_user_id_purpose_idx" ON "one_time_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "one_time_tokens_email_purpose_idx" ON "one_time_tokens"("email", "purpose");

-- CreateIndex
CREATE INDEX "one_time_tokens_expires_at_idx" ON "one_time_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels"("slug");

-- CreateIndex
CREATE INDEX "hotels_destination_id_status_idx" ON "hotels"("destination_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_hotel_id_name_key" ON "room_types"("hotel_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_options_destination_id_mode_name_key" ON "transport_options"("destination_id", "mode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tours_slug_key" ON "tours"("slug");

-- CreateIndex
CREATE INDEX "tours_destination_id_status_idx" ON "tours"("destination_id", "status");

-- CreateIndex
CREATE INDEX "package_components_package_id_type_idx" ON "package_components"("package_id", "type");

-- CreateIndex
CREATE INDEX "seasons_destination_id_starts_on_idx" ON "seasons"("destination_id", "starts_on");

-- CreateIndex
CREATE INDEX "price_rules_rule_set_version_active_idx" ON "price_rules"("rule_set_version", "active");

-- CreateIndex
CREATE INDEX "price_rules_package_id_idx" ON "price_rules"("package_id");

-- CreateIndex
CREATE INDEX "price_rules_room_type_id_idx" ON "price_rules"("room_type_id");

-- CreateIndex
CREATE INDEX "price_rules_tour_id_idx" ON "price_rules"("tour_id");

-- CreateIndex
CREATE INDEX "price_rules_transport_option_id_idx" ON "price_rules"("transport_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_active_starts_at_ends_at_idx" ON "promotions"("active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "exchange_rates_quote_currency_effective_at_idx" ON "exchange_rates"("quote_currency", "effective_at");

-- CreateIndex
CREATE INDEX "media_attachments_destination_id_sort_order_idx" ON "media_attachments"("destination_id", "sort_order");

-- CreateIndex
CREATE INDEX "media_attachments_hotel_id_sort_order_idx" ON "media_attachments"("hotel_id", "sort_order");

-- CreateIndex
CREATE INDEX "media_attachments_tour_id_sort_order_idx" ON "media_attachments"("tour_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_quote_id_line_no_key" ON "quote_lines"("quote_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_code_key" ON "reservations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_quote_id_key" ON "reservations"("quote_id");

-- CreateIndex
CREATE INDEX "reservations_customer_id_created_at_idx" ON "reservations"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "reservations_status_created_at_idx" ON "reservations"("status", "created_at");

-- CreateIndex
CREATE INDEX "reservations_departure_id_status_idx" ON "reservations"("departure_id", "status");

-- CreateIndex
CREATE INDEX "reservations_assigned_advisor_id_status_idx" ON "reservations"("assigned_advisor_id", "status");

-- CreateIndex
CREATE INDEX "travelers_reservation_id_idx" ON "travelers"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_status_history_reservation_id_at_idx" ON "reservation_status_history"("reservation_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_transaction_id_key" ON "payment_transactions"("provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_customer_id_created_at_idx" ON "payment_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_reservation_id_status_idx" ON "payment_transactions"("reservation_id", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_status_created_at_idx" ON "payment_transactions"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_payment_id_received_at_idx" ON "payment_webhook_events"("payment_id", "received_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processed_at_idx" ON "payment_webhook_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "ledger_entries_reservation_id_created_at_idx" ON "ledger_entries"("reservation_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_savings_plan_id_created_at_idx" ON "ledger_entries"("savings_plan_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_customer_id_created_at_idx" ON "ledger_entries"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_payment_id_kind_key" ON "ledger_entries"("payment_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_manual_abono_id_kind_key" ON "ledger_entries"("manual_abono_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_refund_id_kind_key" ON "ledger_entries"("refund_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "manual_abonos_payment_id_key" ON "manual_abonos"("payment_id");

-- CreateIndex
CREATE INDEX "manual_abonos_customer_id_created_at_idx" ON "manual_abonos"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "manual_abonos_reservation_id_idx" ON "manual_abonos"("reservation_id");

-- CreateIndex
CREATE INDEX "manual_abonos_status_created_at_idx" ON "manual_abonos"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_reservation_id_idx" ON "refunds"("reservation_id");

-- CreateIndex
CREATE INDEX "savings_plan_installments_due_on_idx" ON "savings_plan_installments"("due_on");

-- CreateIndex
CREATE UNIQUE INDEX "savings_plan_installments_savings_plan_id_sequence_key" ON "savings_plan_installments"("savings_plan_id", "sequence");

-- CreateIndex
CREATE INDEX "legal_documents_type_status_idx" ON "legal_documents"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");

-- CreateIndex
CREATE INDEX "consent_records_customer_id_purpose_at_idx" ON "consent_records"("customer_id", "purpose", "at");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_at_idx" ON "consent_records"("user_id", "purpose", "at");

-- CreateIndex
CREATE INDEX "consent_records_email_purpose_at_idx" ON "consent_records"("email", "purpose", "at");

-- CreateIndex
CREATE INDEX "consent_records_reservation_id_idx" ON "consent_records"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_pages_slug_key" ON "content_pages"("slug");

-- CreateIndex
CREATE INDEX "content_pages_kind_status_published_at_idx" ON "content_pages"("kind", "status", "published_at");

-- CreateIndex
CREATE INDEX "faq_items_status_topic_sort_order_idx" ON "faq_items"("status", "topic", "sort_order");

-- CreateIndex
CREATE INDEX "lead_assignments_quote_id_assigned_at_idx" ON "lead_assignments"("quote_id", "assigned_at");

-- CreateIndex
CREATE INDEX "lead_assignments_advisor_id_unassigned_at_idx" ON "lead_assignments"("advisor_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "follow_up_tasks_assignee_id_status_due_at_idx" ON "follow_up_tasks"("assignee_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "crm_notes_quote_id_created_at_idx" ON "crm_notes"("quote_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_notes_reservation_id_created_at_idx" ON "crm_notes"("reservation_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_notes_customer_id_created_at_idx" ON "crm_notes"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "destinations_category_status_idx" ON "destinations"("category", "status");

-- CreateIndex
CREATE INDEX "quotes_customer_id_created_at_idx" ON "quotes"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "quotes_assigned_to_id_status_idx" ON "quotes"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "savings_plans_customer_id_idx" ON "savings_plans"("customer_id");

-- CreateIndex
CREATE INDEX "savings_plans_reservation_id_idx" ON "savings_plans"("reservation_id");

-- CreateIndex
CREATE INDEX "pqrs_tickets_customer_id_created_at_idx" ON "pqrs_tickets"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "pqrs_tickets_assigned_to_id_status_idx" ON "pqrs_tickets"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "pqrs_tickets_resolution_due_at_idx" ON "pqrs_tickets"("resolution_due_at");

-- CreateIndex
CREATE INDEX "pqrs_messages_ticket_id_created_at_idx" ON "pqrs_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "roles"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_options" ADD CONSTRAINT "transport_options_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_transport_option_id_fkey" FOREIGN KEY ("transport_option_id") REFERENCES "transport_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "age_rules" ADD CONSTRAINT "age_rules_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "age_rules" ADD CONSTRAINT "age_rules_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "age_rules" ADD CONSTRAINT "age_rules_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_transport_option_id_fkey" FOREIGN KEY ("transport_option_id") REFERENCES "transport_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_age_rule_id_fkey" FOREIGN KEY ("age_rule_id") REFERENCES "age_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_transport_option_id_fkey" FOREIGN KEY ("transport_option_id") REFERENCES "transport_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_transport_option_id_fkey" FOREIGN KEY ("transport_option_id") REFERENCES "transport_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_assigned_advisor_id_fkey" FOREIGN KEY ("assigned_advisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_savings_plan_id_fkey" FOREIGN KEY ("savings_plan_id") REFERENCES "savings_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_savings_plan_id_fkey" FOREIGN KEY ("savings_plan_id") REFERENCES "savings_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_manual_abono_id_fkey" FOREIGN KEY ("manual_abono_id") REFERENCES "manual_abonos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_savings_plan_id_fkey" FOREIGN KEY ("savings_plan_id") REFERENCES "savings_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_receipt_media_id_fkey" FOREIGN KEY ("receipt_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_plans" ADD CONSTRAINT "savings_plans_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_plans" ADD CONSTRAINT "savings_plans_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_plan_installments" ADD CONSTRAINT "savings_plan_installments_savings_plan_id_fkey" FOREIGN KEY ("savings_plan_id") REFERENCES "savings_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_tickets" ADD CONSTRAINT "pqrs_tickets_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_tickets" ADD CONSTRAINT "pqrs_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_messages" ADD CONSTRAINT "pqrs_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_pqrs_ticket_id_fkey" FOREIGN KEY ("pqrs_ticket_id") REFERENCES "pqrs_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written section: CHECK constraints and triggers. Prisma does not model or
-- diff these, so future `prisma migrate diff` runs neither recreate nor drop them.
-- Documented in docs/data/DATA_MODEL.md ("Database-level rules").
-- ---------------------------------------------------------------------------

-- Emails stored lowercased. NOT VALID: enforced for new/updated rows, v1 rows are not scanned.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email")) NOT VALID;

-- Manual cupos (held + sold <= capacity) are already enforced by v1 "departures_capacity_check".

-- Money: integer COP cents only.
ALTER TABLE "departures" ADD CONSTRAINT "departures_price_cents_check" CHECK ("price_cents" IS NULL OR "price_cents" >= 0);
ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_price_cents_check"
  CHECK ("base_price_cents" IS NULL OR "base_price_cents" >= 0);
ALTER TABLE "savings_plans" ADD CONSTRAINT "savings_plans_goal_cents_check" CHECK ("goal_cents" IS NULL OR "goal_cents" > 0);
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_amount_valid"
  CHECK ("amount_cents" > 0 AND "currency" = 'COP');
ALTER TABLE "manual_abonos" ADD CONSTRAINT "manual_abonos_amount_valid"
  CHECK ("amount_cents" > 0 AND "currency" = 'COP');
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_valid"
  CHECK ("amount_cents" > 0 AND "currency" = 'COP');
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_amounts_valid"
  CHECK ("total_cents" >= 0 AND "required_deposit_cents" >= 0 AND "required_deposit_cents" <= "total_cents"
    AND "adults" >= 0 AND "children" >= 0 AND "currency" = 'COP');
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "savings_plan_installments" ADD CONSTRAINT "savings_plan_installments_amount_positive"
  CHECK ("amount_cents" > 0);

-- Ledger: signed amounts whose sign matches the kind, and exactly the source the kind implies.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_valid" CHECK (
  "currency" = 'COP' AND (
    ("kind" IN ('PAYMENT_APPROVED', 'MANUAL_ABONO') AND "amount_cents" > 0)
    OR ("kind" IN ('PAYMENT_VOIDED', 'REFUND') AND "amount_cents" < 0)
    OR ("kind" = 'ADJUSTMENT' AND "amount_cents" <> 0)
  )
);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_valid" CHECK (
  num_nonnulls("reservation_id", "savings_plan_id") >= 1 AND (
    ("kind" IN ('PAYMENT_APPROVED', 'PAYMENT_VOIDED') AND "payment_id" IS NOT NULL AND "manual_abono_id" IS NULL AND "refund_id" IS NULL)
    OR ("kind" = 'MANUAL_ABONO' AND "manual_abono_id" IS NOT NULL AND "refund_id" IS NULL)
    OR ("kind" = 'REFUND' AND "refund_id" IS NOT NULL AND "manual_abono_id" IS NULL)
    OR ("kind" = 'ADJUSTMENT' AND "payment_id" IS NULL AND "manual_abono_id" IS NULL AND "refund_id" IS NULL)
  )
);

-- Pricing data.
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_target_valid" CHECK (
  "amount_cents" >= 0
  AND num_nonnulls("package_id", "departure_id", "room_type_id", "tour_id", "transport_option_id", "add_on_id") = 1
);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_discount_valid" CHECK (
  "ends_at" > "starts_at" AND (
    ("discount_type" = 'PERCENT' AND "percent_bps" BETWEEN 1 AND 10000 AND "amount_off_cents" IS NULL)
    OR ("discount_type" = 'FIXED_AMOUNT' AND "amount_off_cents" > 0 AND "percent_bps" IS NULL)
  )
);
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_range_valid" CHECK ("ends_on" >= "starts_on");

-- Polymorphic links: exactly one target.
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_one_target"
  CHECK (num_nonnulls("hotel_id", "room_type_id", "tour_id", "transport_option_id", "add_on_id") = 1);
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_one_owner"
  CHECK (num_nonnulls("destination_id", "hotel_id", "tour_id") = 1);

-- Agency settings is a singleton row.
ALTER TABLE "agency_settings" ADD CONSTRAINT "agency_settings_singleton" CHECK ("id" = 1);

-- Append-only tables: UPDATE and DELETE are rejected. Corrections are new rows.
CREATE FUNCTION "rt_reject_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "rt_reject_mutation"();
CREATE TRIGGER "reservation_status_history_append_only" BEFORE UPDATE OR DELETE ON "reservation_status_history"
  FOR EACH ROW EXECUTE FUNCTION "rt_reject_mutation"();
CREATE TRIGGER "consent_records_append_only" BEFORE UPDATE OR DELETE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION "rt_reject_mutation"();
