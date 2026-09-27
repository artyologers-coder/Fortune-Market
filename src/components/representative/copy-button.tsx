"use client";

import { useState } from "react";

/**
 * Copies a site-relative path as an absolute URL.
 *
 * The path is resolved against the browser origin at click time rather than at
 * render time: the dashboard is a server component, so `window` is not
 * available while rendering, and a hardcoded origin would be wrong on every
 * environment except production.
 */
export function CopyButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const absolute =
      typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permission, iframe).
      // Surfacing the raw text is more useful than a button that does nothing.
      window.prompt("Copy this link:", absolute);
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-outline !py-2 !px-4 text-sm">
      {copied ? "Copied" : label}
    </button>
  );
}
