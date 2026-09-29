-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'BUYER',
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessNameSi" TEXT NOT NULL,
    "description" TEXT,
    "descriptionSi" TEXT,
    "location" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "businessRegistrationNo" TEXT,
    "membershipId" TEXT,
    "membershipActivatedAt" TIMESTAMP(3),
    "membershipExpiresAt" TIMESTAMP(3),
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameSi" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "descriptionSi" TEXT,
    "image" TEXT,
    "markupPercentage" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameSi" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionSi" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "originalPrice" DOUBLE PRECISION,
    "codAmount" DOUBLE PRECISION,
    "codUnit" TEXT,
    "codUnitsPerKg" DOUBLE PRECISION,
    "codAdditionalKgRate" DOUBLE PRECISION,
    "certifications" TEXT NOT NULL DEFAULT '[]',
    "unit" TEXT NOT NULL,
    "unitSi" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "sourceSite" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT DEFAULT 'paused',
    "externalPrice" DOUBLE PRECISION,
    "externalStock" TEXT,
    "slug" TEXT,
    "brandLogoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCreative" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeShare" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSyncLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "oldPrice" DOUBLE PRECISION,
    "newPrice" DOUBLE PRECISION,
    "oldStock" TEXT,
    "newStock" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerSource" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourcePrice" DOUBLE PRECISION NOT NULL,
    "sourceStock" INTEGER,
    "sourceStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sourceRawData" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "syncFailCount" INTEGER NOT NULL DEFAULT 0,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperDomainProfile" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'json-ld',
    "selectorConfig" TEXT,
    "requiresJsRender" BOOLEAN NOT NULL DEFAULT true,
    "supplierWhatsAppNumber" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperDomainProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentDone" BOOLEAN NOT NULL DEFAULT false,
    "shippingName" TEXT NOT NULL,
    "shippingPhone" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "notes" TEXT,
    "forwardedToSupplierAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "codFee" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleSi" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionSi" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT,
    "adminId" TEXT,
    "producerId" TEXT NOT NULL,
    "productId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeApplication" (
    "id" TEXT NOT NULL,
    "applicationCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nic" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT NOT NULL,
    "province" TEXT,
    "preferredArea" TEXT,
    "coverageAreas" TEXT NOT NULL DEFAULT '[]',
    "experience" TEXT,
    "occupation" TEXT,
    "socialProfileLink" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankBranch" TEXT,
    "paymentMethodNotes" TEXT,
    "agreedTerms" BOOLEAN NOT NULL DEFAULT false,
    "agreedCommission" BOOLEAN NOT NULL DEFAULT false,
    "agreedPrivacy" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAccurate" BOOLEAN NOT NULL DEFAULT false,
    "agreementsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "infoRequestNote" TEXT,
    "infoRequestedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "representativeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepresentativeApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Representative" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nic" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT NOT NULL,
    "province" TEXT,
    "avatar" TEXT,
    "preferredArea" TEXT,
    "coverageAreas" TEXT NOT NULL DEFAULT '[]',
    "experience" TEXT,
    "occupation" TEXT,
    "socialProfileLink" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankBranch" TEXT,
    "paymentMethodNotes" TEXT,
    "assignedCity" TEXT,
    "assignedArea" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Representative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeLead" (
    "id" TEXT NOT NULL,
    "leadCode" TEXT NOT NULL,
    "representativeId" TEXT NOT NULL,
    "producerName" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "district" TEXT NOT NULL,
    "area" TEXT,
    "productCategory" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "statusLocked" BOOLEAN NOT NULL DEFAULT false,
    "duplicateSuspect" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfProducerId" TEXT,
    "duplicateNote" TEXT,
    "producerId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepresentativeLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProducerReferral" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "representativeId" TEXT NOT NULL,
    "leadId" TEXT,
    "referralCode" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'LINK',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "referredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "changedById" TEXT,
    "changeReason" TEXT,
    "previousRepresentativeId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProducerRegistrationPayment" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INITIAL',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "feeRequired" BOOLEAN NOT NULL DEFAULT true,
    "feeBasis" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "waiveReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "renewedPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerRegistrationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeCommission" (
    "id" TEXT NOT NULL,
    "commissionCode" TEXT NOT NULL,
    "representativeId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "registrationPaymentId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'INITIAL',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "eligibleAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "paymentMethod" TEXT,
    "paidById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "reversalOfId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepresentativeCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "payoutCode" TEXT NOT NULL,
    "representativeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "representativeId" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepresentativeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "producerAnnualRegistrationFee" INTEGER NOT NULL DEFAULT 1200,
    "representativeInitialCommission" INTEGER NOT NULL DEFAULT 700,
    "fortuneMarketInitialAllocation" INTEGER NOT NULL DEFAULT 500,
    "renewalCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "renewalCommissionAmount" INTEGER NOT NULL DEFAULT 0,
    "feeEnforcementMode" TEXT NOT NULL DEFAULT 'FORCE_OPEN',
    "feeEnforcementStartsAt" TIMESTAMP(3),
    "initialProducerTarget" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "RepresentativeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeSettingsRevision" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "producerAnnualRegistrationFee" INTEGER NOT NULL,
    "representativeInitialCommission" INTEGER NOT NULL,
    "fortuneMarketInitialAllocation" INTEGER NOT NULL,
    "renewalCommissionEnabled" BOOLEAN NOT NULL,
    "renewalCommissionAmount" INTEGER NOT NULL,
    "feeEnforcementMode" TEXT NOT NULL,
    "feeEnforcementStartsAt" TIMESTAMP(3),
    "initialProducerTarget" INTEGER,
    "reason" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepresentativeSettingsRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepresentativeGuideSection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "RepresentativeGuideSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Producer_userId_key" ON "Producer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Producer_membershipId_key" ON "Producer"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCreative_productId_key" ON "ProductCreative"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerSource_productId_key" ON "ResellerSource"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperDomainProfile_domain_key" ON "ScraperDomainProfile"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");

