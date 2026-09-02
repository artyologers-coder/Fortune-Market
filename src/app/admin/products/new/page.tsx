"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
  nameSi: string;
  slug: string;
  markupPercentage: number;
}

export default function AdminNewProductPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    nameSi: "",
    categoryId: "",
    price: "",
    originalPrice: "",
    stock: "0",
    unit: "piece",
    unitSi: "කැබැල්ල",
    description: "",
    descriptionSi: "",
    images: "",
  });

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
      fetchCategories();
    }
  }, [session, status, router]);

  async function fetchCategories() {
    try {
      const res = await fetch("/api/admin/reseller/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      console.error("Failed to fetch categories");
    }
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!form.name || !form.categoryId || !form.price) {
      setError("Name, category, and price are required");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          nameSi: form.nameSi || undefined,
          categoryId: form.categoryId,
          price: form.price,
          originalPrice: form.originalPrice || undefined,
          stock: form.stock || undefined,
          unit: form.unit || undefined,
          unitSi: form.unitSi || undefined,
          description: form.description || undefined,
          descriptionSi: form.descriptionSi || undefined,
          images: form.images ? form.images.split(",").map((u) => u.trim()).filter(Boolean) : [],
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setForm({ name: "", nameSi: "", categoryId: "", price: "", originalPrice: "", stock: "0", unit: "piece", unitSi: "කැබැල්ල", description: "", descriptionSi: "", images: "" });
      } else {
        setError(data.error || "Failed to create product");
      }
    } catch {
      setError("Something went wrong");
    }

    setLoading(false);
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add Product Manually</h1>

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6">
          Product created successfully!
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name (English)</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name (Sinhala)</label>
          <input
            type="text"
            value={form.nameSi}
            onChange={(e) => update("nameSi", e.target.value)}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={form.categoryId}
            onChange={(e) => update("categoryId", e.target.value)}
            className="input-field"
            required
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameSi} ({c.name}) — {c.markupPercentage}% markup
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (Rs.)</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
              className="input-field"
              min="0"
              step="0.01"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Original Price (Rs.)</label>
            <input
              type="number"
              value={form.originalPrice}
              onChange={(e) => update("originalPrice", e.target.value)}
              className="input-field"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) => update("stock", e.target.value)}
              className="input-field"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit (English)</label>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => update("unit", e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit (Sinhala)</label>
            <input
              type="text"
              value={form.unitSi}
              onChange={(e) => update("unitSi", e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Images (comma-separated URLs)</label>
          <input
            type="text"
            value={form.images}
            onChange={(e) => update("images", e.target.value)}
            placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
            className="input-field"
          />
          <p className="text-xs text-gray-500 mt-1">Enter full image URLs separated by commas</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (English)</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className="input-field"
            rows={4}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (Sinhala)</label>
          <textarea
            value={form.descriptionSi}
            onChange={(e) => update("descriptionSi", e.target.value)}
            className="input-field"
            rows={4}
          />
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Creating..." : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}