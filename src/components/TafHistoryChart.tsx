"use client";

import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getTafAttempts, TafAttempt } from "@/lib/tafAttempts";
import {
  TAF_EVENT_LABELS,
  TafEventKey,
  TafGender,
  getTafEventsForGender,
} from "@/lib/tafData";

interface Props {
  userId: string;
  gender: TafGender;
}

interface Point {
  dateLabel: string;
  score: number;
}

export default function TafHistoryChart({ userId, gender }: Props) {
  const [attempts, setAttempts] = useState<TafAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTafAttempts(userId, 50).then((loadedAttempts) => {
      setAttempts([...loadedAttempts].reverse());
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="flex h-[120px] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  const events = getTafEventsForGender(gender);
  const byEvent: Partial<Record<TafEventKey, Point[]>> = {};
  const styles =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;
  const strokeColor = styles?.getPropertyValue("--red-500").trim() || "#EF4444";
  const activeDotColor =
    styles?.getPropertyValue("--amber-500").trim() || "#F59E0B";

  for (const attempt of attempts) {
    const dateLabel = attempt.date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });

    for (const result of attempt.results) {
      if (result.skipped) continue;
      const points = byEvent[result.event] ?? [];
      points.push({ dateLabel, score: result.score });
      byEvent[result.event] = points;
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {events.map((event) => {
        const data = byEvent[event] ?? [];
        return (
          <div
            key={event}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <p className="mb-1 text-[11px] font-bold text-[var(--text-muted)]">
              {TAF_EVENT_LABELS[event]}
            </p>

            {data.length < 2 ? (
              <div className="flex h-[70px] items-center justify-center">
                <p className="text-[10px] text-[var(--text-dim)]">
                  Precisa ≥2 tentativas
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={70}>
                <LineChart
                  data={data}
                  margin={{ top: 2, right: 2, bottom: 0, left: 0 }}
                >
                  <XAxis dataKey="dateLabel" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value) => [`${value ?? 0} pts`, ""]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={strokeColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, fill: activeDotColor, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      })}
    </div>
  );
}
