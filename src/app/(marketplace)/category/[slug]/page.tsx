import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

type ProductWithProducer = Prisma.ProductGetPayload<{
  include: { producer: { include: { user: { select: { name: true } } } } };
}>;

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const category = await prisma.category.findUnique({ where: { slug: params.slug } });
    return { title: category ? `${category.nameSi} | Fortune Market` : "Category" };
  } catch {
    return { title: "Category" };
  }
}

export default async function CategoryPage({ params }: Props) {
  let category;
  try {
    category = await prisma.category.findUnique({
      where: { slug: params.slug },
    });
  } catch (error) {
    console.error("Failed to fetch category:", error);
    notFound();
  }

  if (!category) notFound();

  let products: ProductWithProducer[] = [];
  try {
    products = await prisma.product.findMany({
      where: { categoryId: category.id, active: true, flagged: false },
      include: {
        producer: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);
  }

  return (
    <div className="page-container">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <span className="text-gray-900">{category.nameSi}</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{category.nameSi}</h1>
        {category.descriptionSi && (
          <p className="text-gray-500 mt-2">{category.descriptionSi}</p>
        )}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No products in this category yet</p>
          <Link href="/search" className="btn-primary inline-block mt-4">
            Browse All Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className="card">
              <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400 text-4xl">
                📦
              </div>
              <div className="p-4">
                <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">
                  {product.nameSi}
                </h3>
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
      )}
    </div>
  );
}
