"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
  nameSi: string;
  slug: string;
  markupPercentage: number;
}

interface DomainProfile {
  id: string;
  domain: string;
  strategy: string;
  selectorConfig: string | null;
  requiresJsRender: boolean;
  supplierWhatsAppNumber: string | null;
  lastVerifiedAt: string | null;
}

interface WorkerStatus {
  running: boolean;
  syncing: boolean;
  intervalMinutes: number;
}

export default function ResellerSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [profiles, setProfiles] = useState<DomainProfile[]>([]);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    setRiskAcknowledged(localStorage.getItem("reseller-risk-acknowledged") === "true");
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role !== "ADMIN") {
        router.push("/");
        return;
      }
      fetchAll();
    }
  }, [session, status, router]);

  async function fetchAll() {
    try {
      const [catsRes, profilesRes, workerRes] = await Promise.all([
        fetch("/api/admin/reseller/categories"),
        fetch("/api/admin/reseller/settings"),
        fetch("/api/sync"),
      ]);

      if (catsRes.ok) {
        const data = await catsRes.json();
        setCategories(data.categories || []);
      }

      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.profiles || []);
      }

      if (workerRes.ok) {
        const data = await workerRes.json();
        setWorkerStatus(data);
      }
    } catch {
      console.error("Failed to fetch settings");
    }
    setLoading(false);
  }

  async function handleCategoryUpdate(categoryId: string, markupPercentage: number) {
    setSaving(categoryId);
    try {
      const res = await fetch("/api/admin/reseller/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: categoryId, markupPercentage }),
      });

      if (res.ok) {
        fetchAll();
      } else {
        alert("Failed to update category");
      }
    } catch {
      alert("Failed to update category");
    }
    setSaving(null);
  }

  async function handleRecalculate(categoryId?: string) {
    setRecalculating(true);
    try {
      const res = await fetch("/api/admin/reseller/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalculate", categoryId }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        fetchAll();
      } else {
        alert("Failed to recalculate");
      }
    } catch {
      alert("Failed to recalculate");
    }
    setRecalculating(false);
  }

  async function handleProfileUpdate(domain: string, supplierWhatsAppNumber: string) {
    setSaving(domain);
    try {
      const res = await fetch("/api/admin/reseller/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, supplierWhatsAppNumber }),
      });

      if (res.ok) {
        fetchAll();
      } else {
        alert("Failed to update profile");
      }
    } catch {
      alert("Failed to update profile");
    }
    setSaving(null);
  }

  async function handleTestSync() {
    if (!confirm("This will run a full sync pass on all reseller sources. Continue?")) return;

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_all" }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Sync completed: ${data.results?.length || 0} sources processed`);
        fetchAll();
      } else {
        alert("Sync failed");
      }
    } catch {
      alert("Sync failed");
    }
  }

  if (loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="page-container max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Reseller Settings</h1>

      {!riskAcknowledged && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-yellow-800 mb-2">⚠️ Terms of Service Risk Notice</h3>
          <p className="text-sm text-yellow-700 mb-3">
            Automated scraping of third-party sites may violate their Terms of Service.
            Please verify that the source platform offers an official affiliate/reseller API or data feed
            before relying on scraping long-term. Fortune Market is not responsible for any legal issues
            arising from scraping activities.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              onChange={(e) => {
                setRiskAcknowledged(e.target.checked);
                if (e.target.checked) localStorage.setItem("reseller-risk-acknowledged", "true");
              }}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-yellow-700">I understand and accept this risk</span>
          </label>
        </div>
      )}

      <div className="space-y-8">
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Category Markup Settings</h2>
            <button
              onClick={() => handleRecalculate()}
              disabled={recalculating}
              className="btn-primary"
            >
              {recalculating ? "Recalculating..." : "Recalculate All Prices"}
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Markup % is applied to the source price to calculate the Fortune Market selling price.
            Changing markup recalculates prices for all products in that category on next sync.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="pb-3">Category</th>
                  <th className="pb-3">Markup %</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{cat.nameSi}</p>
                      <p className="text-xs text-gray-500">{cat.name} ({cat.slug})</p>
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        value={cat.markupPercentage}
                        onChange={(e) => handleCategoryUpdate(cat.id, parseFloat(e.target.value))}
                        disabled={saving === cat.id}
                        className="w-24 input-field text-center"
                        min="0"
                        max="100"
                        step="0.5"
                      />
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleRecalculate(cat.id)}
                        disabled={recalculating}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        Recalculate Now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Supplier WhatsApp Numbers (per domain)</h2>
          <p className="text-sm text-gray-500 mb-4">
            These numbers are used to generate WhatsApp deep links when forwarding orders to suppliers.
            Format: +947XXXXXXXX (country code + number, no spaces).
          </p>

          {profiles.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No domain profiles yet. They are created automatically when products are imported.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                    <th className="pb-3">Domain</th>
                    <th className="pb-3">Strategy</th>
                    <th className="pb-3">JS Render</th>
                    <th className="pb-3">Supplier WhatsApp</th>
                    <th className="pb-3">Last Verified</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-900">{profile.domain}</td>
                      <td className="py-3 text-sm text-gray-500">{profile.strategy}</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          profile.requiresJsRender ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {profile.requiresJsRender ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="py-3">
                        <input
                          type="tel"
                          value={profile.supplierWhatsAppNumber || ""}
                          onChange={(e) => handleProfileUpdate(profile.domain, e.target.value)}
                          disabled={saving === profile.domain}
                          placeholder="+947XXXXXXXX"
                          className="input-field w-48"
                        />
                      </td>
                      <td className="py-3 text-sm text-gray-500">
                        {profile.lastVerifiedAt ? new Date(profile.lastVerifiedAt).toLocaleDateString() : "Never"}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => handleProfileUpdate(profile.domain, profile.supplierWhatsAppNumber || "")}
                          disabled={saving === profile.domain}
                          className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Sync Worker Status</h2>
          <p className="text-sm text-gray-500 mb-4">
            The reseller sync runs as a separate Node.js worker process (not in the browser).
            Start it with <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">npm run worker</code>
            on your server. It runs every {workerStatus?.intervalMinutes || 30} minutes.
          </p>

          {workerStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-500">Worker Running</p>
                <p className="text-2xl font-bold text-gray-900">{workerStatus.running ? "Yes" : "No"}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-500">Currently Syncing</p>
                <p className="text-2xl font-bold text-gray-900">{workerStatus.syncing ? "Yes" : "No"}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-500">Interval (minutes)</p>
                <p className="text-2xl font-bold text-gray-900">{workerStatus.intervalMinutes}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleTestSync}
              className="btn-primary"
            >
              Run Full Sync Now
            </button>
            <a href="/admin/reseller-import" className="btn-ghost">
              Import New Product
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}