"use client";

import { useCallback, useEffect, useState } from "react";

type Payment = {
  id: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  feeRequired: boolean;
  feeBasis: string;
  reference: string | null;
  notes: string | null;
  paidAt: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  producer: {
    id: string;
    businessName: string;
    location: string;
    district: string;
    phone: string;
    businessRegistrationNo: string | null;
    verificationStatus: string;
    user: { id: string; name: string | null; email: string | null } | null;
    referral: {
      referralCode: string;
      status: string;
      representative: { id: string; code: string; fullName: string; status: string } | null;
    } | null;
  };
  commissions: { id: string; commissionCode: string; amount: number; status: string }[];
};

const MONEY = (n: number) => `Rs. ${n.toLocaleString("en-LK")}`;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid — not yet verified",
  VERIFIED: "Verified",
  UNDER_REVIEW: "Under review",
  WAIVED: "Waived",
  REFUNDED: "Refunded",
  FAILED: "Failed",
};

function Badge({ status }: { status: string }) {
  const cls =
    status === "VERIFIED"
      ? "badge-verified"
      : status === "FAILED" || status === "REFUNDED"
      ? "badge-rejected"
      : "badge-pending";
  return <span className={cls}>{STATUS_LABEL[status] ?? status}</span>;
}

/**
 * The registration payment gate.
 *
 * Approving is the single irreversible step that activates a producer, starts
 * their membership and creates the representative's commission, so it is gated
 * behind a confirmation that spells out what will happen. Everything else is
 * reversible, so it is a single click.
 */
export function PaymentsTab() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/admin/producer-registrations/queue?status=PENDING,UNDER_REVIEW,PAID,WAIVED",
        { cache: "no-store" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not load payments.");
        return;
      }
      setPayments((await res.json()).payments);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(p: Payment, action: string, extra: Record<string, string> = {}) {
    if (action === "approve") {
      const rep = p.producer.referral?.representative;
      const commission = rep ? MONEY(Math.round(p.amount * 0.7)) : "none";
      if (
        !confirm(
          `Approve ${p.producer.businessName}?\n\n` +
            `This activates the producer, starts their membership, and approves` +
            (rep ? ` ${rep.fullName}'s commission of ${commission}.` : ` their application.`) +
            `\n\nThis cannot be undone from here.`
        )
      ) {
        return;
      }
    }
    if ((action === "waive" || action === "fail" || action === "reject" || action === "refund") &&
        !extra.reason?.trim()) {
      setFlash({ tone: "err", text: "This action needs a reason for the audit record." });
      return;
    }
    if (action === "pay") {
      if (!extra.reference?.trim()) {
        setFlash({ tone: "err", text: "Enter the bank transfer reference." });
        return;
      }
      if (!confirm(`Mark this payment as paid using reference ${extra.reference}?`)) return;
    }

    setBusy(p.id);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/producer-registrations/${p.id}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes[p.id] ?? "", ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ tone: "err", text: data.error ?? "That action failed." });
        return;
      }
      setFlash({ tone: "ok", text: data.message ?? "Done." });
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

      {!payments ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : payments.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">
          No registration payments are waiting.
        </div>
      ) : (
        payments.map((p) => {
          const rep = p.producer.referral?.representative;
          const settled = ["VERIFIED", "WAIVED", "REFUNDED", "FAILED"].includes(p.status);
          return (
            <div key={p.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{p.producer.businessName}</p>
                  <p className="text-sm text-gray-600">
                    {p.producer.user?.name ?? "—"} · {p.producer.user?.email ?? "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.producer.district} · {p.producer.phone}
                    {p.producer.businessRegistrationNo
                      ? ` · BR ${p.producer.businessRegistrationNo}`
                      : ""}{" "}
                    · registered {new Date(p.createdAt).toLocaleDateString("en-GB")}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {p.feeRequired
                      ? `Fee required (${p.feeBasis.replace(/_/g, " ")})`
                      : "No fee — referred producer"}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                    {p.waiveReason ? ` · waived: ${p.waiveReason}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{MONEY(p.amount)}</p>
                  <Badge status={p.status} />
                </div>
              </div>

              {rep && (
                <div className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">
                  Referred by{" "}
                  <span className="font-mono">{rep.code}</span> — {rep.fullName} (
                  {rep.status.toLowerCase()}). Approving this records{" "}
                  {MONEY(Math.round(p.amount * 0.7))} of commission for them.
                </div>
              )}

              {p.commissions.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Already produced{" "}
                  {p.commissions.map((c) => `${c.commissionCode} (${MONEY(c.amount)}, ${c.status.toLowerCase()})`).join(", ")}
                </p>
              )}

              <div className="mt-4 space-y-3">
                <input
                  className="input-field text-sm"
                  placeholder="Internal note (optional)"
                  value={notes[p.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  {!settled && (
                    <>
                      {p.status === "PAID" && (
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => {
                            const reference = prompt("Bank transfer reference:");
                            if (reference) act(p, "verify", { reference });
                          }}
                          className="btn-outline !py-2 !px-4 text-sm"
                        >
                          Verify
                        </button>
                      )}
                      {p.status === "PENDING" && (
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => act(p, "under-review")}
                          className="btn-outline !py-2 !px-4 text-sm"
                        >
                          Move to review
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy === p.id}
                        onClick={() => act(p, "approve")}
                        className="btn-primary !py-2 !px-4 text-sm"
                      >
                        Approve producer
                      </button>
                      {p.feeRequired && (
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => {
                            const reason = prompt("Why is this fee being waived?");
                            if (reason) act(p, "waive", { reason });
                          }}
                          className="btn-ghost text-sm"
                        >
                          Waive fee
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy === p.id}
                        onClick={() => {
                          const reason = prompt("Why is this payment failing?");
                          if (reason) act(p, "fail", { reason });
                        }}
                        className="btn-ghost text-sm text-red-600"
                      >
                        Mark failed
                      </button>
                    </>
                  )}
                  {p.status === "VERIFIED" && (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => act(p, "approve")}
                      className="btn-primary !py-2 !px-4 text-sm"
                    >
                      Approve producer
                    </button>
                  )}
                  {p.status === "VERIFIED" && (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => {
                        const reason = prompt("Why is this being refunded?");
                        if (reason) act(p, "refund", { reason });
                      }}
                      className="btn-ghost text-sm text-red-600"
                    >
                      Refund
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
