"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface ResellerProduct {
  id: string;
  productId: string;
  name: string;
  nameSi: string;
  sellingPrice: number;
  sourcePrice: number;
  sourceStock: number | null;
  sourceStatus: string;
  stock: number;
  active: boolean;
  requiresReview: boolean;
  lastScrapedAt: string | null;
  lastSyncError: string | null;
  sourceUrl: string;
  sourceDomain: string;
  category: { name: string; nameSi: string; markupPercentage: number } | null;
  images: string[];
}

export default function ResellerProductsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [products, setProducts] = useState<ResellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role !== "ADMIN") {
        router.push("/");
        return;
      }
      fetchProducts();
    }
  }, [session, status, router]);

  async function fetchProducts() {
    try {
      const res = await fetch("/api/admin/reseller/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      console.error("Failed to fetch products");
    }
    setLoading(false);
  }

  async function handleResync(productId: string, sourceId: string) {
    setSyncing(sourceId);
    try {
      const res = await fetch(`/api/admin/reseller/products/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resync" }),
      });

      if (res.ok) {
        fetchProducts();
      } else {
        alert("Resync failed");
      }
    } catch {
      alert("Resync failed");
    }
    setSyncing(null);
  }

  async function handleResolveReview(sourceId: string) {
    try {
      const res = await fetch(`/api/admin/reseller/products/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_review" }),
      });

      if (res.ok) {
        fetchProducts();
      } else {
        alert("Failed to resolve review");
      }
    } catch {
      alert("Failed to resolve review");
    }
  }

  async function handleUnpublish(sourceId: string, productId: string) {
    if (!confirm("Unpublish this product? It will be hidden from the marketplace.")) return;

    try {
      const res = await fetch(`/api/admin/reseller/products/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish" }),
      });

      if (res.ok) {
        fetchProducts();
      } else {
        alert("Failed to unpublish");
      }
    } catch {
      alert("Failed to unpublish");
    }
  }

  function getStatusColor(status: string, requiresReview: boolean): string {
    if (requiresReview) return "bg-yellow-100 text-yellow-700";
    switch (status) {
      case "ACTIVE": return "bg-green-100 text-green-700";
      case "OUT_OF_STOCK": return "bg-red-100 text-red-700";
      case "UNREACHABLE": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  }

  function getStatusLabel(status: string, requiresReview: boolean): string {
    if (requiresReview) return "Needs Review";
    switch (status) {
      case "ACTIVE": return "Active";
      case "OUT_OF_STOCK": return "Out of Stock";
      case "UNREACHABLE": return "Unreachable";
      default: return status;
    }
  }

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Reseller Products</h1>
        <a href="/admin/reseller-import" className="btn-primary">
          + Import New Product
        </a>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No reseller products yet</p>
          <p className="text-sm text-gray-400 mt-2">Import products from external URLs to get started</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                <th className="pb-3">Product</th>
                <th className="pb-3">Source</th>
                <th className="pb-3">Pricing</th>
                <th className="pb-3">Stock</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Last Sync</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm overflow-hidden">
                        {product.images.length > 0 ? (
                          <img src={product.images[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          "📦"
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{product.nameSi}</p>
                        <p className="text-xs text-gray-500">{product.category?.nameSi || product.category?.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{product.sourceDomain}</p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">{product.sourceUrl}</p>
                    </div>
                  </td>
                  <td className="py-4">
                    <div>
                      <p className="text-sm font-medium text-emerald-600">Rs. {product.sellingPrice.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Source: Rs. {product.sourcePrice.toLocaleString()}</p>
                      {product.category && (
                        <p className="text-xs text-gray-400">Markup: {product.category.markupPercentage}%</p>
                      )}
                    </div>
                  </td>
                  <td className="py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {product.sourceStock !== null ? product.sourceStock : "—"} (source)
                    </p>
                    <p className="text-xs text-gray-500">
                      {product.stock} (local)
                    </p>
                  </td>
                  <td className="py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(product.sourceStatus, product.requiresReview)}`}>
                      {getStatusLabel(product.sourceStatus, product.requiresReview)}
                    </span>
                  </td>
                  <td className="py-4 text-sm text-gray-500">
                    {product.lastScrapedAt ? new Date(product.lastScrapedAt).toLocaleDateString() : "Never"}
                    {product.lastSyncError && (
                      <p className="text-xs text-red-500 mt-1 truncate max-w-xs">{product.lastSyncError}</p>
                    )}
                  </td>
                  <td className="py-4">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleResync(product.productId, product.id)}
                        disabled={syncing === product.id}
                        className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {syncing === product.id ? "..." : "Sync"}
                      </button>
                      {product.requiresReview && (
                        <button
                          onClick={() => handleResolveReview(product.id)}
                          className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        onClick={() => handleUnpublish(product.id, product.productId)}
                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Unpublish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}