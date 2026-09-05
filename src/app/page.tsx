import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function HomePage() {
  const dict = getDictionary("en");

  return (
    <div>
      <section className="bg-gradient-to-br from-primary-500 to-primary-700 text-white">
        <div className="page-container text-center">
          <Logo className="h-24 w-auto mx-auto mb-6 drop-shadow-lg" />
          <p className="text-lg md:text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            {dict.hero.subtitle}
          </p>
          <Link href="/search" className="btn-secondary inline-block">
            {dict.hero.cta}
          </Link>
        </div>
      </section>

      <section className="page-container">
        <h2 className="section-title text-center">{dict.categories.title}</h2>
        <CategoryCards dict={dict} />
      </section>

      <section className="page-container">
        <h2 className="section-title">{dict.common.verified} {dict.categories.title}</h2>
        <FeaturedProducers />
      </section>

      <section className="page-container">
        <h2 className="section-title">{dict.product.title}s</h2>
        <FeaturedProducts />
      </section>
    </div>
  );
}

function CategoryCards({ dict }: { dict: ReturnType<typeof getDictionary> }) {
  const categories = [
    { slug: "foods", name: dict.categories.foods, desc: dict.categories.foodsDesc, icon: "🍛" },
    { slug: "crafts", name: dict.categories.crafts, desc: dict.categories.craftsDesc, icon: "🎨" },
    { slug: "naturals", name: dict.categories.naturals, desc: dict.categories.naturalsDesc, icon: "🌿" },
    { slug: "fashion", name: dict.categories.fashion, desc: dict.categories.fashionDesc, icon: "👗" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/category/${cat.slug}`}
          className="card p-6 text-center hover:scale-[1.02] transition-transform"
        >
          <span className="text-4xl mb-3 block">{cat.icon}</span>
          <h3 className="font-semibold text-gray-900 mb-1">{cat.name}</h3>
          <p className="text-sm text-gray-500">{cat.desc}</p>
        </Link>
      ))}
    </div>
  );
}

async function FeaturedProducers() {
  let producers;
  try {
    producers = await prisma.producer.findMany({
      where: { verificationStatus: "APPROVED" },
      include: { user: { select: { name: true } } },
      orderBy: { rating: "desc" },
      take: 4,
    });
  } catch (error) {
    console.error("Failed to fetch producers:", error);
    return <p className="text-gray-500 text-center py-8">Unable to load producers</p>;
  }

  if (producers.length === 0) {
    return <p className="text-gray-500 text-center py-8">No verified producers yet</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {producers.map((producer) => (
        <div key={producer.id} className="card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold text-lg">
              {producer.businessName.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{producer.businessName}</h3>
              <span className="badge-verified">✓ Verified</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-2">{producer.location}</p>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-accent">★</span>
            <span className="font-medium">{producer.rating.toFixed(1)}</span>
            <span className="text-gray-400">({producer.totalReviews})</span>
          </div>
        </div>
      ))}
    </div>
  );
}

async function FeaturedProducts() {
  let products;
  try {
    products = await prisma.product.findMany({
      where: { active: true, flagged: false },
      include: {
        producer: { include: { user: { select: { name: true } } } },
        category: { select: { name: true, nameSi: true } },
      },
      orderBy: { rating: "desc" },
      take: 8,
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return <p className="text-gray-500 text-center py-8">Unable to load products</p>;
  }

  if (products.length === 0) {
    return <p className="text-gray-500 text-center py-8">No products yet</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {products.map((product) => (
        <Link key={product.id} href={`/product/${product.id}`} className="card">
          <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400 text-4xl">
            📦
          </div>
          <div className="p-4">
            <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">
              {product.name}
            </h3>
            <p className="text-xs text-gray-500 mb-2">{product.category.name}</p>
            <div className="flex items-center justify-between">
              <span className="font-bold text-primary">Rs. {product.price}</span>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-accent">★</span>
                <span>{product.rating.toFixed(1)}</span>
              </div>
            </div>
            {product.producer.verificationStatus === "APPROVED" && (
              <span className="badge-verified mt-2 text-[10px]">✓ Verified</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
