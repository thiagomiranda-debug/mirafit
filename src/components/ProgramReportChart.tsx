"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProgramChartPoint } from "@/lib/workoutReport";

type Metric = "volume" | "strength";

export default function ProgramReportChart({
  data,
  volumeChangePct,
  strengthChangePct,
}: {
  data: ProgramChartPoint[];
  volumeChangePct?: number;
  strengthChangePct?: number;
}) {
  const [metric, setMetric] = useState<Metric>("volume");

  const chartData = useMemo(
    () =>
      data
        .filter((point) => (metric === "volume" ? point.volume > 0 : point.avg1RM > 0))
        .map((point) => ({
          ...point,
          value: metric === "volume" ? point.volume : point.avg1RM,
        })),
    [data, metric]
  );
  const change = metric === "volume" ? volumeChangePct : strengthChangePct;
  const unit = metric === "volume" ? "kg" : "kg (1RM médio)";
  const color = metric === "volume" ? "var(--red-500)" : "var(--amber-500)";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {change !== undefined && (
            <p className={`text-xs font-bold ${change >= 0 ? "text-[var(--success)]" : "text-[var(--red-500)]"}`}>
              {change >= 0 ? "+" : ""}{change.toLocaleString("pt-BR")}% no período
            </p>
          )}
        </div>
        <div className="flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
          <button
            type="button"
            onClick={() => setMetric("volume")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${
              metric === "volume"
                ? "bg-[var(--red-600)] text-white"
                : "text-[var(--text-dim)]"
            }`}
          >
            Volume
          </button>
          <button
            type="button"
            onClick={() => setMetric("strength")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${
              metric === "strength"
                ? "bg-[var(--amber-500)] text-black"
                : "text-[var(--text-dim)]"
            }`}
          >
            Força
          </button>
        </div>
      </div>

      {chartData.length < 2 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-6 text-center">
          <p className="text-xs leading-relaxed text-[var(--text-dim)]">
            Complete pelo menos 2 sessões com cargas registradas para comparar a evolução.
          </p>
        </div>
      ) : (
        <div className="h-52 w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={208}
            initialDimension={{ width: 350, height: 208 }}
          >
            <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={`program-report-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
                }
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  color: "var(--foreground)",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
                formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => [
                  `${Number(Array.isArray(value) ? value[0] : value || 0).toLocaleString("pt-BR")} ${unit}`,
                  metric === "volume" ? "Volume" : "Força",
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#program-report-${metric})`}
                dot={{ r: 3, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
