"use client";

import { useState } from "react";
import { BodyMeasurement } from "@/types";

type MeasurementInput = Omit<BodyMeasurement, "id" | "user_id" | "date">;

interface MeasurementSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: MeasurementInput) => Promise<void>;
}

interface FieldDef {
  key: keyof MeasurementInput;
  label: string;
  placeholder: string;
  unit: string;
}

const SECTIONS: { title: string; color: string; fields: FieldDef[] }[] = [
  {
    title: "Geral",
    color: "var(--red-500)",
    fields: [
      { key: "weight_kg", label: "Peso", placeholder: "80.0", unit: "kg" },
      { key: "waist_cm", label: "Cintura", placeholder: "85", unit: "cm" },
    ],
  },
  {
    title: "Tronco",
    color: "var(--amber-500)",
    fields: [
      { key: "hip_cm", label: "Quadril", placeholder: "95", unit: "cm" },
      { key: "chest_cm", label: "Peito", placeholder: "100", unit: "cm" },
      { key: "shoulder_cm", label: "Ombros", placeholder: "115", unit: "cm" },
      { key: "neck_cm", label: "Pescoço", placeholder: "38", unit: "cm" },
    ],
  },
  {
    title: "Membros Superiores",
    color: "var(--red-500)",
    fields: [
      { key: "bicep_r_cm", label: "Bíceps D", placeholder: "36", unit: "cm" },
      { key: "bicep_l_cm", label: "Bíceps E", placeholder: "35", unit: "cm" },
      { key: "forearm_r_cm", label: "Antebraço D", placeholder: "28", unit: "cm" },
      { key: "forearm_l_cm", label: "Antebraço E", placeholder: "27", unit: "cm" },
    ],
  },
  {
    title: "Membros Inferiores",
    color: "var(--amber-500)",
    fields: [
      { key: "thigh_r_cm", label: "Coxa D", placeholder: "58", unit: "cm" },
      { key: "thigh_l_cm", label: "Coxa E", placeholder: "57", unit: "cm" },
      { key: "calf_r_cm", label: "Panturrilha D", placeholder: "37", unit: "cm" },
      { key: "calf_l_cm", label: "Panturrilha E", placeholder: "36", unit: "cm" },
    ],
  },
];

const EMPTY: Record<keyof MeasurementInput, string> = {
  weight_kg: "",
  waist_cm: "",
  hip_cm: "",
  chest_cm: "",
  shoulder_cm: "",
  neck_cm: "",
  bicep_r_cm: "",
  bicep_l_cm: "",
  forearm_r_cm: "",
  forearm_l_cm: "",
  thigh_r_cm: "",
  thigh_l_cm: "",
  calf_r_cm: "",
  calf_l_cm: "",
};

export default function MeasurementSheet({ open, onClose, onSave }: MeasurementSheetProps) {
  const [fields, setFields] = useState<Record<keyof MeasurementInput, string>>(EMPTY);
  const [saving, setSaving] = useState(false);

  const hasAnyValue = Object.values(fields).some((v) => v.trim() !== "");

  function reset() {
    setFields(EMPTY);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    if (!hasAnyValue || saving) return;
    setSaving(true);
    try {
      const data: MeasurementInput = {};
      for (const [key, val] of Object.entries(fields)) {
        if (val.trim() !== "") {
          const num = parseFloat(val);
          if (!isNaN(num) && num > 0) {
            (data as Record<string, number>)[key] = num;
          }
        }
      }
      await onSave(data);
      reset();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] flex flex-col max-h-[90dvh]">
        {/* Handle */}
        <div className="flex-shrink-0 pt-4 px-5 pb-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
          <h2 className="text-base font-bold text-[var(--foreground)]">Nova Medida</h2>
          <p className="text-xs text-[var(--text-dim)] mt-0.5">Preencha apenas os campos que quiser registrar</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p
                className="mb-2 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: section.color }}
              >
                {section.title}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {section.fields.map(({ key, label, placeholder, unit }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-semibold text-[var(--text-dim)] mb-1">
                      {label} <span className="text-[var(--text-dim)]/60">({unit})</span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={fields[key]}
                      placeholder={placeholder}
                      onChange={(e) =>
                        setFields((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 pb-8 pt-3 border-t border-[var(--border)]">
          <button
            onClick={handleSave}
            disabled={!hasAnyValue || saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-40 gradient-red"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </>
            ) : (
              "Salvar Medida"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
