"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getExercisesByIds } from "@/lib/workouts";
import { getExerciseDetail, ExerciseDetail } from "@/lib/workoutLogs";
import { LibraryExercise } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";
import { generatePortugueseInstructions } from "@/lib/exerciseInstructions";
import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import ExerciseProgressChart, {
  ExerciseChartPoint,
} from "@/components/ExerciseProgressChart";
import { haptic } from "@/lib/haptics";

const MUSCLE_NAME_PT: Record<string, string> = {
  abductors: "Abdutores",
  abs: "Abdômen",
  adductors: "Adutores",
  biceps: "Bíceps",
  calves: "Panturrilhas",
  cardiovascular_system: "Sistema Cardiovascular",
  delts: "Deltoides",
  forearms: "Antebraços",
  glutes: "Glúteos",
  hamstrings: "Posterior de Coxa",
  lats: "Dorsal",
  levator_scapulae: "Levantador da Escápula",
  pectorals: "Peitorais",
  quads: "Quadríceps",
  serratus_anterior: "Serrátil Anterior",
  spine: "Coluna",
  traps: "Trapézio",
  triceps: "Tríceps",
  upper_back: "Costas Superior",
};

function translateMuscle(name: string | undefined): string {
  if (!name) return "";
  return MUSCLE_NAME_PT[name.toLowerCase()] || name;
}

type Metric = "weight" | "1rm" | "volume" | "reps";

const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "weight", label: "Peso máx", unit: "kg" },
  { key: "1rm", label: "1RM", unit: "kg" },
  { key: "volume", label: "Volume", unit: "kg" },
  { key: "reps", label: "Reps", unit: "reps" },
];

export default function ExercisePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ExerciseContent />
    </Suspense>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
    </div>
  );
}

function ExerciseContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const exerciseId = searchParams.get("id");

  const [lib, setLib] = useState<LibraryExercise | null>(null);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [metric, setMetric] = useState<Metric>("weight");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    async function load() {
      if (!user || !exerciseId) return;
      setLoading(true);
      setError(false);
      try {
        const [exMap, det] = await Promise.all([
          getExercisesByIds([exerciseId]),
          getExerciseDetail(user.uid, exerciseId),
        ]);
        setLib(exMap[exerciseId] ?? null);
        setDetail(det);
      } catch (err) {
        console.error("[ExercisePage]", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (user && exerciseId) load();
  }, [user, exerciseId]);

  const chartData: ExerciseChartPoint[] = useMemo(() => {
    if (!detail) return [];
    // Mais antigo → mais recente para o gráfico.
    const asc = [...detail.sessions].reverse();
    return asc.map((s) => {
      const dateLabel = s.date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      });
      let value = 0;
      if (metric === "weight") value = Math.max(...s.sets.map((x) => x.weight));
      else if (metric === "1rm") value = Math.round(best1RMFromSets(s.sets));
      else if (metric === "volume") value = Math.round(totalVolume(s.sets));
      else value = Math.max(...s.sets.map((x) => x.reps));
      return { dateLabel, value };
    });
  }, [detail, metric]);

  const activeUnit = METRICS.find((m) => m.key === metric)!.unit;
  const exName = lib
    ? translateExerciseName(lib.name)
    : exerciseId
    ? translateExerciseName(exerciseId.replace(/-/g, " "))
    : "Exercício";

  if (authLoading || loading) return <Spinner />;

  if (!exerciseId || error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--background)] px-8 text-center">
        <p className="text-sm font-semibold text-[var(--text-muted)]">
          Não foi possível carregar este exercício.
        </p>
        <button
          onClick={() => router.back()}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-2)]"
        >
          Voltar
        </button>
      </div>
    );
  }

  const records = detail?.records;
  const sessions = detail?.sessions ?? [];
  const instructions = lib
    ? generatePortugueseInstructions(lib.target_muscle, lib.equipment)
    : [];

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-6">
        <button
          onClick={() => {
            haptic("light");
            router.back();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--foreground)]"
          aria-label="Voltar"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1
            className="truncate text-2xl capitalize text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            {exName}
          </h1>
          {lib?.target_muscle && (
            <p className="text-xs text-[var(--text-dim)]">
              {translateMuscle(lib.target_muscle)}
            </p>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 py-3">
        {/* GIF */}
        {lib?.gif_url && imgOk ? (
          <div className="flex justify-center overflow-hidden rounded-2xl bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lib.gif_url}
              alt={exName}
              loading="lazy"
              onError={() => setImgOk(false)}
              className="max-h-56 object-contain"
            />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/fallback-exercise.svg" alt="Exercício" className="h-12 w-12 opacity-30" />
          </div>
        )}

        {/* Instruções */}
        {instructions.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Como executar
            </h2>
            <ol className="space-y-1.5">
              {instructions.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-[var(--text-muted)]">
                  <span className="font-bold text-[var(--red-500)]">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Recordes */}
        {records && sessions.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Recordes
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <RecordCard label="🏆 Melhor 1RM" value={`${records.best1RM} kg`} />
              <RecordCard label="Peso máximo" value={`${records.maxWeight} kg`} />
              <RecordCard
                label="Melhor série"
                value={
                  records.bestSet
                    ? `${records.bestSet.weight}kg × ${records.bestSet.reps}`
                    : "—"
                }
              />
              <RecordCard
                label="Maior volume"
                value={`${records.bestSessionVol.toLocaleString("pt-BR")} kg`}
              />
            </div>
          </section>
        )}

        {/* Gráfico + toggle */}
        {sessions.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Evolução
            </h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => {
                    haptic("light");
                    setMetric(m.key);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    metric === m.key
                      ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
                      : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <ExerciseProgressChart data={chartData} unit={activeUnit} />
          </section>
        )}

        {/* Histórico sessão a sessão */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
            Histórico
          </h2>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">
              <p className="text-sm font-medium text-[var(--text-muted)]">
                Você ainda não registrou este exercício
              </p>
              <p className="mt-1 text-xs text-[var(--text-dim)]">
                Complete um treino com ele para ver o histórico aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sessions.map((s, i) => (
                <SessionRow key={i} date={s.date} sets={s.sets} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function RecordCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-3.5 py-3"
      style={{ background: "var(--surface-gradient)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {label}
      </p>
      <p
        className="mt-1 text-xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SessionRow({
  date,
  sets,
}: {
  date: Date;
  sets: { weight: number; reps: number }[];
}) {
  const formatted = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: "var(--surface-gradient)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="mb-1.5 text-xs font-semibold text-[var(--text-dim)]">{formatted}</p>
      <div className="flex flex-wrap gap-1.5">
        {sets.map((s, i) => (
          <span
            key={i}
            className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text-muted)]"
          >
            {s.weight}kg × {s.reps}
          </span>
        ))}
      </div>
    </div>
  );
}
