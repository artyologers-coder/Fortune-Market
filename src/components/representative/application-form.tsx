"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

const PROVINCES = ["Western", "Central", "Southern", "Northern", "Eastern", "North Western", "Uva", "Sabaragamuwa"];

type Errors = Record<string, string>;

const EMPTY = {
  fullName: "", email: "", phone: "", whatsapp: "", password: "", confirmPassword: "",
  nic: "", dateOfBirth: "", address: "", district: "", province: "", preferredArea: "",
  coverageAreas: "", experience: "", occupation: "", socialProfileLink: "",
  bankName: "", bankAccountName: "", bankAccountNumber: "", bankBranch: "",
  agreedTerms: false, agreedCommission: false, agreedPrivacy: false, confirmedAccurate: false,
};

const inputCls = "input-field";
const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";
const errCls = "text-sm text-red-600 mt-1";

function Field({
  label, required, error, children, hint,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {error && <p className={errCls}>{error}</p>}
    </div>
  );
}

export function ApplicationForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field error as soon as the applicant starts fixing it.
    setErrors((e) => (e[key as string] ? { ...e, [key as string]: undefined } as Errors : e));
  };

  const agreementsDone =
    form.agreedTerms && form.agreedCommission && form.agreedPrivacy && form.confirmedAccurate;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);

    // Cheap client-side pass so the applicant is not made to wait on a
    // round-trip for the obvious mistakes. The server revalidates everything.
    const local: Errors = {};
    if (form.fullName.trim().length < 3) local.fullName = "Please enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
      local.email = "Please enter a valid email address.";
    if (!/^0\d{9}$/.test(form.phone.trim()))
      local.phone = "Enter a 10-digit mobile number, e.g. 0771234567.";
    if (form.whatsapp && !/^0\d{9}$/.test(form.whatsapp.trim()))
      local.whatsapp = "Enter a 10-digit mobile number, e.g. 0771234567.";
    if (form.password.length < 8) local.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword)
      local.confirmPassword = "The two passwords do not match.";
    if (!form.district) local.district = "Please select your district.";
    if (!agreementsDone) local.agreements = "Please confirm all four statements below.";

    if (Object.keys(local).length) {
      setErrors(local);
      setBanner({ tone: "error", text: "Please fix the highlighted fields." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/representative/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          whatsapp: form.whatsapp || null,
          password: form.password,
          nic: form.nic || null,
          dateOfBirth: form.dateOfBirth || null,
          address: form.address || null,
          district: form.district,
          province: form.province || null,
          preferredArea: form.preferredArea || null,
          coverageAreas: form.coverageAreas
            ? form.coverageAreas.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          experience: form.experience || null,
          occupation: form.occupation || null,
          socialProfileLink: form.socialProfileLink || null,
          bankName: form.bankName || null,
          bankAccountName: form.bankAccountName || null,
          bankAccountNumber: form.bankAccountNumber || null,
          bankBranch: form.bankBranch || null,
          agreedTerms: form.agreedTerms,
          agreedCommission: form.agreedCommission,
          agreedPrivacy: form.agreedPrivacy,
          confirmedAccurate: form.confirmedAccurate,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.field) setErrors({ [data.field]: data.error });
        setBanner({
          tone: "error",
          text: data.error ?? "We could not submit your application. Please try again.",
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setBanner({ tone: "success", text: data.message });
      setForm(EMPTY);
    } catch {
      setBanner({ tone: "error", text: "Network problem. Please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {banner && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            banner.tone === "success"
              ? "bg-primary-50 text-primary-800 border border-primary-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {banner.text}
          {banner.tone === "success" && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="underline font-medium"
              >
                Go to sign in
              </button>
            </div>
          )}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-gray-900 mb-2">About you</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name" required error={errors.fullName}>
            <input className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" required error={errors.email}>
            <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Mobile number" required error={errors.phone} hint="10 digits, starting with 0">
            <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="numeric" autoComplete="tel-national" />
          </Field>
          <Field label="WhatsApp number" error={errors.whatsapp} hint="Optional. If different from your mobile.">
            <input className={inputCls} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="numeric" autoComplete="tel-national" />
          </Field>
          <Field label="NIC number" error={errors.nic} hint="Optional">
            <input className={inputCls} value={form.nic} onChange={(e) => set("nic", e.target.value)} />
          </Field>
          <Field label="Date of birth" error={errors.dateOfBirth} hint="You must be at least 18">
            <input type="date" className={inputCls} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          </Field>
          <Field label="Occupation" error={errors.occupation} hint="Optional">
            <input className={inputCls} value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
          </Field>
          <Field label="District" required error={errors.district}>
            <select className={inputCls} value={form.district} onChange={(e) => set("district", e.target.value)}>
              <option value="">Select a district</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Province" error={errors.province} hint="Optional">
            <select className={inputCls} value={form.province} onChange={(e) => set("province", e.target.value)}>
              <option value="">Select a province</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Home address" error={errors.address} hint="Optional">
          <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-gray-900 mb-2">Your territory and experience</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Main area you cover" error={errors.preferredArea} hint="Optional">
            <input className={inputCls} value={form.preferredArea} onChange={(e) => set("preferredArea", e.target.value)} placeholder="e.g. Gampaha town" />
          </Field>
          <Field label="Areas you can cover" error={errors.coverageAreas} hint="Comma separated, optional">
            <input className={inputCls} value={form.coverageAreas} onChange={(e) => set("coverageAreas", e.target.value)} placeholder="e.g. Gampaha, Kalutara, Western" />
          </Field>
          <Field label="Relevant experience" error={errors.experience} hint="Optional">
            <input className={inputCls} value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="e.g. 5 years selling rice" />
          </Field>
          <Field label="Social profile link" error={errors.socialProfileLink} hint="Optional">
            <input className={inputCls} value={form.socialProfileLink} onChange={(e) => set("socialProfileLink", e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-gray-900 mb-2">Payment details</legend>
        <p className="text-sm text-gray-600">
          We need a bank account to pay your commission. These are never shown to producers
          and are never included in any admin list view.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Bank name" error={errors.bankName} hint="Optional">
            <input className={inputCls} value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
          </Field>
          <Field label="Name on the account" error={errors.bankAccountName} hint="Optional">
            <input className={inputCls} value={form.bankAccountName} onChange={(e) => set("bankAccountName", e.target.value)} />
          </Field>
          <Field label="Account number" error={errors.bankAccountNumber} hint="Optional">
            <input className={inputCls} value={form.bankAccountNumber} onChange={(e) => set("bankAccountNumber", e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Branch" error={errors.bankBranch} hint="Optional">
            <input className={inputCls} value={form.bankBranch} onChange={(e) => set("bankBranch", e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-gray-900 mb-2">Confirmations</legend>
        {([
          ["agreedTerms", "I have read and agree to the programme terms."],
          ["agreedCommission", "I understand my commission, and that it is paid only after a producer I referred is approved."],
          ["agreedPrivacy", "I understand how my personal and bank details are stored and used."],
          ["confirmedAccurate", "Everything I have written above is true and complete."],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={form[key]}
              onChange={(e) => set(key, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
        {errors.agreements && <p className={errCls}>{errors.agreements}</p>}
      </fieldset>

      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit application"}
      </button>
      <p className="text-xs text-gray-500 text-center">
        By submitting you agree to be contacted by a Fortune Market admin about this application.
      </p>
    </form>
  );
}
