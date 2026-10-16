-- Consumer integrity is additive after the national directory baseline.
ALTER TABLE "DirectoryReview" ADD CONSTRAINT review_rating_valid CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "DirectoryReview" ADD CONSTRAINT review_status_valid CHECK (status IN ('pending','published','rejected'));
ALTER TABLE "DirectoryReview" ADD CONSTRAINT review_response_status_valid CHECK ("responseStatus" IN ('none','pending','published','rejected'));
ALTER TABLE "DirectoryReview" ADD CONSTRAINT review_text_valid CHECK (length(text) BETWEEN 10 AND 1500);
ALTER TABLE "PublicBooking" ADD CONSTRAINT booking_idempotency_valid CHECK ("idempotencyKey" ~ '^[a-zA-Z0-9_-]{16,80}$' AND "requestHash" ~ '^[a-f0-9]{64}$');
CREATE OR REPLACE FUNCTION agt_public_booking_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE listing "DirectoryListing"; appointment "Order"; merchant integer;
BEGIN
 SELECT * INTO listing FROM "DirectoryListing" WHERE id=NEW."listingId";
 SELECT * INTO appointment FROM "Order" WHERE id=NEW."orderId";
 IF listing.id IS NULL OR appointment.id IS NULL OR appointment."storeId" <> listing."storeId" THEN
  RAISE EXCEPTION 'booking tenant mismatch' USING ERRCODE='23514';
 END IF;
 SELECT "userId" INTO merchant FROM "Store" WHERE id=listing."storeId";
 IF merchant=NEW."userId" THEN RAISE EXCEPTION 'merchant cannot reserve own public listing' USING ERRCODE='23514'; END IF;
 IF appointment."scheduledAt" IS NULL OR appointment."totalPrice" IS NULL OR appointment."totalPrice" < 0 OR NEW."timeZone" <> listing."timeZone" THEN
  RAISE EXCEPTION 'invalid public booking snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER public_booking_integrity BEFORE INSERT OR UPDATE OF "userId","orderId","listingId","timeZone" ON "PublicBooking" FOR EACH ROW EXECUTE FUNCTION agt_public_booking_integrity();
CREATE OR REPLACE FUNCTION agt_review_verified_booking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE booking "PublicBooking"; appointment "Order";
BEGIN
 SELECT * INTO booking FROM "PublicBooking" WHERE id=NEW."bookingId";
 SELECT * INTO appointment FROM "Order" WHERE id=booking."orderId";
 IF booking.id IS NULL OR booking."listingId" <> NEW."listingId" OR appointment.status <> 'completed' THEN
  RAISE EXCEPTION 'review requires completed booking for same listing' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_verified_booking BEFORE INSERT OR UPDATE OF "bookingId","listingId" ON "DirectoryReview" FOR EACH ROW EXECUTE FUNCTION agt_review_verified_booking();
