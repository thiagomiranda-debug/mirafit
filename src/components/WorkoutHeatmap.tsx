"use client";

import { useEffect, useMemo, useState } from "react";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { WorkoutLog } from "@/types";

interface WorkoutHeatmapProps {
  userId: string;
  /** Número de semanas a exibir (default 13 = ~3 meses) */
  weeks?: number;
}

const DAY_LABELS = ["S", "T", "Q", "Q", "S", "S", "D"]; // Seg-Dom (iso)
const MONTH_NAMES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function countSets(log: WorkoutLog): number {
  let n = 0;
  for (const perf of log.performance) {
    if (perf.sets && perf.sets.length > 0) n += perf.sets.length;
    else if (perf.weight_lifted !== undefined) n += 1;
  }
  return n;
}

/** Retorna o nível 0-4 de intensidade para colorir a célula */
function intensityLevel(sets: number): 0 | 1 | 2 | 3 | 4 {
  if (sets === 0) return 0;
  if (sets <= 8) return 1;
  if (sets <= 16) return 2;
  if (sets <= 24) return 3;
  return 4;
}

const LEVEL_BG: Record<number, string> = {
  0: "var(--surface-2)",
  1: "rgba(239, 68, 68, 0.22)",
  2: "rgba(239, 68, 68, 0.45)",
  3: "rgba(239, 68, 68, 0.70)",
  4: "rgba(239, 68, 68, 0.95)",
};

export default function WorkoutHeatmap({ userId, weeks = 13 }: WorkoutHeatmapProps) {
  const [logs, setLogs] = useState<WorkoutLog[] | null>(null);

  useEffect(() => {
    let alive = true;
    getWorkoutLogs(userId, 120).then((data) => {
      if (alive) setLogs(data);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const { grid, monthMarkers, totalDays, totalSets } = useMemo(() => {
    if (!logs) {
      return { grid: [], monthMarkers: [], totalDays: 0, totalSets: 0 };
    }

    // Mapa YYYY-MM-DD → total de séries no dia
    const byDay = new Map<string, number>();
    for (const log of logs) {
      const key = ymd(log.date);
      byDay.set(key, (byDay.get(key) ?? 0) + countSets(log));
    }

    // Constrói últimas N semanas. Cada semana começa na segunda.
    // A última coluna inclui o dia de hoje.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Descobre a segunda-feira da semana atual
    const dayOfWeek = (today.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - dayOfWeek);

    // Início: segunda-feira (weeks-1) semanas atrás
    const start = new Date(mondayThisWeek);
    start.setDate(mondayThisWeek.getDate() - 7 * (weeks - 1));

    const columns: { date: Date; sets: number; inFuture: boolean }[][] = [];
    const markers: { col: number; label: string }[] = [];
    let lastMonth = -1;
    let daysTrained = 0;
    let setsSum = 0;

    for (let w = 0; w < weeks; w++) {
      const col: { date: Date; sets: number; inFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + w * 7 + d);
        const sets = byDay.get(ymd(dt)) ?? 0;
        const inFuture = dt.getTime() > today.getTime();
        if (!inFuture && sets > 0) {
          daysTrained++;
          setsSum += sets;
        }
        col.push({ date: dt, sets, inFuture });
      }
      // marca nome do mês quando muda no primeiro dia da coluna (segunda)
      const firstDay = col[0].date;
      if (firstDay.getMonth() !== lastMonth) {
        markers.push({ col: w, label: MONTH_NAMES[firstDay.getMonth()] });
        lastMonth = firstDay.getMonth();
      }
      columns.push(col);
    }

    return {
      grid: columns,
      monthMarkers: markers,
      totalDays: daysTrained,
      totalSets: setsSum,
    };
  }, [logs, weeks]);

  if (!logs) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--amber-500)]">
          Atividade
        </h2>
        <p className="text-[11px] text-[var(--text-dim)]">
          <span className="font-bold text-[var(--foreground)]">{totalDays}</span> dias · {totalSets} séries ({weeks} sem.)
        </p>
      </div>

      {/* Month markers */}
      <div className="mb-1 ml-6 grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {Array.from({ length: weeks }).map((_, i) => {
          const m = monthMarkers.find((mm) => mm.col === i);
          return (
            <span key={i} className="text-[9px] font-semibold uppercase text-[var(--text-dim)]">
              {m?.label ?? ""}
            </span>
          );
        })}
      </div>

      <div className="flex gap-1">
        {/* Day labels column */}
        <div className="flex flex-col justify-between py-0.5" style={{ gap: "2px" }}>
          {DAY_LABELS.map((lbl, i) => (
            <span
              key={i}
              className="flex h-[10px] items-center text-[8px] font-bold text-[var(--text-dim)]"
              style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}
            >
              {lbl}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
          {grid.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[2px]">
              {col.map((cell, ri) => {
                const level = cell.inFuture ? -1 : intensityLevel(cell.sets);
                const bg = level < 0 ? "transparent" : LEVEL_BG[level];
                const title = cell.inFuture
                  ? ""
                  : `${cell.date.toLocaleDateString("pt-BR")}: ${cell.sets} série${cell.sets === 1 ? "" : "s"}`;
                return (
                  <div
                    key={ri}
                    title={title}
                    className="aspect-square rounded-[3px]"
                    style={{
                      backgroundColor: bg,
                      border: level < 0 ? "none" : "1px solid rgba(255,255,255,0.03)",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          menos
        </span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div
            key={l}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: LEVEL_BG[l] }}
          />
        ))}
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          mais
        </span>
      </div>
    </div>
  );
}
