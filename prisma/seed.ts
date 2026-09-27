import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash(
    process.env.SEED_DEMO_PASSWORD || "local-dev-seed-password-change-me",
    12
  );

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: "foods" },
      update: { markupPercentage: 15 },
      create: {
        name: "Fortune Foods",
        nameSi: "ෆෝචුන් ආහාර",
        slug: "foods",
        description: "Natural food products from Sri Lankan producers",
        descriptionSi: "ශ්‍රී ලාංකික නිෂ්පාදකයින්ගෙන් ස්වාභාවික ආහාර නිෂ්පාදන",
        image: "/images/categories/foods.jpg",
        markupPercentage: 15,
      },
    }),
    prisma.category.upsert({
      where: { slug: "crafts" },
      update: { markupPercentage: 20 },
      create: {
        name: "Fortune Crafts",
        nameSi: "ෆෝචුන් වෙළඳ භාණ්ඩ",
        slug: "crafts",
        description: "Handcrafted goods from local artisans",
        descriptionSi: "දේශීය වැඩ කරුවන්ගෙන් අත්පැති වෙළඳ භාණ්ඩ",
        image: "/images/categories/crafts.jpg",
        markupPercentage: 20,
      },
    }),
    prisma.category.upsert({
      where: { slug: "naturals" },
      update: { markupPercentage: 25 },
      create: {
        name: "Fortune Naturals",
        nameSi: "ෆෝචුන් ස්වාභාවික",
        slug: "naturals",
        description: "Natural personal care and wellness products",
        descriptionSi: "ස්වාභාවික පුද්ගලික සත්කාර හා සුවය නිෂ්පාදන",
        image: "/images/categories/naturals.jpg",
        markupPercentage: 25,
      },
    }),
    prisma.category.upsert({
      where: { slug: "fashion" },
      update: { markupPercentage: 30 },
      create: {
        name: "Fortune Fashion",
        nameSi: "ෆෝචුන් විලාසිතා",
        slug: "fashion",
        description: "Local fashion and traditional clothing",
        descriptionSi: "දේශීය විලාසිතා හා සම්ප්‍රදායික ඇඳුම්",
        image: "/images/categories/fashion.jpg",
        markupPercentage: 30,
      },
    }),
  ]);

  const producer1User = await prisma.user.upsert({
    where: { email: "kamal@fortune.lk" },
    update: {},
    create: {
      email: "kamal@fortune.lk",
      passwordHash,
      phone: "+94771234567",
      phoneVerified: true,
      role: "PRODUCER",
      name: "Kamal Perera",
    },
  });

  const producer2User = await prisma.user.upsert({
    where: { email: "nimali@fortune.lk" },
    update: {},
    create: {
      email: "nimali@fortune.lk",
      passwordHash,
      phone: "+94779876543",
      phoneVerified: true,
      role: "PRODUCER",
      name: "Nimali Silva",
    },
  });

  const producer3User = await prisma.user.upsert({
    where: { email: "sunil@fortune.lk" },
    update: {},
    create: {
      email: "sunil@fortune.lk",
      passwordHash,
      phone: "+94771112233",
      phoneVerified: true,
      role: "PRODUCER",
      name: "Sunil Fernando",
    },
  });

  const resellerUser = await prisma.user.upsert({
    where: { email: "reseller@fortune.lk" },
    update: {},
    create: {
      email: "reseller@fortune.lk",
      passwordHash,
      phone: "+94770000000",
      phoneVerified: true,
      role: "PRODUCER",
      name: "Fortune Market Reseller",
    },
  });

  const producer1 = await prisma.producer.upsert({
    where: { userId: producer1User.id },
    update: {},
    create: {
      userId: producer1User.id,
      businessName: "Kamal's Traditional Foods",
      businessNameSi: "කමල්ගේ සම්ප්‍රදායික ආහාර",
      description: "Traditional Sri Lankan spices and pickles made from family recipes",
      descriptionSi: "පවුල් වට්ටෝරු වලින් සාදන සම්ප්‍රදායික ශ්‍රී ලාංකික මිශ්‍රණ හා අච්චාරු",
      location: "Gampaha",
      district: "Gampaha",
      phone: "+94771234567",
      businessRegistrationNo: "PV00234567",
      membershipId: "FM-2026-0001",
      membershipActivatedAt: new Date(),
      membershipExpiresAt: new Date("2028-01-01T00:00:00.000Z"),
      verificationStatus: "APPROVED",
      verifiedAt: new Date(),
      rating: 4.5,
      totalReviews: 12,
    },
  });

  const producer2 = await prisma.producer.upsert({
    where: { userId: producer2User.id },
    update: {},
    create: {
      userId: producer2User.id,
      businessName: "Nimali's Herbal Garden",
      businessNameSi: "නිමලිගේ ඔෂධ උද්‍යානය",
      description: "Natural herbal products and Ayurvedic remedies",
      descriptionSi: "ස්වාභාවික ඔෂධ නිෂ්පාදන හා ආයුර්වේද ප්‍රතිකාර",
      location: "Kandy",
      district: "Kandy",
      phone: "+94779876543",
      businessRegistrationNo: "PV00244681",
      membershipId: "FM-2026-0002",
      membershipActivatedAt: new Date(),
      membershipExpiresAt: new Date("2028-01-01T00:00:00.000Z"),
      verificationStatus: "APPROVED",
      verifiedAt: new Date(),
      rating: 4.8,
      totalReviews: 24,
    },
  });

  const producer3 = await prisma.producer.upsert({
    where: { userId: producer3User.id },
    update: {},
    create: {
      userId: producer3User.id,
      businessName: "Sunil Craft House",
      businessNameSi: "සුනිල් වෙළඳ නිවහන",
      description: "Handmade batik and traditional Sri Lankan crafts",
      descriptionSi: "අතින් සාදන ලද බැටික් හා සම්ප්‍රදායික ශ්‍රී ලාංකික වෙළඳ භාණ්ඩ",
      location: "Matara",
      district: "Matara",
      phone: "+94771112233",
      businessRegistrationNo: "PV00378120",
      verificationStatus: "PENDING",
      rating: 0,
      totalReviews: 0,
    },
  });

  const resellerProducer = await prisma.producer.upsert({
    where: { userId: resellerUser.id },
    update: {},
    create: {
      userId: resellerUser.id,
      businessName: "Fortune Market Reseller",
      businessNameSi: "ෆෝචුන් වෙළඳපොළ වික්‍රේතා",
      description: "Official reseller account for imported products",
      descriptionSi: "ආනයන් නිෂ්පාදන සඳහා නියෝජිත රිසෙලර් ගිණුම",
      location: "Colombo",
      district: "Colombo",
      phone: "+94770000000",
      verificationStatus: "APPROVED",
      verifiedAt: new Date(),
      rating: 5.0,
      totalReviews: 0,
    },
  });

  await prisma.scraperDomainProfile.upsert({
    where: { domain: "shopzy.lk" },
    update: {},
    create: {
      domain: "shopzy.lk",
      strategy: "auto",
      selectorConfig: null,
      requiresJsRender: true,
      supplierWhatsAppNumber: "+94770000000",
      lastVerifiedAt: new Date(),
    },
  });

  const products = [
    {
      producerId: producer1.id,
      categoryId: categories[0].id,
      name: "Traditional Curry Powder",
      nameSi: "සම්ප්‍රදායික කරි පාං",
      description: "Authentic Sri Lankan curry powder made with hand-selected spices",
      descriptionSi: "අතින් තෝරාගත් මිශ්‍රණ වලින් සාදන සැබෑ ශ්‍රී ලාංකික කරි පාං",
      price: 450,
      originalPrice: 550,
      unit: "250g pack",
      unitSi: "250g පැකට්",
      images: "[]",
      stock: 50,
      rating: 4.5,
      totalReviews: 8,
    },
    {
      producerId: producer1.id,
      categoryId: categories[0].id,
      name: "Lunu Miris Paste",
      nameSi: "ලුණු මිරිස් පේස්ට්",
      description: "Spicy traditional chili paste, perfect with rice and hoppers",
      descriptionSi: "බත් හා හොප්පර් සමඟ සුදුසු, තද මිරිස් පේස්ට්",
      price: 320,
      unit: "200g jar",
      unitSi: "200g බඳුන",
      images: "[]",
      stock: 35,
      rating: 4.7,
      totalReviews: 15,
    },
    {
      producerId: producer2.id,
      categoryId: categories[2].id,
      name: "Herbal Hair Oil",
      nameSi: "ඔෂධ හිස් තෙල්",
      description: "Natural herbal hair oil with Bhringraj and Amla",
      descriptionSi: "Bhringraj හා Amla සහිත ස්වාභාවික ඔෂධ හිස් තෙල්",
      price: 680,
      unit: "100ml bottle",
      unitSi: "100ml බෝතලය",
      images: "[]",
      stock: 25,
      rating: 4.9,
      totalReviews: 20,
    },
    {
      producerId: producer2.id,
      categoryId: categories[2].id,
      name: "Natural Face Scrub",
      nameSi: "ස්වාභාවික මුහුණු ස්ක්‍රබ්",
      description: "Gentle exfoliating scrub with turmeric and sandalwood",
      descriptionSi: "කහ හා සන්දනය සහිත සැහැල්ලු ස්ක්‍රබ්",
      price: 550,
      unit: "150g tub",
      unitSi: "150g බදුන",
      images: "[]",
      stock: 40,
      rating: 4.6,
      totalReviews: 18,
    },
    {
      producerId: producer3.id,
      categoryId: categories[1].id,
      name: "Handmade Batik Wall Hanging",
      nameSi: "අතින් සාදන ලද බැටික් බිත්ති එල්ලීම",
      description: "Beautiful hand-dyed batik wall art featuring traditional Kandyan motifs",
      descriptionSi: "සම්ප්‍රදායික මහනුවර රටා සහිත සුන්දර අතින් වර්ණ කළ බැටික් බිත්ති කලාව",
      price: 2500,
      unit: "piece",
      unitSi: "කැබැල්ල",
      images: "[]",
      stock: 8,
      rating: 4.3,
      totalReviews: 5,
    },
  ];

  for (const product of products) {
    const existing = await prisma.product.findFirst({
      where: { name: product.name },
    });
    if (!existing) {
      await prisma.product.create({ data: product });
    }
  }

  await prisma.user.upsert({
    where: { email: "buyer@fortune.lk" },
    update: {},
    create: {
      email: "buyer@fortune.lk",
      passwordHash,
      phone: "+94775556677",
      phoneVerified: true,
      role: "BUYER",
      name: "Test Buyer",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@fortune.lk" },
    update: {},
    create: {
      email: "admin@fortune.lk",
      passwordHash,
      phone: "+94770001111",
      phoneVerified: true,
      role: "ADMIN",
      name: "Admin",
    },
  });

  // ---------------------------------------------------------------------------
  // Representative programme
  //
  // Only reference data lives here. Representatives and producers are created
  // through the real application flow, not faked by the seed, so the seed cannot
  // mask a bug in registration, referral attribution or commission creation.
  // ---------------------------------------------------------------------------

  const representativeSettings = await prisma.representativeSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      producerAnnualRegistrationFee: 1200,
      representativeInitialCommission: 700,
      fortuneMarketInitialAllocation: 500,
      renewalCommissionEnabled: false,
      renewalCommissionAmount: 0,
      // Start with the gate open so the initial producer cohort can be seeded
      // for free. An admin closes it when the target is reached.
      feeEnforcementMode: "AUTO",
      feeEnforcementStartsAt: null,
      initialProducerTarget: null,
      currency: "LKR",
    },
  });

  // The initial policy is recorded as a revision so the price in force on any
  // given date is reconstructable from day one, not just from the first change.
  const existingRevisionCount = await prisma.representativeSettingsRevision.count({
    where: { settingsId: "singleton" },
  });
  if (existingRevisionCount === 0) {
    await prisma.representativeSettingsRevision.create({
      data: {
        settingsId: "singleton",
        producerAnnualRegistrationFee: representativeSettings.producerAnnualRegistrationFee,
        representativeInitialCommission: representativeSettings.representativeInitialCommission,
        fortuneMarketInitialAllocation: representativeSettings.fortuneMarketInitialAllocation,
        renewalCommissionEnabled: representativeSettings.renewalCommissionEnabled,
        renewalCommissionAmount: representativeSettings.renewalCommissionAmount,
        feeEnforcementMode: representativeSettings.feeEnforcementMode,
        feeEnforcementStartsAt: representativeSettings.feeEnforcementStartsAt,
        initialProducerTarget: representativeSettings.initialProducerTarget,
        reason: "Initial representative programme policy",
      },
    });
  }

  const guideSections = [
    {
      slug: "welcome",
      title: "Welcome to the Fortune Market Representative Programme",
      sortOrder: 1,
      body: `You have joined Fortune Market as a Producer Acquisition Representative. Your job is to find Sri Lankan producers who make good products, sign them up to sell on Fortune Market, and help them get their first sales.

How you are paid
For every producer you bring in who completes registration and pays the annual registration fee, you earn Rs. 700. The remaining Rs. 500 of the Rs. 1,200 annual fee is retained by Fortune Market to run the platform.

The Rs. 700 is yours regardless of what happens to the producer's sales, and it is recorded against you permanently as soon as the producer is approved.`,
    },
    {
      slug: "how-to-acquire",
      title: "How to acquire a producer",
      sortOrder: 2,
      body: `1. Create a Producer Lead for every business you visit or speak to. Record the contact name, phone number, district and area.

2. Give the producer your referral link or QR code. Your link contains your unique representative code, for example FM-REP-00001. When the producer registers using it, the producer is permanently linked to you.

3. Help the producer complete their registration and pay the annual registration fee by bank transfer.

4. Track progress from your dashboard. When an admin approves the producer, your commission is created automatically. You do not need to submit a claim.

Important: make sure the producer registers with their own email address, phone number and business name. Registering on someone else's behalf, or using your own details, will not earn a commission.`,
    },
    {
      slug: "commission-rules",
      title: "Commission rules",
      sortOrder: 3,
      body: `You earn Rs. 700 for each producer you refer who is approved with a settled registration payment.

A commission is created only when all of the following are true:
- The producer registered through your referral link, and the referral is locked to you.
- The producer's account has been approved by an admin.
- The producer's registration payment is marked paid, or an admin has formally waived it.

Your commission amount is fixed at the moment it is created. If the registration fee changes later, your existing commission is not affected.

Commission is never paid twice for the same producer registration. Year-2 renewal commission is currently disabled and is never paid automatically.`,
    },
    {
      slug: "payment-process",
      title: "How and when you are paid",
      sortOrder: 4,
      body: `Commissions move through the following stages: Eligible, Approved, Payable, then Paid.

Once a payout is processed to your registered bank account, the payout reference is recorded against your account so you can reconcile it with your bank statement.

If any commission is ever reversed, for example because a producer's registration was found to be a duplicate, the reversal is shown in your history with a reason. Your other commissions are not affected.`,
    },
    {
      slug: "account-status",
      title: "Account status and what you can still do",
      sortOrder: 5,
      body: `ACTIVE
You can create leads, use your referral link and earn commission normally.

SUSPENDED
Your existing records and commission history stay available to you. You cannot create new leads, and your referral link will no longer bring in new producers. Contact Fortune Market Admin to discuss reinstatement.

INACTIVE
Your account is closed. Your records and commission history are retained. Contact Fortune Market Admin.`,
    },
    {
      slug: "faq",
      title: "Frequently asked questions",
      sortOrder: 6,
      body: `What happens if a producer I referred is also found by another representative?
Only the first locked referral is kept. Every registration checks for an existing producer with the same phone number, email or business name, and you are told to contact an admin rather than having the record silently reassigned.

I registered a lead but the producer never registered. Can I delete it?
You can mark a lead as not interested. Nothing you have entered is deleted, so the history of your outreach is preserved.

My referral link is not working. What should I check?
First check your account status. If it is suspended, your link will not bring in new producers. If it is active, contact Admin with the code shown on your dashboard.

Do I pay anything to join?
No. There is no joining fee. You are paid only when producers you refer are approved.`,
    },
  ];

  for (const section of guideSections) {
    await prisma.representativeGuideSection.upsert({
      where: { slug: section.slug },
      update: { title: section.title, body: section.body, sortOrder: section.sortOrder },
      create: { ...section, visible: true },
    });
  }

  console.log("Seed completed:");
  console.log("  Categories: 4 (with markup percentages)");
  console.log("  Producers: 4 (3 regular + 1 reseller, all verified except 1)");
  console.log("  Products: 5");
  console.log("  ScraperDomainProfile: shopzy.lk");
  console.log(`  RepresentativeSettings: fee Rs. ${representativeSettings.producerAnnualRegistrationFee} (gate ${representativeSettings.feeEnforcementMode})`);
  console.log(`  RepresentativeGuideSections: ${guideSections.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });