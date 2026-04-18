"use client";

import { useEffect, useMemo, useState } from "react";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { WorkoutLog, SetPerformance } from "@/types";
import { totalVolume } from "@/lib/metrics";

interface WeekComparisonProps {
  userId: string;
}

function mondayOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - dow);
  return r;
}

interface WeekStats {
  workouts: number;
  sets: number;
  volume: number;
}

function computeStats(logs: WorkoutLog[], start: Date, end: Date): WeekStats {
  let workouts = 0;
  let sets = 0;
  let volume = 0;
  for (const log of logs) {
    if (log.date < start || log.date >= end) continue;
    workouts++;
    const allSets: SetPerformance[] = [];
    for (const perf of log.performance) {
      if (perf.sets && perf.sets.length > 0) {
        allSets.push(...perf.sets);
      } else if (perf.weight_lifted !== undefined && perf.reps_done !== undefined) {
        allSets.push({ weight: perf.weight_lifted, reps: perf.reps_done });
      }
    }
    sets += allSets.length;
    volume += totalVolume(allSets);
  }
  return { workouts, sets, volume };
}

export default function WeekComparison({ userId }: WeekComparisonProps) {
  const [logs, setLogs] = useState<WorkoutLog[] | null>(null);

  useEffect(() => {
    let alive = true;
    getWorkoutLogs(userId, 60).then((data) => {
      if (alive) setLogs(data);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const { current, previous } = useMemo(() => {
    if (!logs) return { current: null as WeekStats | null, previous: null as WeekStats | null };
    const thisMonday = mondayOf(new Date());
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    return {
      current: computeStats(logs, thisMonday, nextMonday),
      previous: computeStats(logs, lastMonday, thisMonday),
    };
  }, [logs]);

  if (!logs || !current || !previous) {
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
          Esta Semana
        </h2>
        <p className="text-[11px] text-[var(--text-dim)]">vs. semana anterior</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Treinos"
          current={current.workouts}
          previous={previous.workouts}
          format={(n) => String(n)}
        />
        <Metric
          label="Séries"
          current={current.sets}
          previous={previous.sets}
          format={(n) => String(n)}
        />
        <Metric
          label="Tonelagem"
          current={current.volume}
          previous={previous.volume}
          format={(n) =>
            n >= 1000 ? `${(n / 1000).toFixed(1)}t` : `${Math.round(n)}kg`
          }
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  current,
  previous,
  format,
}: {
  label: string;
  current: number;
  previous: number;
  format: (n: number) => string;
}) {
  const delta = current - previous;
  const pct = previous > 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : 0;
  const up = delta > 0;
  const down = delta < 0;
  const color = up
    ? "text-[var(--success)]"
    : down
      ? "text-[var(--red-500)]"
      : "text-[var(--text-dim)]";
  const arrow = up ? "▲" : down ? "▼" : "·";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {label}
      </p>
      <p
        className="mt-0.5 text-xl leading-none text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        {format(current)}
      </p>
      <p className={`mt-1 text-[10px] font-semibold ${color}`}>
        {arrow} {Math.abs(pct)}% <span className="text-[var(--text-dim)]">({format(previous)})</span>
      </p>
    </div>
  );
}
