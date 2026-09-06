"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

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

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const categories = [
  { id: "cat-foods", name: "Foods", nameSi: "ආහාර", slug: "foods" },
  { id: "cat-crafts", name: "Crafts", nameSi: "වෙළඳ භාණ්ඩ", slug: "crafts" },
  { id: "cat-naturals", name: "Naturals", nameSi: "ස්වාභාවික", slug: "naturals" },
  { id: "cat-fashion", name: "Fashion", nameSi: "විලාසිතා", slug: "fashion" },
];

export default function ProducerListings() {
  return (
    <Suspense
      fallback={<div className="page-container text-center text-gray-500">Loading...</div>}
    >
      <ProducerListingsContent />
    </Suspense>
  );
}

function ProducerListingsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const editing = Boolean(editId);

  const [tab, setTab] = useState<Tab>("manual");
  const [loading, setLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(editing);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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
    active: true,
    images: [] as string[],
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated" && editId) {
      fetch(`/api/producer/products?id=${editId}`)
        .then((r) => r.json())
        .then((data) => {
          const p = data.product;
          if (p) {
            let images: string[] = [];
            try {
              images = Array.isArray(JSON.parse(p.images || "[]")) ? JSON.parse(p.images || "[]") : [];
            } catch {
              images = [];
            }
            setForm({
              name: p.name || "",
              nameSi: p.nameSi || "",
              description: p.description || "",
              descriptionSi: p.descriptionSi || "",
              categoryId: p.categoryId || "",
              price: p.price != null ? String(p.price) : "",
              originalPrice: p.originalPrice != null ? String(p.originalPrice) : "",
              unit: p.unit || "piece",
              unitSi: p.unitSi || "කැබැල්ල",
              stock: p.stock != null ? String(p.stock) : "",
              active: p.active !== false,
              images,
            });
            setTab("manual");
          } else {
            alert(data.error || "Product not found");
            router.push("/producer/dashboard");
          }
        })
        .catch(() => {
          alert("Failed to load product");
          router.push("/producer/dashboard");
        })
        .finally(() => setProductLoading(false));
    }
  }, [status, editId, router]);

  if (status === "unauthenticated") {
    router.push("/auth/login");
    return null;
  }

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleUpload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Only JPG, PNG, WebP, or GIF images are allowed");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError("Image must be under 3 MB");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/producer/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setForm((prev) => ({ ...prev, images: [...prev.images, data.url] }));
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch {
      setUploadError("Upload failed");
    }
    setUploading(false);
  }

  function handleRemoveImage(url: string) {
    setForm((prev) => ({ ...prev, images: prev.images.filter((i) => i !== url) }));
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
      const payload = editing
        ? { id: editId, ...form }
        : { ...form };
      const res = await fetch("/api/producer/products", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccess(true);
        if (!editing) {
          setForm({
            name: "", nameSi: "", description: "", descriptionSi: "",
            categoryId: "", price: "", originalPrice: "", unit: "piece",
            unitSi: "කැබැල්ල", stock: "", active: true, images: [],
          });
        } else {
          router.push("/producer/dashboard");
          return;
        }
      } else {
        const data = await res.json();
        alert(data.error || (editing ? "Failed to update product" : "Failed to create product"));
      }
    } catch {
      alert("Something went wrong");
    }

    setLoading(false);
  }

  if (productLoading) {
    return <div className="page-container text-center text-gray-500">Loading product...</div>;
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        {editing ? "Edit Product" : "Add New Product"}
      </h1>

      {success && !editing && (
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
          disabled={editing}
          className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
            <div className="flex flex-wrap gap-3">
              {form.images.map((url) => (
                <div key={url} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt="Product preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(url)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white text-xs rounded-full hover:bg-red-700"
                  >
                    ×
                  </button>
                </div>
              ))}
              <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 text-gray-400 text-sm">
                {uploading ? "..." : "+ Add"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
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
              Listed on marketplace {editing && <span className="text-gray-400">(availability)</span>}
            </label>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => router.push("/producer/dashboard")}
              className="btn-ghost"
            >
              ← Back to Dashboard
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving..." : editing ? "Save Changes" : "Create Product"}
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