import type { Workout } from "@/types";

export function buildGeneratedProgramName(
  workoutType: string,
  createdAt: Date = new Date()
): string {
  const programDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(createdAt);

  return `Programa ${workoutType} · ${programDate}`;
}

export function getProgramDisplayName(workout: Workout): string {
  return workout.display_name?.trim() || workout.workout_type || "Programa de treino";
}
