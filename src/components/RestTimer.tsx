"use client";

import { useEffect, useRef, useState } from "react";

export interface NextPreview {
  /** "Próxima série" quando faltam séries do mesmo exercício, ou "Próximo exercício" */
  label: string;
  name: string;
  gifUrl?: string;
  sets?: number;
  reps?: string;
  targetMuscle?: string;
  /** Resumo da última performance (ex: "101 × 10 kg") */
  lastPerformance?: string;
}

interface RestTimerProps {
  exerciseName: string;
  initialSeconds?: number;
  onClose: () => void;
  nextPreview?: NextPreview | null;
}

export default function RestTimer({
  exerciseName,
  initialSeconds = 90,
  onClose,
  nextPreview,
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [total, setTotal] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown(seconds: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(seconds);
    setTotal(seconds);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
          onClose();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    startCountdown(initialSeconds);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / total;
  const dash = circumference * progress;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="animate-slide-up relative w-full max-w-md rounded-t-3xl bg-[var(--surface)] px-6 pb-8 pt-5 shadow-2xl">
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border-light)]" />

        <p className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-dim)]">
          Descanso
        </p>
        <p className="mb-6 truncate text-center text-sm font-semibold text-[var(--text-muted)]">
          {exerciseName}
        </p>

        {/* Circular countdown */}
        <div className="relative mx-auto mb-7 flex h-32 w-32 items-center justify-center">
          <svg className="absolute inset-0" viewBox="0 0 100 100">
            {/* Track */}
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth="5"
            />
            {/* Progress */}
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="var(--red-500)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dasharray 1s linear" }}
            />
          </svg>
          <span
            className="text-5xl leading-none text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            {remaining}
          </span>
        </div>

        {/* Preset buttons */}
        <div className="mb-4 flex gap-2">
          {[60, 90, 120].map((s) => (
            <button
              key={s}
              onClick={() => startCountdown(s)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${
                total === s && remaining <= s
                  ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
              }`}
            >
              {s}s
            </button>
          ))}
        </div>

        {/* Preview do próximo exercício / próxima série */}
        {nextPreview && (
          <div className="animate-fade-in mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--amber-500)]">
              {nextPreview.label}
            </p>
            <div className="flex items-center gap-3">
              {nextPreview.gifUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nextPreview.gifUrl}
                  alt={nextPreview.name}
                  className="h-14 w-14 shrink-0 rounded-xl border border-[var(--border)] bg-black object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-3)]">
                  <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold capitalize text-[var(--foreground)]">
                  {nextPreview.name}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">
                  {nextPreview.sets && nextPreview.reps
                    ? `${nextPreview.sets} × ${nextPreview.reps} reps`
                    : nextPreview.targetMuscle ?? ""}
                </p>
                {nextPreview.lastPerformance && (
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--amber-500)]">
                    Última: {nextPreview.lastPerformance}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-xl border border-[var(--border)] py-3.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
        >
          Pular descanso
        </button>
      </div>
    </div>
  );
}
