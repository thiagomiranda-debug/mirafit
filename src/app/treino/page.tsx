"use client";

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getExercisesByIds, updateRoutineExercises } from "@/lib/workouts";
import { saveWorkoutLog, getPerfAndRecords } from "@/lib/workoutLogs";
import { LibraryExercise, Routine, ExercisePerformance, SetPerformance, LocationType, WorkoutExercise } from "@/types";
import { QUARTEL_EQUIPMENT_WHITELIST } from "@/lib/workoutGenerator";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { generatePortugueseInstructions } from "@/lib/exerciseInstructions";
import { translateExerciseName } from "@/lib/exerciseNames";
import RestTimer, { NextPreview } from "@/components/RestTimer";
import ExerciseSearchModal from "@/components/ExerciseSearchModal";
import EditModeCard from "@/components/treino/EditModeCard";
import DeleteConfirmModal from "@/components/treino/DeleteConfirmModal";
import { epley1RM } from "@/lib/metrics";
import TreinoSkeleton from "@/components/skeletons/TreinoSkeleton";
import { haptic } from "@/lib/haptics";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    <Suspense fallback={<TreinoSkeleton />}>
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
  const [workoutName, setWorkoutName] = useState("Programa de treino");

  const [editMode, setEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    exIdx: number;
    exerciseName: string;
    doneSets: number;
  } | null>(null);
  const [editError, setEditError] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToExerciseCard = useCallback((idx: number) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-exercise-idx="${idx}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
      setWorkoutName(
        (workoutSnap.data().display_name as string | undefined) ||
          (workoutSnap.data().workout_type as string | undefined) ||
          "Programa de treino"
      );
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
          const prev = lastPerfMap[ex.exercise_id] ?? [];
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
      setError("Não consegui carregar essa rotina.");
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

  const persistExercises = useCallback(
    (exercises: WorkoutExercise[], immediate = false) => {
      if (!workoutId || !routineId) return;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      const doIt = () => {
        updateRoutineExercises(workoutId, routineId, exercises).catch(() => {
          setEditError(true);
          loadRoutine().catch(() => {});
        });
      };
      if (immediate) doIt();
      else persistTimerRef.current = setTimeout(doIt, 500);
    },
    [workoutId, routineId, loadRoutine]
  );

  function applyDelete(exIdx: number) {
    if (!routine) return;
    const sortedEx = [...routine.exercises].sort((a, b) => a.order - b.order);
    const nextExercises = sortedEx
      .filter((_, i) => i !== exIdx)
      .map((ex, i) => ({ ...ex, order: i }));

    setRoutine({ ...routine, exercises: nextExercises });
    setInputs((prev) => prev.filter((_, i) => i !== exIdx));
    persistExercises(nextExercises, true);
    haptic("medium");
  }

  function applyReorder(fromIdx: number, toIdx: number) {
    if (!routine || fromIdx === toIdx) return;
    const sortedEx = [...routine.exercises].sort((a, b) => a.order - b.order);
    const movedEx = arrayMove(sortedEx, fromIdx, toIdx).map((ex, i) => ({
      ...ex,
      order: i,
    }));
    setRoutine({ ...routine, exercises: movedEx });
    setInputs((prev) => arrayMove(prev, fromIdx, toIdx));
    persistExercises(movedEx, false);
    haptic("light");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sortedEx = routine
      ? [...routine.exercises].sort((a, b) => a.order - b.order)
      : [];
    const fromIdx = sortedEx.findIndex((ex, i) => `${ex.exercise_id}-${i}` === active.id);
    const toIdx = sortedEx.findIndex((ex, i) => `${ex.exercise_id}-${i}` === over.id);
    if (fromIdx !== -1 && toIdx !== -1) {
      applyReorder(fromIdx, toIdx);
    }
  }

  function applyAdd(newEx: LibraryExercise, newSets: number, newReps: string) {
    if (!routine) return;
    const sortedEx = [...routine.exercises].sort((a, b) => a.order - b.order);
    const nextExercises: WorkoutExercise[] = [
      ...sortedEx,
      {
        exercise_id: newEx.id,
        sets: newSets,
        reps: newReps,
        order: sortedEx.length,
      },
    ];

    const prev = lastPerf[newEx.id] ?? [];
    const newInput: ExerciseInput = {
      exercise_id: newEx.id,
      sets: Array.from({ length: newSets }, (_, i) => ({
        weight: prev[i]?.weight?.toString() || prev[0]?.weight?.toString() || "",
        reps: prev[i]?.reps?.toString() || prev[0]?.reps?.toString() || "",
        done: false,
      })),
    };

    setRoutine({ ...routine, exercises: nextExercises });
    setInputs((prevInputs) => [...prevInputs, newInput]);
    setExercises((prevEx) => ({ ...prevEx, [newEx.id]: newEx }));
    persistExercises(nextExercises, true);
    haptic("medium");
  }

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
      if (exIdx < 0 || exIdx >= prev.length) return prev;
      if (setIdx < 0 || setIdx >= prev[exIdx].sets.length) return prev;
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
    if (exIdx < 0 || exIdx >= inputs.length) return;
    if (setIdx < 0 || setIdx >= inputs[exIdx].sets.length) return;
    const wasDone = inputs[exIdx].sets[setIdx].done;
    setInputs((prev) => {
      if (exIdx >= prev.length || setIdx >= prev[exIdx].sets.length) return prev;
      const next = [...prev];
      const sets = [...next[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], done: !sets[setIdx].done };
      next[exIdx] = { ...next[exIdx], sets };
      return next;
    });
    if (!wasDone) {
      unlockAudio();
      haptic("medium");
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
          setOpenMap((prev) => ({ ...prev, [exIdx]: false, [exIdx + 1]: true }));
          scrollToExerciseCard(exIdx + 1);
        } else {
          setOpenMap((prev) => ({ ...prev, [exIdx]: false }));
        }
      }

      setRestTimer({ exerciseName: name, nextPreview });
    }
  }

  function handleSwapExercise(exIdx: number, newExercise: LibraryExercise) {
    if (!routine) return;
    const prevRoutine = routine;
    const prevInputs = inputs;

    // Troca por posição (exIdx), nunca por exercise_id: a rotina pode conter o
    // mesmo exercício mais de uma vez e uma troca por id afetaria todas as cópias.
    const sorted = [...routine.exercises].sort((a, b) => a.order - b.order);
    const nextExercises = sorted.map((ex, i) =>
      i === exIdx ? { ...ex, exercise_id: newExercise.id } : ex
    );
    setRoutine({ ...routine, exercises: nextExercises });

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
      updateRoutineExercises(workoutId, routineId, nextExercises).catch(() => {
        setRoutine(prevRoutine);
        setInputs(prevInputs);
        setSwapError(true);
      });
    }
  }

  async function handleFinish() {
    if (!user || !routine || !workoutId || !routineId) return;
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
      await saveWorkoutLog({
        userId: user.uid,
        workoutId,
        routineId,
        workoutName,
        routineName: routine.name,
        performance: perf,
        notes,
        locationType,
      });
      finalElapsedRef.current = elapsed;
      setSaved(true);
    } catch {
      setError("Não consegui salvar. Verifica sua conexão.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return <TreinoSkeleton />;
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
      <header
        className="relative px-4 py-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(220,38,38,0.06), rgba(19,19,22,0.95))",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="tactile flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-[var(--foreground)]">
                {editMode ? "Editando exercícios" : routine.name}
              </h1>
              <p className="text-xs text-[var(--text-dim)]">
                {routine.exercises.length} exercícios
                {training && totalSets > 0 && !editMode && (
                  <span
                    className="ml-2 text-[var(--amber-500)]"
                    style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.05em", fontSize: "0.8rem" }}
                  >
                    {doneSets}/{totalSets} SETS
                  </span>
                )}
              </p>
            </div>
          </div>
          {editMode ? (
            <button
              onClick={() => {
                haptic("light");
                setEditMode(false);
              }}
              className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #22C55E, #16A34A)",
                boxShadow: "var(--glow-success)",
              }}
            >
              Concluído
            </button>
          ) : training ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  haptic("light");
                  setEditMode(true);
                }}
                aria-label="Editar exercícios"
                className="tactile flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <div
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))",
                  border: "1px solid rgba(245,158,11,0.25)",
                  boxShadow: "0 0 12px rgba(245,158,11,0.15)",
                }}
              >
                <span
                  className="block h-1.5 w-1.5 rounded-full bg-[var(--amber-500)]"
                  style={{
                    boxShadow: "0 0 6px var(--amber-500)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <span
                  className="text-sm font-bold text-[var(--amber-400)]"
                  style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.05em" }}
                >
                  {formatElapsed(elapsed)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  haptic("light");
                  setEditMode(true);
                }}
                aria-label="Editar exercícios"
                className="tactile flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  haptic("medium");
                  setTraining(true);
                }}
                disabled={routine.exercises.length === 0}
                className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white gradient-red transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: "var(--shadow-red)" }}
              >
                Treinar
              </button>
            </div>
          )}
        </div>

        {/* Progress bar com glow */}
        {training && totalSets > 0 && !editMode && (
          <div className="mt-3 relative">
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <div
                className="relative h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, var(--red-500), var(--amber-500))",
                  boxShadow: "0 0 8px rgba(239,68,68,0.4)",
                }}
              >
                {progressPct > 0 && progressPct < 100 && (
                  <div
                    className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                    style={{
                      background: "var(--amber-400)",
                      boxShadow: "0 0 12px var(--amber-400)",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Exercises */}
      <main className="flex flex-1 flex-col gap-3 px-4 py-4 pb-28">
        {editMode ? (
          <>
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  Rotina vazia
                </p>
                <p className="mt-1 text-xs text-[var(--text-dim)]">
                  Adicione exercícios pra começar
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sorted.map((ex, i) => `${ex.exercise_id}-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {sorted.map((ex, idx) => {
                      const lib = exercises[ex.exercise_id];
                      const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
                      return (
                        <SortableEditCard
                          key={`${ex.exercise_id}-${idx}`}
                          id={`${ex.exercise_id}-${idx}`}
                          index={idx}
                          name={name}
                          sets={ex.sets}
                          reps={ex.reps}
                          onDelete={() => {
                            const doneSetsCount = (inputs[idx]?.sets ?? []).filter((s) => s.done).length;
                            if (doneSetsCount > 0) {
                              setDeleteConfirm({ exIdx: idx, exerciseName: name, doneSets: doneSetsCount });
                            } else {
                              applyDelete(idx);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <button
              onClick={() => {
                haptic("light");
                setAddModal(true);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all hover:bg-[var(--red-600)]/8"
              style={{
                border: "1.5px dashed var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Adicionar exercício
            </button>
          </>
        ) : (
          <div className="stagger space-y-3">
            {sorted.map((ex, idx) => {
              const lib = exercises[ex.exercise_id];
              const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
              const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };
              // Active = first exercise with at least one pending set
              const firstActiveIdx = sorted.findIndex((_, i) => {
                const inp = inputs[i];
                if (!inp) return false;
                return inp.sets.some((s) => !s.done);
              });
              const allSetsDoneInThis = exInput.sets.length > 0 && exInput.sets.every((s) => s.done);
              const isActive = training && idx === firstActiveIdx && !allSetsDoneInThis;
              return (
                <div key={`${ex.exercise_id}-${idx}`} data-exercise-idx={idx}>
                  <ExerciseCard
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
                    isActive={isActive}
                    open={openMap[idx] ?? false}
                    onToggleOpen={() =>
                      setOpenMap((prev) => ({ ...prev, [idx]: !(prev[idx] ?? false) }))
                    }
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
                </div>
              );
            })}
          </div>
        )}

        {/* Notas do treino */}
        {training && !editMode && (
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
        {editError && (
          <div className="animate-fade-in flex items-center gap-2 rounded-xl border border-[var(--red-500)]/30 bg-[var(--red-600)]/10 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            <p className="text-xs font-medium text-[var(--red-500)]">
              Não foi possível salvar a mudança. Verifique sua conexão.
            </p>
            <button
              onClick={() => setEditError(false)}
              className="ml-auto text-xs font-bold text-[var(--red-500)] underline"
            >
              Ok
            </button>
          </div>
        )}
      </main>

      {/* Finish button */}
      {training && !editMode && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => {
              haptic("success");
              handleFinish();
            }}
            disabled={saving || doneSets === 0}
            className="tactile shimmer-overlay flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white transition-all disabled:opacity-50 gradient-red"
            style={{ boxShadow: "var(--shadow-red)" }}
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </>
            ) : (
              `Finalizar Treino${doneSets > 0 ? ` (${doneSets}/${totalSets})` : ""}`
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
          onSelect={(ex) => handleSwapExercise(swapModal.exIdx, ex)}
          onClose={() => setSwapModal(null)}
          equipmentWhitelist={locationType === "quartel" ? QUARTEL_EQUIPMENT_WHITELIST : undefined}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          exerciseName={deleteConfirm.exerciseName}
          doneSets={deleteConfirm.doneSets}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            applyDelete(deleteConfirm.exIdx);
            setDeleteConfirm(null);
          }}
        />
      )}

      {/* Add Exercise Modal */}
      {addModal && (
        <ExerciseSearchModal
          mode="builder"
          onSelectWithDetails={(ex, sets, reps) => {
            applyAdd(ex, sets, reps);
            setAddModal(false);
          }}
          onClose={() => setAddModal(false)}
          equipmentWhitelist={locationType === "quartel" ? QUARTEL_EQUIPMENT_WHITELIST : undefined}
        />
      )}
    </div>
  );
}

// ─── Share card canvas helper ─────────────────────────────────────────────────

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
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

function SortableEditCard({
  id,
  index,
  name,
  sets,
  reps,
  onDelete,
}: {
  id: string;
  index: number;
  name: string;
  sets: number;
  reps: string;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <EditModeCard
      index={index}
      name={name}
      sets={sets}
      reps={reps}
      onDelete={onDelete}
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      style={style}
      setNodeRef={setNodeRef}
    />
  );
}

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

  const [quote] = useState(
    () => MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
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

  async function generateShareCard(): Promise<Blob | null> {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);

      const W = 1080;
      const H = 1920;
      const M = 80; // margin
      const CW = W - M * 2; // content width

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Carrega o ícone do app pro logo (icone + texto), best-effort
      let logoImg: HTMLImageElement | null = null;
      try {
        logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = "/icons/icon-192.png";
        });
      } catch {
        logoImg = null;
      }

      // ── Background ──
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0c0b0b");
      bg.addColorStop(0.5, "#100d0d");
      bg.addColorStop(1, "#0c0b0b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Red glow
      const glowY = H * 0.37;
      const redGlow = ctx.createRadialGradient(W / 2, glowY, 0, W / 2, glowY, 520);
      redGlow.addColorStop(0, "rgba(220,38,38,0.22)");
      redGlow.addColorStop(0.55, "rgba(220,38,38,0.09)");
      redGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = redGlow;
      ctx.fillRect(0, 0, W, H);

      // Amber inner glow
      const amberGlow = ctx.createRadialGradient(W / 2, glowY, 0, W / 2, glowY, 270);
      amberGlow.addColorStop(0, "rgba(245,158,11,0.15)");
      amberGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = amberGlow;
      ctx.fillRect(0, 0, W, H);

      // Subtle dot grid
      ctx.fillStyle = "rgba(255,255,255,0.013)";
      for (let row = 0; row < H; row += 60) {
        for (let col = 0; col < W; col += 60) {
          ctx.fillRect(col, row, 1.5, 1.5);
        }
      }

      // ── Logo / Brand (icone + texto, igual a tela) ──
      const ICON_SIZE = 88;
      const ICON_GAP = 22;
      const LOGO_CENTER_Y = 158;

      ctx.font = `bold 62px "Bebas Neue", sans-serif`;
      ctx.letterSpacing = "14px";
      const textW = ctx.measureText("MIRAFIT").width;

      const hasIcon = !!logoImg;
      const totalW = hasIcon ? ICON_SIZE + ICON_GAP + textW : textW;
      const startX = (W - totalW) / 2;

      if (hasIcon && logoImg) {
        const iconX = startX;
        const iconY = LOGO_CENTER_Y - ICON_SIZE / 2;
        ctx.save();
        rrect(ctx, iconX, iconY, ICON_SIZE, ICON_SIZE, 20);
        ctx.clip();
        ctx.drawImage(logoImg, iconX, iconY, ICON_SIZE, ICON_SIZE);
        ctx.restore();
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f5f5f7";
      ctx.fillText(
        "MIRAFIT",
        hasIcon ? startX + ICON_SIZE + ICON_GAP : startX,
        LOGO_CENTER_Y
      );
      ctx.letterSpacing = "0px";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";

      // Thin separator
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M + 60, 218);
      ctx.lineTo(W - M - 60, 218);
      ctx.stroke();

      // ── Trophy emoji ──
      ctx.font = "190px serif";
      ctx.fillText("🏆", W / 2, 456);

      // ── Title ──
      ctx.letterSpacing = "6px";
      ctx.font = `bold 174px "Bebas Neue", sans-serif`;
      ctx.fillStyle = "#f5f5f7";
      ctx.fillText("TREINO", W / 2, 638);
      ctx.fillText("CONCLUÍDO!", W / 2, 806);
      ctx.letterSpacing = "0px";

      // ── Quote ──
      ctx.letterSpacing = "3px";
      ctx.font = `bold 37px "Outfit", sans-serif`;
      ctx.fillStyle = "#f59e0b";
      let q = quote.toUpperCase();
      while (ctx.measureText(q).width > CW - 20 && q.length > 8) q = q.slice(0, -1);
      ctx.fillText(q, W / 2, 898);
      ctx.letterSpacing = "0px";

      // ── Routine name ──
      ctx.font = `33px "Outfit", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.33)";
      let rn = routineName;
      while (ctx.measureText(rn).width > CW && rn.length > 5) rn = rn.slice(0, -1) + "…";
      ctx.fillText(rn, W / 2, 960);

      // ── Eval message card ──
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      rrect(ctx, M, 1000, CW, 130, 28);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1.5;
      rrect(ctx, M, 1000, CW, 130, 28);
      ctx.stroke();

      ctx.font = `34px "Outfit", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.fillText(evalMessage, W / 2, 1074);

      // ── Stats 2×2 grid ──
      const cardW = (CW - 36) / 2;
      const cardH = 216;
      const gY = 1168;

      const statsItems = [
        { icon: "🔥", label: "SÉRIES",     value: `${stats.totalDone}/${stats.totalPossible}`, red: true  },
        { icon: "⚡", label: stats.totalVolume > 0 ? "VOLUME" : "REPS TOTAIS", value: volumeStr, red: false },
        { icon: "⏱", label: "DURAÇÃO",    value: formatElapsed(elapsed),          red: true  },
        { icon: "💪", label: "EXERCÍCIOS", value: String(stats.exercisesCompleted), red: false },
      ];

      statsItems.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = M + col * (cardW + 36);
        const cy = gY + row * (cardH + 28);
        const accent = s.red ? "#ef4444" : "#f59e0b";

        ctx.fillStyle = s.red ? "rgba(220,38,38,0.09)" : "rgba(245,158,11,0.09)";
        rrect(ctx, cx, cy, cardW, cardH, 28);
        ctx.fill();

        ctx.strokeStyle = s.red ? "rgba(239,68,68,0.28)" : "rgba(245,158,11,0.28)";
        ctx.lineWidth = 1.5;
        rrect(ctx, cx, cy, cardW, cardH, 28);
        ctx.stroke();

        const mid = cx + cardW / 2;
        ctx.textAlign = "center";

        ctx.font = "58px serif";
        ctx.fillText(s.icon, mid, cy + 74);

        ctx.font = `bold 94px "Bebas Neue", sans-serif`;
        ctx.fillStyle = accent;
        ctx.fillText(s.value, mid, cy + 164);

        ctx.letterSpacing = "2px";
        ctx.font = `bold 27px "Outfit", sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.33)";
        ctx.fillText(s.label, mid, cy + 205);
        ctx.letterSpacing = "0px";
      });

      // ── Footer ──
      const dateStr = new Date().toLocaleDateString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
      });
      ctx.font = `30px "Outfit", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillText(dateStr, W / 2, 1840);

      ctx.font = `bold 38px "Outfit", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillText("mirafit.app", W / 2, 1890);

      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
    } catch (err) {
      console.error("generateShareCard:", err);
      return null;
    }
  }

  async function handleShare() {
    const blob = await generateShareCard();

    if (blob) {
      const file = new File([blob], "mirafit-treino.png", { type: "image/png" });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: "MiraFit – Treino Concluído!" });
          return;
        } catch {
          // dismissed — fall through to download
        }
      }

      // Fallback: download the image
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mirafit-treino.png";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Canvas failed — text fallback
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
      } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* unavailable */ }
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
  isActive = false,
  open,
  onToggleOpen,
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
  isActive?: boolean;
  open: boolean;
  onToggleOpen: () => void;
  setInputs: SetInput[];
  lastSets: SetPerformance[];
  personalRecord: number;
  onSetUpdate: (setIdx: number, field: "weight" | "reps", value: string) => void;
  onSetDone: (setIdx: number) => void;
  onSwap?: () => void;
}) {
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

  return (
    <div
      className="animate-fade-in relative overflow-hidden rounded-2xl"
      style={{
        background: isActive ? "var(--surface-gradient-active)" : "var(--surface-gradient)",
        border: `1px solid ${isActive ? "var(--border-active)" : "var(--border-subtle)"}`,
        boxShadow: isActive ? "0 0 20px rgba(239,68,68,0.10)" : "none",
        transition: "all 200ms ease-out",
      }}
    >
      {isActive && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px]"
          style={{
            background: "linear-gradient(180deg, var(--red-500), transparent)",
          }}
        />
      )}
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggleOpen(); }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          style={{
            fontFamily: "var(--font-bebas)",
            fontSize: "1.25rem",
            lineHeight: 1,
            color: isActive ? "var(--red-500)" : "var(--text-dim)",
            letterSpacing: "0.04em",
            minWidth: "28px",
          }}
        >
          {String(index + 1).padStart(2, "0")}
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

            {setInputs.map((s, sIdx) => {
              const w = parseFloat(s.weight);
              const r = parseInt(s.reps);
              const current1RM =
                w > 0 && r > 0 ? epley1RM(w, r) : 0;
              const isNewPR =
                current1RM > personalRecord && current1RM > 0 && !s.done;

              // Estado: done | active (próximo a ser feito) | pending
              const isDone = s.done;
              const firstPendingIdx = setInputs.findIndex((x) => !x.done);
              const isSetActive = training && !isDone && sIdx === firstPendingIdx;

              return (
                <div key={sIdx}>
                  <div
                    className="grid items-center gap-2 rounded-lg px-2 py-1.5 transition-all"
                    style={{
                      gridTemplateColumns: "20px 1fr 1fr 44px",
                      background: isDone
                        ? "rgba(34,197,94,0.06)"
                        : isSetActive
                        ? "rgba(239,68,68,0.06)"
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${
                        isDone
                          ? "rgba(34,197,94,0.2)"
                          : isSetActive
                          ? "rgba(239,68,68,0.4)"
                          : "rgba(255,255,255,0.04)"
                      }`,
                      boxShadow: isSetActive ? "0 0 0 1px rgba(239,68,68,0.2)" : "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-bebas)",
                        fontSize: "0.95rem",
                        textAlign: "center",
                        color: isDone
                          ? "var(--success)"
                          : isSetActive
                          ? "var(--red-500)"
                          : "var(--text-muted)",
                        fontWeight: 700,
                      }}
                    >
                      {sIdx + 1}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="kg"
                      value={s.weight}
                      onChange={(e) => onSetUpdate(sIdx, "weight", e.target.value)}
                      disabled={!training}
                      className="rounded-lg bg-transparent px-2 py-1.5 text-center text-[var(--foreground)] placeholder-[var(--text-dim)] focus:outline-none disabled:opacity-60"
                      style={{
                        fontFamily: "var(--font-bebas)",
                        fontSize: "0.95rem",
                        letterSpacing: "0.04em",
                        border: `1px solid ${
                          s.weight ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"
                        }`,
                        background: s.weight ? "rgba(255,255,255,0.03)" : "transparent",
                      }}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="reps"
                      value={s.reps}
                      onChange={(e) => onSetUpdate(sIdx, "reps", e.target.value)}
                      disabled={!training}
                      className="rounded-lg bg-transparent px-2 py-1.5 text-center text-[var(--foreground)] placeholder-[var(--text-dim)] focus:outline-none disabled:opacity-60"
                      style={{
                        fontFamily: "var(--font-bebas)",
                        fontSize: "0.95rem",
                        letterSpacing: "0.04em",
                        border: `1px solid ${
                          s.reps ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"
                        }`,
                        background: s.reps ? "rgba(255,255,255,0.03)" : "transparent",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => training && onSetDone(sIdx)}
                      disabled={!training}
                      aria-label={isDone ? "Desmarcar série" : "Marcar série como concluída"}
                      className="tactile flex h-11 w-11 items-center justify-center rounded-lg transition-all disabled:opacity-50"
                      style={
                        isDone
                          ? {
                              background: "linear-gradient(135deg, #22C55E, #16A34A)",
                              border: "1.5px solid #22C55E",
                              boxShadow: "var(--glow-success)",
                            }
                          : isSetActive
                          ? {
                              background: "rgba(239,68,68,0.12)",
                              border: "1.5px solid rgba(239,68,68,0.6)",
                            }
                          : {
                              background: "rgba(239,68,68,0.06)",
                              border: "1.5px solid rgba(239,68,68,0.3)",
                            }
                      }
                    >
                      <svg
                        className={`h-5 w-5 ${isDone ? "text-white animate-scale-in" : "text-[var(--red-500)]"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                        style={isDone ? undefined : { opacity: 0.6 }}
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
