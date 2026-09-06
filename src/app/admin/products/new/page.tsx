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

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const MAX_DIMENSION = 1000;

async function compressImage(file: File): Promise<File> {
  const isGif = file.type === "image/gif";
  if (isGif || file.size <= MAX_FILE_SIZE * 0.6) {
    return file;
  }

  try {
    let bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let { width, height } = bitmap;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    if (scale === 1 && file.type === "image/webp") {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale) || 1;
    canvas.height = Math.round(height * scale) || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8)
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}

export default function AdminNewProductPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [uploading, setUploading] = useState(false);

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");
    const added: string[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" is over 3 MB. Try a smaller image.`);
        continue;
      }

      let uploadFile = file;
      try {
        uploadFile = await compressImage(file);
      } catch {
        // compression failed; fall through with the original file
      }

      const fd = new FormData();
      fd.append("file", uploadFile);
      try {
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.url) {
          added.push(data.url);
        } else {
          setError(data.error || `Failed to upload ${file.name}`);
        }
      } catch {
        setError(`Failed to upload ${file.name}`);
      }
    }

    if (added.length > 0) {
      setImageUrls((prev) => [...prev, ...added]);
    }
    setUploading(false);
    e.target.value = "";
  }

  function addLinks() {
    const urls = linkInput
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setImageUrls((prev) => [...prev, ...urls]);
    setLinkInput("");
  }

  function removeImage(index: number) {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
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
          images: imageUrls,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setImageUrls([]);
        setLinkInput("");
        setForm({ name: "", nameSi: "", categoryId: "", price: "", originalPrice: "", stock: "0", unit: "piece", unitSi: "කැබැල්ල", description: "", descriptionSi: "" });
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Images</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-100 file:text-primary hover:file:bg-primary-200"
          />
          <p className="text-xs text-gray-500 mt-1">
            {uploading ? "Uploading images..." : "JPG, PNG, WebP, or GIF (max 3 MB, up to 1000px). Large photos are auto-resized to WebP. Square 1:1 images display best."}
          </p>

          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3">
              {imageUrls.map((url, i) => (
                <div key={`${url}-${i}`} className="relative">
                  <img
                    src={url}
                    alt={`Product image ${i + 1}`}
                    className="w-24 h-24 aspect-square object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center hover:bg-red-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
              className="input-field"
            />
            <button type="button" onClick={addLinks} className="btn-secondary whitespace-nowrap">
              Add Links
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Or paste full image URLs, separated by commas</p>
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