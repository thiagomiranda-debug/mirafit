"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getExercisesByIds } from "@/lib/workouts";
import { saveWorkoutLog, getPerfAndRecords } from "@/lib/workoutLogs";
import { LibraryExercise, Routine, ExercisePerformance, SetPerformance, LocationType } from "@/types";
import { QUARTEL_EQUIPMENT_WHITELIST } from "@/lib/workoutGenerator";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { generatePortugueseInstructions } from "@/lib/exerciseInstructions";
import { translateExerciseName } from "@/lib/exerciseNames";
import RestTimer from "@/components/RestTimer";
import ExerciseSearchModal from "@/components/ExerciseSearchModal";
import { epley1RM } from "@/lib/metrics";

type SetInput = {
  weight: string;
  reps: string;
  done: boolean;
};

type ExerciseInput = {
  exercise_id: string;
  sets: SetInput[];
};

function summarizeSets(sets: SetPerformance[]): string {
  if (sets.length === 0) return "";
  const maxWeight = Math.max(...sets.map((s) => s.weight));
  const avgReps = Math.round(sets.reduce((a, s) => a + s.reps, 0) / sets.length);
  return `${sets.length}×${avgReps} reps @ ${maxWeight} kg`;
}

export default function TreinoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
        </div>
      }
    >
      <TreinoContent />
    </Suspense>
  );
}

