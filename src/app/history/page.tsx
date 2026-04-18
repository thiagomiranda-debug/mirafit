"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { getExercisesByIds } from "@/lib/workouts";
import { WorkoutLog } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";
import ExerciseChart, { ChartDataPoint } from "@/components/ExerciseChart";
import MuscleAnalytics from "@/components/MuscleAnalytics";
import BottomNav from "@/components/BottomNav";

type Tab = "treinos" | "evolucao" | "analise";

function getTotalVolume(log: WorkoutLog): number {
  return log.performance.reduce((acc, p) => {
    if (p.sets && p.sets.length > 0) {
      return acc + p.sets.reduce((a, s) => a + s.weight * s.reps, 0);
    }
    return acc + (p.weight_lifted || 0) * (p.reps_done || 0);
  }, 0);
}

function getMaxWeight(log: WorkoutLog, exerciseId: string): number {
  const perf = log.performance.find((p) => p.exercise_id === exerciseId);
  if (!perf) return 0;
  if (perf.sets && perf.sets.length > 0) {
    return Math.max(...perf.sets.map((s) => s.weight));
  }
  return perf.weight_lifted || 0;
}

function summarizeSets(p: WorkoutLog["performance"][number]): string {
  if (p.sets && p.sets.length > 0) {
    const maxW = Math.max(...p.sets.map((s) => s.weight));
    const avgReps = Math.round(p.sets.reduce((a, s) => a + s.reps, 0) / p.sets.length);
    return `${p.sets.length}×${avgReps} @ ${maxW} kg`;
  }
  if (p.weight_lifted !== undefined) {
    return `${p.reps_done} reps @ ${p.weight_lifted} kg`;
  }
  return "—";
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("treinos");

  const loadLogs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getWorkoutLogs(user.uid, 30);
      setLogs(data);

      const allIds = new Set<string>();
      data.forEach((log) => log.performance.forEach((p) => allIds.add(p.exercise_id)));
      if (allIds.size > 0) {
        const details = await getExercisesByIds([...allIds]);
        const names: Record<string, string> = {};
        for (const [id, ex] of Object.entries(details)) {
          names[id] = translateExerciseName(ex.name);
        }
        setExerciseNames(names);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) loadLogs();
  }, [user, loadLogs]);

  const evolutionMap = useMemo(() => {
    const map: Record<string, ChartDataPoint[]> = {};
    for (const log of logs) {
      const logDate = log.date instanceof Date ? log.date : new Date(log.date);
      for (const perf of log.performance) {
        const maxW = getMaxWeight(log, perf.exercise_id);
        if (maxW <= 0) continue;
        if (!map[perf.exercise_id]) map[perf.exercise_id] = [];
        map[perf.exercise_id].push({ date: logDate, value: maxW });
      }
    }
    const result: Record<string, ChartDataPoint[]> = {};
    for (const [id, pts] of Object.entries(map)) {
      const sorted = [...pts].sort((a, b) => a.date.getTime() - b.date.getTime());
      if (sorted.length >= 2) result[id] = sorted;
    }
    return result;
  }, [logs]);

  const evolutionExercises = useMemo(
    () =>
      Object.entries(evolutionMap).sort(
        (a, b) => b[1].length - a[1].length
      ),
    [evolutionMap]
  );

  if (authLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      {/* Header */}
      <header className="px-5 pb-1 pt-6">
        <h1
          className="text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          HISTÓRICO
        </h1>
        <p className="text-xs text-[var(--text-dim)]">Últimos 30 treinos registrados</p>
      </header>

      {/* Tabs */}
      <div className="mt-3 flex gap-2 px-5">
        {(["treinos", "evolucao", "analise"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-5 py-2 text-sm font-bold transition-all ${
              tab === t
                ? "bg-[var(--red-600)] text-white shadow-md shadow-[var(--red-600)]/20"
                : "bg-[var(--surface)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "treinos" ? "Treinos" : t === "evolucao" ? "Evolução" : "Análise"}
          </button>
        ))}
      </div>

      <main className="flex flex-1 flex-col gap-3 px-4 py-4">
        {tab === "treinos" && (
          <>
            {logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                  <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  Nenhum treino registrado ainda
                </p>
                <p className="mt-1 text-xs text-[var(--text-dim)]">
                  Finalize um treino para ver o histórico aqui
                </p>
              </div>
            ) : (
              <div className="stagger space-y-3">
                {logs.map((log) => (
                  <LogCard key={log.id} log={log} exerciseNames={exerciseNames} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "analise" && user && (
          <MuscleAnalytics userId={user.uid} embedded />
        )}

        {tab === "evolucao" && (
          <>
            {evolutionExercises.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                  <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  Ainda não há dados suficientes
                </p>
                <p className="mt-1 text-xs text-[var(--text-dim)]">
                  Complete pelo menos 2 treinos com o mesmo exercício
                </p>
              </div>
            ) : (
              <div className="stagger space-y-3">
                {evolutionExercises.map(([id, pts]) => (
                  <EvolutionCard
                    key={id}
                    exerciseId={id}
                    exerciseName={exerciseNames[id] || translateExerciseName(id.replace(/-/g, " "))}
                    data={pts}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// ─── LogCard ─────────────────────────────────────────────────────────────────

function LogCard({
  log,
  exerciseNames,
}: {
  log: WorkoutLog;
  exerciseNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  const date = log.date instanceof Date ? log.date : new Date(log.date);
  const formatted = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const totalVolume = getTotalVolume(log);

  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--amber-500)]/12">
            <svg className="h-5 w-5 text-[var(--amber-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)]">
              {log.routine_name}
              {" "}
              <span className="text-xs" title={log.location_type === "quartel" ? "Quartel" : "Academia"}>
                {log.location_type === "quartel" ? "🚒" : "🏢"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-dim)]">
              {formatted} às {time} · {log.performance.length} exercícios
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalVolume > 0 && (
            <span className="text-xs font-bold text-[var(--amber-500)]">
              {totalVolume.toLocaleString("pt-BR")} kg
            </span>
          )}
          <svg
            className={`h-4 w-4 text-[var(--text-dim)] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-3">
          <table className="mt-2.5 w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                <th className="pb-2">Exercício</th>
                <th className="pb-2 text-right">Desempenho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {log.performance.map((p, i) => {
                const name =
                  exerciseNames[p.exercise_id] ||
                  translateExerciseName(p.exercise_id.replace(/-/g, " "));
                return (
                  <tr key={i}>
                    <td className="py-2 capitalize text-[var(--text-muted)]">
                      {name}
                    </td>
                    <td className="py-2 text-right font-medium text-[var(--foreground)]">
                      {summarizeSets(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {log.notes && (
            <div className="mt-3 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Anotações
              </p>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {log.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── EvolutionCard ────────────────────────────────────────────────────────────

function EvolutionCard({
  exerciseId,
  exerciseName,
  data,
}: {
  exerciseId: string;
  exerciseName: string;
  data: ChartDataPoint[];
}) {
  const first = data[0];
  const last = data[data.length - 1];
  const delta = last.value - first.value;
  const pct = first.value > 0 ? Math.round((delta / first.value) * 100) : 0;
  const gradientId = `grad-${exerciseId.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-semibold capitalize text-[var(--foreground)]">
          {exerciseName}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {delta !== 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                delta > 0
                  ? "bg-[var(--success)]/15 text-[var(--success)]"
                  : "bg-[var(--red-500)]/15 text-[var(--red-500)]"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {pct}%
            </span>
          )}
          <span className="text-xs text-[var(--text-dim)]">
            {data.length} sessões
          </span>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-dim)]">
        <span className="font-semibold text-[var(--text-muted)]">
          {first.value} kg
        </span>
        <svg className="h-3 w-3 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <span className="font-bold text-[var(--amber-500)]">
          {last.value} kg
        </span>
      </div>

      <ExerciseChart data={data} gradientId={gradientId} />
    </div>
  );
}
