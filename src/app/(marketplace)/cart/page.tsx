"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeCodFee } from "@/lib/cod-fee";

interface CartProduct {
  id: string;
  name: string;
  nameSi: string;
  price: number;
  stock: number;
  unit: string;
  unitSi: string;
  codAmount: number | null;
  codUnit: string | null;
  codUnitsPerKg: number | null;
  codAdditionalKgRate: number | null;
  producer?: {
    id: string;
    businessName: string;
    location?: string;
  } | null;
}

interface CartItem {
  productId: string;
  quantity: number;
  product: CartProduct;
}

interface SellerGroup {
  producerId: string;
  producerName: string;
  items: CartItem[];
  subtotal: number;
  codFee: number;
  total: number;
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("cart") || "[]");
    setCart(stored);
    setLoaded(true);
  }, []);

  function updateQuantity(productId: string, delta: number) {
    const updated = cart.map((item) => {
      if (item.productId === productId) {
        const newQty = Math.max(1, Math.min(item.product.stock, item.quantity + delta));
        return { ...item, quantity: newQty };
      }
      return item;
    });
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
    window.dispatchEvent(new Event("cart-updated"));
  }

  function removeItem(productId: string) {
    const updated = cart.filter((item) => item.productId !== productId);
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
    window.dispatchEvent(new Event("cart-updated"));
  }

  const itemFee = (item: CartItem) => computeCodFee(item.quantity, item.product);

  const groups: SellerGroup[] = cart.reduce<SellerGroup[]>((acc, item) => {
    const producer = item.product.producer;
    const producerId = producer?.id || "unknown";
    const producerName = producer?.businessName || "Seller";
    let group = acc.find((g) => g.producerId === producerId);
    if (!group) {
      group = { producerId, producerName, items: [], subtotal: 0, codFee: 0, total: 0 };
      acc.push(group);
    }
    group.items.push(item);
    group.subtotal += item.product.price * item.quantity;
    group.codFee += itemFee(item);
    group.total = group.subtotal + group.codFee;
    return acc;
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const codTotal = cart.reduce((sum, item) => sum + itemFee(item), 0);

  if (!loaded) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  if (cart.length === 0) {
    return (
      <div className="page-container text-center py-16">
        <p className="text-gray-500 text-lg mb-4">Your cart is empty</p>
        <Link href="/search" className="btn-primary">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {groups.map((group) => (
            <div key={group.producerId} className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold text-sm">
                    {group.producerName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{group.producerName}</p>
                    <p className="text-xs text-gray-500">
                      Delivered individually by seller
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">Rs. {group.total}</p>
                </div>
              </div>

              <div className="space-y-3">
                {group.items.map((item) => {
                  const fee = itemFee(item);
                  return (
                    <div key={item.productId} className="flex gap-4">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xl flex-shrink-0">
                        📦
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 text-sm">{item.product.name}</h3>
                        <p className="text-primary font-bold">Rs. {item.product.price} / {item.product.unit}</p>
                        {fee > 0 && (
                          <p className="text-xs text-gray-500">Delivery fee: Rs. {fee}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center border border-gray-300 rounded-lg">
                            <button
                              onClick={() => updateQuantity(item.productId, -1)}
                              className="px-3 py-1 text-gray-600 hover:bg-gray-50 text-sm"
                            >
                              -
                            </button>
                            <span className="px-3 py-1 text-sm font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.productId, 1)}
                              className="px-3 py-1 text-gray-600 hover:bg-gray-50 text-sm"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => removeItem(item.productId)}
                            className="text-sm text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">Rs. {item.product.price * item.quantity}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="card p-6 h-fit">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal ({cart.length} items)</span>
              <span className="font-medium">Rs. {subtotal}</span>
            </div>
            {codTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery fee (COD)</span>
                <span className="font-medium">Rs. {codTotal}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Shipping</span>
              <span className="font-medium text-green-600">Included above</span>
            </div>
          </div>
          <div className="border-t pt-4 mb-6">
            <div className="flex justify-between">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-primary text-xl">Rs. {subtotal + codTotal}</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/checkout")}
            className="btn-primary w-full"
          >
            Checkout
          </button>
          <Link
            href="/search"
            className="block text-center text-sm text-primary mt-3 hover:underline"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}