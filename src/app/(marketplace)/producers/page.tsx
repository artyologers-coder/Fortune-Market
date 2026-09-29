import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { activeMembershipWhere } from "@/lib/producer-membership";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meet the Makers | Fortune Market",
  description:
    "Verified Sri Lankan home-based producers and small businesses on Fortune Market.",
};

export default async function ProducersPage() {
  let producers: {
    id: string;
    businessName: string;
    location: string;
    district: string;
    rating: number;
    totalReviews: number;
    _count: { products: number };
    products: { name: string }[];
  }[] = [];

  try {
    producers = await prisma.producer.findMany({
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
        _count: { select: { products: true } },
        products: { take: 1, select: { name: true }, where: { active: true } },
      },
      orderBy: { rating: "desc" },
    });
  } catch (error) {
    console.error("Failed to fetch producers:", error);
  }

  return (
    <div className="page-container">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <span className="text-gray-900">Meet the Makers</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Meet the Makers</h1>
        <p className="mt-2 text-gray-500">
          Verified home-based producers and small businesses, straight from Sri Lankan homes.
        </p>
      </div>

      {producers.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No verified producers yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {producers.map((producer) => (
            <Link
              key={producer.id}
              href={`/seller/${producer.id}`}
              className="card p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-100 text-lg font-bold text-accent-700">
                  {producer.businessName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-gray-900">
                    {producer.businessName}
                  </h2>
                  <span className="badge-verified">✓ Verified</span>
                </div>
              </div>
              <p className="mb-1 text-sm text-gray-500">
                {producer.location}
                {producer.district ? ` · ${producer.district}` : ""}
              </p>
              <p className="mb-3 text-xs text-gray-500 line-clamp-1">
                {producer.products[0]?.name ? `Makes ${producer.products[0].name}` : "Home-based maker"}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-accent">★</span>
                  <span className="font-medium">{producer.rating.toFixed(1)}</span>
                  <span className="text-gray-400">({producer.totalReviews})</span>
                </div>
                <span className="text-xs text-gray-500">{producer._count.products} products</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}