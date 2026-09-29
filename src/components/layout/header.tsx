"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useCartCount } from "@/lib/cart-context";
import { Logo } from "@/components/ui/logo";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { NotificationBell } from "@/components/layout/notification-bell";

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cartCount = useCartCount();
  const [unreadCount, setUnreadCount] = useState(0);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = search.trim();
    if (query) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    } else {
      router.push("/search");
    }
  };

  const role = session?.user?.role;

  useEffect(() => {
    if (!session || !isFeatureEnabled("INTERNAL_CHAT")) return;
    const fetchUnread = () => {
      fetch("/api/chat/unread-count")
        .then((r) => r.json())
        .then((d) => setUnreadCount(d.count || 0))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="bg-primary-700 text-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 sm:py-2 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold tracking-wide">
          <span aria-hidden="true">🇱🇰</span>
          <span>Made in Sri Lanka</span>
          <span className="text-primary-200" aria-hidden="true">·</span>
          <span className="text-primary-100 font-medium">ලංකාවේ සාදන ලද</span>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {isFeatureEnabled("PRODUCTS") && (
              <Link href="/search" className="text-gray-600 hover:text-primary text-sm">
                Search
              </Link>
            )}
            {isFeatureEnabled("PRODUCTS") && (
              <Link href="/offers" className="text-gray-600 hover:text-primary text-sm">
                Offers
              </Link>
            )}
            {isFeatureEnabled("PRODUCTS") && (
              <Link href="/cart" className="text-gray-600 hover:text-primary text-sm relative">
                Cart
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-4 bg-accent text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
            {isFeatureEnabled("ORDER_HISTORY") && session && (
              <Link href="/orders" className="text-gray-600 hover:text-primary text-sm">
                Orders
              </Link>
            )}
            {isFeatureEnabled("INTERNAL_CHAT") && session && (
              <Link href="/chat" className="text-gray-600 hover:text-primary text-sm relative">
                Messages
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-5 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {isFeatureEnabled("PRODUCER_ACCOUNTS") && role === "PRODUCER" && (
              <Link href="/producer/dashboard" className="text-gray-600 hover:text-primary text-sm">
                Dashboard
              </Link>
            )}
            {isFeatureEnabled("REPRESENTATIVE_APPLICATIONS") &&
              role !== "REPRESENTATIVE" && (
                <Link
                  href="/representative/apply"
                  className="text-gray-600 hover:text-primary text-sm"
                >
                  Become a Representative
                </Link>
              )}
            {isFeatureEnabled("REPRESENTATIVE_SYSTEM") && role === "REPRESENTATIVE" && (
              <Link href="/representative" className="text-gray-600 hover:text-primary text-sm">
                Representative
              </Link>
            )}
            {role === "ADMIN" && (
              <Link href="/admin" className="text-gray-600 hover:text-primary text-sm">
                Admin
              </Link>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <div className="flex items-center gap-3">
                <NotificationBell />
                <Link href="/account" className="text-sm text-gray-600 hover:text-primary">
                  {session.user?.name}
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="btn-ghost text-sm"
                >
                  Logout
                </button>
              </div>
            ) : isFeatureEnabled("BUYER_ACCOUNTS") ? (
              <>
                <Link href="/auth/login" className="btn-ghost text-sm">
                  Login
                </Link>
                <Link href="/auth/signup" className="btn-primary text-sm !px-4 !py-2">
                  Sign Up
                </Link>
              </>
            ) : null}
          </div>

          <button
            className="md:hidden p-2 text-gray-600"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {isFeatureEnabled("PRODUCTS") && (
          <form
            onSubmit={submitSearch}
            role="search"
            aria-label="Search products"
            className="hidden md:block border-t border-gray-100 py-3"
          >
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search handmade products..."
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          </form>
        )}

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-gray-100 mt-2 pt-4">
            <div className="flex flex-col gap-3">
              {session && (
                <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                  <NotificationBell />
                  <span className="text-sm text-gray-600">
                    {session.user?.name}
                  </span>
                </div>
              )}
              {isFeatureEnabled("PRODUCTS") && (
                <Link href="/search" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Search</Link>
              )}
              {isFeatureEnabled("PRODUCTS") && (
                <Link href="/offers" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Offers</Link>
              )}
              {isFeatureEnabled("PRODUCTS") && (
                <Link href="/cart" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Cart</Link>
              )}
              {isFeatureEnabled("REPRESENTATIVE_APPLICATIONS") &&
                role !== "REPRESENTATIVE" && (
                  <Link href="/representative/apply" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Become a Representative</Link>
                )}
              {isFeatureEnabled("REPRESENTATIVE_SYSTEM") && role === "REPRESENTATIVE" && (
                <Link href="/representative" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Representative</Link>
              )}
              {isFeatureEnabled("ORDER_HISTORY") && session && (
                <Link href="/orders" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Orders</Link>
              )}
              {isFeatureEnabled("INTERNAL_CHAT") && session && (
                <Link href="/chat" className="text-gray-600 hover:text-primary text-sm relative" onClick={() => setMobileOpen(false)}>
                  Messages
                  {unreadCount > 0 && (
                    <span className="ml-2 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full inline-flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
              )}
              {isFeatureEnabled("PRODUCER_ACCOUNTS") && role === "PRODUCER" && (
                <Link href="/producer/dashboard" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Dashboard</Link>
              )}
              {role === "ADMIN" && (
                <Link href="/admin" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Admin</Link>
              )}
              {session ? (
                <>
                  <Link href="/account" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>My Profile</Link>
                  <button
                    onClick={() => { signOut({ callbackUrl: "/" }); setMobileOpen(false); }}
                    className="text-left text-gray-600 hover:text-primary text-sm"
                  >
                    Logout
                  </button>
                </>
              ) : isFeatureEnabled("BUYER_ACCOUNTS") ? (
                <>
                  <Link href="/auth/login" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Login</Link>
                  <Link href="/auth/signup" className="text-primary font-medium text-sm" onClick={() => setMobileOpen(false)}>Sign Up</Link>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
