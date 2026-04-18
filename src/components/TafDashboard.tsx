"use client";

import { useEffect, useState } from "react";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { getExercisesByIds } from "@/lib/workouts";
import {
  TafGender,
  TafAgeGroup,
  TafExerciseKey,
  tafStandards,
  calculateTafScore,
  repsForScore,
  matchExerciseToTaf,
  getTafExercisesForGender,
  TAF_LABELS,
  AGE_GROUP_LABELS,
} from "@/lib/tafData";

interface TafResult {
  key: TafExerciseKey;
  maxReps: number;
  score: number;
  base: number;
  mult: number;
}

interface TafDashboardProps {
  userId: string;
  gender?: TafGender;
  ageGroup?: TafAgeGroup;
}

export default function TafDashboard({ userId, gender, ageGroup }: TafDashboardProps) {
  const [results, setResults] = useState<TafResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!gender || !ageGroup) return;

    async function load() {
      setLoading(true);
      try {
        const logs = await getWorkoutLogs(userId, 60);

        // Coletar exercise_ids únicos
        const idsSet = new Set<string>();
        for (const log of logs) {
          for (const perf of log.performance) {
            idsSet.add(perf.exercise_id);
          }
        }

        // Buscar metadados das exercises
        const exerciseMap = idsSet.size > 0
          ? await getExercisesByIds(Array.from(idsSet))
          : {};

        // Mapear exercise_id → categoria TAF
        const idToTaf: Record<string, TafExerciseKey> = {};
        for (const [id, ex] of Object.entries(exerciseMap)) {
          const cat = matchExerciseToTaf(ex.name);
          if (cat) idToTaf[id] = cat;
        }

        // Calcular max reps por categoria
        const maxRepsMap: Partial<Record<TafExerciseKey, number>> = {};
        for (const log of logs) {
          for (const perf of log.performance) {
            const cat = idToTaf[perf.exercise_id];
            if (!cat) continue;

            let reps = 0;
            if (perf.sets && perf.sets.length > 0) {
              reps = Math.max(...perf.sets.map((s) => s.reps));
            } else if (perf.reps_done !== undefined) {
              reps = perf.reps_done;
            }

            if (reps > (maxRepsMap[cat] ?? 0)) {
              maxRepsMap[cat] = reps;
            }
          }
        }

        // Montar resultados para as categorias do sexo
        const standards = tafStandards[gender!][ageGroup!];
        const categoryList = getTafExercisesForGender(gender!);
        const built: TafResult[] = categoryList.map((key) => {
          const std = standards[key];
          const maxReps = maxRepsMap[key] ?? 0;
          const score = std ? calculateTafScore(maxReps, std.base, std.mult) : 0;
          return { key, maxReps, score, base: std?.base ?? 0, mult: std?.mult ?? 0 };
        });

        setResults(built);
        setReady(true);
      } catch {
        setReady(true); // falha silenciosa
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userId, gender, ageGroup]);

  // Perfil incompleto
  if (!gender || !ageGroup) {
    return (
      <div className="rounded-2xl border border-[var(--amber-500)]/20 bg-[var(--amber-500)]/10 px-4 py-4">
        <p className="text-sm font-semibold text-[var(--amber-500)]">Perfil TAF incompleto</p>
        <p className="mt-1 text-xs text-[var(--amber-500)]/80">
          Configure seu sexo e faixa etária na aba Perfil para calcular suas notas do TAF.
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

  const genderLabel = gender === 'masculino' ? 'Masculino' : 'Feminino';
  const ageLabel = AGE_GROUP_LABELS[ageGroup];
  const allZero = ready && results.every((r) => r.maxReps === 0);

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Empty state */}
      {allZero && (
        <div className="rounded-xl bg-[var(--surface-2)] px-4 py-5 text-center">
          <p className="text-sm text-[var(--text-dim)]">
            Nenhum registro encontrado. Treine flexões, barras e abdominais para ver sua nota.
          </p>
        </div>
      )}

      {/* Exercise cards */}
      <div className="stagger space-y-3">
        {results.map((r) => {
          const scoreColor =
            r.score >= 100
              ? 'var(--success)'
              : r.score >= 50
              ? 'var(--amber-500)'
              : 'var(--red-500)';

          const barColor =
            r.score >= 100
              ? 'bg-[var(--success)]'
              : r.score >= 50
              ? 'bg-[var(--amber-500)]'
              : 'bg-[var(--red-500)]';

          let indicatorText: string;
          if (r.score >= 100) {
            indicatorText = 'Nota máxima! Excelente desempenho.';
          } else if (r.score >= 50) {
            const repsTo100 = repsForScore(100, r.base, r.mult) - r.maxReps;
            indicatorText = `Aprovado! Faltam ${repsTo100} rep${repsTo100 !== 1 ? 's' : ''} para a pontuação máxima.`;
          } else {
            const repsTo50 = r.base - r.maxReps;
            indicatorText = r.maxReps === 0
              ? `Reprovado. Mínimo: ${r.base} reps (50 pts).`
              : `Reprovado. Faltam ${repsTo50} rep${repsTo50 !== 1 ? 's' : ''} para o mínimo (50 pts).`;
          }

          return (
            <div
              key={r.key}
              className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              {/* Nome + Score */}
              <div className="mb-3 flex items-start justify-between">
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {TAF_LABELS[r.key]}
                </p>
                <span
                  className="text-2xl leading-none"
                  style={{ fontFamily: "var(--font-bebas)", color: scoreColor }}
                >
                  {Math.round(r.score)} pts
                </span>
              </div>

              {/* PR */}
              <div className="mb-3 flex items-baseline gap-1">
                <span
                  className="text-3xl text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-bebas)" }}
                >
                  {r.maxReps}
                </span>
                <span className="text-xs text-[var(--text-dim)]">reps (seu PR)</span>
                <span className="ml-auto text-xs text-[var(--text-dim)]">
                  mínimo: {r.base} reps
                </span>
              </div>

              {/* Barra de progresso */}
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${Math.round(r.score)}%` }}
                />
              </div>

              {/* Texto indicador */}
              <p
                className="text-xs font-semibold"
                style={{ color: scoreColor }}
              >
                {indicatorText}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
