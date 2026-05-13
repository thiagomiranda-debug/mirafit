"use client";

interface DeleteConfirmModalProps {
  exerciseName: string;
  doneSets: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({
  exerciseName,
  doneSets,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div
        className="animate-slide-up relative w-full max-w-md rounded-t-3xl bg-[var(--surface)] px-5 pb-6 pt-4"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          className="mx-auto mb-3 h-1 w-12 rounded-full"
          style={{ background: "rgba(255,255,255,0.15)" }}
        />

        <h2 className="mb-2 text-lg font-bold text-[var(--foreground)]">
          Excluir &quot;{exerciseName}&quot;?
        </h2>

        <p className="mb-5 text-sm leading-relaxed text-[var(--text-muted)]">
          Esse exercício tem{" "}
          <span className="font-bold text-[var(--amber-500)]">
            {doneSets} {doneSets === 1 ? "série já marcada" : "séries já marcadas"}
          </span>
          . Ao excluir, essas séries{" "}
          <span className="font-bold text-[var(--red-500)]">
            não serão salvas no histórico
          </span>
          .
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="tactile flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] py-3.5 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="tactile flex-1 rounded-2xl py-3.5 text-sm font-bold text-white transition-all gradient-red"
            style={{ boxShadow: "var(--shadow-red)" }}
          >
            Excluir mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
