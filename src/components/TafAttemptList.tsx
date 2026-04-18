"use client";

import { useEffect, useState } from "react";
import { getTafAttempts, TafAttempt } from "@/lib/tafAttempts";
import {
  TAF_EVENT_LABELS,
  TafEventKey,
  TafRunKey,
  formatRunTime,
} from "@/lib/tafData";

interface Props {
  userId: string;
}

function valueDisplay(
  event: TafEventKey,
  value: number,
  skipped: boolean | undefined
): string {
  if (skipped) return "Pulado";
  if (event === "run_300m" || event === "run_1600m") {
    return formatRunTime(value, event as TafRunKey);
  }
  return `${value} reps`;
}

export default function TafAttemptList({ userId }: Props) {
  const [attempts, setAttempts] = useState<TafAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTafAttempts(userId, 30).then((loadedAttempts) => {
      setAttempts(loadedAttempts);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="flex h-[80px] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-2)] px-4 py-5 text-center">
        <p className="text-sm text-[var(--text-dim)]">
          Nenhuma tentativa registrada. Toque em &quot;Iniciar Modo TAF&quot;
          para comecar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {attempts.map((attempt) => (
        <div
          key={attempt.id}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--text-dim)]">
                {attempt.date.toLocaleDateString("pt-BR")} ·{" "}
                {attempt.type === "full" ? "TAF Completo" : "Avulso"}
              </p>
            </div>
            <span
              className="text-2xl text-[var(--amber-500)]"
              style={{ fontFamily: "var(--font-bebas)" }}
            >
              {attempt.total_score} pts
            </span>
          </div>

          <div className="space-y-1">
            {attempt.results.map((result) => (
              <div
                key={result.event}
                className="flex items-center justify-between text-xs"
              >
                <span
                  className={
                    result.skipped
                      ? "text-[var(--text-dim)]"
                      : "text-[var(--foreground)]"
                  }
                >
                  {TAF_EVENT_LABELS[result.event]}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-muted)]">
                    {valueDisplay(result.event, result.value, result.skipped)}
                  </span>
                  <span
                    className="w-10 text-right font-bold"
                    style={{
                      color: result.skipped
                        ? "var(--text-dim)"
                        : result.score >= 50
                          ? "var(--amber-500)"
                          : "var(--red-500)",
                    }}
                  >
                    {result.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
