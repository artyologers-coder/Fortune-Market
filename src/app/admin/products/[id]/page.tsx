"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { ImageManager } from "@/components/product/image-manager";

interface Category {
  id: string;
  name: string;
  nameSi: string;
  slug: string;
  markupPercentage: number;
}

export default function AdminEditProductPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

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
    active: true,
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
      Promise.all([
        fetch("/api/admin/reseller/categories").then((r) => r.json()).catch(() => ({ categories: [] })),
        fetch(`/api/admin/products/${productId}`).then((r) => r.json()).catch(() => ({ product: null })),
      ]).then(([catData, prodData]) => {
        setCategories(catData.categories || []);
        const product = prodData.product;
        if (product) {
          let images: string[] = [];
          try {
            images = JSON.parse(product.images || "[]");
          } catch { /* ignore */ }
          setForm({
            name: product.name || "",
            nameSi: product.nameSi || "",
            categoryId: product.categoryId || "",
            price: product.price != null ? String(product.price) : "",
            originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
            stock: product.stock != null ? String(product.stock) : "0",
            unit: product.unit || "piece",
            unitSi: product.unitSi || "කැබැල්ල",
            description: product.description || "",
            descriptionSi: product.descriptionSi || "",
            active: product.active !== false,
          });
          setImageUrls(images);
        } else {
          setError("Product not found");
        }
        setLoading(false);
      });
    }
  }, [session, status, router, productId]);

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          nameSi: form.nameSi || undefined,
          categoryId: form.categoryId,
          price: form.price,
          originalPrice: form.originalPrice || undefined,
          stock: form.stock,
          unit: form.unit,
          unitSi: form.unitSi,
          description: form.description,
          descriptionSi: form.descriptionSi,
          images: imageUrls,
          active: form.active,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to update product");
      }
    } catch {
      setError("Something went wrong");
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading product...</div>;
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Product</h1>

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6">
          Product updated successfully!
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
                {c.nameSi} ({c.name})
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Product Images</label>
          <ImageManager
            images={imageUrls}
            onChange={setImageUrls}
            productId={productId}
          />
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

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={form.active}
            onChange={(e) => update("active", e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="active" className="text-sm text-gray-700">
            Listed on marketplace
          </label>
        </div>

        <div className="flex justify-between pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.push("/admin/products/new")}
            className="btn-ghost"
          >
            ← Back
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
