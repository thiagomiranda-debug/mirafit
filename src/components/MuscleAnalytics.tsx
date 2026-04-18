"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { getExercisesByIds } from "@/lib/workouts";
import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import { translateExerciseName } from "@/lib/exerciseNames";
import { WorkoutLog, LibraryExercise, SetPerformance } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionPoint {
  dateLabel: string;
  avg1RM: number;
  volume: number;
}

interface ExerciseSummary {
  exerciseId: string;
  name: string;
  bestPR: number;
  lastDate: Date;
}

interface MuscleData {
  muscle: string;
  sessions: SessionPoint[]; // ordenado cronologicamente (mais antigo → mais recente)
  exercises: ExerciseSummary[]; // ordenado por lastDate desc
}

type Period = 7 | 30 | 90;
type Metric = "1rm" | "volume";

// ─── Component ────────────────────────────────────────────────────────────────

export default function MuscleAnalytics({ userId }: { userId: string }) {
  const [allLogs, setAllLogs] = useState<WorkoutLog[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, LibraryExercise>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(30);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("1rm");
  const [chartColors, setChartColors] = useState({
    red: "#EF4444",
    amber: "#F59E0B",
    muted: "#6B7280",
  });

  // Resolve CSS vars para recharts (precisa do DOM)
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setChartColors({
      red: style.getPropertyValue("--red-500").trim() || "#EF4444",
      amber: style.getPropertyValue("--amber-500").trim() || "#F59E0B",
      muted: style.getPropertyValue("--text-dim").trim() || "#6B7280",
    });
  }, []);

  // Busca logs + exercícios uma única vez
  useEffect(() => {
    async function load() {
      try {
        const logs = await getWorkoutLogs(userId, 90);
        const ids = [
          ...new Set(logs.flatMap((l) => l.performance.map((p) => p.exercise_id))),
        ];
        const exMap = ids.length > 0 ? await getExercisesByIds(ids) : {};
        setAllLogs(logs);
        setExerciseMap(exMap);
      } catch {
        // falha silenciosa — não quebra a tela
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  // ─── Computa MuscleData para todos os 90 logs (para sessions e exercises) ──

  const muscleDataMap = useMemo((): Record<string, MuscleData> => {
    if (allLogs.length === 0 || Object.keys(exerciseMap).length === 0) return {};

    const map: Record<string, MuscleData> = {};

    // logs vêm do Firestore em ordem desc (mais recente primeiro)
    for (const log of allLogs) {
      // Acumula 1RM e volume por músculo nesta sessão
      const sessionAcc: Record<string, { rms: number[]; vol: number }> = {};

      for (const perf of log.performance) {
        const ex = exerciseMap[perf.exercise_id];
        if (!ex) continue;
        const muscle = ex.target_muscle;

        // Normaliza sets (suporta formato legado)
        let sets: SetPerformance[];
        if (perf.sets && perf.sets.length > 0) {
          sets = perf.sets;
        } else if (
          perf.weight_lifted !== undefined &&
          perf.reps_done !== undefined
        ) {
          sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
        } else {
          continue;
        }

        const pr = best1RMFromSets(sets);
        const vol = totalVolume(sets);

        // Accumula para SessionPoint desta sessão
        if (!sessionAcc[muscle]) sessionAcc[muscle] = { rms: [], vol: 0 };
        sessionAcc[muscle].rms.push(pr);
        sessionAcc[muscle].vol += vol;

        // Garante que o músculo existe no map
        if (!map[muscle]) {
          map[muscle] = { muscle, sessions: [], exercises: [] };
        }

        // ExerciseSummary — primeira aparição = mais recente (logs são desc)
        const existing = map[muscle].exercises.find(
          (e) => e.exerciseId === perf.exercise_id
        );
        if (!existing) {
          map[muscle].exercises.push({
            exerciseId: perf.exercise_id,
            name: translateExerciseName(ex.name),
            bestPR: pr,
            lastDate: log.date,
          });
        } else {
          if (pr > existing.bestPR) existing.bestPR = pr;
          // lastDate já é a mais recente (primeira inserção)
        }
      }

      // Cria SessionPoint para cada músculo desta sessão
      const dateLabel = log.date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      });
      for (const [muscle, acc] of Object.entries(sessionAcc)) {
        if (!map[muscle]) map[muscle] = { muscle, sessions: [], exercises: [] };
        const avg1RM =
          acc.rms.length > 0
            ? Math.round(acc.rms.reduce((a, b) => a + b, 0) / acc.rms.length)
            : 0;
        map[muscle].sessions.push({
          dateLabel,
          avg1RM,
          volume: Math.round(acc.vol),
        });
      }
    }

    // Inverte sessions para ordem cronológica (antigo → recente)
    for (const d of Object.values(map)) {
      d.sessions.reverse();
      d.exercises.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
    }

    return map;
  }, [allLogs, exerciseMap]);

  // ─── Distribuição filtrada pelo período selecionado ───────────────────────

  const distribution = useMemo(() => {
    const cutoff = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
    const periodLogs = allLogs.filter((l) => l.date >= cutoff);

    const volByMuscle: Record<string, number> = {};
    for (const log of periodLogs) {
      for (const perf of log.performance) {
        const ex = exerciseMap[perf.exercise_id];
        if (!ex) continue;
        let sets: SetPerformance[];
        if (perf.sets && perf.sets.length > 0) {
          sets = perf.sets;
        } else if (
          perf.weight_lifted !== undefined &&
          perf.reps_done !== undefined
        ) {
          sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
        } else {
          continue;
        }
        volByMuscle[ex.target_muscle] =
          (volByMuscle[ex.target_muscle] ?? 0) + totalVolume(sets);
      }
    }

    return Object.entries(volByMuscle)
      .map(([muscle, vol]) => ({ muscle, vol: Math.round(vol) }))
      .sort((a, b) => b.vol - a.vol);
  }, [allLogs, exerciseMap, period]);

  const periodLogCount = allLogs.filter(
    (l) => l.date >= new Date(Date.now() - period * 24 * 60 * 60 * 1000)
  ).length;
  const maxVol = distribution[0]?.vol ?? 1;

  // Dados do drill-down
  const drillData = selectedMuscle ? muscleDataMap[selectedMuscle] : null;
  const chartData =
    drillData?.sessions.map((s) => ({
      dateLabel: s.dateLabel,
      value: metric === "1rm" ? s.avg1RM : s.volume,
    })) ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="px-5 pb-1 pt-6">
        <h1
          className="text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          ANÁLISE MUSCULAR
        </h1>
        <p className="text-xs text-[var(--text-dim)]">
          Distribuição de volume por grupo
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {/* Toggle de período */}
        <div className="flex gap-2">
          {([7, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                period === p
                  ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
                  : "bg-[var(--surface-2)] text-[var(--text-dim)]"
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>

        {/* Empty state */}
        {periodLogCount < 3 && (
          <div className="flex h-32 items-center justify-center rounded-xl bg-[var(--surface-2)] px-4">
            <p className="text-center text-sm text-[var(--text-dim)]">
              Complete pelo menos 3 treinos neste período para ver a análise
            </p>
          </div>
        )}

        {/* Barras de distribuição */}
        {periodLogCount >= 3 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="space-y-4">
              {distribution.map(({ muscle, vol }) => (
                <button
                  key={muscle}
                  onClick={() => setSelectedMuscle(muscle)}
                  className="w-full text-left"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-[var(--foreground)]">
                      {muscle}
                    </span>
                    <span className="text-xs text-[var(--text-dim)]">
                      {vol.toLocaleString("pt-BR")} kg
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-2 rounded-full bg-[var(--red-500)] transition-all duration-700"
                      style={{ width: `${(vol / maxVol) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Drill-down bottom-sheet */}
      {selectedMuscle && drillData && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSelectedMuscle(null)}
          />

          {/* Painel */}
          <div className="animate-slide-up fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5">
            {/* Cabeçalho */}
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-2xl uppercase text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {selectedMuscle}
              </h2>
              <button
                onClick={() => setSelectedMuscle(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Toggle de métrica */}
            <div className="mb-3 flex gap-2">
              {(["1rm", "volume"] as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    metric === m
                      ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
                      : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {m === "1rm" ? "Força (1RM)" : "Volume"}
                </button>
              ))}
            </div>

            {/* Gráfico de linha */}
            {chartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                >
                  <XAxis
                    dataKey="dateLabel"
                    stroke={chartColors.muted}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={chartColors.muted}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(
                      value:
                        | number
                        | string
                        | ReadonlyArray<number | string>
                        | undefined
                    ) => [
                      `${value ?? ""} ${metric === "1rm" ? "kg (1RM)" : "kg total"}`,
                      "",
                    ]}
                    labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={chartColors.red}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: chartColors.amber, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="mb-4 flex h-20 items-center justify-center rounded-xl bg-[var(--surface-2)]">
                <p className="text-xs text-[var(--text-dim)]">
                  Treine mais vezes para ver a evolução
                </p>
              </div>
            )}

            {/* Cards de exercícios */}
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Exercícios
              </p>
              {drillData.exercises.map((ex) => {
                const daysAgo = Math.floor(
                  (Date.now() - ex.lastDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                const daysLabel =
                  daysAgo === 0
                    ? "hoje"
                    : daysAgo === 1
                    ? "há 1 dia"
                    : `há ${daysAgo} dias`;
                return (
                  <div
                    key={ex.exerciseId}
                    className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2.5"
                  >
                    <span className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                      {ex.name}
                    </span>
                    <div className="ml-2 flex shrink-0 flex-col items-end">
                      <span className="text-xs font-bold text-[var(--amber-500)]">
                        PR: {ex.bestPR.toFixed(1)} kg
                      </span>
                      <span className="text-[10px] text-[var(--text-dim)]">
                        {daysLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
