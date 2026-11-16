-- Commercial rules admin (additive). Lifecycle flag for seasons and age rules, optional package scope for seasons.
-- Existing rows keep their meaning: active defaults to true, so isFictitious alone still decides draft vs approved.
ALTER TABLE "seasons" ADD COLUMN "package_id" UUID;
ALTER TABLE "seasons" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "age_rules" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "seasons_package_id_idx" ON "seasons"("package_id");
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
