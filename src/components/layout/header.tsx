"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useCartCount } from "@/lib/cart-context";

export function Header() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const cartCount = useCartCount();

  const role = session?.user?.role;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="font-bold text-xl text-primary">
            Fortune Market
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/search" className="text-gray-600 hover:text-primary text-sm">
              Search
            </Link>
            <Link href="/offers" className="text-gray-600 hover:text-primary text-sm">
              Offers
            </Link>
            <Link href="/cart" className="text-gray-600 hover:text-primary text-sm relative">
              Cart
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-4 bg-accent text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
            {session && (
              <Link href="/orders" className="text-gray-600 hover:text-primary text-sm">
                Orders
              </Link>
            )}
            {role === "PRODUCER" && (
              <Link href="/producer/dashboard" className="text-gray-600 hover:text-primary text-sm">
                Dashboard
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
                <span className="text-sm text-gray-600">{session.user?.name}</span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="btn-ghost text-sm"
                >
                  Logout
                </button>
              </div>
            ) : (
              <>
                <Link href="/auth/login" className="btn-ghost text-sm">
                  Login
                </Link>
                <Link href="/auth/signup" className="btn-primary text-sm !px-4 !py-2">
                  Sign Up
                </Link>
              </>
            )}
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

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-gray-100 mt-2 pt-4">
            <div className="flex flex-col gap-3">
              <Link href="/search" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Search</Link>
              <Link href="/offers" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Offers</Link>
              <Link href="/cart" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Cart</Link>
              {session && (
                <Link href="/orders" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Orders</Link>
              )}
              {role === "PRODUCER" && (
                <Link href="/producer/dashboard" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Dashboard</Link>
              )}
              {role === "ADMIN" && (
                <Link href="/admin" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Admin</Link>
              )}
              {session ? (
                <button
                  onClick={() => { signOut({ callbackUrl: "/" }); setMobileOpen(false); }}
                  className="text-left text-gray-600 hover:text-primary text-sm"
                >
                  Logout
                </button>
              ) : (
                <>
                  <Link href="/auth/login" className="text-gray-600 hover:text-primary text-sm" onClick={() => setMobileOpen(false)}>Login</Link>
                  <Link href="/auth/signup" className="text-primary font-medium text-sm" onClick={() => setMobileOpen(false)}>Sign Up</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