function TreinoContent() {
  const searchParams = useSearchParams();
  const workoutId = searchParams.get("w");
  const routineId = searchParams.get("r");
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [exercises, setExercises] = useState<Record<string, LibraryExercise>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [training, setTraining] = useState(false);
  const [inputs, setInputs] = useState<ExerciseInput[]>([]);
  const [lastPerf, setLastPerf] = useState<Record<string, SetPerformance[]>>({});
  const [prMap, setPrMap] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [restTimer, setRestTimer] = useState<{ exerciseName: string } | null>(null);
  const [swapModal, setSwapModal] = useState<{ exIdx: number; exerciseId: string; muscle: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [locationType, setLocationType] = useState<LocationType>("gym");

  const loadRoutine = useCallback(async () => {
    if (!user || !workoutId || !routineId) return;
    try {
      const db = getFirebaseDb();
      const workoutSnap = await getDoc(doc(db, "workouts", workoutId));
      if (!workoutSnap.exists() || workoutSnap.data().user_id !== user.uid) {
        setError("Treino não encontrado.");
        setLoading(false);
        return;
      }
      const workoutLocType = workoutSnap.data().location_type as LocationType | undefined;
      if (workoutLocType) setLocationType(workoutLocType);
      const routineSnap = await getDoc(
        doc(db, "workouts", workoutId, "routines", routineId)
      );
      if (!routineSnap.exists()) {
        setError("Rotina não encontrada.");
        setLoading(false);
        return;
      }
      const data = { id: routineSnap.id, ...routineSnap.data() } as Routine;
      setRoutine(data);

      const ids = data.exercises.map((ex) => ex.exercise_id);
      const [exMap, { lastPerfMap, personalRecords }] = await Promise.all([
        ids.length > 0 ? getExercisesByIds(ids) : Promise.resolve({}),
        getPerfAndRecords(user.uid),
      ]);
      setExercises(exMap);
      setLastPerf(lastPerfMap);
      setPrMap(personalRecords);

      const sorted = [...data.exercises].sort((a, b) => a.order - b.order);
      setInputs(
        sorted.map((ex) => {
          const prev = lastPerfMap[ex.exercise_id] || [];
          return {
            exercise_id: ex.exercise_id,
            sets: Array.from({ length: ex.sets }, (_, i) => ({
              weight:
                prev[i]?.weight?.toString() ||
                prev[0]?.weight?.toString() ||
                "",
              reps:
                prev[i]?.reps?.toString() ||
                prev[0]?.reps?.toString() ||
                "",
              done: false,
            })),
          };
        })
      );
    } catch {
      setError("Erro ao carregar rotina.");
    } finally {
      setLoading(false);
    }
  }, [user, workoutId, routineId]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) loadRoutine();
  }, [user, loadRoutine]);

  function updateSetInput(
    exIdx: number,
    setIdx: number,
    field: "weight" | "reps",
    value: string
  ) {
    setInputs((prev) => {
      const next = [...prev];
      const sets = [...next[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], [field]: value };
      next[exIdx] = { ...next[exIdx], sets };
      return next;
    });
  }

  function markSetDone(exIdx: number, setIdx: number) {
    const wasDone = inputs[exIdx].sets[setIdx].done;
    setInputs((prev) => {
      const next = [...prev];
      const sets = [...next[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], done: !sets[setIdx].done };
      next[exIdx] = { ...next[exIdx], sets };
      return next;
    });
    if (!wasDone) {
      const exId = inputs[exIdx].exercise_id;
      const lib = exercises[exId];
      const name = lib ? translateExerciseName(lib.name) : exId.replace(/-/g, " ");
      setRestTimer({ exerciseName: name });
    }
  }

  async function handleSwapExercise(exIdx: number, newExercise: LibraryExercise) {
    setRoutine((prev) => {
      if (!prev) return prev;
      const sorted = [...prev.exercises].sort((a, b) => a.order - b.order);
      sorted[exIdx] = { ...sorted[exIdx], exercise_id: newExercise.id };
      return { ...prev, exercises: sorted };
    });

    setExercises((prev) => ({ ...prev, [newExercise.id]: newExercise }));

    const prev = lastPerf[newExercise.id] || [];
    setInputs((prevInputs) => {
      const next = [...prevInputs];
      next[exIdx] = {
        exercise_id: newExercise.id,
        sets: Array.from({ length: next[exIdx].sets.length }, (_, i) => ({
          weight: prev[i]?.weight?.toString() || prev[0]?.weight?.toString() || "",
          reps: prev[i]?.reps?.toString() || prev[0]?.reps?.toString() || "",
          done: false,
        })),
      };
      return next;
    });

    setSwapModal(null);
  }

  async function handleFinish() {
    if (!user || !routine) return;
    const perf: ExercisePerformance[] = inputs
      .filter((inp) => inp.sets.some((s) => s.done))
      .map((inp) => ({
        exercise_id: inp.exercise_id,
        sets: inp.sets
          .filter((s) => s.done)
          .map((s) => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0,
          })),
      }));
    if (perf.length === 0) {
      setError("Complete pelo menos uma série para finalizar.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveWorkoutLog(user.uid, routine.name, perf, notes, locationType);
      setSaved(true);
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (error && !routine) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--background)] px-4">
        <p className="text-sm font-medium text-[var(--red-500)]">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="text-sm font-bold text-[var(--amber-500)]"
        >
          Voltar
        </button>
      </div>
    );
  }

  if (!routine) return null;

  if (saved) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-[var(--background)] px-6">
        <div className="animate-scale-in flex h-20 w-20 items-center justify-center rounded-full bg-[var(--success)]/15">
          <svg className="h-10 w-10 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center">
          <h2
            className="text-4xl text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            TREINO FINALIZADO!
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {routine.name} salvo no histórico
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="mt-2 rounded-2xl px-8 py-3.5 text-sm font-bold text-white gradient-red transition-all hover:shadow-lg hover:shadow-[var(--red-600)]/20"
        >
          Voltar ao início
        </button>
      </div>
    );
  }

  const sorted = [...routine.exercises].sort((a, b) => a.order - b.order);
  const totalSets = inputs.reduce((a, inp) => a + inp.sets.length, 0);
  const doneSets = inputs.reduce(
    (a, inp) => a + inp.sets.filter((s) => s.done).length,
    0
  );
  const progressPct = totalSets > 0 ? (doneSets / totalSets) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="relative border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-[var(--foreground)]">
                {routine.name}
              </h1>
              <p className="text-xs text-[var(--text-dim)]">
                {routine.exercises.length} exercícios
                {training && totalSets > 0 && (
                  <span className="ml-2 font-bold text-[var(--amber-500)]">
                    {doneSets}/{totalSets} séries
                  </span>
                )}
              </p>
            </div>
          </div>
          {!training && (
            <button
              onClick={() => setTraining(true)}
              className="rounded-xl px-4 py-2 text-xs font-bold text-white gradient-red transition-all hover:shadow-md hover:shadow-[var(--red-600)]/20"
            >
              Treinar
            </button>
          )}
        </div>

        {/* Progress bar */}
        {training && totalSets > 0 && (
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out gradient-red"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </header>

      {/* Exercises */}
      <main className="flex flex-1 flex-col gap-3 px-4 py-4 pb-28">
        <div className="stagger space-y-3">
          {sorted.map((ex, idx) => {
            const lib = exercises[ex.exercise_id];
            const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
            const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };
            return (
              <ExerciseCard
                key={ex.exercise_id + idx}
                name={name}
                gifUrl={lib?.gif_url}
                targetMuscle={lib?.target_muscle}
                equipment={lib?.equipment}
                instructions={
                  lib
                    ? generatePortugueseInstructions(lib.target_muscle, lib.equipment)
                    : []
                }
                sets={ex.sets}
                reps={ex.reps}
                index={idx}
                training={training}
                setInputs={exInput.sets}
                lastSets={lastPerf[ex.exercise_id] || []}
                personalRecord={prMap[ex.exercise_id] ?? 0}
                onSetUpdate={(setIdx, field, value) =>
                  updateSetInput(idx, setIdx, field, value)
                }
                onSetDone={(setIdx) => markSetDone(idx, setIdx)}
                onSwap={
                  lib?.target_muscle
                    ? () =>
                        setSwapModal({
                          exIdx: idx,
                          exerciseId: ex.exercise_id,
                          muscle: lib.target_muscle,
                        })
                    : undefined
                }
              />
            );
          })}
        </div>

        {/* Notas do treino */}
        {training && (
          <div className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Anotações do treino
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Como foi o treino? Algo a melhorar na próxima vez..."
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
            />
          </div>
        )}

        {error && (
          <p className="text-center text-sm font-medium text-[var(--red-500)]">{error}</p>
        )}
      </main>

      {/* Finish button */}
      {training && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button
            onClick={handleFinish}
            disabled={saving || doneSets === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 gradient-red"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </>
            ) : (
              `Finalizar Treino${doneSets > 0 ? ` (${doneSets}/${totalSets} séries)` : ""}`
            )}
          </button>
        </div>
      )}

      {/* Rest Timer */}
      {restTimer && (
        <RestTimer
          exerciseName={restTimer.exerciseName}
          onClose={() => setRestTimer(null)}
        />
      )}

      {/* Exercise Swap Modal */}
      {swapModal && (
        <ExerciseSearchModal
          currentExerciseId={swapModal.exerciseId}
          targetMuscle={swapModal.muscle}
          onSelect={(ex) => handleSwapExercise(swapModal.exIdx, ex)}
          onClose={() => setSwapModal(null)}
          equipmentWhitelist={locationType === "quartel" ? QUARTEL_EQUIPMENT_WHITELIST : undefined}
        />
      )}
    </div>
  );
}

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

