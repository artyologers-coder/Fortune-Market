"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ProducerListings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    name: "",
    nameSi: "",
    description: "",
    descriptionSi: "",
    categoryId: "",
    price: "",
    originalPrice: "",
    unit: "piece",
    unitSi: "කැබැල්ල",
    stock: "",
  });

  if (status === "unauthenticated") {
    router.push("/auth/login");
    return null;
  }

  const categories = [
    { id: "cat-foods", name: "Foods", nameSi: "ආහාර", slug: "foods" },
    { id: "cat-crafts", name: "Crafts", nameSi: "වෙළඳ භාණ්ඩ", slug: "crafts" },
    { id: "cat-naturals", name: "Naturals", nameSi: "ස්වාභාවික", slug: "naturals" },
    { id: "cat-fashion", name: "Fashion", nameSi: "විලාසිතා", slug: "fashion" },
  ];

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/producer/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSuccess(true);
        setForm({
          name: "", nameSi: "", description: "", descriptionSi: "",
          categoryId: "", price: "", originalPrice: "", unit: "piece",
          unitSi: "කැබැල්ල", stock: "",
        });
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create product");
      }
    } catch {
      alert("Something went wrong");
    }

    setLoading(false);
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Add New Product</h1>

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6">
          Product created successfully!{" "}
          <button onClick={() => setSuccess(false)} className="underline font-medium">
            Add another
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (English)</label>
            <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (Sinhala)</label>
            <input type="text" value={form.nameSi} onChange={(e) => update("nameSi", e.target.value)} className="input-field" required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (English)</label>
          <textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="input-field" rows={3} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (Sinhala)</label>
          <textarea value={form.descriptionSi} onChange={(e) => update("descriptionSi", e.target.value)} className="input-field" rows={3} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)} className="input-field" required>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nameSi} ({c.name})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (Rs.)</label>
            <input type="number" value={form.price} onChange={(e) => update("price", e.target.value)} className="input-field" required min="0" step="0.01" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Original Price</label>
            <input type="number" value={form.originalPrice} onChange={(e) => update("originalPrice", e.target.value)} className="input-field" min="0" step="0.01" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <input type="text" value={form.unit} onChange={(e) => update("unit", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
            <input type="number" value={form.stock} onChange={(e) => update("stock", e.target.value)} className="input-field" required min="0" />
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <button type="button" onClick={() => router.push("/producer/dashboard")} className="btn-ghost">
            ← Back to Dashboard
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Creating..." : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
