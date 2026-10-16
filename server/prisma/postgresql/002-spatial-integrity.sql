CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "DirectoryListing" ADD COLUMN "publicGeo" geography(Point,4326)
 GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("publicLongitude", "publicLatitude"),4326)::geography) STORED;
CREATE INDEX "DirectoryListing_publicGeo_gist" ON "DirectoryListing" USING gist("publicGeo");
CREATE INDEX "DirectoryListing_publicGeo_geometry_gist" ON "DirectoryListing" USING gist(("publicGeo"::geometry));
ALTER TABLE "DirectoryListing" ADD CONSTRAINT "directory_coordinates_valid" CHECK
 ("latitude" BETWEEN -34 AND 6 AND "longitude" BETWEEN -74 AND -28
 AND "publicLatitude" BETWEEN -34 AND 6 AND "publicLongitude" BETWEEN -74 AND -28);
ALTER TABLE "DirectoryListing" ADD CONSTRAINT "directory_state_valid" CHECK
 (status IN ('draft','pending','published','rejected','suspended'));
ALTER TABLE "DirectoryListing" ADD CONSTRAINT "directory_precision_valid" CHECK ("locationPrecision" IN ('exact','approximate'));
ALTER TABLE "DirectoryListing" ADD CONSTRAINT "directory_publication_consent" CHECK
 (status <> 'published' OR ("consentAt" IS NOT NULL AND "coordinatesConfirmedAt" IS NOT NULL));

-- Existing scheduledAt is legacy wall-clock encoded as UTC. Preserve it during
-- migration; do not silently reinterpret history. Occupancy uses wall-time ranges
-- consistently for all channels until a reviewed UTC backfill is approved.
UPDATE "Order" o SET "reservedDurationMinutes"=COALESCE(o."durationOverride",p.duration,30),
 "reservedBufferMinutes"=COALESCE(p."bufferTime",0), "priceCents"=round(o."totalPrice"::numeric*100)
 FROM "Product" p WHERE o."productId"=p.id;
UPDATE "Order" SET "reservedDurationMinutes"=30,"reservedBufferMinutes"=0 WHERE "reservedDurationMinutes" IS NULL;
ALTER TABLE "Order" ADD COLUMN "occupiedPeriod" tsrange GENERATED ALWAYS AS
 (CASE WHEN "scheduledAt" IS NOT NULL THEN tsrange("scheduledAt", "scheduledAt" + make_interval(mins => "reservedDurationMinutes" + "reservedBufferMinutes"), '[)') END) STORED;
ALTER TABLE "Order" ADD COLUMN "resourceRange" int4range GENERATED ALWAYS AS
 (CASE WHEN "professionalId" IS NULL THEN int4range(NULL,NULL,'()') ELSE int4range("professionalId","professionalId",'[]') END) STORED;
-- Global legacy bookings overlap every professional, never use NULL to bypass.
ALTER TABLE "Order" ADD CONSTRAINT "booking_no_overlap" EXCLUDE USING gist
 ("storeId" WITH =, "resourceRange" WITH &&, "occupiedPeriod" WITH &&)
 WHERE (status <> 'cancelled' AND "scheduledAt" IS NOT NULL);
CREATE FUNCTION agt_snapshot_booking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "Product";
BEGIN
 PERFORM pg_advisory_xact_lock(713901, NEW."storeId");
 IF NEW."productId" IS NOT NULL THEN
   SELECT * INTO p FROM "Product" WHERE id=NEW."productId" AND "storeId"=NEW."storeId";
   IF NOT FOUND THEN RAISE EXCEPTION 'service does not belong to store' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."professionalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Professional" WHERE id=NEW."professionalId" AND "storeId"=NEW."storeId") THEN
   RAISE EXCEPTION 'professional does not belong to store' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
   NEW."reservedDurationMinutes" := COALESCE(NEW."durationOverride",p.duration,30);
   NEW."reservedBufferMinutes" := COALESCE(p."bufferTime",0);
   NEW."priceCents" := round(NEW."totalPrice"::numeric*100);
 ELSIF NEW."durationOverride" IS DISTINCT FROM OLD."durationOverride" THEN
   NEW."reservedDurationMinutes" := COALESCE(NEW."durationOverride",p.duration,30);
 END IF;
 IF NEW."reservedDurationMinutes" < 1 OR NEW."reservedBufferMinutes" < 0 THEN RAISE EXCEPTION 'invalid duration' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_snapshot BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION agt_snapshot_booking();
-- Serialize schedule edits with booking transactions across every application replica.
CREATE FUNCTION agt_lock_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='Store' THEN PERFORM pg_advisory_xact_lock(713901,NEW.id);
 ELSE PERFORM pg_advisory_xact_lock(713901,COALESCE(NEW."storeId",OLD."storeId")); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lock_store_schedule BEFORE UPDATE ON "Store" FOR EACH ROW EXECUTE FUNCTION agt_lock_schedule();
CREATE TRIGGER lock_blocks BEFORE INSERT OR UPDATE OR DELETE ON "BlockedSlot" FOR EACH ROW EXECUTE FUNCTION agt_lock_schedule();
CREATE TRIGGER lock_products BEFORE UPDATE OR DELETE ON "Product" FOR EACH ROW EXECUTE FUNCTION agt_lock_schedule();
