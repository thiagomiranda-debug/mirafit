"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LibraryExercise, LocationType } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";
import ExerciseSearchModal from "@/components/ExerciseSearchModal";

type BuilderExercise = {
  exercise_id: string;
  name: string;
  sets: number;
  reps: string;
};

type BuilderRoutine = {
  name: string;
  exercises: BuilderExercise[];
};

const LABELS = ["A", "B", "C", "D", "E", "F"];
const MAX_ROUTINES = 6;

function BuilderContent() {
  const { user } = useAuth();
  const router = useRouter();

  const [planName, setPlanName] = useState("Ficha do Personal");
  const [locationType, setLocationType] = useState<LocationType>("gym");
  const [routines, setRoutines] = useState<BuilderRoutine[]>([
    { name: "Treino A", exercises: [] },
  ]);
  const [activeTab, setActiveTab] = useState(0);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalExercises = routines.reduce((sum, r) => sum + r.exercises.length, 0);
  const canSave = totalExercises > 0 && routines.every((r) => r.exercises.length > 0);

  const addRoutine = () => {
    if (routines.length >= MAX_ROUTINES) return;
    const label = LABELS[routines.length] || `${routines.length + 1}`;
    setRoutines((prev) => [...prev, { name: `Treino ${label}`, exercises: [] }]);
    setActiveTab(routines.length);
  };

  const removeRoutine = (idx: number) => {
    if (routines.length <= 1) return;
    setRoutines((prev) => prev.filter((_, i) => i !== idx));
    setActiveTab((prev) => Math.min(prev, routines.length - 2));
  };

  const handleAddExercise = (exercise: LibraryExercise, sets: number, reps: string) => {
    setRoutines((prev) =>
      prev.map((r, i) =>
        i === activeTab
          ? {
              ...r,
              exercises: [
                ...r.exercises,
                { exercise_id: exercise.id, name: exercise.name, sets, reps },
              ],
            }
          : r
      )
    );
  };

  const removeExercise = (exIdx: number) => {
    setRoutines((prev) =>
      prev.map((r, i) =>
        i === activeTab
          ? { ...r, exercises: r.exercises.filter((_, j) => j !== exIdx) }
          : r
      )
    );
  };

  const moveExercise = (exIdx: number, direction: -1 | 1) => {
    const target = exIdx + direction;
    const current = routines[activeTab].exercises;
    if (target < 0 || target >= current.length) return;
    setRoutines((prev) =>
      prev.map((r, i) => {
        if (i !== activeTab) return r;
        const updated = [...r.exercises];
        [updated[exIdx], updated[target]] = [updated[target], updated[exIdx]];
        return { ...r, exercises: updated };
      })
    );
  };

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const payload = {
        locationType,
        planName: planName.trim() || "Treino Manual",
        routines: routines.map((r) => ({
          name: r.name,
          exercises: r.exercises.map((ex, idx) => ({
            exercise_id: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            order: idx,
          })),
        })),
      };

      const res = await fetch("/api/save-manual-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar treino");

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar treino");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-[var(--foreground)]">Montar Treino</h1>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 pb-28 pt-5">
        {/* Plan name */}
        <div className="animate-fade-in">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
            Nome do plano
          </label>
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            maxLength={50}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
          />
        </div>

        {/* Location toggle */}
        <div className="animate-fade-in">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
            Local
          </label>
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
            <button
              onClick={() => setLocationType("gym")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                locationType === "gym"
                  ? "bg-[var(--red-600)] text-white shadow-md"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span>🏋️</span> Academia
            </button>
            <button
              onClick={() => setLocationType("quartel")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                locationType === "quartel"
                  ? "bg-[var(--amber-600)] text-white shadow-md"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span>🎖️</span> Quartel
            </button>
          </div>
        </div>

        {/* Routine tabs */}
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {routines.map((r, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`group relative shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                  activeTab === idx
                    ? "bg-[var(--red-600)] text-white shadow-md"
                    : "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--red-500)]/30"
                }`}
              >
                {r.name}
                {routines.length > 1 && activeTab === idx && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRoutine(idx);
                    }}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-dim)] shadow-md transition-colors hover:text-[var(--red-500)]"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
            {routines.length < MAX_ROUTINES && (
              <button
                onClick={addRoutine}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-[var(--border-light)] px-3 py-2.5 text-xs font-semibold text-[var(--text-dim)] transition-all hover:border-[var(--red-500)]/30 hover:text-[var(--foreground)]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
                Divisão
              </button>
            )}
          </div>
        </div>

        {/* Exercise list for active routine */}
        <div className="space-y-2.5">
          {routines[activeTab]?.exercises.length === 0 ? (
            <div className="animate-fade-in rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--text-muted)]">Nenhum exercício ainda</p>
              <p className="mt-1 text-xs text-[var(--text-dim)]">
                Adicione exercícios do catálogo
              </p>
            </div>
          ) : (
            <div className="stagger space-y-2">
              {routines[activeTab].exercises.map((ex, exIdx) => (
                <div
                  key={`${ex.exercise_id}-${exIdx}`}
                  className="animate-fade-in flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 transition-all"
                >
                  {/* Order badge */}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--red-600)]/15 text-xs font-bold text-[var(--red-500)]">
                    {exIdx + 1}
                  </span>

                  {/* Exercise info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                      {translateExerciseName(ex.name)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-dim)]">
                      {ex.sets} séries × {ex.reps} reps
                    </p>
                  </div>

                  {/* Move buttons */}
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      onClick={() => moveExercise(exIdx, -1)}
                      disabled={exIdx === 0}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)] disabled:opacity-25"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveExercise(exIdx, 1)}
                      disabled={exIdx === routines[activeTab].exercises.length - 1}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)] disabled:opacity-25"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-dim)] transition-colors hover:bg-[var(--red-600)]/10 hover:text-[var(--red-500)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add exercise button */}
          <button
            onClick={() => setShowExerciseModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-light)] py-3.5 text-sm font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--red-500)]/30 hover:text-[var(--foreground)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
            </svg>
            Adicionar Exercício
          </button>
        </div>

        {error && (
          <p className="text-center text-sm font-medium text-[var(--red-500)]">{error}</p>
        )}
      </main>

      {/* Fixed footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto max-w-md px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 gradient-red"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Salvar Treino ({totalExercises} exercício{totalExercises !== 1 ? "s" : ""})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Exercise search modal */}
      {showExerciseModal && (
        <ExerciseSearchModal
          mode="builder"
          onSelectWithDetails={handleAddExercise}
          onClose={() => setShowExerciseModal(false)}
        />
      )}
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
        </div>
      }
    >
      <BuilderContent />
    </Suspense>
  );
}
