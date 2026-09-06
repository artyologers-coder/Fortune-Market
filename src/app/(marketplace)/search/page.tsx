"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ProductImage } from "@/components/product/product-image";

interface Product {
  id: string;
  name: string;
  nameSi: string;
  price: number;
  originalPrice: number | null;
  rating: number;
  totalReviews: number;
  images: string[];
  producer: {
    businessName: string;
    verificationStatus: string;
    user: { name: string };
  };
  category: { name: string; nameSi: string; slug: string };
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (sort) params.set("sort", sort);
      params.set("page", page.toString());

      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setLoading(false);
    }

    fetchProducts();
  }, [query, category, sort, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  const categories = [
    { slug: "", label: "All" },
    { slug: "foods", label: "Foods" },
    { slug: "crafts", label: "Crafts" },
    { slug: "naturals", label: "Naturals" },
    { slug: "fashion", label: "Fashion" },
  ];

  return (
    <div className="page-container">
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary">
            Search
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 mb-6">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => { setCategory(cat.slug); setPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              category === cat.slug
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 mb-6">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">Sort: Newest</option>
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="rating">Highest Rated</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No products found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => (
              <Link key={product.id} href={`/product/${product.id}`} className="card">
                <ProductImage images={product.images} alt={product.name} />
                <div className="p-4">
                  <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-xs text-gray-500 mb-2">{product.category.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">Rs. {product.price}</span>
                    {product.originalPrice && (
                      <span className="text-xs text-gray-400 line-through">
                        Rs. {product.originalPrice}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-accent">★</span>
                      <span>{product.rating.toFixed(1)}</span>
                      <span className="text-gray-400">({product.totalReviews})</span>
                    </div>
                    {product.producer.verificationStatus === "APPROVED" && (
                      <span className="badge-verified text-[10px]">✓</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium ${
                    p === page ? "bg-primary text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="page-container text-center text-gray-500">Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
