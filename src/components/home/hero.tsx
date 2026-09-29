import Link from "next/link";
import { ProductImage } from "@/components/product/product-image";
import type { Dictionary } from "@/lib/i18n";

export interface HeroProduct {
  id: string;
  name: string;
  images: string | string[] | null | undefined;
  producer: { businessName: string; location: string };
}

interface HeroProps {
  home: Dictionary["home"];
  si: Dictionary["home"];
  products: HeroProduct[];
}

export function Hero({ home, si, products }: HeroProps) {
  const collage = products.slice(0, 4);

  return (
    <section className="relative overflow-hidden bg-[#FBF4E6]">
      <div className="pointer-events-none absolute -top-28 -right-24 h-80 w-80 rounded-full bg-primary-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-accent-100/50 blur-3xl" />

      <div className="page-container relative grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2 text-sm font-bold text-primary-700 shadow-sm ring-2 ring-accent-400">
            <span className="text-xl" aria-hidden="true">🇱🇰</span>
            {home.madeIn}
            <span className="font-medium text-gray-500">· ලංකාවේ සාදන ලද</span>
          </p>
          <h1 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-extrabold leading-snug text-gray-900">
            {home.tagline}
          </h1>
          <p className="mt-3 text-base md:text-lg text-gray-600">{si.tagline}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/search" className="btn-primary">
              {home.ctaPrimary}
            </Link>
            <Link href="/producer/onboarding" className="btn-outline">
              {home.ctaSecondary}
            </Link>
          </div>
        </div>

        {collage.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {collage.map((product) => (
              <Link
                key={product.id}
                href={`/product/${product.id}`}
                className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              >
                <ProductImage
                  images={product.images}
                  alt={product.name}
                  emojiClass="text-3xl"
                />
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-500 line-clamp-1">
                    {product.producer.businessName} · {product.producer.location}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}