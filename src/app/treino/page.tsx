"use client";

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getExercisesByIds, updateRoutineExercise } from "@/lib/workouts";
import { saveWorkoutLog, getPerfAndRecords } from "@/lib/workoutLogs";
import { LibraryExercise, Routine, ExercisePerformance, SetPerformance, LocationType } from "@/types";
import { QUARTEL_EQUIPMENT_WHITELIST } from "@/lib/workoutGenerator";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { generatePortugueseInstructions } from "@/lib/exerciseInstructions";
import { translateExerciseName } from "@/lib/exerciseNames";
import RestTimer, { NextPreview } from "@/components/RestTimer";
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

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

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
  const [swapError, setSwapError] = useState(false);

  const [restTimer, setRestTimer] = useState<{
    exerciseName: string;
    nextPreview: NextPreview | null;
  } | null>(null);
  const trainingStartRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const finalElapsedRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
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

  useEffect(() => {
    if (!training) return;
    if (!trainingStartRef.current) trainingStartRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - trainingStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [training]);

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

  function unlockAudio() {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") return;
    try {
      const AudioCtxCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtxCtor();
      audioCtxRef.current = ctx;
      // Play a silent buffer to satisfy iOS gesture requirement
      ctx.resume().then(() => {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      });
    } catch {
      // audio not supported
    }
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
      unlockAudio();
      const exId = inputs[exIdx].exercise_id;
      const lib = exercises[exId];
      const name = lib ? translateExerciseName(lib.name) : exId.replace(/-/g, " ");

      // Compute remaining undone sets for the current exercise AFTER this toggle
      const currentSets = inputs[exIdx].sets;
      const remainingAfter = currentSets.filter(
        (s, i) => (i === setIdx ? false : !s.done)
      ).length;

      let nextPreview: NextPreview | null = null;
      const sortedEx = routine
        ? [...routine.exercises].sort((a, b) => a.order - b.order)
        : [];

      if (remainingAfter > 0) {
        // Same exercise, next set
        const lastSummary = summarizeSets(lastPerf[exId] || []);
        const currentDef = sortedEx[exIdx];
        nextPreview = {
          label: "Próxima série",
          name,
          gifUrl: lib?.gif_url,
          sets: currentDef?.sets,
          reps: currentDef?.reps,
          targetMuscle: lib?.target_muscle,
          lastPerformance: lastSummary || undefined,
        };
      } else {
        // Look for next exercise
        const nextDef = sortedEx[exIdx + 1];
        if (nextDef) {
          const nextLib = exercises[nextDef.exercise_id];
          const nextName = nextLib
            ? translateExerciseName(nextLib.name)
            : nextDef.exercise_id.replace(/-/g, " ");
          const lastSummary = summarizeSets(lastPerf[nextDef.exercise_id] || []);
          nextPreview = {
            label: "Próximo exercício",
            name: nextName,
            gifUrl: nextLib?.gif_url,
            sets: nextDef.sets,
            reps: nextDef.reps,
            targetMuscle: nextLib?.target_muscle,
            lastPerformance: lastSummary || undefined,
          };
        }
      }

      setRestTimer({ exerciseName: name, nextPreview });
    }
  }

  function handleSwapExercise(exIdx: number, newExercise: LibraryExercise, oldExerciseId: string) {
    const prevRoutine = routine;
    const prevInputs = inputs;

    setRoutine((prev) => {
      if (!prev) return prev;
      const sorted = [...prev.exercises].sort((a, b) => a.order - b.order);
      sorted[exIdx] = { ...sorted[exIdx], exercise_id: newExercise.id };
      return { ...prev, exercises: sorted };
    });

    setExercises((prev) => ({ ...prev, [newExercise.id]: newExercise }));

    const prev = lastPerf[newExercise.id] || [];
    setInputs((prevInputsState) => {
      const next = [...prevInputsState];
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
    setSwapError(false);

    if (workoutId && routineId) {
      updateRoutineExercise(workoutId, routineId, oldExerciseId, newExercise.id).catch(() => {
        setRoutine(prevRoutine);
        setInputs(prevInputs);
        setSwapError(true);
      });
    }
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
      finalElapsedRef.current = elapsed;
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
      <WorkoutComplete
        routineName={routine.name}
        inputs={inputs}
        elapsed={finalElapsedRef.current}
        onHome={() => router.push("/")}
      />
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
          {training ? (
            <div className="flex items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 py-1.5">
              <svg className="h-3.5 w-3.5 text-[var(--amber-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span
                className="text-sm font-bold text-[var(--amber-500)]"
                style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.05em" }}
              >
                {formatElapsed(elapsed)}
              </span>
            </div>
          ) : (
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
                key={`${ex.exercise_id}-${idx}`}
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
        {swapError && (
          <div className="animate-fade-in flex items-center gap-2 rounded-xl border border-[var(--red-500)]/30 bg-[var(--red-600)]/10 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            <p className="text-xs font-medium text-[var(--red-500)]">
              Exercício trocado na sessão, mas não foi possível salvar. Verifique sua conexão.
            </p>
          </div>
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
          nextPreview={restTimer.nextPreview}
          onClose={() => setRestTimer(null)}
          audioCtx={audioCtxRef.current}
        />
      )}

      {/* Exercise Swap Modal */}
      {swapModal && (
        <ExerciseSearchModal
          currentExerciseId={swapModal.exerciseId}
          targetMuscle={swapModal.muscle}
          onSelect={(ex) => handleSwapExercise(swapModal.exIdx, ex, swapModal.exerciseId)}
          onClose={() => setSwapModal(null)}
          equipmentWhitelist={locationType === "quartel" ? QUARTEL_EQUIPMENT_WHITELIST : undefined}
        />
      )}
    </div>
  );
}

// ─── WorkoutComplete ──────────────────────────────────────────────────────────

const MOTIVATIONAL_QUOTES = [
  "CADA SÉRIE É UMA VITÓRIA",
  "VOCÊ É MAIS FORTE DO QUE PENSA",
  "MISSÃO CUMPRIDA. REPITA AMANHÃ.",
  "O CORPO CONQUISTA O QUE A MENTE ORDENA",
  "SEM SUOR, SEM GLÓRIA",
  "A DOR DE HOJE É A FORÇA DE AMANHÃ",
  "VOCÊ GANHOU O DIA",
  "DISCIPLINA BATE MOTIVAÇÃO TODOS OS DIAS",
];

function WorkoutComplete({
  routineName,
  inputs,
  elapsed,
  onHome,
}: {
  routineName: string;
  inputs: ExerciseInput[];
  elapsed: number;
  onHome: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const doneSetsArr = inputs.flatMap((inp) => inp.sets.filter((s) => s.done));
    const totalPossible = inputs.reduce((a, inp) => a + inp.sets.length, 0);
    const totalDone = doneSetsArr.length;
    const totalVolume = doneSetsArr.reduce(
      (a, s) => a + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0),
      0
    );
    const totalReps = doneSetsArr.reduce((a, s) => a + (parseInt(s.reps) || 0), 0);
    const exercisesCompleted = inputs.filter((inp) => inp.sets.some((s) => s.done)).length;
    const pct = totalPossible > 0 ? (totalDone / totalPossible) * 100 : 0;
    return { totalDone, totalPossible, totalVolume, totalReps, exercisesCompleted, pct };
  }, [inputs]);

  const quote = useMemo(
    () => MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)],
    []
  );

  const evalMessage = useMemo(() => {
    if (stats.pct === 100) return "Perfeito! Você dominou cada série hoje. 🔥";
    if (stats.pct >= 80) return "Excelente! Treino sólido e consistente.";
    if (stats.pct >= 60) return "Bom trabalho! Cada rep conta na sua evolução.";
    return "Você apareceu — e isso já é metade da batalha.";
  }, [stats.pct]);

  const volumeStr = useMemo(() => {
    if (stats.totalVolume >= 1000)
      return `${(stats.totalVolume / 1000).toFixed(1).replace(".", ",")}t`;
    if (stats.totalVolume > 0)
      return `${stats.totalVolume.toFixed(0)} kg`;
    return `${stats.totalReps} reps`;
  }, [stats]);

  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        color:
          i % 4 === 0 ? "#EF4444" :
          i % 4 === 1 ? "#F59E0B" :
          i % 4 === 2 ? "#FBBF24" : "#F5F5F7",
        left: `${(i / 28) * 100 + (i % 3) * 2}%`,
        delay: `${(i * 0.09) % 1.8}s`,
        duration: `${2.2 + (i % 5) * 0.3}s`,
        size: `${5 + (i % 4) * 2}px`,
        isRect: i % 3 !== 0,
      })),
    []
  );

  async function handleShare() {
    const volumeLabel = stats.totalVolume > 0 ? `${volumeStr} de volume` : `${stats.totalReps} reps`;
    const text = [
      `💪 Treino concluído no MiraFit!`,
      `📋 ${routineName}`,
      `⏱ ${formatElapsed(elapsed)}  •  🔥 ${stats.totalDone} séries  •  ${volumeLabel}`,
    ].join("\n");

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "MiraFit – Treino Concluído!", text });
        return;
      } catch {
        // dismissed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-between overflow-hidden bg-[var(--background)] px-5 py-10">
      {/* ── Radial glow background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-glow-breathe absolute left-1/2 top-[38%] h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--red-600)]/20 blur-[80px]"
        />
        <div
          className="animate-glow-breathe absolute left-1/2 top-[38%] h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--amber-500)]/15 blur-[40px]"
          style={{ animationDelay: "1.2s" }}
        />
      </div>

      {/* ── Confetti ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute top-0"
            style={{
              left: p.left,
              width: p.size,
              height: p.isRect ? `calc(${p.size} * 0.5)` : p.size,
              backgroundColor: p.color,
              borderRadius: p.isRect ? "1px" : "50%",
              animation: `confetti-fall ${p.duration} ${p.delay} ease-in both`,
            }}
          />
        ))}
      </div>

      {/* ── Top: Logo ── */}
      <div className="animate-fade-in z-10 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="MiraFit" className="h-8 w-8 rounded-xl" />
        <span
          className="text-2xl tracking-[0.12em] text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          MIRAFIT
        </span>
      </div>

      {/* ── Center: Trophy + Title + Quote + Stats ── */}
      <div className="z-10 flex w-full flex-col items-center gap-5 text-center">
        {/* Trophy */}
        <div className="animate-scale-in animate-trophy-pulse relative flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-[var(--amber-500)]/15 blur-lg" />
          <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-full border border-[var(--amber-500)]/25 bg-gradient-to-b from-[var(--amber-500)]/10 to-transparent">
            <span style={{ fontSize: "2.8rem", lineHeight: 1 }}>🏆</span>
          </div>
        </div>

        {/* Title */}
        <div className="animate-fade-in-up" style={{ animationDelay: "180ms" }}>
          <h1
            className="leading-none text-[var(--foreground)]"
            style={{
              fontFamily: "var(--font-bebas)",
              fontSize: "clamp(2.8rem, 12vw, 4.5rem)",
              letterSpacing: "0.04em",
            }}
          >
            TREINO<br />CONCLUÍDO!
          </h1>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--amber-500)]">
            {quote}
          </p>
          <p className="mt-1 text-xs text-[var(--text-dim)]">{routineName}</p>
        </div>

        {/* Eval message */}
        <div
          className="animate-fade-in-up w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3"
          style={{ animationDelay: "320ms" }}
        >
          <p className="text-sm text-[var(--text-muted)]">{evalMessage}</p>
        </div>

        {/* Stats 2×2 */}
        <div className="grid w-full grid-cols-2 gap-3">
          {[
            {
              icon: "🔥",
              label: "SÉRIES",
              value: `${stats.totalDone}/${stats.totalPossible}`,
              accent: "red" as const,
              delay: "400ms",
            },
            {
              icon: "⚡",
              label: stats.totalVolume > 0 ? "VOLUME" : "REPS TOTAIS",
              value: volumeStr,
              accent: "amber" as const,
              delay: "480ms",
            },
            {
              icon: "⏱",
              label: "DURAÇÃO",
              value: formatElapsed(elapsed),
              accent: "red" as const,
              delay: "560ms",
            },
            {
              icon: "💪",
              label: "EXERCÍCIOS",
              value: String(stats.exercisesCompleted),
              accent: "amber" as const,
              delay: "640ms",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="animate-stat-pop rounded-2xl border p-4"
              style={{
                animationDelay: s.delay,
                borderColor:
                  s.accent === "red"
                    ? "rgba(239,68,68,0.2)"
                    : "rgba(245,158,11,0.2)",
                background:
                  s.accent === "red"
                    ? "rgba(220,38,38,0.07)"
                    : "rgba(245,158,11,0.07)",
              }}
            >
              <p className="mb-1 text-base">{s.icon}</p>
              <p
                className="text-2xl leading-none"
                style={{
                  fontFamily: "var(--font-bebas)",
                  color:
                    s.accent === "red"
                      ? "var(--red-500)"
                      : "var(--amber-500)",
                }}
              >
                {s.value}
              </p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom: Buttons ── */}
      <div
        className="animate-fade-in-up z-10 w-full space-y-3"
        style={{ animationDelay: "750ms" }}
      >
        <button
          onClick={handleShare}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--amber-500)]/30 bg-[var(--amber-500)]/10 py-4 text-sm font-bold text-[var(--amber-500)] transition-all hover:bg-[var(--amber-500)]/15 active:scale-[0.98]"
        >
          {copied ? (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copiado!
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Compartilhar resultado
            </>
          )}
        </button>
        <button
          onClick={onHome}
          className="w-full rounded-2xl py-4 text-sm font-bold text-white shadow-lg shadow-[var(--red-600)]/20 transition-all gradient-red hover:shadow-xl active:scale-[0.98]"
        >
          Voltar ao início
        </button>
      </div>
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

  function openYouTube(query: string) {
    const encoded = encodeURIComponent(query);
    const webUrl = `https://www.youtube.com/results?search_query=${encoded}`;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isIOS) { window.open(webUrl, "_blank", "noopener,noreferrer"); return; }

    // iOS: tenta abrir no app via scheme nativo; se o app não abrir em 1.5s, abre no browser
    const appUrl = `youtube://results?search_query=${encoded}`;
    let appOpened = false;
    const onBlur = () => { appOpened = true; };
    window.addEventListener("blur", onBlur, { once: true });
    window.location.href = appUrl;
    setTimeout(() => {
      window.removeEventListener("blur", onBlur);
      if (!appOpened) window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 1500);
  }

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
            <div className="grid items-center gap-2 px-1" style={{ gridTemplateColumns: "2rem 1fr 1fr 2.5rem" }}>
              <span />
              <span className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Carga (kg)
              </span>
              <span className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Reps
              </span>
              <span />
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
                  <div className="grid items-center gap-2" style={{ gridTemplateColumns: "2rem 1fr 1fr 2.5rem" }}>
                    {/* Set badge */}
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all ${
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
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2.5 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] disabled:opacity-50"
                    />

                    {/* Reps */}
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={s.reps}
                      onChange={(e) => onSetUpdate(si, "reps", e.target.value)}
                      disabled={s.done}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2.5 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] disabled:opacity-50"
                    />

                    {/* Done toggle */}
                    <button
                      onClick={() => onSetDone(si)}
                      aria-label={s.done ? "Desmarcar série" : "Marcar série como concluída"}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                        s.done
                          ? "border-[var(--success)] bg-[var(--success)] text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                          : "border-[var(--red-500)]/60 bg-[var(--red-500)]/10 text-[var(--red-500)]"
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

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openYouTube(name + " execução"); }}
            className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-[var(--surface-2)] px-4 py-2.5 transition-colors hover:bg-[var(--surface-3)]"
          >
            <svg className="h-5 w-5 shrink-0 text-[var(--red-500)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span className="text-sm font-medium text-[var(--text-muted)]">Ver demonstração no YouTube</span>
            <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

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
