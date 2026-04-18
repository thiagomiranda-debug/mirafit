"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import { SetPerformance } from "@/types";

type Metric = "1rm" | "volume";

interface ChartPoint {
  dateLabel: string;
  value: number;
}

interface ProgressChartProps {
  userId: string;
}

export default function ProgressChart({ userId }: ProgressChartProps) {
  const [metric, setMetric] = useState<Metric>("1rm");
  const [rm1Data, setRm1Data] = useState<ChartPoint[]>([]);
  const [volumeData, setVolumeData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartColors, setChartColors] = useState({
    red: "#EF4444",
    amber: "#F59E0B",
    muted: "#6B7280",
  });

  useEffect(() => {
    async function load() {
      try {
        const logs = await getWorkoutLogs(userId, 60);
        // Ordenar do mais antigo para o mais recente para o gráfico
        const sorted = [...logs].reverse();

        const rm1: ChartPoint[] = [];
        const vol: ChartPoint[] = [];

        for (const log of sorted) {
          const dateLabel = log.date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });

          // Coletar todos os sets de todos os exercícios da sessão
          const allSets: SetPerformance[] = [];
          for (const perf of log.performance) {
            if (perf.sets && perf.sets.length > 0) {
              allSets.push(...perf.sets);
            } else if (
              perf.weight_lifted !== undefined &&
              perf.reps_done !== undefined
            ) {
              allSets.push({ weight: perf.weight_lifted, reps: perf.reps_done });
            }
          }

          if (allSets.length === 0) continue;

          // 1RM médio: média do best1RM de cada exercício
          const perExercise1RM = log.performance.map((perf) => {
            let sets: SetPerformance[] = [];
            if (perf.sets && perf.sets.length > 0) {
              sets = perf.sets;
            } else if (
              perf.weight_lifted !== undefined &&
              perf.reps_done !== undefined
            ) {
              sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
            }
            return best1RMFromSets(sets);
          }).filter((v) => v > 0);

          const avg1RM =
            perExercise1RM.length > 0
              ? Math.round(
                  perExercise1RM.reduce((a, b) => a + b, 0) /
                    perExercise1RM.length
                )
              : 0;

          const vol_total = totalVolume(allSets);

          if (avg1RM > 0) rm1.push({ dateLabel, value: avg1RM });
          if (vol_total > 0) vol.push({ dateLabel, value: Math.round(vol_total) });
        }

        setRm1Data(rm1);
        setVolumeData(vol);
      } catch {
        // Erro silencioso — não quebra a página de perfil
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const red = style.getPropertyValue("--red-500").trim();
    const amber = style.getPropertyValue("--amber-500").trim();
    const muted = style.getPropertyValue("--text-dim").trim();
    setChartColors({
      red: red || "#EF4444",
      amber: amber || "#F59E0B",
      muted: muted || "#6B7280",
    });
  }, []);

  const chartData = metric === "1rm" ? rm1Data : volumeData;
  const yLabel = metric === "1rm" ? "kg (1RM)" : "kg total";

  if (loading) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (chartData.length < 3) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-xl bg-[var(--surface-2)] px-4">
        <p className="text-center text-sm text-[var(--text-dim)]">
          Complete pelo menos 3 treinos para ver sua evolução
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toggle */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setMetric("1rm")}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
            metric === "1rm"
              ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
              : "bg-[var(--surface-2)] text-[var(--text-dim)]"
          }`}
        >
          Força (1RM)
        </button>
        <button
          onClick={() => setMetric("volume")}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
            metric === "volume"
              ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
              : "bg-[var(--surface-2)] text-[var(--text-dim)]"
          }`}
        >
          Volume
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={180}>
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
            width={50}
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
            formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => [`${value ?? ""} ${yLabel}`, ""]}
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
    </div>
  );
}
