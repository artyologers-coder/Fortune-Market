"use client";

import { useCallback, useEffect, useState } from "react";

const DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  REGISTRATION_STARTED: "Registration started",
  REGISTERED: "Registered",
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_CONFIRMED: "Payment confirmed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NOT_INTERESTED: "Not interested",
  DUPLICATE: "Duplicate",
};

const FILTER_STATUSES = ["ALL", "NEW", "CONTACTED", "INTERESTED", "REGISTRATION_STARTED", "REGISTERED", "PAYMENT_PENDING", "PAYMENT_CONFIRMED", "APPROVED", "REJECTED", "NOT_INTERESTED", "DUPLICATE"];

type Lead = {
  id: string;
  leadCode: string;
  contactName: string;
  phone: string;
  whatsapp: string | null;
  district: string;
  area: string | null;
  productCategory: string | null;
  notes: string | null;
  status: string;
  statusLocked: boolean;
  duplicateSuspect: boolean;
  duplicateNote: string | null;
  producerId: string | null;
  contactedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
};

const inputCls = "input-field";

export function LeadsManager() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [counts, setCounts] = useState<{ total: number; open: number; converted: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/representative/leads", { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not load your leads.");
        return;
      }
      const data = await res.json();
      setLeads(data.leads);
      setCounts(data.counts);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function move(lead: Lead, status: string) {
    setError(null);
    const res = await fetch("/api/representative/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not update that lead.");
      return;
    }
    load();
  }

  if (error && !leads) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const visible = (leads ?? []).filter((l) => filter === "ALL" || l.status === filter);

  return (
    <div className="space-y-6">
      {error && (
        <p role="status" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {counts && (
          <div className="flex gap-4 text-sm text-gray-600 mr-auto">
            <span><strong className="text-gray-900">{counts.total}</strong> total</span>
            <span><strong className="text-gray-900">{counts.open}</strong> open</span>
            <span><strong className="text-gray-900">{counts.converted}</strong> converted</span>
          </div>
        )}
        <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-primary !py-2 !px-4 text-sm">
          {showForm ? "Close" : "Add lead"}
        </button>
      </div>

      {showForm && (
        <LeadForm
          onDone={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {FILTER_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {s === "ALL" ? "All" : STATUS_LABELS[s] ?? s}
          </button>
        ))}
      </div>

      {!leads ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-600">
            {leads.length === 0
              ? "You have not recorded any leads yet. Add one so you can keep track of who you have spoken to."
              : "No leads with that status."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((lead) => (
            <LeadRow key={lead.id} lead={lead} onMove={move} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, onMove }: { lead: Lead; onMove: (l: Lead, s: string) => void }) {
  // The registration and payment flow owns these. Showing them as a button
  // would let the rep click their way to a status the business has not earned.
  const locked = lead.statusLocked || !["NEW", "CONTACTED", "INTERESTED", "REGISTRATION_STARTED", "NOT_INTERESTED", "DUPLICATE"].includes(lead.status);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{lead.contactName}</p>
            <span className="badge-pending">{STATUS_LABELS[lead.status] ?? lead.status}</span>
            {lead.duplicateSuspect && (
              <span className="badge-rejected" title={lead.duplicateNote ?? "Possible duplicate"}>
                Possible duplicate
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {lead.phone}
            {lead.whatsapp ? ` · WhatsApp ${lead.whatsapp}` : ""} · {lead.district}
            {lead.area ? ` · ${lead.area}` : ""}
          </p>
          {lead.productCategory && (
            <p className="text-xs text-gray-500 mt-0.5">Product: {lead.productCategory}</p>
          )}
          {lead.notes && <p className="text-xs text-gray-500 mt-1">{lead.notes}</p>}
          <p className="text-xs text-gray-400 mt-1">
            {lead.leadCode} · added{" "}
            {new Date(lead.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="shrink-0">
          {locked ? (
            <p className="text-xs text-gray-500 max-w-[16rem] text-right">
              This status is set by the registration and payment process.
            </p>
          ) : (
            <select
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
              value={lead.status}
              onChange={(e) => onMove(lead, e.target.value)}
            >
              {["NEW", "CONTACTED", "INTERESTED", "REGISTRATION_STARTED", "NOT_INTERESTED", "DUPLICATE"].map(
                (s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                )
              )}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    contactName: "", phone: "", whatsapp: "", district: "", area: "",
    productCategory: "", notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);

    const local: Record<string, string> = {};
    if (form.contactName.trim().length < 2) local.contactName = "Enter the contact's name.";
    if (!/^0\d{9}$/.test(form.phone.trim())) local.phone = "Enter a 10-digit number, e.g. 0771234567.";
    if (form.whatsapp && !/^0\d{9}$/.test(form.whatsapp.trim())) local.whatsapp = "Enter a 10-digit number.";
    if (!form.district) local.district = "Select a district.";
    if (Object.values(local).some(Boolean)) {
      setErrors(local);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/representative/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.field) setErrors({ [data.field]: data.error });
        setBanner(data.error ?? "Could not save that lead.");
        return;
      }
      onDone();
    } catch {
      setBanner("Network problem. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">Add a lead</h3>
      {banner && (
        <p role="status" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {banner}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Contact name" error={errors.contactName}>
          <input className={inputCls} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Mobile number" error={errors.phone}>
          <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="WhatsApp number" error={errors.whatsapp} hint="Optional">
          <input className={inputCls} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="District" error={errors.district}>
          <select className={inputCls} value={form.district} onChange={(e) => set("district", e.target.value)}>
            <option value="">Select a district</option>
            {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Area" hint="Optional">
          <input className={inputCls} value={form.area} onChange={(e) => set("area", e.target.value)} />
        </Field>
        <Field label="Product category" hint="Optional">
          <input className={inputCls} value={form.productCategory} onChange={(e) => set("productCategory", e.target.value)} placeholder="e.g. Rice" />
        </Field>
      </div>
      <Field label="Notes" hint="Optional">
        <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary !py-2 !px-4 text-sm" disabled={saving}>
          {saving ? "Saving…" : "Save lead"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label, error, hint, children,
}: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  );
}
