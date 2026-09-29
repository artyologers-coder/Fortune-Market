import Link from "next/link";

export interface CategoryCardItem {
  slug: string;
  name: string;
  nameSi: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  foods: "🥘",
  crafts: "🧶",
  naturals: "🌿",
  fashion: "👗",
};

export function CategoryCards({ cards }: { cards: CategoryCardItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {cards.map((card) => (
        <Link
          key={card.slug}
          href={`/category/${card.slug}`}
          className="group relative flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 shadow-sm ring-1 ring-black/10 transition-shadow hover:shadow-md"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-300/70 via-accent-400/60 to-accent-600/70" />
          <span
            className="pointer-events-none absolute -bottom-8 -right-6 select-none text-9xl opacity-10 blur-sm transition-transform duration-300 group-hover:scale-110"
            aria-hidden="true"
          >
            {CATEGORY_ICONS[card.slug] ?? "🎁"}
          </span>
          <div className="relative flex flex-col items-center px-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl ring-1 ring-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
              {CATEGORY_ICONS[card.slug] ?? "🎁"}
            </span>
            <p className="mt-3 text-lg font-bold leading-tight text-white">{card.name}</p>
            {card.nameSi && (
              <p className="mt-0.5 text-sm text-accent-200/90">{card.nameSi}</p>
            )}
            <p className="mt-2 text-xs font-medium text-accent-100 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              Shop now →
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}