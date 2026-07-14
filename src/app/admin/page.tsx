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
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingProducers, setPendingProducers] = useState<Producer[]>([]);
  const [flaggedProducts, setFlaggedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "verification" | "moderation">("overview");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      const role = (session?.user as Record<string, { role?: string }>)?.role;
      if (role !== "ADMIN") {
        router.push("/");
        return;
      }
      fetchData();
    }
  }, [session, status, router]);

  async function fetchData() {
    try {
      const [statsRes, producersRes, productsRes] = await Promise.all([
        fetch("/api/admin"),
        fetch("/api/admin/producers"),
        fetch("/api/admin/products"),
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

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(["overview", "verification", "moderation"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "verification" ? "Verification" : "Moderation"}
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
    </div>
  );
}
