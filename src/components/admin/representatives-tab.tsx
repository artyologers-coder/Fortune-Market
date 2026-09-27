"use client";

import { useCallback, useEffect, useState } from "react";

type Rep = {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone: string;
  district: string;
  status: string;
  statusReason: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  joinedAt: string;
  approvedAt: string | null;
  counts: { leads: number; commissions: number; referrals: number; payouts: number };
  unpaidAmount: number;
};

const MONEY = (n: number) => `Rs. ${n.toLocaleString("en-LK")}`;

export function RepresentativesTab() {
  const [reps, setReps] = useState<Rep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/representatives", { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not load representatives.");
        return;
      }
      setReps((await res.json()).representatives);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const needle = q.trim().toLowerCase();
  const visible = (reps ?? []).filter(
    (r) =>
      !needle ||
      r.fullName.toLowerCase().includes(needle) ||
      r.code.toLowerCase().includes(needle) ||
      r.email.toLowerCase().includes(needle) ||
      r.phone.includes(needle)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="input-field flex-1"
          placeholder="Search by name, code, email or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <a href="/api/admin/representatives/export" className="btn-outline !py-2 !px-4 text-sm text-center">
          Export CSV
        </a>
      </div>

      {!reps ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">
          {reps.length === 0 ? "No representatives have been approved yet." : "No match."}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">District</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Owing</th>
                <th className="px-4 py-3 font-medium text-right">Leads</th>
                <th className="px-4 py-3 font-medium text-right">Referrals</th>
                <th className="px-4 py-3 font-medium">Bank</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.code}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 font-medium">{r.fullName}</p>
                    <p className="text-xs text-gray-500">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.district}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.status === "ACTIVE"
                          ? "badge-verified"
                          : r.status === "SUSPENDED"
                          ? "badge-pending"
                          : "badge-rejected"
                      }
                    >
                      {r.status.toLowerCase()}
                    </span>
                    {r.statusReason && (
                      <p className="text-xs text-gray-500 mt-1 max-w-[14rem]">{r.statusReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {r.unpaidAmount > 0 ? MONEY(r.unpaidAmount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.counts.leads}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.counts.referrals}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.bankName ? (
                      <>
                        <p>{r.bankName}</p>
                        <p className="text-xs text-gray-500 font-mono">
                          {r.bankAccountNumber ?? "—"}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">Not provided</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(r.joinedAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
