"use client";

import { useEffect, useState } from "react";
import { getExercisesByIds } from "@/lib/workouts";
import { LibraryExercise } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";

interface Props {
  rawName: string;
  targetMuscle: string;
  suggestionIds: string[];
  onResolve: (exercise: LibraryExercise) => void;
  onSearchManual: () => void;
  onClose: () => void;
}

export default function ResolveUnmatchedModal({
  rawName,
  targetMuscle,
  suggestionIds,
  onResolve,
  onSearchManual,
  onClose,
}: Props) {
  const [suggestions, setSuggestions] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(suggestionIds.length > 0);

  useEffect(() => {
    if (suggestionIds.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getExercisesByIds(suggestionIds)
      .then((map) => {
        if (cancelled) return;
        const ordered = suggestionIds
          .map((id) => map[id])
          .filter((e): e is LibraryExercise => Boolean(e));
        setSuggestions(ordered);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [suggestionIds]);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] px-5 pb-8 pt-4">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border)]" />

        <h2 className="text-base font-bold text-[var(--foreground)]">
          Encontrar substituto
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-dim)]">
          Do PDF: <span className="italic">{rawName}</span>
        </p>
        {targetMuscle && (
          <span className="mt-2 inline-flex items-center rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {targetMuscle}
          </span>
        )}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border-light)] py-4 text-center text-xs text-[var(--text-dim)]">
              Nenhuma sugestão automática
            </p>
          ) : (
            suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onResolve(s)}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-left transition-all hover:border-[var(--red-500)]/30"
              >
                {s.gif_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.gif_url}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg bg-black/10 object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--surface)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                    {translateExerciseName(s.name)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-dim)]">
                    {s.equipment}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <button
          onClick={onSearchManual}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Buscar outro exercício
        </button>
      </div>
    </div>
  );
}
