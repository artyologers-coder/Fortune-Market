"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Stats {
  totalProducers: number;
  totalProducts: number;
  totalOrders: number;
  pendingVerifications: number;
  pendingModeration: number;
}

interface Producer {
  id: string;
  businessName: string;
  businessNameSi: string;
  verificationStatus: string;
  location: string;
  user: { name: string; email: string; phone: string };
}

interface Product {
  id: string;
  name: string;
  nameSi: string;
  price: number;
  flagged: boolean;
  active: boolean;
  sourceSite: string | null;
  sourceUrl: string | null;
  createdAt: string;
  producer: { user: { name: string | null } } | null;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  shippingName: string;
  shippingCity: string;
  user: { name: string; email: string };
  items: Array<{
    quantity: number;
    price: number;
    product: { nameSi: string; resellerSource?: { sourceDomain: string } | null };
  }>;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingProducers, setPendingProducers] = useState<Producer[]>([]);
  const [flaggedProducts, setFlaggedProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "verification" | "moderation" | "products" | "reseller-import" | "reseller-products" | "reseller-settings" | "orders" | "add-product">("overview");

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
      fetchData();
    }
  }, [session, status, router]);

  async function fetchData() {
    try {
      const [statsRes, producersRes, productsRes, allProductsRes, ordersRes] = await Promise.all([
        fetch("/api/admin"),
        fetch("/api/admin/producers"),
        fetch("/api/admin/products"),
        fetch("/api/admin/products?all=1"),
        fetch("/api/orders"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (producersRes.ok) {
        const data = await producersRes.json();
        setPendingProducers(data.producers || []);
      }

      if (productsRes.ok) {
        const data = await productsRes.json();
        setFlaggedProducts(data.products || []);
      }

      if (allProductsRes.ok) {
        const data = await allProductsRes.json();
        setAllProducts(data.products || []);
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
      }
    } catch {
      console.error("Failed to fetch admin data");
    }
    setLoading(false);
  }

  async function handleProducerAction(producerId: string, action: "approve" | "reject") {
    await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, targetId: producerId, targetType: "producer" }),
    });
    setPendingProducers((prev) => prev.filter((p) => p.id !== producerId));
    if (stats) {
      setStats({
        ...stats,
        pendingVerifications: stats.pendingVerifications - 1,
      });
    }
  }

  async function handleProductAction(productId: string, action: "flag" | "unflag") {
    await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, targetId: productId, targetType: "product" }),
    });
    setFlaggedProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, flagged: action === "flag" } : p))
    );
  }

  async function handleRemoveProduct(productId: string) {
    if (!confirm("Remove this product? It will be hidden from the marketplace.")) return;
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setAllProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, active: false } : p))
      );
    } else {
      alert("Failed to remove product");
    }
  }

  async function handleRestoreProduct(productId: string) {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (res.ok) {
      setAllProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, active: true } : p))
      );
    } else {
      alert("Failed to restore product");
    }
  }

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(["overview", "verification", "moderation", "products", "orders", "reseller-import", "reseller-products", "reseller-settings", "add-product"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "verification" ? "Verification" : tab === "moderation" ? "Moderation" : tab === "products" ? "Products" : tab === "orders" ? "Orders" : tab === "reseller-import" ? "Reseller Import" : tab === "reseller-products" ? "Reseller Products" : tab === "reseller-settings" ? "Reseller Settings" : "Add Product"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total Producers", value: stats.totalProducers, color: "text-primary" },
            { label: "Total Products", value: stats.totalProducts, color: "text-primary" },
            { label: "Total Orders", value: stats.totalOrders, color: "text-primary" },
            { label: "Pending Verifications", value: stats.pendingVerifications, color: "text-yellow-600" },
            { label: "Flagged Products", value: stats.pendingModeration, color: "text-red-600" },
          ].map((stat) => (
            <div key={stat.label} className="card p-6 text-center">
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "verification" && (
        <div className="space-y-4">
          {pendingProducers.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No pending verifications</p>
          ) : (
            pendingProducers.map((producer) => (
              <div key={producer.id} className="card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{producer.businessNameSi}</h3>
                    <p className="text-sm text-gray-500">{producer.businessName}</p>
                    <p className="text-sm text-gray-500">{producer.location}</p>
                    <p className="text-xs text-gray-400">{producer.user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleProducerAction(producer.id, "approve")}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleProducerAction(producer.id, "reject")}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "moderation" && (
        <div className="space-y-4">
          {flaggedProducts.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No flagged products</p>
          ) : (
            flaggedProducts.map((product) => (
              <div key={product.id} className="card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{product.nameSi}</h3>
                    <p className="text-sm text-gray-500">Rs. {product.price}</p>
                    <span className={`text-xs font-medium ${product.flagged ? "text-red-600" : "text-green-600"}`}>
                      {product.flagged ? "Flagged" : "Active"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {product.flagged ? (
                      <button
                        onClick={() => handleProductAction(product.id, "unflag")}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                      >
                        Unflag
                      </button>
                    ) : (
                      <button
                        onClick={() => handleProductAction(product.id, "flag")}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
                      >
                        Flag
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "products" && (
        <div className="overflow-x-auto">
          {allProducts.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No products yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="pb-3">Product</th>
                  <th className="pb-3">Price</th>
                  <th className="pb-3">Source</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="py-4">
                      <p className="font-medium text-gray-900">{product.nameSi}</p>
                      <p className="text-xs text-gray-500">{product.name}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-sm font-bold text-primary">Rs. {product.price}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-sm text-gray-900">{product.sourceSite || product.producer?.user?.name || "N/A"}</p>
                      {product.sourceUrl && (
                        <p className="text-xs text-gray-500 truncate max-w-xs">{product.sourceUrl}</p>
                      )}
                    </td>
                    <td className="py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        product.active ? (product.flagged ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700") : "bg-gray-100 text-gray-600"
                      }`}>
                        {product.active ? (product.flagged ? "Flagged" : "Active") : "Inactive"}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex gap-1">
                        {product.active ? (
                          <button
                            onClick={() => handleRemoveProduct(product.id)}
                            className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestoreProduct(product.id)}
                            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "reseller-import" && (
        <div className="space-y-4">
          <a href="/admin/reseller-import" className="btn-primary inline-block">
            Open Reseller Import
          </a>
        </div>
      )}

      {activeTab === "reseller-products" && (
        <div className="space-y-4">
          <a href="/admin/reseller-products" className="btn-primary inline-block">
            Open Reseller Products
          </a>
        </div>
      )}

      {activeTab === "reseller-settings" && (
        <div className="space-y-4">
          <a href="/admin/reseller-settings" className="btn-primary inline-block">
            Open Reseller Settings
          </a>
        </div>
      )}

      {activeTab === "orders" && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No orders yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                    <th className="pb-3">Order</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Reseller Items</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="py-4">
                        <p className="text-sm font-medium text-gray-900">#{order.id.slice(-8).toUpperCase()}</p>
                      </td>
                      <td className="py-4">
                        <p className="text-sm text-gray-900">{order.shippingName}</p>
                        <p className="text-xs text-gray-500">{order.user?.email}</p>
                      </td>
                      <td className="py-4">
                        <p className="text-sm font-bold text-primary">Rs. {order.totalAmount}</p>
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          order.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                          order.status === "CONFIRMED" ? "bg-blue-100 text-blue-800" :
                          order.status === "PROCESSING" ? "bg-indigo-100 text-indigo-800" :
                          order.status === "SHIPPED" ? "bg-purple-100 text-purple-800" :
                          order.status === "DELIVERED" ? "bg-green-100 text-green-800" :
                          order.status === "CANCELLED" ? "bg-red-100 text-red-800" :
                          order.status === "FORWARDED_TO_SUPPLIER" ? "bg-blue-100 text-blue-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {order.status === "FORWARDED_TO_SUPPLIER" ? "Forwarded" : order.status}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString("en-LK")}
                      </td>
                      <td className="py-4">
                        {order.items.filter((i) => i.product.resellerSource).length > 0 ? (
                          <div className="space-y-1">
                            {order.items
                              .filter((i) => i.product.resellerSource)
                              .map((item) => (
                                <div key={item.product.nameSi} className="text-xs text-blue-600">
                                  {item.product.nameSi} ({item.product.resellerSource?.sourceDomain})
                                </div>
                              ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-4">
                        <div className="flex gap-1">
                          <a
                            href={`/admin/orders/${order.id}`}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            View
                          </a>
                          {order.items.some((i) => i.product.resellerSource) && order.status !== "FORWARDED_TO_SUPPLIER" && (
                            <button
                              onClick={async () => {
                                const res = await fetch(`/api/admin/orders/${order.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "forward_to_supplier" }),
                                });
                                if (res.ok) {
                                  alert("Order marked as forwarded to supplier");
                                  fetchData();
                                }
                              }}
                              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              Forward
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "add-product" && (
        <div className="text-center py-12">
          <a
            href="/admin/products/new"
            className="btn-primary inline-block"
          >
            Create New Product
          </a>
          <p className="text-sm text-gray-500 mt-4">Manually add a product to the catalog (no source URL required)</p>
        </div>
      )}
    </div>
  );
}
