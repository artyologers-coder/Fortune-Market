"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Tab = "manual" | "import";

interface ScrapedData {
  name: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  images: string[];
  availability: "in_stock" | "out_of_stock" | "unknown";
  siteName: string;
}

export default function ProducerListings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [scraped, setScraped] = useState<ScrapedData | null>(null);
  const [scrapeError, setScrapeError] = useState("");
  const [importCategoryId, setImportCategoryId] = useState("");
  const [importPrice, setImportPrice] = useState("");
  const [importStock, setImportStock] = useState("");

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

  async function handlePreview() {
    if (!importUrl) return;
    setScrapeError("");
    setScraped(null);
    setImporting(true);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl, previewOnly: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setScraped(data.scraped);
        if (data.scraped.price) setImportPrice(String(data.scraped.price));
      } else {
        const data = await res.json();
        setScrapeError(data.error || "Failed to fetch product");
      }
    } catch {
      setScrapeError("Failed to fetch product");
    }

    setImporting(false);
  }

  async function handleImport() {
    if (!importUrl || !scraped) return;
    setLoading(true);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: importUrl,
          categoryId: importCategoryId || "cat-foods",
          price: importPrice ? parseFloat(importPrice) : undefined,
          stock: importStock ? parseInt(importStock) : undefined,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setImportUrl("");
        setScraped(null);
        setImportCategoryId("");
        setImportPrice("");
        setImportStock("");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to import product");
      }
    } catch {
      alert("Something went wrong");
    }

    setLoading(false);
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
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add New Product</h1>

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6">
          Product created successfully!{" "}
          <button onClick={() => setSuccess(false)} className="underline font-medium">
            Add another
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("manual")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "manual"
              ? "bg-emerald-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Manual Entry
        </button>
        <button
          onClick={() => setTab("import")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "import"
              ? "bg-emerald-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Import from URL
        </button>
      </div>

      {tab === "manual" && (
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
      )}

      {tab === "import" && (
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://example.com/product/123"
                className="input-field flex-1"
              />
              <button
                onClick={handlePreview}
                disabled={importing || !importUrl}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                {importing ? "Fetching..." : "Fetch"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Paste any product URL to automatically import name, description, price, and images
            </p>
          </div>

          {scrapeError && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              {scrapeError}
            </div>
          )}

          {scraped && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Scraped Data</h3>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {scraped.siteName}
                </span>
              </div>

              <div>
                <span className="text-xs text-gray-500">Name:</span>
                <p className="text-sm">{scraped.name}</p>
              </div>

              {scraped.description && (
                <div>
                  <span className="text-xs text-gray-500">Description:</span>
                  <p className="text-sm line-clamp-3">{scraped.description}</p>
                </div>
              )}

              <div className="flex gap-4">
                {scraped.price && (
                  <div>
                    <span className="text-xs text-gray-500">Price:</span>
                    <p className="text-sm font-medium">Rs. {scraped.price.toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-gray-500">Availability:</span>
                  <p className={`text-sm font-medium ${
                    scraped.availability === "in_stock"
                      ? "text-green-600"
                      : scraped.availability === "out_of_stock"
                      ? "text-red-600"
                      : "text-gray-600"
                  }`}>
                    {scraped.availability === "in_stock"
                      ? "In Stock"
                      : scraped.availability === "out_of_stock"
                      ? "Out of Stock"
                      : "Unknown"}
                  </p>
                </div>
              </div>

              {scraped.images.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500">Images: {scraped.images.length} found</span>
                </div>
              )}

              <hr className="border-gray-200" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={importCategoryId}
                    onChange={(e) => setImportCategoryId(e.target.value)}
                    className="input-field text-sm"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.nameSi} ({c.name})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Your Price (Rs.)</label>
                  <input
                    type="number"
                    value={importPrice}
                    onChange={(e) => setImportPrice(e.target.value)}
                    className="input-field text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stock</label>
                  <input
                    type="number"
                    value={importStock}
                    onChange={(e) => setImportStock(e.target.value)}
                    className="input-field text-sm"
                    min="0"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? "Importing..." : "Import Product"}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button type="button" onClick={() => router.push("/producer/dashboard")} className="btn-ghost">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
