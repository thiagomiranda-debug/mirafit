"use client";

import type { CardioModality } from "@/types";
import { MODALITY_LABELS } from "@/lib/cardioSessions";

interface CardioModalityPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (modality: CardioModality) => void;
}

const MODALITIES = Object.keys(MODALITY_LABELS) as CardioModality[];

export default function CardioModalityPicker({
  open,
  onClose,
  onSelect,
}: CardioModalityPickerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] px-5 pb-8 pt-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div
          className="mx-auto mb-5 h-1 w-12 rounded-full"
          style={{ background: "rgba(255,255,255,0.15)" }}
        />

        <h2 className="mb-4 text-base font-bold text-[var(--foreground)]">
          Escolha a modalidade
        </h2>

        <div className="flex flex-col gap-2">
          {MODALITIES.map((m) => {
            const info = MODALITY_LABELS[m];
            return (
              <button
                key={m}
                onClick={() => onSelect(m)}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-left transition-colors hover:border-[var(--red-500)]/40 hover:bg-[var(--red-500)]/5 active:scale-[0.98]"
              >
                <span className="text-2xl">{info.emoji}</span>
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {info.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
