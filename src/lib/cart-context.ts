"use client";

import { useState, useEffect } from "react";

export function useCartCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function updateCount() {
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      const total = cart.reduce(
        (sum: number, item: { quantity: number }) => sum + item.quantity,
        0
      );
      setCount(total);
    }

    updateCount();
    window.addEventListener("cart-updated", updateCount);
    return () => window.removeEventListener("cart-updated", updateCount);
  }, []);

  return count;
}
