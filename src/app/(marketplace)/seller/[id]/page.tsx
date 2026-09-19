import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ProductImage } from "@/components/product/product-image";
import {
  visibleProducerProductWhere,
  membershipIsActive,
} from "@/lib/producer-membership";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const producer = await prisma.producer.findUnique({
      where: { id: params.id },
      select: { businessName: true },
    });
    return {
      title: producer ? `${producer.businessName} | Fortune Market` : "Seller",
    };
  } catch {
    return { title: "Seller" };
  }
}

export default async function SellerPage({ params }: Props) {
  let producer;
  try {
    producer = await prisma.producer.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, avatar: true } },
        _count: { select: { products: true } },
      },
    });
  } catch (error) {
    console.error("Failed to fetch seller:", error);
    notFound();
  }

  if (!producer) notFound();

  let reviewStats: { _avg: { rating: number | null }; _count: { _all: number } } = {
    _avg: { rating: null },
    _count: { _all: 0 },
  };
  let products: {
    id: string;
    name: string;
    price: number;
    rating: number;
    images: string;
    category: { name: string };
    producer: { verificationStatus: string };
  }[] = [];
  let ordersServed = 0;
  let offers: {
    id: string;
    title: string;
    titleSi: string;
    description: string;
    descriptionSi: string;
    discountPercent: number;
    startDate: Date;
    endDate: Date;
  }[] = [];

  try {
    const [reviewData, visibleProducts, servedOrders, activeOffers] = await Promise.all([
      prisma.review.aggregate({
        where: {
          approved: true,
          product: { producerId: producer.id, active: true, flagged: false },
        },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.product.findMany({
        where: {
          producerId: producer.id,
          active: true,
          flagged: false,
          ...visibleProducerProductWhere(),
        },
        include: {
          category: { select: { name: true } },
          producer: { select: { verificationStatus: true } },
        },
        orderBy: { rating: "desc" },
        take: 48,
      }),
      prisma.order.count({
        where: {
          items: { some: { product: { producerId: producer.id } } },
          paymentDone: true,
        },
      }),
      prisma.offer.findMany({
        where: {
          producerId: producer.id,
          status: "APPROVED",
          endDate: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    reviewStats = reviewData;
    products = visibleProducts;
    ordersServed = servedOrders;
    offers = activeOffers;
  } catch (error) {
    console.error("Failed to fetch seller data:", error);
  }

  const rating = reviewStats._avg.rating ?? producer.rating;
  const totalReviews = reviewStats._count._all || producer.totalReviews;
  const membershipActive = membershipIsActive(producer);

  return (
    <div className="page-container">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span>/</span>
        <span className="text-gray-900">{producer.businessName}</span>
      </div>

      <div className="card p-6 md:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
            {producer.businessName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {producer.businessName}
              </h1>
              {producer.verificationStatus === "APPROVED" && (
                <span className="badge-verified">✓ Verified</span>
              )}
              {membershipActive && (
                <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
                  Active Producer
                </span>
              )}
            </div>
            <p className="text-gray-500 mt-1">
              {producer.location}
              {producer.district ? ` · ${producer.district}` : ""}
            </p>
            <div className="flex items-center gap-1 text-sm mt-1">
              <span className="text-accent">★</span>
              <span className="font-medium">{rating.toFixed(1)}</span>
              <span className="text-gray-400">({totalReviews} reviews)</span>
              <span className="text-gray-300 mx-2">|</span>
              <span className="text-gray-500">
                Member since {new Date(producer.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <a className="btn-outline self-start md:self-center" href="#products">
            Browse Products
          </a>
        </div>

        {(producer.description || producer.businessNameSi) && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-1 mt-6">About</h3>
            <p className="text-gray-600 leading-relaxed">
              {producer.description || producer.businessNameSi}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        <div className="card p-6 text-center">
          <p className="text-2xl font-bold text-gray-900">{rating.toFixed(1)} ★</p>
          <p className="text-sm text-gray-500">{totalReviews} reviews</p>
        </div>
        <div className="card p-6 text-center">
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          <p className="text-sm text-gray-500">Products</p>
        </div>
        <div className="card p-6 text-center">
          <p className="text-2xl font-bold text-gray-900">{ordersServed}</p>
          <p className="text-sm text-gray-500">Orders Served</p>
        </div>
      </div>

      {offers.length > 0 && (
        <div className="mb-12">
          <h2 className="section-title">Special Offers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {offers.map((offer) => (
              <div key={offer.id} className="card overflow-hidden">
                <div className="bg-gradient-to-br from-primary-500 to-primary-700 text-white p-6">
                  <p className="text-4xl font-bold">{offer.discountPercent}% OFF</p>
                  <p className="text-primary-100 mt-1">
                    {new Date(offer.startDate).toLocaleDateString()} →{" "}
                    {new Date(offer.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {offer.titleSi || offer.title}
                  </h3>
                  {(offer.descriptionSi || offer.description) && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                      {offer.descriptionSi || offer.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 id="products" className="section-title">Products by {producer.businessName}</h2>
        {products.length === 0 ? (
          <p className="text-gray-500 text-center py-12">No products yet</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => (
              <Link key={product.id} href={`/product/${product.id}`} className="card">
                <ProductImage images={product.images} alt={product.name} />
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
        )}
      </div>
    </div>
  );
}