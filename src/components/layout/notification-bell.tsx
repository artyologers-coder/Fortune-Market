"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function when(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

/**
 * Notification bell with an unread badge and a dropdown list.
 *
 * Polls on the same 15s cadence the chat badge already uses, and only while the
 * panel is open or the tab is visible, so a backgrounded tab is not polling a
 * database every 15 seconds for a badge nobody is looking at.
 */
export function NotificationBell() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/notifications?perPage=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // A failed poll must never blank an already-rendered list.
    }
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return;
    load();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => clearInterval(tick);
  }, [session, load]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = async (ids: string[]) => {
    // Optimistic: the badge should respond to the click, not to the round trip.
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnread((u) => Math.max(0, u - ids.length));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      load();
    }
  };

  const openPanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  if (!session?.user?.id) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openPanel}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className="relative p-1.5 text-gray-600 hover:text-primary"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 card shadow-lg z-50 max-h-96 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markRead(items.filter((n) => !n.readAt).map((n) => n.id))}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">Nothing yet.</p>
            ) : (
              items.map((n) => {
                const body = (
                  <>
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`text-sm ${
                            n.readAt ? "text-gray-600" : "font-semibold text-gray-900"
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                        <p className="text-[11px] text-gray-400 mt-1">{when(n.createdAt)}</p>
                      </div>
                    </div>
                  </>
                );
                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => {
                      if (!n.readAt) markRead([n.id]);
                      setOpen(false);
                    }}
                    className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-50"
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => !n.readAt && markRead([n.id])}
                    className="block w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50"
                  >
                    {body}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