function ExerciseCard({
  name,
  gifUrl,
  targetMuscle,
  equipment,
  instructions,
  sets,
  reps,
  index,
  training,
  setInputs,
  lastSets,
  personalRecord,
  onSetUpdate,
  onSetDone,
  onSwap,
}: {
  name: string;
  gifUrl?: string;
  targetMuscle?: string;
  equipment?: string;
  instructions: string[];
  sets: number;
  reps: string;
  index: number;
  training: boolean;
  setInputs: SetInput[];
  lastSets: SetPerformance[];
  personalRecord: number;
  onSetUpdate: (setIdx: number, field: "weight" | "reps", value: string) => void;
  onSetDone: (setIdx: number) => void;
  onSwap?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  const doneSets = setInputs.filter((s) => s.done).length;
  const allDone = setInputs.length > 0 && doneSets === setInputs.length;

  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all ${
            allDone
              ? "bg-[var(--success)] text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]"
              : "bg-[var(--red-600)]/15 text-[var(--red-500)]"
          }`}
        >
          {allDone ? (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            index + 1
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold capitalize text-[var(--foreground)]">
            {name}
          </p>
          <p className="text-xs text-[var(--text-dim)]">
            {sets} séries × {reps} reps
            {training && doneSets > 0 && doneSets < sets && (
              <span className="ml-1.5 font-bold text-[var(--amber-500)]">
                · {doneSets}/{sets}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onSwap && (
            <button
              onClick={(e) => { e.stopPropagation(); onSwap(); }}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] transition-colors"
              title="Trocar exercício"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <svg
            className={`h-4 w-4 text-[var(--text-dim)] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Training: set rows */}
      {training && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          {lastSets.length > 0 && (
            <p className="mb-2.5 text-xs text-[var(--text-dim)]">
              Última vez: <span className="font-semibold text-[var(--amber-500)]">{summarizeSets(lastSets)}</span>
            </p>
          )}

          <div className="space-y-2">
            {/* Column headers */}
            <div className="flex items-center gap-2 px-1">
              <span className="w-8 shrink-0" />
              <span className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Carga (kg)
              </span>
              <span className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Reps
              </span>
              <span className="w-10 shrink-0" />
            </div>

            {setInputs.map((s, si) => {
              const w = parseFloat(s.weight);
              const r = parseInt(s.reps);
              const current1RM =
                w > 0 && r > 0 ? epley1RM(w, r) : 0;
              const isNewPR =
                current1RM > personalRecord && current1RM > 0 && !s.done;

              return (
                <div key={si}>
                  <div className="flex items-center gap-2">
                    {/* Set badge */}
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                        s.done
                          ? "bg-[var(--success)] text-white"
                          : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                      }`}
                    >
                      {si + 1}
                    </span>

                    {/* Weight */}
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={s.weight}
                      onChange={(e) => onSetUpdate(si, "weight", e.target.value)}
                      disabled={s.done}
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2.5 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] disabled:opacity-50"
                    />

                    {/* Reps */}
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={s.reps}
                      onChange={(e) => onSetUpdate(si, "reps", e.target.value)}
                      disabled={s.done}
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2.5 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] disabled:opacity-50"
                    />

                    {/* Done toggle */}
                    <button
                      onClick={() => onSetDone(si)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                        s.done
                          ? "border-[var(--success)] bg-[var(--success)] text-white shadow-[0_0_10px_rgba(34,197,94,0.2)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] hover:border-[var(--red-500)] hover:text-[var(--red-500)]"
                      }`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>

                  {/* PR Badge */}
                  {isNewPR && (
                    <div className="animate-scale-in mt-1.5 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--amber-500)]/15 px-3 py-1.5">
                      <span className="text-xs font-bold text-[var(--amber-500)]">
                        🏆 Novo PR!
                      </span>
                      <span className="text-[10px] text-[var(--amber-500)]/70">
                        {current1RM.toFixed(1)} kg
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expanded: media + details */}
      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-4">
          {gifUrl && imgOk ? (
            <div className="relative mt-3 flex justify-center rounded-xl bg-[var(--surface-2)] overflow-hidden">
              <img
                src={gifUrl}
                alt={name}
                loading="lazy"
                onError={() => setImgOk(false)}
                className="max-h-56 rounded-xl object-contain"
              />
            </div>
          ) : (
            <div className="mt-3 flex h-32 items-center justify-center rounded-xl bg-[var(--surface-2)]">
              <img
                src="/icons/fallback-exercise.svg"
                alt="Exercício"
                className="h-12 w-12 opacity-30"
              />
            </div>
          )}

          {(targetMuscle || equipment) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {targetMuscle && (
                <span className="inline-block rounded-full bg-[var(--red-600)]/15 px-3 py-1 text-xs font-bold text-[var(--red-500)]">
                  {targetMuscle}
                </span>
              )}
              {equipment && (
                <span className="inline-block rounded-full bg-[var(--surface-3)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                  {equipment}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex gap-3">
            <div className="rounded-xl bg-[var(--surface-2)] px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Séries</p>
              <p
                className="text-2xl text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {sets}
              </p>
            </div>
            <div className="rounded-xl bg-[var(--surface-2)] px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Repetições</p>
              <p
                className="text-2xl text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {reps}
              </p>
            </div>
          </div>

          {instructions.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Como executar
              </p>
              <ol className="list-inside list-decimal space-y-1.5">
                {instructions.map((inst, i) => (
                  <li key={i} className="text-sm leading-relaxed text-[var(--text-muted)]">
                    {inst}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
