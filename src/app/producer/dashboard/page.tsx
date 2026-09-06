"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Producer {
  id: string;
  businessName: string;
  businessNameSi: string;
  verificationStatus: string;
  verifiedAt: string | null;
  rating: number;
  totalReviews: number;
}

interface Product {
  id: string;
  name: string;
  nameSi: string;
  price: number;
  stock: number;
  active: boolean;
  flagged: boolean;
  rating: number;
  sourceUrl: string | null;
  syncStatus: string | null;
  lastSyncAt: string | null;
  externalStock: string | null;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: { product: { nameSi: string }; quantity: number; price: number }[];
}

export default function ProducerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [producer, setProducer] = useState<Producer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"listings" | "orders" | "offers">("listings");
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role !== "PRODUCER") {
        router.push("/");
        return;
      }

      Promise.all([
        fetch("/api/producer/profile").then((r) => r.json()).catch(() => ({ producer: null })),
        fetch("/api/producer/products/list").then((r) => r.json()).catch(() => ({ products: [] })),
        fetch("/api/orders").then((r) => r.json()).catch(() => ({ orders: [] })),
      ]).then(([profileData, productsData, ordersData]) => {
        setProducer(profileData.producer);
        setProducts(productsData.products || []);
        setOrders(ordersData.orders || []);
        setLoading(false);
      });
    }
  }, [session, status, router]);

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  async function handleSync(productId: string) {
    setSyncing(productId);
    try {
      const res = await fetch(`/api/products/${productId}/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId
              ? { ...p, lastSyncAt: new Date().toISOString(), externalStock: data.newStock }
              : p
          )
        );
        alert(data.message);
      }
    } catch {
      alert("Sync failed");
    }
    setSyncing(null);
  }

  async function handleToggleSync(productId: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/products/${productId}/sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncStatus: newStatus }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, syncStatus: newStatus } : p))
        );
      }
    } catch {
      alert("Failed to update sync status");
    }
  }

  async function handleRemoveProduct(productId: string) {
    if (!confirm("Remove this product? It will be hidden from the marketplace.")) return;
    try {
      const res = await fetch(`/api/producer/products?id=${productId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, active: false } : p))
        );
      } else {
        alert("Failed to remove product");
      }
    } catch {
      alert("Failed to remove product");
    }
  }

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {producer?.businessNameSi || "Producer Dashboard"}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {producer?.verificationStatus === "APPROVED" ? (
              <span className="badge-verified">✓ Verified Producer</span>
            ) : (
              <span className="badge-pending">⏳ Pending Verification</span>
            )}
            {producer && (
              <span className="text-sm text-gray-500">
                ★ {producer.rating.toFixed(1)} ({producer.totalReviews} reviews)
              </span>
            )}
          </div>
        </div>
        <Link href="/producer/dashboard/listings" className="btn-primary">
          + Add Product
        </Link>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(["listings", "orders", "offers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "listings" ? "My Listings" : tab === "orders" ? "Orders" : "Offers"}
          </button>
        ))}
      </div>

      {activeTab === "listings" && (
        <div className="space-y-4">
          {products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No products yet</p>
              <Link href="/producer/dashboard/listings" className="btn-primary inline-block mt-4">
                Add Your First Product
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <div key={product.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{product.nameSi}</h3>
                    {product.flagged && <span className="badge-rejected text-xs">Flagged</span>}
                  </div>
                  <p className="text-primary font-bold mb-2">Rs. {product.price}</p>
                  <p className="text-sm text-gray-500 mb-2">Stock: {product.stock}</p>
                  {product.sourceUrl && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        product.syncStatus === "active"
                          ? "bg-green-100 text-green-700"
                          : product.syncStatus === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {product.syncStatus === "active"
                          ? "Auto-sync ON"
                          : product.syncStatus === "error"
                          ? "Sync Error"
                          : "Auto-sync OFF"}
                      </span>
                      {product.externalStock && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          product.externalStock === "in_stock"
                            ? "bg-blue-100 text-blue-700"
                            : product.externalStock === "out_of_stock"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          Source: {product.externalStock === "in_stock" ? "In Stock" : product.externalStock === "out_of_stock" ? "Out of Stock" : "Unknown"}
                        </span>
                      )}
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSync(product.id)}
                          disabled={syncing === product.id}
                          className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-50"
                        >
                          {syncing === product.id ? "..." : "Sync Now"}
                        </button>
                        <button
                          onClick={() => handleToggleSync(product.id, product.syncStatus || "paused")}
                          className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        >
                          {product.syncStatus === "active" ? "Pause" : "Resume"}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${product.active ? "text-green-600" : "text-red-600"}`}>
                      {product.active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-xs text-gray-500">★ {product.rating.toFixed(1)}</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                    <Link
                      href={`/producer/dashboard/listings?id=${product.id}`}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleRemoveProduct(product.id)}
                      disabled={!product.active}
                      className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "orders" && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No orders yet</p>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">#{order.id.slice(-8).toUpperCase()}</span>
                  <span className="badge-pending text-xs">{order.status}</span>
                </div>
                {order.items.map((item, i) => (
                  <p key={i} className="text-sm">{item.product.nameSi} × {item.quantity}</p>
                ))}
                <p className="font-bold text-primary mt-2">Rs. {order.totalAmount}</p>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "offers" && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Manage your special offers</p>
          <Link href="/producer/dashboard/offers" className="btn-primary">
            Create New Offer
          </Link>
        </div>
      )}
    </div>
  );
}
