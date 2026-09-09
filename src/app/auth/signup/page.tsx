"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { isFeatureEnabled } from "@/lib/feature-flags";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "BUYER" as "BUYER" | "PRODUCER",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: form.role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      if (form.phone) {
        router.push(`/auth/verify-otp?phone=${encodeURIComponent(form.phone)}`);
      } else {
        router.push("/auth/login");
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const buyerEnabled = isFeatureEnabled("BUYER_ACCOUNTS");
  const producerEnabled = isFeatureEnabled("PRODUCER_ACCOUNTS");

  if (!buyerEnabled && !producerEnabled) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Coming Soon</h1>
          <p className="text-gray-500 mb-6">Account registration is not yet available.</p>
          <Link href="/" className="btn-primary">Go to Homepage</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Logo className="h-16 w-auto mx-auto mb-4" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Sign Up</h1>
          <p className="text-gray-500 mt-2">Create your Fortune Market account</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
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
            {buyerEnabled && producerEnabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => update("role", "BUYER")}
                    className={`p-3 rounded-lg border-2 text-center transition-colors ${
                      form.role === "BUYER"
                        ? "border-primary bg-primary-50 text-primary font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Buyer
                  </button>
                  <button
                    type="button"
                    onClick={() => update("role", "PRODUCER")}
                    className={`p-3 rounded-lg border-2 text-center transition-colors ${
                      form.role === "PRODUCER"
                        ? "border-primary bg-primary-50 text-primary font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Producer
                  </button>
                </div>
              </div>
            )}
            {!buyerEnabled && producerEnabled && (
              <input type="hidden" name="role" value="PRODUCER" />
            )}
            {buyerEnabled && !producerEnabled && (
              <input type="hidden" name="role" value="BUYER" />
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className="input-field"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-6"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary font-medium hover:underline">
              Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
