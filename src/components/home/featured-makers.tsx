import Link from "next/link";
import type { Dictionary } from "@/lib/i18n";

export interface FeaturedMakerItem {
  id: string;
  businessName: string;
  location: string;
  district: string;
  rating: number;
  totalReviews: number;
  firstProduct: string | null;
}

interface FeaturedMakersProps {
  makers: FeaturedMakerItem[];
  home: Dictionary["home"];
  si: Dictionary["home"];
}

export function FeaturedMakers({ makers, home, si }: FeaturedMakersProps) {
  return (
    <section className="page-container">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="section-title mb-0">
          {home.makers}
          <span className="ml-3 text-lg font-semibold text-primary">{si.makers}</span>
        </h2>
        {makers.length > 0 && (
          <Link href="/producers" className="shrink-0 text-sm font-medium text-primary hover:underline">
            {home.viewAll} →
          </Link>
        )}
      </div>

      {makers.length === 0 ? (
        <p className="py-8 text-center text-gray-500">No verified producers yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {makers.map((maker) => (
            <Link
              key={maker.id}
              href={`/seller/${maker.id}`}
              className="card p-6 transition-transform hover:scale-[1.02]"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-lg font-bold text-accent-700">
                  {maker.businessName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">{maker.businessName}</h3>
                  <span className="badge-verified">✓ {home.trustVerified}</span>
                </div>
              </div>
              <p className="mb-1 text-sm text-gray-500">
                {maker.location}
                {maker.district ? ` · ${maker.district}` : ""}
              </p>
              <p className="mb-2 text-xs text-gray-500 line-clamp-1">
                {maker.firstProduct
                  ? `${home.madeBy} ${maker.firstProduct}`
                  : home.makesFallback}
              </p>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-accent">★</span>
                <span className="font-medium">{maker.rating.toFixed(1)}</span>
                <span className="text-gray-400">({maker.totalReviews})</span>
              </div>
              <p className="mt-3 text-xs font-medium text-primary">{home.visitShop} →</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}