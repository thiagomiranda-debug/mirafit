"use client";

import { useState } from "react";
import { LocationType } from "@/types";

interface WorkoutConfigModalProps {
  initialLocationType: LocationType;
  onGenerate: (locationType: LocationType, daysAvailable: number) => void;
  onClose: () => void;
  generating: boolean;
}

const MAX_DAYS_QUARTEL = 3;

export default function WorkoutConfigModal({
  initialLocationType,
  onGenerate,
  onClose,
  generating,
}: WorkoutConfigModalProps) {
  const [locationType, setLocationType] = useState<LocationType>(initialLocationType);
  const [daysAvailable, setDaysAvailable] = useState<number>(
    initialLocationType === "quartel" ? Math.min(2, MAX_DAYS_QUARTEL) : 3
  );

  function handleLocationChange(loc: LocationType) {
    setLocationType(loc);
    if (loc === "quartel" && daysAvailable > MAX_DAYS_QUARTEL) {
      setDaysAvailable(MAX_DAYS_QUARTEL);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] px-5 pb-8 pt-4">
        {/* Handle bar */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border)]" />

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--foreground)]">
            Configurar Treino
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Local toggle */}
        <div className="mb-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--text-dim)]">
            Local
          </p>
          <div className="flex rounded-xl bg-[var(--surface-2)] p-1 border border-[var(--border)]">
            <button
              onClick={() => handleLocationChange("gym")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
                locationType === "gym"
                  ? "bg-[var(--red-600)] text-white shadow-md"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              🏢 Academia
            </button>
            <button
              onClick={() => handleLocationChange("quartel")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
                locationType === "quartel"
                  ? "bg-[var(--amber-600)] text-white shadow-md"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              🚒 Quartel
            </button>
          </div>
          {locationType === "quartel" && (
            <p className="mt-1.5 text-xs text-[var(--text-dim)]">
              Escala de serviço: máximo de {MAX_DAYS_QUARTEL} dias por ciclo.
            </p>
          )}
        </div>

        {/* Dias disponíveis */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--text-dim)]">
            Dias disponíveis para este plano
          </p>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((d) => {
              const isDisabled = locationType === "quartel" && d > MAX_DAYS_QUARTEL;
              const isActive = daysAvailable === d;
              return (
                <button
                  key={d}
                  onClick={() => !isDisabled && setDaysAvailable(d)}
                  className={`rounded-xl border py-2.5 text-sm font-bold transition-all ${
                    isActive
                      ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
                  } ${isDisabled ? "opacity-30 pointer-events-none" : "hover:border-[var(--border-light)]"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={() => onGenerate(locationType, daysAvailable)}
          disabled={generating}
          className="relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-60 gradient-red"
        >
          {generating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Gerando seu treino...
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Gerar Plano Personalizado
            </>
          )}
        </button>
      </div>
    </div>
  );
}
