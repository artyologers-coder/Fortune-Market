"use client";

import { useEffect, useRef, useState } from "react";
import { productShareUrl } from "@/lib/product-share";

interface ProductShareButtonProps {
  product: {
    id: string;
    slug?: string | null;
    name: string;
    description?: string;
  };
}

export function ProductShareButton({ product }: ProductShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const url = typeof window !== "undefined"
    ? productShareUrl(product.slug ?? product.id)
    : "";

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not copy link");
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: product.name,
        text: product.description,
        url,
      });
    } catch {
      // user cancelled or share unavailable
    }
  }

  const supportNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="btn-outline flex items-center justify-center gap-2 text-sm"
        aria-label="Share this product"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        Share
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50">
          {supportNativeShare && (
            <button
              type="button"
              onClick={() => { nativeShare(); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              Share…
            </button>
          )}
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            Facebook
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${product.name}\n${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            WhatsApp
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </div>
  );
}