"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: {
    id: string;
    name: string;
    nameSi: string;
    images: string[];
    resellerSource?: {
      sourceUrl: string;
      sourceDomain: string;
      sourcePrice: number;
      supplierWhatsAppNumber?: string;
    } | null;
  };
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  items: OrderItem[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-indigo-100 text-indigo-800",
  SHIPPED: "bg-purple-100 text-purple-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  FORWARDED_TO_SUPPLIER: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FORWARDED_TO_SUPPLIER: "Forwarded to Supplier",
};

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/orders")
        .then((res) => res.json())
        .then((data) => {
          setOrders(data.orders || []);
          setLoading(false);
        });
    }
  }, [status, router]);

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Orders</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg">No orders yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">
                    Order #{order.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString("en-LK")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || ""}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                  <span className="font-bold text-primary">Rs. {order.totalAmount}</span>
                </div>
              </div>

              <div className="border-t pt-4">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">
                      📦
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.product.nameSi}</p>
                      <p className="text-xs text-gray-500">
                        Rs. {item.price} × {item.quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {order.items.some((item) => item.product.resellerSource) && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Reseller Order Items</h4>
                  {order.items
                    .filter((item) => item.product.resellerSource)
                    .map((item) => {
                      const source = item.product.resellerSource!;
                      const waNumber = source.supplierWhatsAppNumber?.replace(/\D/g, "") || "";
                      const message = `New Fortune Market Order\n\nProduct: ${item.product.nameSi}\nSource: ${source.sourceUrl}\nQuantity: ${item.quantity}\nSelling Price: Rs. ${item.price}\nSource Price: Rs. ${source.sourcePrice}\nCustomer: ${order.shippingName}\nPhone: ${order.shippingPhone}\nAddress: ${order.shippingAddress}, ${order.shippingCity}\n\nPlease process this order.`;
                      const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : null;

                      return (
                        <div key={item.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-blue-700">Source: {source.sourceDomain}</span>
                            <span className="text-xs text-gray-500">Rs. {source.sourcePrice.toLocaleString()} (source)</span>
                          </div>
                          <p className="text-xs text-gray-600 mb-2">
                            Source URL: <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate block">{source.sourceUrl}</a>
                          </p>
                          {waLink && (
                            <div className="flex gap-2">
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                              >
                                📱 Forward to Supplier (WhatsApp)
                              </a>
                              <button
                                onClick={() => navigator.clipboard.writeText(message)}
                                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                              >
                                Copy Message
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="border-t pt-3 mt-3 text-xs text-gray-500">
                <p>Ship to: {order.shippingName}, {order.shippingCity}</p>
                <p>Payment: {order.paymentMethod === "cod" ? "Cash on Delivery" : "Card"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
