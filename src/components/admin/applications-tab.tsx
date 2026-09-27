"use client";

import { useCallback, useEffect, useState } from "react";

type Application = {
  id: string;
  applicationCode: string;
  status: string;
  fullName: string;
  email: string;
  phone: string;
  whatsapp: string | null;
  district: string;
  province: string | null;
  preferredArea: string | null;
  experience: string | null;
  occupation: string | null;
  agreedTerms: boolean;
  agreedCommission: boolean;
  agreedPrivacy: boolean;
  confirmedAccurate: boolean;
  agreementsAt: string | null;
  reviewNotes: string | null;
  infoRequestNote: string | null;
  infoRequestedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  representativeId: string | null;
  representative: { id: string; code: string; status: string } | null;
};

/**
 * Pending representative applications.
 *
 * The bank account number is deliberately absent from this payload, so there is
 * no way to render it here even by accident. It is on the individual
 * application's detail, which this view does not fetch.
 */
export function ApplicationsTab() {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/representative-applications?status=PENDING,UNDER_REVIEW", {
        cache: "no-store",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not load applications.");
        return;
      }
      setApplications((await res.json()).applications);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(app: Application, action: "approve" | "reject" | "request-info") {
    const reason = note[app.id]?.trim() ?? "";

    // Approving mints a permanent representative code, so it is a single
    // deliberate click rather than something an accidental double-press can do.
    if (action === "approve" && !confirm(
      `Approve ${app.fullName}?\n\nThis creates representative ${app.fullName} with a permanent referral code and gives them a login.`
    )) {
      return;
    }
    if (action === "reject" && !reason) {
      setFlash({ tone: "err", text: "A rejection needs a reason so the applicant can be told why." });
      return;
    }
    if (action === "request-info" && !reason) {
      setFlash({ tone: "err", text: "Say what information you need from the applicant." });
      return;
    }

    setBusy(app.id);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/representative-applications/${app.id}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ tone: "err", text: data.error ?? "That action failed." });
        return;
      }
      setFlash({
        tone: "ok",
        text: data.code
          ? `${data.message} Representative code: ${data.code}`
          : data.message ?? "Done.",
      });
      load();
    } catch {
      setFlash({ tone: "err", text: "Network problem. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      {flash && (
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm border ${
            flash.tone === "ok"
              ? "bg-primary-50 text-primary-800 border-primary-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {flash.text}
        </p>
      )}

      {!applications ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : applications.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">
          No applications are waiting for review.
        </div>
      ) : (
        applications.map((app) => (
          <div key={app.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{app.fullName}</p>
                <p className="text-sm text-gray-600">
                  {app.email} · {app.phone}
                  {app.whatsapp ? ` · WhatsApp ${app.whatsapp}` : ""}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {app.applicationCode} · {app.district}
                  {app.province ? `, ${app.province}` : ""}
                  {app.preferredArea ? ` · ${app.preferredArea}` : ""} · applied{" "}
                  {new Date(app.createdAt).toLocaleDateString("en-GB")}
                </p>
                {app.occupation && <p className="text-xs text-gray-500">{app.occupation}</p>}
                {app.experience && <p className="text-xs text-gray-500">{app.experience}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={app.status === "PENDING" ? "badge-pending" : "badge-verified"}>
                  {app.status === "PENDING" ? "New" : "Awaiting applicant"}
                </span>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setExpanded(expanded === app.id ? null : app.id)}
                >
                  {expanded === app.id ? "Hide" : "Details"}
                </button>
              </div>
            </div>

            {app.infoRequestNote && (
              <p className="mt-3 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                We asked: {app.infoRequestNote}
                {app.infoRequestedAt
                  ? ` (${new Date(app.infoRequestedAt).toLocaleDateString("en-GB")})`
                  : ""}
              </p>
            )}
            {app.reviewNotes && (
              <p className="mt-3 text-sm text-gray-600">Review note: {app.reviewNotes}</p>
            )}

            {expanded === app.id && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium text-gray-900 mb-1">Confirmations</p>
                <ul className="space-y-0.5 text-gray-600">
                  <li>Terms accepted: {app.agreedTerms ? "yes" : "no"}</li>
                  <li>Commission understood: {app.agreedCommission ? "yes" : "no"}</li>
                  <li>Privacy accepted: {app.agreedPrivacy ? "yes" : "no"}</li>
                  <li>Details confirmed accurate: {app.confirmedAccurate ? "yes" : "no"}</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  Agreed at{" "}
                  {app.agreementsAt ? new Date(app.agreementsAt).toLocaleString("en-GB") : "—"}
                </p>
              </div>
            )}

            {app.representative ? (
              <p className="mt-3 text-sm text-gray-600">
                Already approved as{" "}
                <span className="font-mono">{app.representative.code}</span> (
                {app.representative.status.toLowerCase()}).
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <textarea
                  rows={2}
                  className="input-field text-sm"
                  placeholder="Note (required to reject or to ask for more information)"
                  value={note[app.id] ?? ""}
                  onChange={(e) => setNote((n) => ({ ...n, [app.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => act(app, "approve")}
                    disabled={busy === app.id}
                    className="btn-primary !py-2 !px-4 text-sm"
                  >
                    {busy === app.id ? "Working…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(app, "request-info")}
                    disabled={busy === app.id}
                    className="btn-outline !py-2 !px-4 text-sm"
                  >
                    Request information
                  </button>
                  <button
                    type="button"
                    onClick={() => act(app, "reject")}
                    disabled={busy === app.id}
                    className="btn-ghost text-sm text-red-600"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
