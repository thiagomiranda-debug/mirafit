import type { Workout, WorkoutLog } from "@/types";

export interface ProgramProgressData {
  weeksOnGoal: number;
  thisWeekDays: boolean[];
  thisWeekWorkouts: number;
  trainedToday: boolean;
  programWorkouts: number;
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function startOfWeek(date: Date): Date {
  const normalized = startOfDay(date);
  const mondayBasedIndex = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - mondayBasedIndex);
  return normalized;
}

function weekDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function dayKey(date: Date): string {
  const d = startOfDay(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function asDate(value: Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Mantém o histórico da Home no mesmo escopo do programa ativo.
 * Logs novos usam workout_id; logs legados são associados pela data de início
 * e localização para não desaparecerem durante a migração.
 */
export function getLogsForWorkout(
  logs: WorkoutLog[],
  workout: Workout
): WorkoutLog[] {
  const createdAt = asDate(workout.created_at);
  const hasValidStart = !Number.isNaN(createdAt.getTime());

  return logs.filter((log) => {
    if (workout.id && log.workout_id === workout.id) return true;
    if (log.workout_id || !hasValidStart) return false;

    const logDate = asDate(log.date);
    const sameLocation =
      !log.location_type || log.location_type === workout.location_type;
    return sameLocation && logDate >= createdAt;
  });
}

export function calculateProgramProgress(
  logs: WorkoutLog[],
  workout: Workout,
  weeklyGoal: number,
  now: Date = new Date()
): ProgramProgressData {
  const goal = Math.max(1, Math.floor(workout.weekly_target ?? weeklyGoal));
  const programLogs = getLogsForWorkout(logs, workout);
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const thisWeekStart = startOfWeek(now);
  const programStart = asDate(workout.created_at);

  const thisWeekDays = Array<boolean>(7).fill(false);
  const thisWeekDateKeys = new Set<string>();
  let trainedToday = false;

  for (const log of programLogs) {
    const logDate = asDate(log.date);
    if (logDate >= thisWeekStart && logDate <= now) {
      thisWeekDays[weekDayIndex(logDate)] = true;
      thisWeekDateKeys.add(dayKey(logDate));
    }
    if (logDate >= todayStart && logDate < tomorrowStart) {
      trainedToday = true;
    }
  }

  let weeksOnGoal = 0;
  const checkWeekStart = new Date(thisWeekStart);

  for (let weekIndex = 0; weekIndex < 52; weekIndex += 1) {
    const checkWeekEnd = new Date(checkWeekStart);
    checkWeekEnd.setDate(checkWeekEnd.getDate() + 7);

    // Nunca avalia semanas anteriores ao início deste programa.
    if (checkWeekEnd <= programStart) break;

    const trainedDaysInWeek = new Set<string>();
    for (const log of programLogs) {
      const logDate = asDate(log.date);
      if (logDate >= checkWeekStart && logDate < checkWeekEnd) {
        trainedDaysInWeek.add(dayKey(logDate));
      }
    }

    if (trainedDaysInWeek.size >= goal) {
      weeksOnGoal += 1;
    } else if (weekIndex > 0) {
      // A semana atual ainda está em andamento e não quebra a sequência.
      // Uma semana anterior abaixo da meta encerra a contagem.
      break;
    }

    // A semana parcial de ativação não é cobrada como uma semana completa.
    if (programStart >= checkWeekStart) break;
    checkWeekStart.setDate(checkWeekStart.getDate() - 7);
  }

  return {
    weeksOnGoal,
    thisWeekDays,
    thisWeekWorkouts: thisWeekDateKeys.size,
    trainedToday,
    programWorkouts: programLogs.length,
  };
}
