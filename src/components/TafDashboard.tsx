"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TafAttemptList from "@/components/TafAttemptList";
import TafHistoryChart from "@/components/TafHistoryChart";
import { getBestTafResults } from "@/lib/tafAttempts";
import {
  AGE_GROUP_LABELS,
  TAF_EVENT_LABELS,
  TafAgeGroup,
  TafExerciseKey,
  TafGender,
  TafRunKey,
  calculateTafScore,
  formatRunTime,
  getTafEventsForGender,
  matchExerciseToTaf,
  repsForScore,
  scoreRunTime,
  secondsToReachScore,
  tafRunStandards,
  tafStandards,
} from "@/lib/tafData";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { getExercisesByIds } from "@/lib/workouts";

type TafResult =
  | {
      kind: "reps";
      key: TafExerciseKey;
      maxReps: number;
      score: number;
      base: number;
      mult: number;
    }
  | {
      kind: "run";
      key: TafRunKey;
      bestSeconds: number | null;
      score: number;
    };

interface TafDashboardProps {
  userId: string;
  gender?: TafGender;
  ageGroup?: TafAgeGroup;
}

export default function TafDashboard({
  userId,
  gender,
  ageGroup,
}: TafDashboardProps) {
  const [results, setResults] = useState<TafResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!gender || !ageGroup) return;
    const resolvedGender = gender;
    const resolvedAgeGroup = ageGroup;

    async function load() {
      setLoading(true);
      try {
        const logs = await getWorkoutLogs(userId, 60);
        const idsSet = new Set<string>();
        for (const log of logs) {
          for (const perf of log.performance) idsSet.add(perf.exercise_id);
        }

        const exerciseMap =
          idsSet.size > 0 ? await getExercisesByIds(Array.from(idsSet)) : {};

        const idToTaf: Record<string, TafExerciseKey> = {};
        for (const [id, exercise] of Object.entries(exerciseMap)) {
          const category = matchExerciseToTaf(exercise.name);
          if (category) idToTaf[id] = category;
        }

        const maxRepsFromLogs: Partial<Record<TafExerciseKey, number>> = {};
        for (const log of logs) {
          for (const perf of log.performance) {
            const category = idToTaf[perf.exercise_id];
            if (!category) continue;

            let reps = 0;
            if (perf.sets && perf.sets.length > 0) {
              reps = Math.max(...perf.sets.map((set) => set.reps));
            } else if (perf.reps_done !== undefined) {
              reps = perf.reps_done;
            }

            if (reps > (maxRepsFromLogs[category] ?? 0)) {
              maxRepsFromLogs[category] = reps;
            }
          }
        }

        const bestFromAttempts = await getBestTafResults(userId);
        const events = getTafEventsForGender(resolvedGender);
        const repsStandards = tafStandards[resolvedGender][resolvedAgeGroup];

        const built: TafResult[] = events.map((key): TafResult => {
          if (key === "run_300m" || key === "run_1600m") {
            const attempt = bestFromAttempts[key];
            return {
              kind: "run",
              key,
              bestSeconds: attempt?.value ?? null,
              score:
                attempt?.score ??
                (attempt?.value != null
                  ? scoreRunTime(
                      attempt.value,
                      resolvedGender,
                      resolvedAgeGroup,
                      key
                    )
                  : 0),
            };
          }

          const standard = repsStandards[key];
          const logsReps = maxRepsFromLogs[key] ?? 0;
          const attemptValue = bestFromAttempts[key]?.value ?? 0;
          const maxReps = Math.max(logsReps, attemptValue);
          const score = standard
            ? calculateTafScore(maxReps, standard.base, standard.mult)
            : 0;

          return {
            kind: "reps",
            key,
            maxReps,
            score,
            base: standard?.base ?? 0,
            mult: standard?.mult ?? 0,
          };
        });

        setResults(built);
        setReady(true);
      } catch {
        setReady(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [ageGroup, gender, userId]);

  if (!gender || !ageGroup) {
    return (
      <div className="rounded-2xl border border-[var(--amber-500)]/20 bg-[var(--amber-500)]/10 px-4 py-4">
        <p className="text-sm font-semibold text-[var(--amber-500)]">
          Perfil TAF incompleto
        </p>
        <p className="mt-1 text-xs text-[var(--amber-500)]/80">
          Configure seu sexo e faixa etaria no Perfil para calcular suas notas
          do TAF.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  const genderLabel = gender === "masculino" ? "Masculino" : "Feminino";
  const ageLabel = AGE_GROUP_LABELS[ageGroup];
  const allZero =
    ready &&
    results.every((result) =>
      result.kind === "reps" ? result.maxReps === 0 : result.bestSeconds == null
    );

  return (
    <div className="space-y-4">
      <div>
        <h2
          className="text-2xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          EDITAL CBMAL
        </h2>
        <p className="text-xs text-[var(--text-dim)]">
          {genderLabel} · {ageLabel}
        </p>
      </div>

      <Link
        href="/taf/tentativa"
        className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--red-500)] to-[var(--amber-500)] px-4 py-3.5 text-sm font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        <span>INICIAR MODO TAF</span>
      </Link>

      {allZero && (
        <div className="rounded-xl bg-[var(--surface-2)] px-4 py-5 text-center">
          <p className="text-sm text-[var(--text-dim)]">
            Nenhum registro encontrado. Toque em &quot;Iniciar Modo TAF&quot;
            para registrar sua primeira tentativa.
          </p>
        </div>
      )}

      <div className="stagger space-y-3">
        {results.map((result) => {
          const scoreColor =
            result.score >= 100
              ? "var(--success)"
              : result.score >= 50
                ? "var(--amber-500)"
                : "var(--red-500)";

          const barColor =
            result.score >= 100
              ? "bg-[var(--success)]"
              : result.score >= 50
                ? "bg-[var(--amber-500)]"
                : "bg-[var(--red-500)]";

          return (
            <div
              key={result.key}
              className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-3 flex items-start justify-between">
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {TAF_EVENT_LABELS[result.key]}
                </p>
                <span
                  className="text-2xl leading-none"
                  style={{ fontFamily: "var(--font-bebas)", color: scoreColor }}
                >
                  {Math.round(result.score)} pts
                </span>
              </div>

              {result.kind === "reps" ? (
                <RepsCardBody r={result} />
              ) : (
                <RunCardBody r={result} gender={gender} ageGroup={ageGroup} />
              )}

              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${Math.round(result.score)}%` }}
                />
              </div>

              <p className="text-xs font-semibold" style={{ color: scoreColor }}>
                {indicatorTextFor(result, gender, ageGroup)}
              </p>
            </div>
          );
        })}
      </div>

      <section className="mt-6 space-y-4">
        <h3
          className="text-xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          EVOLUCAO
        </h3>

        <TafHistoryChart userId={userId} gender={gender} />

        <div>
          <h4 className="mb-2 text-sm font-bold uppercase text-[var(--text-dim)]">
            Tentativas
          </h4>
          <TafAttemptList userId={userId} />
        </div>
      </section>
    </div>
  );
}

function RepsCardBody({
  r,
}: {
  r: Extract<TafResult, { kind: "reps" }>;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-1">
      <span
        className="text-3xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        {r.maxReps}
      </span>
      <span className="text-xs text-[var(--text-dim)]">reps (seu PR)</span>
      <span className="ml-auto text-xs text-[var(--text-dim)]">
        minimo: {r.base} reps
      </span>
    </div>
  );
}

function RunCardBody({
  r,
  gender,
  ageGroup,
}: {
  r: Extract<TafResult, { kind: "run" }>;
  gender: TafGender;
  ageGroup: TafAgeGroup;
}) {
  const tiers = tafRunStandards[gender][ageGroup][r.key];
  const minSecondsForApproval = [...tiers]
    .reverse()
    .find((tier) => tier.score >= 50)?.maxSeconds;

  return (
    <div className="mb-3 flex items-baseline gap-1">
      <span
        className="text-3xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        {r.bestSeconds != null ? formatRunTime(r.bestSeconds, r.key) : "—"}
      </span>
      <span className="text-xs text-[var(--text-dim)]">melhor tempo</span>
      {minSecondsForApproval != null && (
        <span className="ml-auto text-xs text-[var(--text-dim)]">
          minimo: {formatRunTime(minSecondsForApproval, r.key)}
        </span>
      )}
    </div>
  );
}

function indicatorTextFor(
  r: TafResult,
  gender: TafGender,
  ageGroup: TafAgeGroup
): string {
  if (r.kind === "reps") {
    if (r.score >= 100) return "Nota maxima! Excelente desempenho.";
    if (r.score >= 50) {
      const repsTo100 = repsForScore(100, r.base, r.mult) - r.maxReps;
      return `Aprovado! Faltam ${repsTo100} rep${
        repsTo100 !== 1 ? "s" : ""
      } para a pontuacao maxima.`;
    }
    const repsTo50 = r.base - r.maxReps;
    return r.maxReps === 0
      ? `Reprovado. Minimo: ${r.base} reps (50 pts).`
      : `Reprovado. Faltam ${repsTo50} rep${
          repsTo50 !== 1 ? "s" : ""
        } para o minimo (50 pts).`;
  }

  if (r.bestSeconds == null) {
    return 'Nenhum registro. Toque em "Iniciar Modo TAF" para registrar.';
  }

  if (r.score >= 100) return "Nota maxima! Excelente desempenho.";

  if (r.score >= 50) {
    const delta = secondsToReachScore(
      r.bestSeconds,
      100,
      gender,
      ageGroup,
      r.key
    );
    return delta == null || delta === 0
      ? "Aprovado!"
      : `Aprovado! Reduza ${delta.toFixed(2)}s para a pontuacao maxima.`;
  }

  const delta = secondsToReachScore(r.bestSeconds, 50, gender, ageGroup, r.key);
  return delta == null
    ? "Reprovado. Tempo fora da tabela."
    : `Reprovado. Reduza ${delta.toFixed(2)}s para atingir o minimo (50 pts).`;
}
