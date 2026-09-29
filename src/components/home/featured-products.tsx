import Link from "next/link";
import { ProductImage } from "@/components/product/product-image";
import { formatLKR } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";

export interface FeaturedProductItem {
  id: string;
  name: string;
  price: number;
  rating: number;
  images: string | string[] | null | undefined;
  category: { name: string };
  producer: {
    businessName: string;
    verificationStatus: string;
    location: string;
  };
}

interface FeaturedProductsProps {
  products: FeaturedProductItem[];
  home: Dictionary["home"];
  si: Dictionary["home"];
}

export function FeaturedProducts({ products, home, si }: FeaturedProductsProps) {
  return (
    <section className="page-container">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="section-title mb-0">
          {home.featuredProducts}
          <span className="ml-3 text-lg font-semibold text-primary">{si.featuredProducts}</span>
        </h2>
        <Link href="/search" className="shrink-0 text-sm font-medium text-primary hover:underline">
          {home.viewAll} →
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="py-8 text-center text-gray-500">No products yet</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className="card">
              <ProductImage images={product.images} alt={product.name} />
              <div className="p-4">
                <h3 className="mb-1 line-clamp-2 text-sm font-medium text-gray-900">
                  {product.name}
                </h3>
                <p className="mb-2 text-xs text-gray-500">{product.category.name}</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary">{formatLKR(product.price)}</span>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-accent">★</span>
                    <span>{product.rating.toFixed(1)}</span>
                  </div>
                </div>
                <span className="mt-2 flex items-center gap-1 text-xs text-gray-500 line-clamp-1">
                  {home.madeBy} {product.producer.businessName} · {product.producer.location}
                  {product.producer.verificationStatus === "APPROVED" && (
                    <span className="badge-verified text-[10px]">✓</span>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}