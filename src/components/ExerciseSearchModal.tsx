"use client";

import { useEffect, useState } from "react";
import { getExercisesByMuscle, getDistinctMuscleGroups } from "@/lib/workouts";
import { LibraryExercise } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";

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

function translateMuscleName(name: string): string {
  return MUSCLE_NAME_PT[name.toLowerCase()] || name;
}

interface ExerciseSearchModalProps {
  currentExerciseId?: string;
  targetMuscle?: string;
  onSelect?: (exercise: LibraryExercise) => void;
  mode?: "swap" | "builder";
  onSelectWithDetails?: (exercise: LibraryExercise, sets: number, reps: string) => void;
  onClose: () => void;
  equipmentWhitelist?: string[];
}

export default function ExerciseSearchModal({
  currentExerciseId = "",
  targetMuscle,
  onSelect,
  mode = "swap",
  onSelectWithDetails,
  onClose,
  equipmentWhitelist,
}: ExerciseSearchModalProps) {
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const initialMuscle = mode === "builder" ? "" : targetMuscle || "";
  const [loading, setLoading] = useState(initialMuscle.length > 0);
  const [search, setSearch] = useState("");

  // Builder mode state
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState<string>(targetMuscle || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailSets, setDetailSets] = useState(3);
  const [detailReps, setDetailReps] = useState("10-12");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const activeMuscle = mode === "builder" ? selectedMuscle : targetMuscle || "";

  const fetchExercises = (muscle: string) => {
    setLoading(true);
    setExercises([]);
    getExercisesByMuscle(muscle, 50)
      .then((list) => {
        let results = currentExerciseId
          ? list.filter((e) => e.id !== currentExerciseId)
          : list;
        if (equipmentWhitelist) {
          results = results.filter((e) =>
            equipmentWhitelist.includes((e.equipment || "").toLowerCase())
          );
        }
        setExercises(results);
      })
      .finally(() => setLoading(false));
  };

  // Swap mode: fetch on mount; Builder mode: fetch muscle groups
  useEffect(() => {
    if (mode === "swap" && activeMuscle) {
      fetchExercises(activeMuscle);
    }
    if (mode === "builder") {
      getDistinctMuscleGroups().then(setMuscleGroups);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = search.trim()
    ? exercises.filter((e) =>
        e.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : exercises;

  const handleSwapSelect = (ex: LibraryExercise) => {
    onSelect?.(ex);
    onClose();
  };

  const handleBuilderExpand = (ex: LibraryExercise) => {
    if (expandedId === ex.id) {
      setExpandedId(null);
    } else {
      setExpandedId(ex.id);
      setDetailSets(3);
      setDetailReps("10-12");
    }
  };

  const handleBuilderConfirm = (ex: LibraryExercise) => {
    onSelectWithDetails?.(ex, detailSets, detailReps);
    setAddedIds((prev) => new Set(prev).add(ex.id));
    setExpandedId(null);
    // Reset for next selection
    setDetailSets(3);
    setDetailReps("10-12");
    // Brief visual feedback — clear after 2s
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(ex.id);
        return next;
      });
    }, 2000);
  };

  const handleMuscleSelect = (muscle: string) => {
    setSelectedMuscle(muscle);
    setExpandedId(null);
    setSearch("");
    fetchExercises(muscle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="animate-slide-up relative flex w-full max-w-md flex-col rounded-t-3xl bg-[var(--surface)]"
        style={{ maxHeight: "85vh" }}
      >
        {/* Handle */}
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-4">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-[var(--border-light)]" />
        </div>

        <div className="shrink-0 px-4 pb-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--foreground)]">
              {mode === "builder" ? "Adicionar Exercício" : "Trocar exercício"}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Muscle chips (builder mode) */}
          {mode === "builder" && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {muscleGroups.map((muscle) => (
                <button
                  key={muscle}
                  onClick={() => handleMuscleSelect(muscle)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    selectedMuscle === muscle
                      ? "bg-[var(--red-600)] text-white shadow-md"
                      : "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--red-500)]/30"
                  }`}
                >
                  {translateMuscleName(muscle)}
                </button>
              ))}
            </div>
          )}

          {/* Swap mode subtitle */}
          {mode === "swap" && targetMuscle && (
            <p className="mb-3 text-xs text-[var(--text-dim)]">
              Exercícios para:{" "}
              <span className="font-bold text-[var(--red-500)]">{targetMuscle}</span>
            </p>
          )}

          {/* Search input */}
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar exercício..."
              autoFocus={mode === "swap"}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 pl-10 pr-3 text-sm text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {mode === "builder" && !selectedMuscle ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--text-muted)]">Selecione um grupo muscular</p>
              <p className="mt-1 text-xs text-[var(--text-dim)]">Escolha acima para ver os exercícios</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-dim)]">
              Nenhum exercício encontrado.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((ex) => (
                <div key={ex.id}>
                  <button
                    onClick={() =>
                      mode === "builder" ? handleBuilderExpand(ex) : handleSwapSelect(ex)
                    }
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
                      addedIds.has(ex.id)
                        ? "border-[var(--success)]/40 bg-[var(--success)]/10"
                        : expandedId === ex.id
                        ? "border-[var(--red-500)]/40 bg-[var(--red-600)]/10"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--red-500)]/30 hover:bg-[var(--red-600)]/8"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                        {translateExerciseName(ex.name)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-dim)]">
                        {ex.category || ex.equipment || "—"}
                      </p>
                    </div>
                    {addedIds.has(ex.id) ? (
                      <svg className="h-5 w-5 shrink-0 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : mode === "builder" ? (
                      <svg
                        className={`h-4 w-4 shrink-0 text-[var(--text-dim)] transition-transform ${expandedId === ex.id ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 shrink-0 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>

                  {/* Inline detail expansion (builder mode only) */}
                  {mode === "builder" && expandedId === ex.id && (
                    <div className="animate-fade-in mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-3.5 py-3">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                            Séries
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={detailSets}
                            onChange={(e) => setDetailSets(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center text-sm font-bold text-[var(--foreground)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                            Reps
                          </label>
                          <input
                            type="text"
                            value={detailReps}
                            onChange={(e) => setDetailReps(e.target.value)}
                            placeholder="ex: 10-12"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
                          />
                        </div>
                        <button
                          onClick={() => handleBuilderConfirm(ex)}
                          disabled={!detailReps.trim()}
                          className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-white shadow transition-all hover:shadow-md disabled:opacity-50 gradient-red"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
