import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 12);

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: "foods" },
      update: {},
      create: {
        name: "Fortune Foods",
        nameSi: "ෆෝචුන් ආහාර",
        slug: "foods",
        description: "Natural food products from Sri Lankan producers",
        descriptionSi: "ශ්‍රී ලාංකික නිෂ්පාදකයින්ගෙන් ස්වාභාවික ආහාර නිෂ්පාදන",
        image: "/images/categories/foods.jpg",
      },
    }),
    prisma.category.upsert({
      where: { slug: "crafts" },
      update: {},
      create: {
        name: "Fortune Crafts",
        nameSi: "ෆෝචුන් වෙළඳ භාණ්ඩ",
        slug: "crafts",
        description: "Handcrafted goods from local artisans",
        descriptionSi: "දේශීය වැඩ කරුවන්ගෙන් අත්පැති වෙළඳ භාණ්ඩ",
        image: "/images/categories/crafts.jpg",
      },
    }),
    prisma.category.upsert({
      where: { slug: "naturals" },
      update: {},
      create: {
        name: "Fortune Naturals",
        nameSi: "ෆෝචුන් ස්වාභාවික",
        slug: "naturals",
        description: "Natural personal care and wellness products",
        descriptionSi: "ස්වාභාවික පුද්ගලික සත්කාර හා සුවය නිෂ්පාදන",
        image: "/images/categories/naturals.jpg",
      },
    }),
    prisma.category.upsert({
      where: { slug: "fashion" },
      update: {},
      create: {
        name: "Fortune Fashion",
        nameSi: "ෆෝචුන් විලාසිතා",
        slug: "fashion",
        description: "Local fashion and traditional clothing",
        descriptionSi: "දේශීය විලාසිතා හා සම්ප්‍රදායික ඇඳුම්",
        image: "/images/categories/fashion.jpg",
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
      verificationStatus: "PENDING",
      rating: 0,
      totalReviews: 0,
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

  console.log("Seed completed:");
  console.log("  Categories: 4");
  console.log("  Producers: 3 (2 verified, 1 pending)");
  console.log("  Products: 5");
  console.log("");
  console.log("  Demo accounts (password: password123):");
  console.log("  Buyer:   buyer@fortune.lk");
  console.log("  Producer: kamal@fortune.lk");
  console.log("  Producer: nimali@fortune.lk");
  console.log("  Producer: sunil@fortune.lk (pending verification)");
  console.log("  Admin:   admin@fortune.lk");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