-- CreateIndex
CREATE INDEX "Conversation_buyerId_idx" ON "Conversation"("buyerId");

-- CreateIndex
CREATE INDEX "Conversation_adminId_idx" ON "Conversation"("adminId");

-- CreateIndex
CREATE INDEX "Conversation_producerId_idx" ON "Conversation"("producerId");

-- CreateIndex
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeApplication_applicationCode_key" ON "RepresentativeApplication"("applicationCode");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeApplication_userId_key" ON "RepresentativeApplication"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeApplication_representativeId_key" ON "RepresentativeApplication"("representativeId");

-- CreateIndex
CREATE INDEX "RepresentativeApplication_status_idx" ON "RepresentativeApplication"("status");

-- CreateIndex
CREATE INDEX "RepresentativeApplication_createdAt_idx" ON "RepresentativeApplication"("createdAt");

-- CreateIndex
CREATE INDEX "RepresentativeApplication_district_idx" ON "RepresentativeApplication"("district");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_code_key" ON "Representative"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_userId_key" ON "Representative"("userId");

-- CreateIndex
CREATE INDEX "Representative_status_idx" ON "Representative"("status");

-- CreateIndex
CREATE INDEX "Representative_district_idx" ON "Representative"("district");

-- CreateIndex
CREATE INDEX "Representative_phone_idx" ON "Representative"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeLead_leadCode_key" ON "RepresentativeLead"("leadCode");

-- CreateIndex
CREATE INDEX "RepresentativeLead_representativeId_status_idx" ON "RepresentativeLead"("representativeId", "status");

-- CreateIndex
CREATE INDEX "RepresentativeLead_representativeId_createdAt_idx" ON "RepresentativeLead"("representativeId", "createdAt");

-- CreateIndex
CREATE INDEX "RepresentativeLead_phone_idx" ON "RepresentativeLead"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ProducerReferral_producerId_key" ON "ProducerReferral"("producerId");

-- CreateIndex
CREATE INDEX "ProducerReferral_representativeId_idx" ON "ProducerReferral"("representativeId");

-- CreateIndex
CREATE INDEX "ProducerReferral_status_idx" ON "ProducerReferral"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProducerRegistrationPayment_renewedPaymentId_key" ON "ProducerRegistrationPayment"("renewedPaymentId");

-- CreateIndex
CREATE INDEX "ProducerRegistrationPayment_producerId_status_idx" ON "ProducerRegistrationPayment"("producerId", "status");

-- CreateIndex
CREATE INDEX "ProducerRegistrationPayment_status_idx" ON "ProducerRegistrationPayment"("status");

-- CreateIndex
CREATE INDEX "ProducerRegistrationPayment_kind_idx" ON "ProducerRegistrationPayment"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeCommission_commissionCode_key" ON "RepresentativeCommission"("commissionCode");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeCommission_reversalOfId_key" ON "RepresentativeCommission"("reversalOfId");

-- CreateIndex
CREATE INDEX "RepresentativeCommission_representativeId_status_idx" ON "RepresentativeCommission"("representativeId", "status");

-- CreateIndex
CREATE INDEX "RepresentativeCommission_status_idx" ON "RepresentativeCommission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeCommission_producerId_kind_key" ON "RepresentativeCommission"("producerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayout_payoutCode_key" ON "CommissionPayout"("payoutCode");

-- CreateIndex
CREATE INDEX "CommissionPayout_representativeId_status_idx" ON "CommissionPayout"("representativeId", "status");

-- CreateIndex
CREATE INDEX "CommissionPayoutItem_commissionId_idx" ON "CommissionPayoutItem"("commissionId");

-- CreateIndex
CREATE INDEX "CommissionPayoutItem_payoutId_idx" ON "CommissionPayoutItem"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayoutItem_commissionId_payoutId_key" ON "CommissionPayoutItem"("commissionId", "payoutId");

-- CreateIndex
CREATE INDEX "RepresentativeAuditLog_entityType_entityId_idx" ON "RepresentativeAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "RepresentativeAuditLog_representativeId_createdAt_idx" ON "RepresentativeAuditLog"("representativeId", "createdAt");

-- CreateIndex
CREATE INDEX "RepresentativeAuditLog_action_idx" ON "RepresentativeAuditLog"("action");

-- CreateIndex
CREATE INDEX "RepresentativeSettingsRevision_settingsId_createdAt_idx" ON "RepresentativeSettingsRevision"("settingsId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepresentativeGuideSection_slug_key" ON "RepresentativeGuideSection"("slug");

-- CreateIndex
CREATE INDEX "RepresentativeGuideSection_sortOrder_idx" ON "RepresentativeGuideSection"("sortOrder");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_subjectType_subjectId_idx" ON "Notification"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- AddForeignKey
ALTER TABLE "Producer" ADD CONSTRAINT "Producer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCreative" ADD CONSTRAINT "ProductCreative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeShare" ADD CONSTRAINT "CreativeShare_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "ProductCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSyncLog" ADD CONSTRAINT "StockSyncLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerSource" ADD CONSTRAINT "ResellerSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeApplication" ADD CONSTRAINT "RepresentativeApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeApplication" ADD CONSTRAINT "RepresentativeApplication_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeLead" ADD CONSTRAINT "RepresentativeLead_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerReferral" ADD CONSTRAINT "ProducerReferral_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerReferral" ADD CONSTRAINT "ProducerReferral_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerRegistrationPayment" ADD CONSTRAINT "ProducerRegistrationPayment_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeCommission" ADD CONSTRAINT "RepresentativeCommission_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeCommission" ADD CONSTRAINT "RepresentativeCommission_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeCommission" ADD CONSTRAINT "RepresentativeCommission_registrationPaymentId_fkey" FOREIGN KEY ("registrationPaymentId") REFERENCES "ProducerRegistrationPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutItem" ADD CONSTRAINT "CommissionPayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CommissionPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutItem" ADD CONSTRAINT "CommissionPayoutItem_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "RepresentativeCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeAuditLog" ADD CONSTRAINT "RepresentativeAuditLog_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepresentativeSettingsRevision" ADD CONSTRAINT "RepresentativeSettingsRevision_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "RepresentativeSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

