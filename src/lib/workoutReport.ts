import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import { translateExerciseName } from "@/lib/exerciseNames";
import type {
  LibraryExercise,
  Routine,
  SetPerformance,
  Workout,
  WorkoutLog,
} from "@/types";

const MUSCLE_NAME_PT: Record<string, string> = {
  abductors: "Abdutores",
  abs: "Abdômen",
  adductors: "Adutores",
  biceps: "Bíceps",
  calves: "Panturrilhas",
  cardiovascular_system: "Sistema cardiovascular",
  delts: "Deltoides",
  forearms: "Antebraços",
  glutes: "Glúteos",
  hamstrings: "Posterior de coxa",
  lats: "Dorsal",
  levator_scapulae: "Levantador da escápula",
  pectorals: "Peitorais",
  quads: "Quadríceps",
  serratus_anterior: "Serrátil anterior",
  spine: "Coluna",
  traps: "Trapézio",
  triceps: "Tríceps",
  upper_back: "Costas superior",
};

export interface ProgramChartPoint {
  id: string;
  dateLabel: string;
  volume: number;
  avg1RM: number;
}

export interface RoutineReportStat {
  key: string;
  name: string;
  sessions: number;
  percentage: number;
}

export interface MuscleReportStat {
  muscle: string;
  volume: number;
  percentage: number;
}

export interface ReportHighlight {
  value: number;
  exerciseName: string;
  date: Date;
}

export interface ProgramSessionReport {
  id: string;
  date: Date;
  routineName: string;
  volume: number;
  sets: number;
  maxWeight: number;
  best1RM: number;
  avg1RM: number;
  durationSec?: number;
  notes?: string;
}

export interface WorkoutProgramReport {
  sessionCount: number;
  totalVolume: number;
  totalSets: number;
  sessionsPerWeek: number;
  averageDurationSec?: number;
  strengthChangePct?: number;
  volumeChangePct?: number;
  chart: ProgramChartPoint[];
  routines: RoutineReportStat[];
  muscles: MuscleReportStat[];
  maxWeight?: ReportHighlight;
  best1RM?: ReportHighlight;
  mostFrequentExercise?: {
    exerciseName: string;
    sessions: number;
    percentage: number;
  };
  sessions: ProgramSessionReport[];
}

type ProgramWithRoutines = Workout & { routines: Routine[] };

