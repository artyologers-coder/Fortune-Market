"use client";

import { useCallback, useEffect, useState } from "react";

type Payout = {
  id: string;
  payoutCode: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
  representative: {
    id: string;
    code: string;
    fullName: string;
    status: string;
    bankAccountName: string | null;
  };
  items: { id: string; amount: number }[];
};

type Readiness = {
  representative: {
    id: string;
    code: string;
    fullName: string;
    status: string;
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankBranch: string | null;
  };
  summary: { payableBalance: number; totals: Record<string, number> };
  eligibleCount: number;
  flaggedCommissions: { id: string; amount: number; flagReason: string | null }[];
  flaggedCount: number;
  flaggedAmount: number;
  approvedCount: number;
  approvedAmount: number;
  openPayout: { id: string; payoutCode: string; amount: number; status: string } | null;
  recentPayouts: { id: string; payoutCode: string; amount: number; status: string }[];
  blockedReason: string | null;
};

type Rep = {
  id: string;
  code: string;
  fullName: string;
  status: string;
  unpaidAmount: number;
};

const MONEY = (n: number) => `Rs. ${n.toLocaleString("en-LK")}`;

export function PayoutsTab() {
  const [reps, setReps] = useState<Rep[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [method, setMethod] = useState("BANK_TRANSFER");

  const loadLists = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        fetch("/api/admin/representatives", { cache: "no-store" }),
        fetch("/api/admin/payouts", { cache: "no-store" }),
      ]);
      if (r.ok) setReps((await r.json()).representatives);
      if (p.ok) setPayouts((await p.json()).payouts);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  const loadReadiness = useCallback(async (repId: string) => {
    if (!repId) {
      setReadiness(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/payouts?representativeId=${repId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not load that representative.");
        return;
      }
      setReadiness(data);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);
  useEffect(() => {
    loadReadiness(selected);
  }, [selected, loadReadiness]);

  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/payouts?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ representativeId: selected, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ tone: "err", text: data.error ?? "That action failed." });
        return;
      }
      setFlash({ tone: "ok", text: data.message ?? "Done." });
      await loadReadiness(selected);
      loadLists();
    } catch {
      setFlash({ tone: "err", text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function actOnPayout(payoutId: string, action: "pay" | "cancel" | "fail") {
    const payout = payouts?.find((p) => p.id === payoutId);
    if (!payout) return;

    if (action === "pay") {
      const reference = prompt("Bank transfer reference (required):");
      if (!reference?.trim()) return;
      // The money has already left the bank by the time this is clicked, so the
      // confirmation states the amount rather than a generic "are you sure".
      if (
        !confirm(
          `Confirm you sent ${MONEY(payout.amount)} to ${payout.representative.fullName}.\n\n` +
            `Only click this once the transfer is actually in your bank account.`
        )
      ) {
        return;
      }
      setBusy(true);
      setFlash(null);
      try {
        const res = await fetch("/api/admin/payouts?action=pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payoutId, reference }),
        });
        const data = await res.json().catch(() => ({}));
        setFlash(
          data.error
            ? { tone: "err", text: data.error }
            : { tone: "ok", text: data.message ?? "Marked as paid." }
        );
        await loadReadiness(selected);
        loadLists();
      } catch {
        setFlash({ tone: "err", text: "Network problem. Please try again." });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!confirm(`Cancel ${payout.payoutCode}? The commissions go back into the pool.`)) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/payouts?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId }),
      });
      const data = await res.json().catch(() => ({}));
      setFlash(
        data.error ? { tone: "err", text: data.error } : { tone: "ok", text: data.message ?? "Done." }
      );
      await loadReadiness(selected);
      loadLists();
    } catch {
      setFlash({ tone: "err", text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
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
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">1. Choose a representative</h2>
          {!reps ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : reps.length === 0 ? (
            <p className="text-sm text-gray-500">No representatives yet.</p>
          ) : (
            <select
              className="input-field"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a representative…</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.fullName} ({r.status.toLowerCase()}
                  {r.unpaidAmount > 0 ? `, ${MONEY(r.unpaidAmount)} owing` : ""})
                </option>
              ))}
            </select>
          )}

          {readiness && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Eligible, awaiting sign-off" value={readiness.eligibleCount} />
                <Stat label="Approved, ready to pay" value={MONEY(readiness.approvedAmount)} />
                <Stat label="Flagged for review" value={MONEY(readiness.flaggedAmount)} />
                <Stat label="Already in a payout" value={readiness.openPayout ? MONEY(readiness.openPayout.amount) : "—"} />
              </div>

              {readiness.flaggedCommissions.length > 0 && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                  <p className="font-medium text-yellow-800 text-sm">
                    {readiness.flaggedCount} flagged commission
                    {readiness.flaggedCount === 1 ? "" : "s"} are held out of every payable
                    figure:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-yellow-800">
                    {readiness.flaggedCommissions.map((c) => (
                      <li key={c.id}>
                        {MONEY(c.amount)}
                        {c.flagReason ? ` — ${c.flagReason}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {readiness.blockedReason && (
                <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-gray-700">
                  {readiness.blockedReason}
                </p>
              )}

              <div className="border-t border-gray-100 pt-3">
                <p className="font-medium text-gray-900">Pay to</p>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 text-gray-600">
                  <dt>Account name</dt>
                  <dd className="text-gray-900">{readiness.representative.bankAccountName ?? "—"}</dd>
                  <dt>Bank</dt>
                  <dd className="text-gray-900">{readiness.representative.bankName ?? "—"}</dd>
                  <dt>Account number</dt>
                  {/* The full number is only ever exposed here, on the one screen
                      where an admin is about to make a transfer. */}
                  <dd className="text-gray-900 font-mono">
                    {readiness.representative.bankAccountNumber ?? "—"}
                  </dd>
                  <dt>Branch</dt>
                  <dd className="text-gray-900">{readiness.representative.bankBranch ?? "—"}</dd>
                </dl>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  disabled={busy || readiness.eligibleCount === 0}
                  onClick={() => act("approve-all")}
                  className="btn-outline !py-2 !px-4 text-sm"
                >
                  Approve {readiness.eligibleCount} eligible
                </button>
                <button
                  type="button"
                  disabled={busy || readiness.approvedAmount === 0}
                  onClick={() => act("create", { method })}
                  className="btn-primary !py-2 !px-4 text-sm"
                >
                  Create payout
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Method</label>
                <select
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">2. Payouts</h2>
          {!payouts ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-gray-500">No payouts have been created yet.</p>
          ) : (
            <div className="space-y-3 max-h-[32rem] overflow-y-auto">
              {payouts.map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {p.representative.code} — {p.representative.fullName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {p.payoutCode} · {p.items.length} commission
                        {p.items.length === 1 ? "" : "s"} ·{" "}
                        {new Date(p.createdAt).toLocaleDateString("en-GB")}
                        {p.reference ? ` · ref ${p.reference}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{MONEY(p.amount)}</p>
                      <span
                        className={
                          p.status === "PAID"
                            ? "badge-verified"
                            : p.status === "PENDING"
                            ? "badge-pending"
                            : "badge-rejected"
                        }
                      >
                        {p.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                  {p.status === "PENDING" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => actOnPayout(p.id, "pay")}
                        className="btn-primary !py-1.5 !px-3 text-xs"
                      >
                        Mark paid
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => actOnPayout(p.id, "fail")}
                        className="btn-ghost text-xs"
                      >
                        Transfer failed
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => actOnPayout(p.id, "cancel")}
                        className="btn-ghost text-xs text-red-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}
