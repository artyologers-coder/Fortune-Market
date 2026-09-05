import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductDetail } from "@/components/product/product-detail";
import { ReviewSection } from "@/components/product/review-section";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const product = await prisma.product.findUnique({ where: { id: params.id } });
    return { title: product ? `${product.name} | Fortune Market` : "Product" };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({ params }: Props) {
  let product;
  try {
    product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        producer: { include: { user: { select: { name: true } } } },
        category: { select: { name: true, nameSi: true, slug: true } },
      },
    });
  } catch (error) {
    console.error("Failed to fetch product:", error);
    notFound();
  }

  if (!product) notFound();

  let relatedProducts: { id: string; name: string; price: number; rating: number; images: string; categoryId: string }[] = [];
  try {
    relatedProducts = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        active: true,
        flagged: false,
      },
      take: 4,
    });
  } catch (error) {
    console.error("Failed to fetch related products:", error);
  }

  return (
    <div className="page-container">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span>/</span>
        <Link href={`/category/${product.category.slug}`} className="hover:text-primary">
          {product.category.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900">{product.name}</span>
      </div>

      <ProductDetail product={JSON.parse(JSON.stringify(product))} />

      <ReviewSection productId={product.id} />

      {relatedProducts.length > 0 && (
        <section className="mt-12">
          <h2 className="section-title">Related Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedProducts.map((rp) => (
              <Link key={rp.id} href={`/product/${rp.id}`} className="card">
                <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400 text-3xl">
                  📦
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm text-gray-900 line-clamp-2">{rp.name}</h3>
                  <span className="font-bold text-primary text-sm">Rs. {rp.price}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
