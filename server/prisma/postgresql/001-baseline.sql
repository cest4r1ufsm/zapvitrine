-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'business',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "themeColor" TEXT NOT NULL DEFAULT '#6C63FF',
    "businessHours" TEXT,
    "schedulingConfig" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'free',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionSource" TEXT,
    "subscriptionExpiresAt" TIMESTAMP(3),
    "playPurchaseToken" TEXT,
    "playProductId" TEXT,
    "botEnabled" BOOLEAN NOT NULL DEFAULT false,
    "botGreeting" TEXT,
    "botAwayMessage" TEXT,
    "botPhoneId" TEXT,
    "botToken" TEXT,
    "botWebhookToken" TEXT,
    "officialWabaId" TEXT,
    "officialPhoneId" TEXT,
    "officialToken" TEXT,
    "officialTokenExpiresAt" TIMESTAMP(3),
    "officialStatus" TEXT NOT NULL DEFAULT 'disconnected',
    "officialDisplayPhone" TEXT,
    "officialVerifiedName" TEXT,
    "officialLastError" TEXT,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSignupState" (
    "id" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppSignupState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppInbox" (
    "id" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "storeId" INTEGER,
    "state" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppDelivery" (
    "id" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWorkerLease" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppWorkerLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "bufferTime" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER,
    "professionalId" INTEGER,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerAddress" TEXT,
    "scheduledTime" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationOverride" INTEGER,
    "reservedDurationMinutes" INTEGER,
    "reservedBufferMinutes" INTEGER,
    "priceCents" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedSlot" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "professionalId" INTEGER,
    "date" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "isFullDay" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryListing" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL DEFAULT '',
    "municipalityCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "publicLatitude" DOUBLE PRECISION NOT NULL,
    "publicLongitude" DOUBLE PRECISION NOT NULL,
    "locationPrecision" TEXT NOT NULL DEFAULT 'exact',
    "timeZone" TEXT NOT NULL,
    "hoursJson" TEXT NOT NULL DEFAULT '{}',
    "holidayHoursJson" TEXT NOT NULL DEFAULT '{}',
    "coordinatesConfirmedAt" TIMESTAMP(3),
    "onlineBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "consentAt" TIMESTAMP(3),
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryListingService" (
    "listingId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "DirectoryListingService_pkey" PRIMARY KEY ("listingId","slug")
);

-- CreateTable
CREATE TABLE "DirectoryMunicipality" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryMunicipality_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "DirectoryReport" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryAudit" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryQuota" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryQuota_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTag" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ServiceTag_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "ProductServiceTag" (
    "productId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "ProductServiceTag_pkey" PRIMARY KEY ("productId","slug")
);

-- CreateTable
CREATE TABLE "DirectoryFavorite" (
    "userId" INTEGER NOT NULL,
    "listingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryFavorite_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "PublicBooking" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "listingId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryReview" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderationReason" TEXT,
    "response" TEXT,
    "responseStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Store_userId_key" ON "Store"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_officialPhoneId_key" ON "Store"("officialPhoneId");

-- CreateIndex
CREATE INDEX "WhatsAppInbox_status_availableAt_idx" ON "WhatsAppInbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "Product_storeId_active_price_idx" ON "Product"("storeId", "active", "price");

-- CreateIndex
CREATE UNIQUE INDEX "Client_storeId_phone_key" ON "Client"("storeId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryListing_publicId_key" ON "DirectoryListing"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryListing_storeId_key" ON "DirectoryListing"("storeId");

-- CreateIndex
CREATE INDEX "DirectoryListing_status_municipalityCode_idx" ON "DirectoryListing"("status", "municipalityCode");

-- CreateIndex
CREATE INDEX "DirectoryListing_status_publicLatitude_publicLongitude_idx" ON "DirectoryListing"("status", "publicLatitude", "publicLongitude");

-- CreateIndex
CREATE INDEX "DirectoryListingService_slug_listingId_idx" ON "DirectoryListingService"("slug", "listingId");

-- CreateIndex
CREATE INDEX "DirectoryMunicipality_uf_searchName_idx" ON "DirectoryMunicipality"("uf", "searchName");

-- CreateIndex
CREATE INDEX "DirectoryMunicipality_searchName_idx" ON "DirectoryMunicipality"("searchName");

-- CreateIndex
CREATE INDEX "DirectoryReport_status_createdAt_idx" ON "DirectoryReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryReport_listingId_userId_key" ON "DirectoryReport"("listingId", "userId");

-- CreateIndex
CREATE INDEX "DirectoryAudit_listingId_createdAt_idx" ON "DirectoryAudit"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectoryQuota_expiresAt_idx" ON "DirectoryQuota"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ProductServiceTag_slug_productId_idx" ON "ProductServiceTag"("slug", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicBooking_orderId_key" ON "PublicBooking"("orderId");

-- CreateIndex
CREATE INDEX "PublicBooking_userId_createdAt_idx" ON "PublicBooking"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicBooking_userId_idempotencyKey_key" ON "PublicBooking"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryReview_bookingId_key" ON "DirectoryReview"("bookingId");

-- CreateIndex
CREATE INDEX "DirectoryReview_listingId_status_createdAt_idx" ON "DirectoryReview"("listingId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSignupState" ADD CONSTRAINT "WhatsAppSignupState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppInbox" ADD CONSTRAINT "WhatsAppInbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryListing" ADD CONSTRAINT "DirectoryListing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryListingService" ADD CONSTRAINT "DirectoryListingService_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DirectoryListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryReport" ADD CONSTRAINT "DirectoryReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DirectoryListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductServiceTag" ADD CONSTRAINT "ProductServiceTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductServiceTag" ADD CONSTRAINT "ProductServiceTag_slug_fkey" FOREIGN KEY ("slug") REFERENCES "ServiceTag"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryFavorite" ADD CONSTRAINT "DirectoryFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryFavorite" ADD CONSTRAINT "DirectoryFavorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DirectoryListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBooking" ADD CONSTRAINT "PublicBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBooking" ADD CONSTRAINT "PublicBooking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBooking" ADD CONSTRAINT "PublicBooking_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DirectoryListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryReview" ADD CONSTRAINT "DirectoryReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "PublicBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryReview" ADD CONSTRAINT "DirectoryReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DirectoryListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

