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

export interface ExerciseChartPoint {
  dateLabel: string;
  value: number;
}

interface ExerciseProgressChartProps {
  data: ExerciseChartPoint[];
  /** Sufixo exibido no tooltip (ex.: "kg", "reps"). */
  unit: string;
}

export default function ExerciseProgressChart({
  data,
  unit,
}: ExerciseProgressChartProps) {
  const [colors, setColors] = useState(() => {
    if (typeof document === "undefined") {
      return { red: "#EF4444", amber: "#F59E0B", muted: "#6B7280" };
    }
    const style = getComputedStyle(document.documentElement);
    const red = style.getPropertyValue("--red-500").trim();
    const amber = style.getPropertyValue("--amber-500").trim();
    const muted = style.getPropertyValue("--text-dim").trim();
    return {
      red: red || "#EF4444",
      amber: amber || "#F59E0B",
      muted: muted || "#6B7280",
    };
  });

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const red = style.getPropertyValue("--red-500").trim();
    const amber = style.getPropertyValue("--amber-500").trim();
    const muted = style.getPropertyValue("--text-dim").trim();
    const next = {
      red: red || "#EF4444",
      amber: amber || "#F59E0B",
      muted: muted || "#6B7280",
    };
    void Promise.resolve().then(() => setColors(next));
  }, []);

  if (data.length < 2) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-xl bg-[var(--surface-2)] px-4">
        <p className="text-center text-sm text-[var(--text-dim)]">
          Registre este exercício em pelo menos 2 treinos para ver o gráfico
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <XAxis
          dataKey="dateLabel"
          stroke={colors.muted}
          tick={{ fontSize: 10, fill: colors.muted }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke={colors.muted}
          tick={{ fontSize: 10, fill: colors.muted }}
          tickLine={false}
          axisLine={false}
          width={44}
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
          formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => [`${value ?? ""} ${unit}`, ""]}
          labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={colors.red}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: colors.amber, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
