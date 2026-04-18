import { WorkoutLog } from "@/types";

export interface StreakData {
  weekStreak: number;       // semanas consecutivas com ao menos 1 treino
  thisWeekDays: boolean[];  // [Dom, Seg, Ter, Qua, Qui, Sex, Sab]
  trainedToday: boolean;
  totalWorkouts: number;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay()); // domingo = 0
  return d;
}

export function calculateStreak(logs: WorkoutLog[]): StreakData {
  const now = new Date();
  const todayStart = startOfDay(now);
  const thisWeekStart = startOfWeek(now);

  const thisWeekDays: boolean[] = [false, false, false, false, false, false, false];
  let trainedToday = false;

  for (const log of logs) {
    const d = log.date instanceof Date ? log.date : new Date(log.date);
    if (d >= thisWeekStart) {
      thisWeekDays[d.getDay()] = true;
    }
    if (d >= todayStart) {
      trainedToday = true;
    }
  }

  // Conta semanas consecutivas com treino (da mais recente para trás)
  let weekStreak = 0;
  let checkWeekStart = new Date(thisWeekStart);

  for (let i = 0; i < 52; i++) {
    const weekEnd = new Date(checkWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const hasWorkout = logs.some((log) => {
      const d = log.date instanceof Date ? log.date : new Date(log.date);
      return d >= checkWeekStart && d < weekEnd;
    });

    if (hasWorkout) {
      weekStreak++;
      checkWeekStart.setDate(checkWeekStart.getDate() - 7);
    } else {
      break;
    }
  }

  return { weekStreak, thisWeekDays, trainedToday, totalWorkouts: logs.length };
}
