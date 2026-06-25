import type { Routine, Workout, WorkoutLog } from "@/types";
import { getLogsForWorkout, type ProgramProgressData } from "@/lib/streaks";

const MS_PER_DAY = 86_400_000;

export function getProgramAgeDays(workout: Workout, now: Date = new Date()): number {
  const createdAt = workout.created_at instanceof Date
    ? workout.created_at
    : new Date(workout.created_at);
  if (Number.isNaN(createdAt.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY) + 1);
}

export function getProgramWeekNumber(workout: Workout, now: Date = new Date()): number {
  return Math.max(1, Math.ceil(getProgramAgeDays(workout, now) / 7));
}

export function getTrainingDaysRemaining(progress: ProgramProgressData | null, weeklyTarget: number): number {
  if (!progress) return Math.max(0, weeklyTarget);
  return Math.max(0, weeklyTarget - progress.thisWeekWorkouts);
}

export function buildAdherenceCopy(progress: ProgramProgressData | null, weeklyTarget: number): string {
  const remaining = getTrainingDaysRemaining(progress, weeklyTarget);
  if (!progress) return `Meta: ${weeklyTarget} treinos por semana.`;
  if (remaining === 0) return "Meta semanal fechada. Excelente consistência.";
  if (remaining === 1) return "Falta 1 treino para fechar sua meta semanal.";
  return `Faltam ${remaining} treinos para fechar sua meta semanal.`;
}

export function buildCycleGuidance(workout: Workout, now: Date = new Date()): string {
  const age = getProgramAgeDays(workout, now);
  if (age < 14) {
    return `Seu programa tem ${age} ${age === 1 ? "dia" : "dias"}. Fase ideal para consolidar técnica e repetir estímulos.`;
  }
  if (age < 28) {
    return `Semana ${getProgramWeekNumber(workout, now)}: boa janela para buscar progressão sem trocar a ficha.`;
  }
  if (age < 42) {
    return "Você já está numa janela madura do ciclo. Renove só se a evolução travou.";
  }
  return "Ciclo longo. Vale revisar cargas, exercícios e recuperação.";
}

export function nextRoutineFromProgramHistory(
  routines: Routine[],
  logs: WorkoutLog[],
  workout: Workout
): Routine | undefined {
  if (!routines.length) return undefined;
  const names = routines.map((routine) => routine.name);
  const lastDone = getLogsForWorkout(logs, workout).find((log) =>
    names.includes(log.routine_name)
  );
  if (!lastDone) return routines[0];
  const idx = names.indexOf(lastDone.routine_name);
  return routines[(idx + 1) % routines.length];
}
