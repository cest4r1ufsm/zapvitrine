-- Per-store queues preserve conversation order without serializing all salons.
CREATE INDEX "WhatsAppInbox_store_pending_idx" ON "WhatsAppInbox" ("storeId", "createdAt", id)
 WHERE status = 'pending';
CREATE INDEX "WhatsAppInbox_interrupted_idx" ON "WhatsAppInbox" ("updatedAt")
 WHERE status = 'processing';
