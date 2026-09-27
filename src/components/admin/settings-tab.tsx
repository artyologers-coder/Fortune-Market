"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  producerAnnualRegistrationFee: number;
  representativeInitialCommission: number;
  fortuneMarketInitialAllocation: number;
  renewalCommissionEnabled: boolean;
  renewalCommissionAmount: number;
  feeEnforcementMode: string;
  initialProducerTarget: number | null;
  currency: string;
  updatedAt: string;
};

const MONEY_FIELDS = [
  {
    key: "producerAnnualRegistrationFee" as const,
    label: "Producer registration fee",
    help: "What each producer pays to join. Waived entirely while the gate is FORCE_OPEN.",
  },
  {
    key: "representativeInitialCommission" as const,
    label: "Representative commission",
    help: "What the representative earns when a producer they referred is approved.",
  },
  {
    key: "fortuneMarketInitialAllocation" as const,
    label: "Fortune Market allocation",
    help: "The business's share. Commission plus allocation must equal the producer fee.",
  },
  {
    key: "renewalCommissionAmount" as const,
    label: "Renewal commission",
    help: "Paid when a referred producer renews. Only applies while renewals are enabled.",
  },
];

export function SettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/representative-settings", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load settings.");
        return;
      }
      const { settings: s } = await res.json();
      setSettings(s);
    } catch {
      setError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { reason };
      for (const f of MONEY_FIELDS) {
        const raw = draft[f.key];
        if (raw !== undefined && raw !== "") body[f.key] = Number(raw);
      }
      if (draft.initialProducerTarget !== undefined) {
        body.initialProducerTarget =
          draft.initialProducerTarget === "" ? null : Number(draft.initialProducerTarget);
      }
      if (draft.renewalCommissionEnabled !== undefined) {
        body.renewalCommissionEnabled = draft.renewalCommissionEnabled === "true";
      }
      if (draft.feeEnforcementMode) body.feeEnforcementMode = draft.feeEnforcementMode;

      const res = await fetch("/api/admin/representative-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "Could not save." });
        return;
      }
      setSettings(data.settings);
      setDraft({});
      setReason("");
      setMessage({ tone: "ok", text: "Settings saved and recorded in the change history." });
    } catch {
      setMessage({ tone: "error", text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!settings) return <p className="text-sm text-gray-500">Loading…</p>;

  const dirty = Object.keys(draft).length > 0;
  const shown = (key: (typeof MONEY_FIELDS)[number]["key"]) =>
    draft[key] !== undefined ? draft[key] : String(settings[key]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Financial settings</h2>
        <p className="text-sm text-gray-600">
          These figures decide what a producer is charged and what a representative earns. They
          are stored as whole rupees in one place, so nothing can drift.
        </p>

        <div className="space-y-4 mt-4">
          {MONEY_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input
                type="number"
                min={0}
                step={1}
                className="input-field"
                value={shown(f.key)}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">{f.help}</p>
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial producer target
            </label>
            <input
              type="number"
              min={0}
              step={1}
              className="input-field"
              placeholder="No target set"
              value={
                draft.initialProducerTarget !== undefined
                  ? draft.initialProducerTarget
                  : settings.initialProducerTarget === null
                  ? ""
                  : String(settings.initialProducerTarget)
              }
              onChange={(e) =>
                setDraft((d) => ({ ...d, initialProducerTarget: e.target.value }))
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty for no target. Used to report programme progress.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Renewal commission enabled
            </label>
            <select
              className="input-field"
              value={
                draft.renewalCommissionEnabled !== undefined
                  ? draft.renewalCommissionEnabled
                  : String(settings.renewalCommissionEnabled)
              }
              onChange={(e) =>
                setDraft((d) => ({ ...d, renewalCommissionEnabled: e.target.value }))
              }
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Fee enforcement gate</h2>
        <p className="text-sm text-gray-600">
          Currently <code className="font-mono">{settings.feeEnforcementMode}</code>. This decides
          whether every producer pays. Changing it from here is refused in production, on purpose.
        </p>
        <select
          className="input-field mt-3"
          value={draft.feeEnforcementMode ?? settings.feeEnforcementMode}
          onChange={(e) => setDraft((d) => ({ ...d, feeEnforcementMode: e.target.value }))}
        >
          {["AUTO", "FORCE_OPEN", "FORCE_CLOSED"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Save</h2>
        <p className="text-sm text-gray-600 mb-3">
          Every change needs a reason. It is stored with the before and after values, and it is
          the only part that cannot be reconstructed later.
        </p>
        <input
          className="input-field"
          placeholder="Reason for this change…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={save}
            disabled={busy || !dirty || !reason.trim()}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
          {dirty && <span className="text-xs text-gray-500">Unsaved changes</span>}
        </div>
        {message && (
          <p
            className={`text-sm mt-3 ${message.tone === "ok" ? "text-green-600" : "text-red-600"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
