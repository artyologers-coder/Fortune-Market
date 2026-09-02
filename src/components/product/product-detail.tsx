"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface ProductDetailProps {
  product: {
    id: string;
    name: string;
    nameSi: string;
    description: string;
    descriptionSi: string;
    price: number;
    originalPrice: number | null;
    unit: string;
    unitSi: string;
    stock: number;
    rating: number;
    totalReviews: number;
    images: string[];
    sourceUrl: string | null;
    externalStock: string | null;
    lastSyncAt: string | null;
    producer: {
      id: string;
      businessName: string;
      businessNameSi: string;
      location: string;
      verificationStatus: string;
      rating: number;
      user: { name: string };
    };
    category: { name: string; nameSi: string; slug: string };
  };
}

export function ProductDetail({ product }: ProductDetailProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  async function addToCart() {
    if (!session) {
      router.push("/auth/login");
      return;
    }
    setAdding(true);
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const existing = cart.find((item: { productId: string }) => item.productId === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ productId: product.id, quantity, product });
    }
    localStorage.setItem("cart", JSON.stringify(cart));
    window.dispatchEvent(new Event("cart-updated"));
    setAdding(false);
    alert("Added to cart!");
  }

  async function reportProduct() {
    if (!session) {
      router.push("/auth/login");
      return;
    }
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, reason: "Reported by user" }),
      });
      setReported(true);
      setReporting(false);
    } catch {
      alert("Failed to report");
    }
  }

  const hasDiscount = product.originalPrice && product.originalPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-8xl">
          📦
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-500">{product.category.nameSi}</span>
          {product.producer.verificationStatus === "APPROVED" && (
            <span className="badge-verified">✓ Verified Producer</span>
          )}
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
          {product.nameSi}
        </h1>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} className={`text-lg ${star <= Math.round(product.rating) ? "text-accent" : "text-gray-300"}`}>
                ★
              </span>
            ))}
            <span className="text-sm text-gray-500 ml-1">
              ({product.rating.toFixed(1)} · {product.totalReviews} reviews)
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-3xl font-bold text-primary">Rs. {product.price}</span>
          {hasDiscount && (
            <>
              <span className="text-lg text-gray-400 line-through">Rs. {product.originalPrice}</span>
              <span className="bg-red-100 text-red-700 text-sm font-medium px-2 py-1 rounded">
                -{discountPercent}%
              </span>
            </>
          )}
          <span className="text-sm text-gray-500">/ {product.unitSi}</span>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
          <p className="text-gray-600 leading-relaxed">{product.descriptionSi}</p>
        </div>

        <div className="mb-6">
          {product.stock > 0 ? (
            <span className="text-green-600 text-sm font-medium">✓ In Stock ({product.stock} available)</span>
          ) : (
            <span className="text-red-600 text-sm font-medium">Out of Stock</span>
          )}
          {product.sourceUrl && product.externalStock && (
            <div className="mt-1">
              <span className={`text-xs ${
                product.externalStock === "in_stock"
                  ? "text-blue-600"
                  : product.externalStock === "out_of_stock"
                  ? "text-orange-600"
                  : "text-gray-500"
              }`}>
                Source: {product.externalStock === "in_stock" ? "Available on source" : product.externalStock === "out_of_stock" ? "Unavailable on source" : "Source status unknown"}
                {product.lastSyncAt && (
                  <span className="text-gray-400 ml-1">
                    (synced {new Date(product.lastSyncAt).toLocaleDateString()})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center border border-gray-300 rounded-lg">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              -
            </button>
            <span className="px-4 py-2 font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
              className="px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={addToCart}
            disabled={adding || product.stock === 0}
            className="btn-primary flex-1"
          >
            {adding ? "Adding..." : "Add to Cart"}
          </button>
          <button
            onClick={() => { addToCart(); router.push("/cart"); }}
            disabled={product.stock === 0}
            className="btn-secondary flex-1"
          >
            Buy Now
          </button>
        </div>

        <div className="border-t border-gray-100 mt-6 pt-6">
          <h3 className="font-semibold text-gray-900 mb-2">Seller</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold">
              {product.producer.businessName.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-gray-900">{product.producer.businessNameSi}</p>
              <p className="text-sm text-gray-500">{product.producer.location}</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {reported ? (
            <span className="text-sm text-gray-500">✓ Reported</span>
          ) : reporting ? (
            <div className="flex gap-2">
              <button onClick={reportProduct} className="text-sm text-red-600 font-medium">
                Confirm Report
              </button>
              <button onClick={() => setReporting(false)} className="text-sm text-gray-500">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setReporting(true)}
              className="text-sm text-gray-400 hover:text-red-600"
            >
              Report this product
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
