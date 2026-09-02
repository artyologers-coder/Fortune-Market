"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function CreateOfferPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    title: "",
    titleSi: "",
    description: "",
    descriptionSi: "",
    discountPercent: "",
    startDate: "",
    endDate: "",
  });

  if (status === "unauthenticated") {
    router.push("/auth/login");
    return null;
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create offer");
      }
    } catch {
      alert("Something went wrong");
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div className="page-container text-center py-16">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Offer Submitted!</h1>
        <p className="text-gray-500 mb-6">Your offer has been submitted for admin approval.</p>
        <button onClick={() => router.push("/producer/dashboard")} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Create Special Offer</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (English)</label>
            <input type="text" value={form.title} onChange={(e) => update("title", e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (Sinhala)</label>
            <input type="text" value={form.titleSi} onChange={(e) => update("titleSi", e.target.value)} className="input-field" required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (English)</label>
          <textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="input-field" rows={3} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (Sinhala)</label>
          <textarea value={form.descriptionSi} onChange={(e) => update("descriptionSi", e.target.value)} className="input-field" rows={3} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount %</label>
            <input type="number" value={form.discountPercent} onChange={(e) => update("discountPercent", e.target.value)} className="input-field" required min="1" max="99" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="datetime-local" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input type="datetime-local" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} className="input-field" required />
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <button type="button" onClick={() => router.push("/producer/dashboard")} className="btn-ghost">
            ← Back
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>
      </form>
    </div>
  );
}