export function buildWorkoutProgramReport(
  workout: ProgramWithRoutines,
  logs: WorkoutLog[],
  exerciseMap: Record<string, LibraryExercise>
): WorkoutProgramReport {
  const routineCounts = new Map<string, { name: string; count: number }>();
  const exerciseSessionCounts = new Map<string, number>();
  const muscleVolumes = new Map<string, number>();
  const sessions: ProgramSessionReport[] = [];
  let totalVolumeValue = 0;
  let totalSets = 0;
  let totalDuration = 0;
  let sessionsWithDuration = 0;
  let maxWeight: ReportHighlight | undefined;
  let best1RM: ReportHighlight | undefined;

  for (const routine of workout.routines) {
    const key = routine.id || `name:${routine.name}`;
    routineCounts.set(key, { name: routine.name, count: 0 });
  }

  for (const log of logs) {
    const routineKey = log.routine_id || `name:${log.routine_name}`;
    const routineStat = routineCounts.get(routineKey);
    if (routineStat) routineStat.count += 1;
    else routineCounts.set(routineKey, { name: log.routine_name, count: 1 });

    let sessionVolume = 0;
    let sessionSets = 0;
    let sessionMaxWeight = 0;
    let sessionBest1RM = 0;
    const perExercise1RM: number[] = [];
    const exercisesInSession = new Set<string>();

    for (const performance of log.performance) {
      const sets = normalizeSets(performance);
      if (sets.length === 0) continue;

      const exerciseVolume = totalVolume(sets);
      const exercise1RM = best1RMFromSets(sets);
      const exerciseMaxWeight = Math.max(...sets.map((set) => set.weight));
      const exercise = exerciseMap[performance.exercise_id];
      const exerciseName = exercise
        ? translateExerciseName(exercise.name)
        : translateExerciseName(performance.exercise_id.replace(/-/g, " "));

      sessionVolume += exerciseVolume;
      sessionSets += sets.length;
      sessionMaxWeight = Math.max(sessionMaxWeight, exerciseMaxWeight);
      sessionBest1RM = Math.max(sessionBest1RM, exercise1RM);
      if (exercise1RM > 0) perExercise1RM.push(exercise1RM);
      exercisesInSession.add(performance.exercise_id);

      if (!maxWeight || exerciseMaxWeight > maxWeight.value) {
        maxWeight = { value: exerciseMaxWeight, exerciseName, date: log.date };
      }
      if (!best1RM || exercise1RM > best1RM.value) {
        best1RM = { value: exercise1RM, exerciseName, date: log.date };
      }

      const muscle = translateMuscleName(exercise?.target_muscle || "Outros");
      muscleVolumes.set(muscle, (muscleVolumes.get(muscle) || 0) + exerciseVolume);
    }

    for (const exerciseId of exercisesInSession) {
      exerciseSessionCounts.set(
        exerciseId,
        (exerciseSessionCounts.get(exerciseId) || 0) + 1
      );
    }

    totalVolumeValue += sessionVolume;
    totalSets += sessionSets;
    if (log.duration_sec && log.duration_sec > 0) {
      totalDuration += log.duration_sec;
      sessionsWithDuration += 1;
    }

    sessions.push({
      id: log.id || `${log.date.getTime()}-${log.routine_name}`,
      date: log.date,
      routineName: log.routine_name,
      volume: Math.round(sessionVolume),
      sets: sessionSets,
      maxWeight: sessionMaxWeight,
      best1RM: Math.round(sessionBest1RM * 10) / 10,
      avg1RM: 0,
      durationSec: log.duration_sec,
      notes: log.notes,
    });

    const avg1RM = perExercise1RM.length
      ? Math.round(
          perExercise1RM.reduce((sum, value) => sum + value, 0) /
            perExercise1RM.length
        )
      : 0;
    sessions[sessions.length - 1].avg1RM = avg1RM;
  }

  const chronologicalSessions = [...sessions].reverse();
  const chart = chronologicalSessions.map((session) => ({
    id: session.id,
    dateLabel: session.date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
    volume: session.volume,
    avg1RM: session.avg1RM,
  }));

  const startDate = workout.created_at.getTime() > 0
    ? workout.created_at
    : chronologicalSessions[0]?.date || new Date();
  const endDate = workout.is_active ? new Date() : workout.ended_at || logs[0]?.date || startDate;
  const spanWeeks = Math.max(
    1,
    (endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const sessionCount = logs.length;
  const routines = [...routineCounts.entries()].map(([key, stat]) => ({
    key,
    name: stat.name,
    sessions: stat.count,
    percentage: sessionCount ? Math.round((stat.count / sessionCount) * 1000) / 10 : 0,
  }));

  const muscles = [...muscleVolumes.entries()]
    .map(([muscle, volume]) => ({
      muscle,
      volume: Math.round(volume),
      percentage: totalVolumeValue
        ? Math.round((volume / totalVolumeValue) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.volume - a.volume);

  const mostFrequentEntry = [...exerciseSessionCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0];
  const mostFrequentExercise = mostFrequentEntry
    ? {
        exerciseName: exerciseMap[mostFrequentEntry[0]]
          ? translateExerciseName(exerciseMap[mostFrequentEntry[0]].name)
          : translateExerciseName(mostFrequentEntry[0].replace(/-/g, " ")),
        sessions: mostFrequentEntry[1],
        percentage: sessionCount
          ? Math.round((mostFrequentEntry[1] / sessionCount) * 1000) / 10
          : 0,
      }
    : undefined;

  return {
    sessionCount,
    totalVolume: Math.round(totalVolumeValue),
    totalSets,
    sessionsPerWeek: Math.round((sessionCount / spanWeeks) * 10) / 10,
    averageDurationSec: sessionsWithDuration
      ? Math.round(totalDuration / sessionsWithDuration)
      : undefined,
    strengthChangePct: calculateChange(
      chart.find((point) => point.avg1RM > 0)?.avg1RM,
      [...chart].reverse().find((point) => point.avg1RM > 0)?.avg1RM
    ),
    volumeChangePct: calculateChange(
      chart.find((point) => point.volume > 0)?.volume,
      [...chart].reverse().find((point) => point.volume > 0)?.volume
    ),
    chart,
    routines,
    muscles,
    maxWeight,
    best1RM,
    mostFrequentExercise,
    sessions,
  };
}

function normalizeSets(
  performance: WorkoutLog["performance"][number]
): SetPerformance[] {
  if (performance.sets?.length) return performance.sets;
  if (
    performance.weight_lifted !== undefined &&
    performance.reps_done !== undefined
  ) {
    return [{ weight: performance.weight_lifted, reps: performance.reps_done }];
  }
  return [];
}

function translateMuscleName(name: string): string {
  return MUSCLE_NAME_PT[name.toLowerCase()] || name;
}

function calculateChange(first?: number, last?: number): number | undefined {
  if (!first || !last) return undefined;
  return Math.round(((last - first) / first) * 1000) / 10;
}
