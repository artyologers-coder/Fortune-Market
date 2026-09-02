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

interface ScrapedProduct {
  name: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  images: string[];
  sourceStock: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  siteName: string;
  sourceDomain: string;
  confidence: "high" | "medium" | "low";
  rawData: Record<string, unknown>;
}

export default function ResellerImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [scraped, setScraped] = useState<ScrapedProduct | null>(null);
  const [outcome, setOutcome] = useState<"ok" | "needsReview" | "failed" | null>(null);
  const [guessedCategoryId, setGuessedCategoryId] = useState<string>("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    setRiskAcknowledged(localStorage.getItem("reseller-risk-acknowledged") === "true");
  }, []);

  const [form, setForm] = useState({
    url: "",
    categoryId: "",
    title: "",
    description: "",
    brandingImage: "",
    overridePrice: "",
    overrideStock: "",
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

  async function handlePreview() {
    if (!form.url) {
      setError("Please enter a URL");
      return;
    }

    setPreviewing(true);
    setError("");
    setScraped(null);
    setOutcome(null);

    try {
      const res = await fetch("/api/admin/reseller/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url }),
      });

      const data = await res.json();

      if (res.ok) {
        setScraped(data.preview);
        setOutcome(data.outcome);
        setGuessedCategoryId(data.guessedCategoryId || "");
        if (data.guessedCategoryId) {
          setForm((prev) => ({ ...prev, categoryId: data.guessedCategoryId }));
        }
        if (data.outcome === "needsReview") {
          setError("Low confidence - please review and complete missing fields");
        } else if (data.outcome === "failed") {
          setError(data.error || "Failed to extract product data");
        }
      } else {
        setError(data.error || "Failed to fetch product");
      }
    } catch {
      setError("Failed to fetch product");
    }

    setPreviewing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!form.url || !form.categoryId) {
      setError("URL and category are required");
      setLoading(false);
      return;
    }

    if (!riskAcknowledged) {
      setError("Please acknowledge the ToS risk notice");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/reseller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.url,
          categoryId: form.categoryId,
          title: form.title || undefined,
          description: form.description || undefined,
          brandingImage: form.brandingImage || undefined,
          overridePrice: form.overridePrice ? parseFloat(form.overridePrice) : undefined,
          overrideStock: form.overrideStock ? parseInt(form.overrideStock) : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setForm({ url: "", categoryId: "", title: "", description: "", brandingImage: "", overridePrice: "", overrideStock: "" });
        setScraped(null);
        setOutcome(null);
      } else {
        setError(data.error || "Failed to import product");
      }
    } catch {
      setError("Something went wrong");
    }

    setLoading(false);
  }

  const category = categories.find((c) => c.id === form.categoryId);
  const markup = category?.markupPercentage ?? 15;
  const sourcePrice = form.overridePrice ? parseFloat(form.overridePrice) : scraped?.price ?? 0;
  const sellingPrice = sourcePrice > 0 ? Math.round(sourcePrice * (1 + markup / 100)) : 0;

  if (loading || previewing) {
    return <div className="page-container text-center text-gray-500">{previewing ? "Fetching preview..." : "Processing..."}</div>;
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Import from URL (Reseller)</h1>

      {!riskAcknowledged && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-yellow-800 mb-2">⚠️ Terms of Service Risk Notice</h3>
          <p className="text-sm text-yellow-700 mb-3">
            Automated scraping of third-party sites may violate their Terms of Service.
            Please verify that the source platform offers an official affiliate/reseller API or data feed
            before relying on scraping long-term. Fortune Market is not responsible for any legal issues
            arising from scraping activities.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              onChange={(e) => {
                setRiskAcknowledged(e.target.checked);
                if (e.target.checked) localStorage.setItem("reseller-risk-acknowledged", "true");
              }}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-yellow-700">I understand and accept this risk</span>
          </label>
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6">
          Product imported successfully!
        </div>
      )}

      {error && !riskAcknowledged && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product URL</label>
          <div className="flex gap-2">
<input
              type="url"
              value={form.url}
              onChange={(e) => update("url", e.target.value)}
              placeholder="https://shopzy.lk/product/b7ccfdc8-dd4c-493b-a8e6-f2dbef612d33"
              className="input-field flex-1"
              required
            />
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || !form.url}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {previewing ? "Fetching..." : "Fetch Preview"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Paste a product URL from a dropshipping/reseller site to auto-extract data
          </p>
        </div>

        {scraped && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Scraped Data Preview</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${
                outcome === "ok" ? "bg-green-100 text-green-700" :
                outcome === "needsReview" ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              }`}>
                {outcome === "ok" ? "Ready to Import" : outcome === "needsReview" ? "Needs Review" : "Failed"}
              </span>
            </div>

            {(outcome === "needsReview" || outcome === "failed") && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                {outcome === "needsReview"
                  ? "Some fields couldn't be auto-detected. Please fill in the override fields below before importing."
                  : "Could not extract product data from this URL. Try a different URL or fill in all fields manually."}
              </div>
            )}

            <div>
              <span className="text-xs text-gray-500">Name:</span>
              <p className="text-sm">{scraped.name}</p>
            </div>

            <div>
              <span className="text-xs text-gray-500">Description:</span>
              <p className="text-sm line-clamp-3">{scraped.description || "(none found)"}</p>
            </div>

            <div className="flex gap-4">
              {scraped.price && (
                <div>
                  <span className="text-xs text-gray-500">Source Price:</span>
                  <p className="text-sm font-medium">Rs. {scraped.price.toLocaleString()}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500">Availability:</span>
                <p className={`text-sm font-medium ${
                  scraped.availability === "in_stock" ? "text-green-600" :
                  scraped.availability === "out_of_stock" ? "text-red-600" : "text-gray-600"
                }`}>
                  {scraped.availability === "in_stock" ? "In Stock" : scraped.availability === "out_of_stock" ? "Out of Stock" : "Unknown"}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Source:</span>
                <p className="text-sm">{scraped.siteName} ({scraped.sourceDomain})</p>
              </div>
            </div>

            {scraped.images.length > 0 && (
              <div>
                <span className="text-xs text-gray-500">Images: {scraped.images.length} found</span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category (determines markup %)</label>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branding Image (optional)</label>
            <input
              type="url"
              value={form.brandingImage}
              onChange={(e) => update("brandingImage", e.target.value)}
              placeholder="https://example.com/your-branding.jpg"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Your own product image (never scraped). Paste a URL or use base64 data URL.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder={scraped?.name || "Auto-filled from source"}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder={scraped?.description || "Auto-filled from source"}
              className="input-field"
              rows={3}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Price (Rs.)</label>
            <input
              type="number"
              value={form.overridePrice}
              onChange={(e) => update("overridePrice", e.target.value)}
              className="input-field"
              min="0"
              step="0.01"
              placeholder={scraped?.price ? String(scraped.price) : "Auto-filled from source"}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Stock</label>
            <input
              type="number"
              value={form.overrideStock}
              onChange={(e) => update("overrideStock", e.target.value)}
              className="input-field"
              min="0"
              placeholder={scraped?.sourceStock ? String(scraped.sourceStock) : "Auto-filled from source"}
            />
          </div>

          <div className="flex items-end">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <p className="text-xs text-emerald-700">Selling Price (with {markup}% markup)</p>
              <p className="text-2xl font-bold text-emerald-600">Rs. {sellingPrice.toLocaleString()}</p>
              <p className="text-xs text-emerald-500">Source: Rs. {sourcePrice.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button type="submit" disabled={loading || !riskAcknowledged} className="btn-primary">
            {loading ? "Importing..." : "Import Product"}
          </button>
        </div>
      </form>
    </div>
  );
}