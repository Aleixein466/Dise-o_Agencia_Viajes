-- Manual cupos history (additive). One append-only row per capacity change, manual hold or manual release.
-- held + sold <= capacity stays enforced by "departures_capacity_check"; this table never stores supplier inventory.
-- CreateEnum
CREATE TYPE "DepartureChangeKind" AS ENUM ('CREATED', 'CAPACITY', 'HOLD', 'RELEASE');

-- CreateTable
CREATE TABLE "departure_seat_changes" (
    "id" UUID NOT NULL,
    "departure_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" "DepartureChangeKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "capacity_after" INTEGER NOT NULL,
    "held_after" INTEGER NOT NULL,
    "sold_after" INTEGER NOT NULL,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departure_seat_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departure_seat_changes_departure_id_created_at_idx" ON "departure_seat_changes"("departure_id", "created_at");

-- AddForeignKey
ALTER TABLE "departure_seat_changes" ADD CONSTRAINT "departure_seat_changes_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_seat_changes" ADD CONSTRAINT "departure_seat_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hold and release deltas are never zero and snapshots are never negative.
ALTER TABLE "departure_seat_changes" ADD CONSTRAINT "departure_seat_changes_values_check" CHECK ("capacity_after" >= 0 AND "held_after" >= 0 AND "sold_after" >= 0 AND ("kind" IN ('CREATED', 'CAPACITY') OR "delta" <> 0));
