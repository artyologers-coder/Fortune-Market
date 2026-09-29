import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { activeMembershipWhere, visibleProducerProductWhere } from "@/lib/producer-membership";
import { Hero, type HeroProduct } from "@/components/home/hero";
import { TrustBand } from "@/components/home/trust-band";
import {
  CategoryCards,
  type CategoryCardItem,
} from "@/components/home/category-cards";
import {
  FeaturedProducts,
  type FeaturedProductItem,
} from "@/components/home/featured-products";
import {
  FeaturedMakers,
  type FeaturedMakerItem,
} from "@/components/home/featured-makers";

export const dynamic = "force-dynamic";

const CATEGORY_SLUGS = ["foods", "crafts", "naturals", "fashion"];

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type ProductRow = {
  id: string;
  name: string;
  price: number;
  rating: number;
  images: string | null;
  producer: {
    businessName: string;
    verificationStatus: string;
    location: string;
  };
  category: { name: string; slug: string };
};

type MakerRow = {
  id: string;
  businessName: string;
  location: string;
  district: string;
  rating: number;
  totalReviews: number;
  products: { name: string }[];
};

type CategoryRow = {
  slug: string;
  name: string;
  nameSi: string;
};

export default async function HomePage() {
  const home = getDictionary("en").home;
  const si = getDictionary("si").home;

  let products: ProductRow[] = [];
  let makers: MakerRow[] = [];
  let categories: CategoryRow[] = [];

  try {
    const [productRows, makerRows, categoryRows] = await Promise.all([
      prisma.product.findMany({
        where: {
          active: true,
          flagged: false,
          ...visibleProducerProductWhere(),
        },
        select: {
          id: true,
          name: true,
          price: true,
          rating: true,
          images: true,
          producer: {
            select: {
              businessName: true,
              verificationStatus: true,
              location: true,
            },
          },
          category: { select: { name: true, slug: true } },
        },
        orderBy: { rating: "desc" },
        take: 32,
      }),
      prisma.producer.findMany({
        where: {
          verificationStatus: "APPROVED",
          ...activeMembershipWhere(),
        },
        select: {
          id: true,
          businessName: true,
          location: true,
          district: true,
          rating: true,
          totalReviews: true,
          products: { take: 1, select: { name: true }, where: { active: true } },
        },
        orderBy: { rating: "desc" },
        take: 12,
      }),
      prisma.category.findMany({
        where: { slug: { in: CATEGORY_SLUGS } },
        select: { slug: true, name: true, nameSi: true },
      }),
    ]);

    products = productRows;
    makers = makerRows;
    categories = categoryRows;
  } catch (error) {
    console.error("Failed to fetch homepage data:", error);
  }

  const shuffledProducts = shuffle(products);
  const shuffledMakers = shuffle(makers);

  const heroProducts: HeroProduct[] = shuffledProducts.slice(0, 4).map((p) => ({
    id: p.id,
    name: p.name,
    images: p.images,
    producer: p.producer,
  }));

  const featuredProducts: FeaturedProductItem[] = shuffledProducts.slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    rating: p.rating,
    images: p.images,
    category: p.category,
    producer: p.producer,
  }));

  const categoryCards: CategoryCardItem[] = CATEGORY_SLUGS.map((slug) => {
    const category = categories.find((c) => c.slug === slug);
    return {
      slug,
      name: category?.name ?? slug,
      nameSi: category?.nameSi ?? "",
    };
  });

  const featuredMakers: FeaturedMakerItem[] = shuffledMakers.slice(0, 4).map((m) => ({
    id: m.id,
    businessName: m.businessName,
    location: m.location,
    district: m.district,
    rating: m.rating,
    totalReviews: m.totalReviews,
    firstProduct: m.products[0]?.name ?? null,
  }));

  return (
    <div>
      <Hero home={home} si={si} products={heroProducts} />
      <TrustBand home={home} />
      <section className="page-container">
        <CategoryCards cards={categoryCards} />
      </section>
      <FeaturedProducts
        products={featuredProducts}
        home={home}
        si={si}
      />
      <FeaturedMakers makers={featuredMakers} home={home} si={si} />
    </div>
  );
}