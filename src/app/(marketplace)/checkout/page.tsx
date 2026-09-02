"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface CartItem {
  productId: string;
  quantity: number;
  product: {
    id: string;
    nameSi: string;
    price: number;
  };
}

export default function CheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    notes: "",
    paymentMethod: "cod",
  });

  useEffect(() => {
    if (!session) {
      router.push("/auth/login");
      return;
    }
    const stored = JSON.parse(localStorage.getItem("cart") || "[]");
    setCart(stored);
    if (session.user) {
      setForm((prev) => ({
        ...prev,
        name: session.user?.name || "",
      }));
    }
  }, [session, router]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          shippingInfo: {
            name: form.name,
            phone: form.phone,
            address: form.address,
            city: form.city,
            notes: form.notes,
          },
          paymentMethod: form.paymentMethod,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to place order");
        setLoading(false);
        return;
      }

      localStorage.removeItem("cart");
      window.dispatchEvent(new Event("cart-updated"));
      setSuccess(data.order.id);
    } catch {
      alert("Failed to place order");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="page-container text-center py-16">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed Successfully!</h1>
        <p className="text-gray-500 mb-6">Order ID: {success}</p>
        <button onClick={() => router.push("/orders")} className="btn-primary">
          View My Orders
        </button>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="page-container text-center py-16">
        <p className="text-gray-500">Your cart is empty</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Shipping Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className="input-field"
                    placeholder="+947XXXXXXXX"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Method</h2>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer border-primary bg-primary-50">
                  <input type="radio" name="payment" value="cod" checked={form.paymentMethod === "cod"} onChange={(e) => update("paymentMethod", e.target.value)} className="text-primary" />
                  <div>
                    <p className="font-medium text-sm">Cash on Delivery</p>
                    <p className="text-xs text-gray-500">Pay when you receive your order</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer border-gray-200">
                  <input type="radio" name="payment" value="card" checked={form.paymentMethod === "card"} onChange={(e) => update("paymentMethod", e.target.value)} />
                  <div>
                    <p className="font-medium text-sm">Card Payment</p>
                    <p className="text-xs text-gray-500">Pay securely online (stubbed for demo)</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="card p-6 h-fit">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-3 mb-4">
              {cart.map((item) => (
                <div key={item.productId} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.product.nameSi} × {item.quantity}
                  </span>
                  <span className="font-medium">Rs. {item.product.price * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-bold text-primary text-xl">Rs. {total}</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6"
            >
              {loading ? "Placing Order..." : "Place Order"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
