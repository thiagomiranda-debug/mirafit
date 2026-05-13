"use client";

interface EditModeCardProps {
  index: number;
  name: string;
  sets: number;
  reps: string;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  style?: React.CSSProperties;
  setNodeRef?: (el: HTMLElement | null) => void;
}

export default function EditModeCard({
  index,
  name,
  sets,
  reps,
  onDelete,
  dragHandleProps,
  isDragging = false,
  style,
  setNodeRef,
}: EditModeCardProps) {
  return (
    <div
      ref={setNodeRef}
      className="animate-fade-in flex items-center gap-2 rounded-2xl px-3 py-3"
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid var(--border-subtle)",
        opacity: isDragging ? 0.5 : 1,
        ...style,
      }}
    >
      <button
        type="button"
        aria-label="Reordenar exercício"
        {...dragHandleProps}
        className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-lg text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] active:cursor-grabbing touch-none"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </button>

      <span
        style={{
          fontFamily: "var(--font-bebas)",
          fontSize: "1.1rem",
          lineHeight: 1,
          color: "var(--text-dim)",
          letterSpacing: "0.04em",
          minWidth: "24px",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold capitalize text-[var(--foreground)]">
          {name}
        </p>
        <p className="text-xs text-[var(--text-dim)]">
          {sets} séries × {reps} reps
        </p>
      </div>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Excluir exercício"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <svg className="h-4 w-4 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
      </button>
    </div>
  );
}
