"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
  nameSi: string;
  slug: string;
}

export default function ProducerOnboarding() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    businessNameSi: "",
    description: "",
    descriptionSi: "",
    location: "",
    district: "",
    phone: "",
    selectedCategory: "",
    productName: "",
    productNameSi: "",
    productDescription: "",
    productDescriptionSi: "",
    productPrice: "",
    productStock: "",
    productUnit: "piece",
    productUnitSi: "කැබැල්ල",
  });

  useEffect(() => {
    const slugs = ["foods", "crafts", "naturals", "fashion"];
    const names = ["ආහාර", "වෙළඳ භාණ්ඩ", "ස්වාභාවික", "විලාසිතා"];
    const engNames = ["Foods", "Crafts", "Naturals", "Fashion"];
    setCategories(
      slugs.map((slug, i) => ({
        id: `cat-${slug}`,
        name: engNames[i],
        nameSi: names[i],
        slug,
      }))
    );
  }, []);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setLoading(true);

    try {
      const res = await fetch("/api/producer/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        alert(data.error || "Submission failed");
      }
    } catch {
      alert("Something went wrong");
    }

    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="page-container text-center py-16">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Application Submitted!</h1>
        <p className="text-gray-500 mb-6">
          Your producer application has been submitted. Our team will review it and verify your account.
        </p>
        <button onClick={() => router.push("/")} className="btn-primary">
          Go to Homepage
        </button>
      </div>
    );
  }

  const districts = [
    "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
    "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mullaitivu",
    "Vavuniya", "Mannar", "Batticaloa", "Ampara", "Trincomalee", "Kurunegala",
    "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla", "Monaragala", "Ratnapura", "Kegalle",
  ];

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Become a Producer</h1>
      <p className="text-gray-500 mb-8">Set up your shop on Fortune Market</p>

      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                s <= step ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {s}
            </div>
            {s < 4 && <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Business Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name (English)</label>
              <input type="text" value={form.businessName} onChange={(e) => update("businessName", e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name (Sinhala)</label>
              <input type="text" value={form.businessNameSi} onChange={(e) => update("businessNameSi", e.target.value)} className="input-field" required />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
              <select value={form.district} onChange={(e) => update("district", e.target.value)} className="input-field">
                <option value="">Select district</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input type="text" value={form.location} onChange={(e) => update("location", e.target.value)} className="input-field" placeholder="City/Town" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input-field" placeholder="+947XXXXXXXX" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="btn-primary">
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Select Your Category</h2>
          <div className="grid grid-cols-2 gap-4">
            {["foods", "crafts", "naturals", "fashion"].map((slug) => (
              <button
                key={slug}
                onClick={() => update("selectedCategory", slug)}
                className={`p-4 rounded-xl border-2 text-center transition-colors ${
                  form.selectedCategory === slug
                    ? "border-primary bg-primary-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="text-3xl block mb-2">
                  {slug === "foods" ? "🍛" : slug === "crafts" ? "🎨" : slug === "naturals" ? "🌿" : "👗"}
                </span>
                <span className="font-medium capitalize">{slug}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
            <button onClick={() => setStep(3)} disabled={!form.selectedCategory} className="btn-primary">Next →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">First Product</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name (English)</label>
              <input type="text" value={form.productName} onChange={(e) => update("productName", e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name (Sinhala)</label>
              <input type="text" value={form.productNameSi} onChange={(e) => update("productNameSi", e.target.value)} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.productDescription} onChange={(e) => update("productDescription", e.target.value)} className="input-field" rows={3} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (Rs.)</label>
              <input type="number" value={form.productPrice} onChange={(e) => update("productPrice", e.target.value)} className="input-field" min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
              <input type="number" value={form.productStock} onChange={(e) => update("productStock", e.target.value)} className="input-field" min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <input type="text" value={form.productUnit} onChange={(e) => update("productUnit", e.target.value)} className="input-field" />
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-ghost">← Back</button>
            <button onClick={() => setStep(4)} className="btn-primary">Next →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Submit for Verification</h2>
          <div className="bg-primary-50 rounded-lg p-4 text-sm text-primary-700">
            <p className="font-medium mb-1">Review your information</p>
            <p>Our team will verify your business details before activating your producer account. This typically takes 1-2 business days.</p>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Business:</span> {form.businessNameSi || form.businessName}</p>
            <p><span className="text-gray-500">Category:</span> {form.selectedCategory}</p>
            <p><span className="text-gray-500">Location:</span> {form.location}, {form.district}</p>
            {form.productName && (
              <p><span className="text-gray-500">First Product:</span> {form.productNameSi || form.productName} — Rs. {form.productPrice}</p>
            )}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="btn-ghost">← Back</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary">
              {loading ? "Submitting..." : "Submit Application"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
