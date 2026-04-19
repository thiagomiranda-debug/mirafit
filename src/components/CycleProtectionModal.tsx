"use client";

import type { CyclePhase } from "@/types";

interface CycleProtectionModalProps {
  daysOld: number;
  nextPhase: CyclePhase;
  onCancel: () => void;
  onConfirm: () => void;
}

const PHASE_LABELS: Record<CyclePhase, string> = {
  acumulacao: 'Acumulação (volume)',
  intensificacao: 'Intensificação (força)',
};

export default function CycleProtectionModal({
  daysOld,
  nextPhase,
  onCancel,
  onConfirm,
}: CycleProtectionModalProps) {
  const daysRounded = Math.max(1, Math.round(daysOld));

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] px-5 pb-8 pt-4">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border)]" />

        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--amber-600)]/15 text-[var(--amber-500)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">
              Seu treino ainda é recente
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-dim)]">
              Ciclo atual tem {daysRounded} {daysRounded === 1 ? 'dia' : 'dias'}
            </p>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-[var(--text-muted)]">
          Fisiologicamente, o ideal é manter a mesma ficha por <strong className="text-[var(--foreground)]">4 a 6 semanas</strong> para
          garantir progressão de carga e adaptação neural. Gerar um novo treino agora vai mudar o estímulo antes do tempo ideal.
        </p>

        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)]">
            Próximo ciclo seria
          </p>
          <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">
            {PHASE_LABELS[nextPhase]}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onCancel}
            className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl gradient-red"
          >
            Manter treino atual
          </button>
          <button
            onClick={onConfirm}
            className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Gerar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
