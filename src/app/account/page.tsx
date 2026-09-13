"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  role: string;
}

interface ProducerProfile {
  id: string;
  businessName: string;
  businessNameSi: string;
  description: string | null;
  descriptionSi: string | null;
  location: string;
  district: string;
  phone: string;
  verificationStatus: string;
}

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [producer, setProducer] = useState<ProducerProfile | null | undefined>(undefined);

  const [personal, setPersonal] = useState({ name: "", email: "", phone: "", currentPassword: "" });
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalMsg, setPersonalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [business, setBusiness] = useState({
    businessName: "",
    businessNameSi: "",
    description: "",
    descriptionSi: "",
    location: "",
    district: "",
    phone: "",
  });
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessMsg, setBusinessMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/user/profile").then((r) => r.json()).catch(() => ({ user: null })),
        fetch("/api/producer/profile").then((r) => r.json()).catch(() => ({ producer: null })),
      ]).then(([userData, producerData]) => {
        if (userData.user) {
          setUser(userData.user);
          setPersonal({
            name: userData.user.name || "",
            email: userData.user.email || "",
            phone: userData.user.phone || "",
            currentPassword: "",
          });
        }
        const prod = producerData.producer ?? null;
        setProducer(prod);
        if (prod) {
          setBusiness({
            businessName: prod.businessName || "",
            businessNameSi: prod.businessNameSi || "",
            description: prod.description || "",
            descriptionSi: prod.descriptionSi || "",
            location: prod.location || "",
            district: prod.district || "",
            phone: prod.phone || "",
          });
        }
        setLoading(false);
      });
    }
  }, [status, router]);

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    setPersonalMsg(null);

    const emailChanged = Boolean(user && personal.email !== user.email);
    if (emailChanged && !personal.currentPassword) {
      setPersonalMsg({ type: "error", text: "Enter your current password to change your email" });
      return;
    }

    setPersonalSaving(true);
    try {
      const payload: Record<string, string> = {
        name: personal.name,
        email: personal.email,
        phone: personal.phone,
      };
      if (emailChanged && personal.currentPassword) {
        payload.currentPassword = personal.currentPassword;
      }
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setPersonal({ ...personal, currentPassword: "" });
        setPersonalMsg({ type: "success", text: "Profile details saved" });
        await update();
      } else {
        setPersonalMsg({ type: "error", text: data.error || "Failed to save profile" });
      }
    } catch {
      setPersonalMsg({ type: "error", text: "Something went wrong" });
    }
    setPersonalSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);

    if (pwd.newPassword.length < 6) {
      setPwdMsg({ type: "error", text: "New password must be at least 6 characters" });
      return;
    }
    if (pwd.newPassword !== pwd.confirmPassword) {
      setPwdMsg({ type: "error", text: "Passwords do not match" });
      return;
    }

    setPwdSaving(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pwd.currentPassword,
          newPassword: pwd.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwd({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setPwdMsg({ type: "success", text: "Password updated successfully" });
      } else {
        setPwdMsg({ type: "error", text: data.error || "Failed to update password" });
      }
    } catch {
      setPwdMsg({ type: "error", text: "Something went wrong" });
    }
    setPwdSaving(false);
  }

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBusinessMsg(null);
    setBusinessSaving(true);
    try {
      const res = await fetch("/api/producer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(business),
      });
      const data = await res.json();
      if (res.ok) {
        setBusinessMsg({ type: "success", text: "Business profile saved" });
      } else {
        setBusinessMsg({ type: "error", text: data.error || "Failed to save business profile" });
      }
    } catch {
      setBusinessMsg({ type: "error", text: "Something went wrong" });
    }
    setBusinessSaving(false);
  }

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">My Profile</h1>
      <p className="text-gray-500 mb-6">
        {session?.user?.role === "PRODUCER" ? "Account and business details" : "Manage your account details"}
      </p>

      {!user && (
        <div className="card p-8 text-center">
          <p className="text-gray-500">Could not load your profile.</p>
        </div>
      )}

      {user && (
        <>
          <form onSubmit={handleSavePersonal} className="card p-6 space-y-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Personal Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={personal.name}
                onChange={(e) => setPersonal((prev) => ({ ...prev, name: e.target.value }))}
                className="input-field"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={personal.email}
                  onChange={(e) => setPersonal((prev) => ({ ...prev, email: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={personal.phone}
                  onChange={(e) => setPersonal((prev) => ({ ...prev, phone: e.target.value }))}
                  className="input-field"
                  placeholder="+947XXXXXXXX"
                />
              </div>
            </div>

            {user && personal.email !== user.email && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={personal.currentPassword}
                  onChange={(e) => setPersonal((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  className="input-field"
                  autoComplete="current-password"
                />
                <p className="text-xs text-gray-500 mt-1">Required to change your email</p>
              </div>
            )}

            {personalMsg && (
              <div className={`p-3 rounded-lg text-sm ${personalMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {personalMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={personalSaving} className="btn-primary">
                {personalSaving ? "Saving..." : "Save Details"}
              </button>
            </div>
          </form>

          <form onSubmit={handleChangePassword} className="card p-6 space-y-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={pwd.currentPassword}
                onChange={(e) => setPwd((prev) => ({ ...prev, currentPassword: e.target.value }))}
                className="input-field"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={pwd.newPassword}
                  onChange={(e) => setPwd((prev) => ({ ...prev, newPassword: e.target.value }))}
                  className="input-field"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={pwd.confirmPassword}
                  onChange={(e) => setPwd((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  className="input-field"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            {pwdMsg && (
              <div className={`p-3 rounded-lg text-sm ${pwdMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {pwdMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={pwdSaving} className="btn-primary">
                {pwdSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>

          {producer === undefined && (
            <div className="card p-6 text-center text-gray-500 mb-6">Loading business details...</div>
          )}

          {producer === null && (
            <div className="card p-8 text-center mb-6">
              <div className="text-5xl mb-4">📝</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Complete your seller registration</h2>
              <p className="text-gray-500 mb-4">
                Your account is registered as a Seller, but your business profile is not submitted yet.
              </p>
              <Link href="/producer/onboarding" className="btn-primary inline-block">
                Continue Registration
              </Link>
            </div>
          )}

          {producer && (
            <form onSubmit={handleSaveBusiness} className="card p-6 space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Business Profile</h2>
                <span className="badge-pending text-xs">
                  {producer.verificationStatus === "APPROVED"
                    ? "✓ Verified"
                    : producer.verificationStatus === "REJECTED"
                    ? "Rejected"
                    : "⏳ Pending Verification"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Name (English)</label>
                  <input
                    type="text"
                    value={business.businessName}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, businessName: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Name (Sinhala)</label>
                  <input
                    type="text"
                    value={business.businessNameSi}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, businessNameSi: e.target.value }))}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (English)</label>
                  <textarea
                    value={business.description}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, description: e.target.value }))}
                    className="input-field"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (Sinhala)</label>
                  <textarea
                    value={business.descriptionSi}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, descriptionSi: e.target.value }))}
                    className="input-field"
                    rows={3}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={business.location}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, location: e.target.value }))}
                    className="input-field"
                    placeholder="City/Town"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                  <input
                    type="text"
                    value={business.district}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, district: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={business.phone}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, phone: e.target.value }))}
                    className="input-field"
                    placeholder="+947XXXXXXXX"
                    required
                  />
                </div>
              </div>

              {businessMsg && (
                <div className={`p-3 rounded-lg text-sm ${businessMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {businessMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <button type="submit" disabled={businessSaving} className="btn-primary">
                  {businessSaving ? "Saving..." : "Save Business Profile"}
                </button>
              </div>
            </form>
          )}

          {session?.user?.role === "PRODUCER" && (
            <div className="flex justify-center mb-8">
              <Link href="/producer/dashboard" className="btn-ghost">
                ← Back to Dashboard
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}