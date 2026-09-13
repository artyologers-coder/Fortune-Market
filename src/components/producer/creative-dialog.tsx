"use client";

import { useEffect, useRef, useState } from "react";

interface ProductBrief {
  id: string;
  name: string;
}

interface CreativeState {
  imageUrl: string;
  status: string;
  version: number;
}

interface PromptVariant {
  key: string;
  label: string;
  prompt: string;
}

interface DialogData {
  creative: CreativeState | null;
  prompts: PromptVariant[];
  product: {
    id: string;
    name: string;
    nameSi: string;
    slug: string | null;
    images: string;
  };
}

interface Props {
  product: ProductBrief | null;
  onApproved?: () => void;
}

const CHANNELS = ["facebook", "whatsapp", "copy"] as const;

function buildProductUrl(
  product: DialogData["product"],
  origin: string
): string {
  const key = product.slug ?? product.id;
  return `${origin}/product/${key}`;
}

function defaultCaption(
  product: DialogData["product"],
  url: string
): string {
  return `${product.name} — Shop on Fortune Market: ${url}`;
}

export function CreativeDialog({ product, onApproved }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DialogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadState() {
    if (!product) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/producer/creative?productId=${product.id}`
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Failed to load Fortune Creative");
        return;
      }
      setData(payload);
      const url = buildProductUrl(payload.product, window.location.origin);
      setCaption(defaultCaption(payload.product, url));
    } catch {
      setError("Failed to load Fortune Creative");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && product) {
      void loadState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  if (!product) return null;

  async function handleCopy(promptText: string, key: string) {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function handleUpload(file: File) {
    if (!product) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("productId", product.id);
      formData.append("file", file);
      const res = await fetch("/api/producer/creative/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Upload failed");
        return;
      }
      await loadState();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleApprove() {
    if (!product || !data?.creative) return;
    if (
      !confirm(
        "This will replace your product image with the branded creative and permanently delete the original product photos. Continue?"
      )
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/producer/creative/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Failed to apply creative");
        return;
      }
      if (data) {
        setData({ ...data, creative: { ...data.creative, status: "ACTIVE" } });
      }
      onApproved?.();
    } catch {
      setError("Failed to apply creative. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function logShare(
    channel: (typeof CHANNELS)[number],
    shareUrl: string
  ) {
    if (!product) return;
    try {
      await fetch("/api/producer/creative/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, channel }),
      });
    } catch {
      // share logging is best-effort
    }

    if (channel === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
        "_blank",
        "noopener"
      );
    } else if (channel === "whatsapp") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${caption}\n${shareUrl}`)}`,
        "_blank",
        "noopener"
      );
    } else {
      navigator.clipboard
        .writeText(`${caption}\n${shareUrl}`)
        .then(() => {
          setCopied("link");
          setTimeout(() => setCopied(""), 1500);
        })
        .catch(() => setError("Could not copy to clipboard"));
    }
  }

  const shareUrl =
    data && typeof window !== "undefined"
      ? buildProductUrl(data.product, window.location.origin)
      : "";
  const active = data?.creative?.status === "ACTIVE";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-emerald-700 to-emerald-600 text-white hover:opacity-90 shadow-sm"
      >
        ✨ Create Fortune Creative
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !loading && !uploading && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Fortune Creative
              </h2>
              <button
                onClick={() => setOpen(false)}
                disabled={loading || uploading}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            {loading && !data && (
              <div className="text-center py-10 text-gray-500">Loading...</div>
            )}

            {data && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">
                    Step 1 — Get your AI image
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Copy a prompt, paste it into any AI image generator
                    (ChatGPT, Gemini, etc.) together with your product photo,
                    and download the result. If your tool supports variations it
                    will give you a few; otherwise it will show two options side
                    by side — then generate a single clean one of your choice.
                  </p>
                  <div className="space-y-2">
                    {data.prompts.map((variant) => (
                      <details
                        key={variant.key}
                        className="border border-gray-200 rounded-lg overflow-hidden group"
                      >
                        <summary className="flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer list-none">
                          <span>{variant.label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              void handleCopy(variant.prompt, variant.key);
                            }}
                            className={`px-2 py-1 text-xs rounded-md font-medium ${
                              copied === variant.key
                                ? "bg-green-100 text-green-700"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            }`}
                          >
                            {copied === variant.key ? "Copied ✓" : "Copy"}
                          </button>
                        </summary>
                        <pre className="px-3 py-2 text-[11px] leading-relaxed text-gray-600 whitespace-pre-wrap border-t border-gray-100 bg-gray-50 max-h-48 overflow-y-auto">
                          {variant.prompt}
                        </pre>
                      </details>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">
                    Step 2 — Upload &amp; add branding
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Upload the image you created. Fortune Market will add its
                    logo and a small{" "}
                    <span className="font-medium text-gray-600">
                      www.fortunemarket.lk
                    </span>{" "}
                    mark before you apply it to your product.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-emerald-300 text-emerald-700 text-sm font-medium hover:border-emerald-500 disabled:opacity-50"
                  >
                    {uploading ? "Branding image..." : "📷 Upload your AI image"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                      e.target.value = "";
                    }}
                  />
                </section>

                {data.creative && (
                  <section className="space-y-3">
                    <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={data.creative.imageUrl}
                        alt="Fortune Creative preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          active
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {active
                          ? "Active — your product image"
                          : "Preview — not applied yet"}
                      </span>
                      <span className="text-gray-400">v{data.creative.version}</span>
                    </div>

                    {!active && (
                      <button
                        onClick={handleApprove}
                        disabled={loading || uploading}
                        className="w-full px-4 py-2 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 disabled:opacity-50"
                      >
                        Use This Creative
                      </button>
                    )}

                    <div className="border-t border-gray-100 pt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Share caption (editable)
                      </label>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        rows={3}
                        className="input-field text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1 break-all">
                        {shareUrl}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          onClick={() => logShare("facebook", shareUrl)}
                          disabled={loading || uploading}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                        >
                          Facebook
                        </button>
                        <button
                          onClick={() => logShare("whatsapp", shareUrl)}
                          disabled={loading || uploading}
                          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-40"
                        >
                          WhatsApp
                        </button>
                        <button
                          onClick={() => logShare("copy", shareUrl)}
                          disabled={loading || uploading}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-40"
                        >
                          {copied === "link" ? "Copied ✓" : "Copy Link"}
                        </button>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}