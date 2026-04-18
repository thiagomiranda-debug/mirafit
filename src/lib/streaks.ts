import { WorkoutLog } from "@/types";

export interface StreakData {
  weekStreak: number;
  thisWeekDays: boolean[];
  trainedToday: boolean;
  totalWorkouts: number;
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function startOfWeek(date: Date): Date {
  const normalized = startOfDay(date);
  normalized.setDate(normalized.getDate() - normalized.getDay());
  return normalized;
}

export function calculateStreak(logs: WorkoutLog[]): StreakData {
  const now = new Date();
  const todayStart = startOfDay(now);
  const thisWeekStart = startOfWeek(now);

  const thisWeekDays: boolean[] = [
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ];
  let trainedToday = false;

  for (const log of logs) {
    const logDate = log.date instanceof Date ? log.date : new Date(log.date);
    if (logDate >= thisWeekStart) {
      thisWeekDays[logDate.getDay()] = true;
    }
    if (logDate >= todayStart) {
      trainedToday = true;
    }
  }

  let weekStreak = 0;
  const checkWeekStart = new Date(thisWeekStart);

  for (let i = 0; i < 52; i += 1) {
    const weekEnd = new Date(checkWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const hasWorkout = logs.some((log) => {
      const logDate = log.date instanceof Date ? log.date : new Date(log.date);
      return logDate >= checkWeekStart && logDate < weekEnd;
    });

    if (hasWorkout) {
      weekStreak += 1;
      checkWeekStart.setDate(checkWeekStart.getDate() - 7);
    } else {
      break;
    }
  }

  return { weekStreak, thisWeekDays, trainedToday, totalWorkouts: logs.length };
}
