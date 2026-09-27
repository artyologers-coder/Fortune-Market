"use client";

import { useCallback, useEffect, useState } from "react";

type Section = {
  id: string;
  slug: string;
  title: string;
  body: string;
  sortOrder: number;
  visible: boolean;
  updatedAt: string;
};

type Draft = {
  id: string | null;
  slug: string;
  title: string;
  body: string;
  sortOrder: number;
  visible: boolean;
};

const EMPTY: Draft = { id: null, slug: "", title: "", body: "", sortOrder: 0, visible: true };

export function GuideTab() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/representative-guide", { cache: "no-store" });
      if (!res.ok) {
        setLoadError("Could not load the guide.");
        return;
      }
      const { sections: s } = await res.json();
      setSections(s);
    } catch {
      setLoadError("Network problem. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function edit(s: Section) {
    setMessage(null);
    setDraft({
      id: s.id,
      slug: s.slug,
      title: s.title,
      body: s.body,
      sortOrder: s.sortOrder,
      visible: s.visible,
    });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        draft.id ? `/api/admin/representative-guide/${draft.id}` : "/api/admin/representative-guide",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "Could not save." });
        return;
      }
      setMessage({ tone: "ok", text: draft.id ? "Section updated." : "Section created." });
      setDraft(EMPTY);
      await load();
    } catch {
      setMessage({ tone: "error", text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Section) {
    if (!window.confirm(`Delete "${s.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/representative-guide/${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "Could not delete." });
        return;
      }
      if (draft.id === s.id) setDraft(EMPTY);
      setMessage({ tone: "ok", text: `Deleted "${s.title}".` });
      await load();
    } catch {
      setMessage({ tone: "error", text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!sections) return <p className="text-sm text-gray-500">Loading…</p>;

  const canSave = draft.slug.trim() && draft.title.trim() && draft.body.trim();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Representative guide</h2>
        <p className="text-gray-600">
          What representatives read at{" "}
          <a href="/representative/guide" className="text-primary hover:underline">
            /representative/guide
          </a>
          . Hiding a section keeps it for later; deleting it is permanent. Every change is recorded
          in the audit trail.
        </p>
      </div>

      <div className="space-y-3">
        {sections.length === 0 && (
          <p className="text-sm text-gray-500">No sections yet. Add the first one below.</p>
        )}
        {sections.map((s) => (
          <div
            key={s.id}
            className={`card p-4 ${draft.id === s.id ? "border-primary" : ""} ${
              s.visible ? "" : "opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-gray-900">{s.title}</h3>
                  {!s.visible && (
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                      hidden
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  #{s.sortOrder} /{s.slug} · {s.body.length} characters
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => edit(s)}
                  className="btn-outline !py-1.5 !px-3 text-sm"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(s)}
                  disabled={busy}
                  className="btn-outline !py-1.5 !px-3 text-sm text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {draft.id ? `Edit "${draft.title || "section"}"` : "Add a section"}
        </h2>
        <div className="space-y-4 mt-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                className="input-field"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                className="input-field font-mono"
                placeholder="how-to-acquire"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase, numbers and hyphens.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <input
                type="number"
                min={0}
                max={9999}
                className="input-field"
                value={draft.sortOrder}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
              <select
                className="input-field"
                value={draft.visible ? "true" : "false"}
                onChange={(e) => setDraft((d) => ({ ...d, visible: e.target.value === "true" }))}
              >
                <option value="true">Visible to everyone</option>
                <option value="false">Hidden</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              className="input-field min-h-40"
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">
              {draft.body.length} / 20000 characters. Line breaks are kept as written.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={save}
            disabled={busy || !canSave}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Saving…" : draft.id ? "Save changes" : "Create section"}
          </button>
          {draft.id && (
            <button type="button" onClick={() => setDraft(EMPTY)} className="btn-outline !py-2">
              Cancel
            </button>
          )}
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
