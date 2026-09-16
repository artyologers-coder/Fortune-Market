"use client";

import { useState } from "react";

export type CertificationEntry = {
  type: string;
  number: string;
};

type Props = {
  value: CertificationEntry[];
  onChange: (value: CertificationEntry[]) => void;
};

export default function CertificationsInput({ value, onChange }: Props) {
  const [addedFlash, setAddedFlash] = useState(false);

  function addRow() {
    onChange([...value, { type: "", number: "" }]);
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1500);
  }

  function updateRow(index: number, field: "type" | "number", text: string) {
    onChange(value.map((entry, i) => (i === index ? { ...entry, [field]: text } : entry)));
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Certifications <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <div className="space-y-2">
        {value.map((entry, index) => (
          <div key={index} className="flex gap-2 items-start">
            <input
              type="text"
              value={entry.type}
              onChange={(e) => updateRow(index, "type", e.target.value)}
              className="input-field"
              placeholder="Type (e.g. Ayurvedic Reg, ISO 9001, SLS)"
            />
            <input
              type="text"
              value={entry.number}
              onChange={(e) => updateRow(index, "number", e.target.value)}
              className="input-field"
              placeholder="Certification number"
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg shrink-0"
              aria-label="Remove certification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
      >
        + Add Certification
      </button>
      {value.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          {value.filter((e) => e.type.trim() && e.number.trim()).length} certification(s) complete
        </p>
      )}
      {addedFlash && <p className="mt-2 text-xs text-green-600">Row added</p>}
    </div>
  );
}
