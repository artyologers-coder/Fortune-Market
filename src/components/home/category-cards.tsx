import Link from "next/link";

export interface CategoryCardItem {
  slug: string;
  name: string;
  nameSi: string;
  image: string | null;
}

export function CategoryCards({ cards }: { cards: CategoryCardItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {cards.map((card) => (
        <Link
          key={card.slug}
          href={`/category/${card.slug}`}
          className="group relative h-44 overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5"
        >
          {card.image ? (
            <img
              src={card.image}
              alt={card.name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary-400 to-primary-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-lg font-bold leading-tight text-white">{card.name}</p>
            {card.nameSi && (
              <p className="mt-0.5 text-sm text-primary-50/90">{card.nameSi}</p>
            )}
            <p className="mt-1 text-xs font-medium text-white/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              Shop now →
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}