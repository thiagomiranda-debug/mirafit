// src/components/EmptyState.tsx
"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  /** SVG ou emoji. Renderizado em uma "moldura" gradient. */
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl text-3xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(220,38,38,0.15), rgba(245,158,11,0.10))",
          boxShadow:
            "inset 0 0 0 1px rgba(239,68,68,0.2), 0 8px 24px rgba(220,38,38,0.10)",
        }}
      >
        {icon}
      </div>
      <h3
        className="mb-1.5 text-xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.04em" }}
      >
        {title}
      </h3>
      {description && (
        <p className="mb-5 max-w-xs text-sm text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="tactile rounded-xl bg-[var(--surface-2)] px-5 py-2.5 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-3)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
