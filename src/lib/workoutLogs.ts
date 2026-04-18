import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { WorkoutLog, ExercisePerformance, SetPerformance, LocationType } from "@/types";
import { best1RMFromSets } from "@/lib/metrics";

export async function saveWorkoutLog(
  userId: string,
  routineName: string,
  performance: ExercisePerformance[],
  notes?: string,
  locationType?: LocationType
): Promise<string> {
  const db = getFirebaseDb();
  const payload: Record<string, unknown> = {
    user_id: userId,
    date: serverTimestamp(),
    routine_name: routineName,
    performance,
  };
  if (notes && notes.trim()) payload.notes = notes.trim();
  if (locationType) payload.location_type = locationType;
  const docRef = await addDoc(collection(db, "workout_history"), payload);
  return docRef.id;
}

export async function getWorkoutLogs(
  userId: string,
  maxResults: number = 20
): Promise<WorkoutLog[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "workout_history"),
      where("user_id", "==", userId),
      orderBy("date", "desc"),
      limit(maxResults)
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const log: WorkoutLog = {
      id: d.id,
      user_id: data.user_id,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
      routine_name: data.routine_name,
      performance: data.performance,
    };
    if (data.notes) log.notes = data.notes;
    if (data.location_type) log.location_type = data.location_type;
    return log;
  });
}

/**
 * Retorna um mapa de exercise_id -> sets da última vez que o exercício foi executado.
 * Usado para pré-preencher os inputs de peso/reps no treino atual.
 */
export async function getLastPerformanceMap(
  userId: string
): Promise<Record<string, SetPerformance[]>> {
  const logs = await getWorkoutLogs(userId, 20);
  const map: Record<string, SetPerformance[]> = {};

  for (const log of logs) {
    for (const perf of log.performance) {
      if (map[perf.exercise_id]) continue; // já encontrou o mais recente

      if (perf.sets && perf.sets.length > 0) {
        map[perf.exercise_id] = perf.sets;
      } else if (perf.weight_lifted !== undefined && perf.reps_done !== undefined) {
        // Converte formato legado para o novo formato
        map[perf.exercise_id] = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
      }
    }
  }

  return map;
}

export async function getExerciseHistory(
  userId: string,
  exerciseId: string,
  maxResults: number = 10
): Promise<{ date: Date; weight: number; reps: number }[]> {
  const logs = await getWorkoutLogs(userId, 50);
  const history: { date: Date; weight: number; reps: number }[] = [];

  for (const log of logs) {
    const perf = log.performance.find((p) => p.exercise_id === exerciseId);
    if (perf) {
      let weight = 0;
      let reps = 0;
      if (perf.sets && perf.sets.length > 0) {
        weight = Math.max(...perf.sets.map((s) => s.weight));
        reps = Math.round(perf.sets.reduce((a, s) => a + s.reps, 0) / perf.sets.length);
      } else {
        weight = perf.weight_lifted ?? 0;
        reps = perf.reps_done ?? 0;
      }
      history.push({ date: log.date, weight, reps });
    }
    if (history.length >= maxResults) break;
  }

  return history;
}

/**
 * Retorna o melhor 1RM histórico (Epley) por exercício,
 * calculado a partir dos últimos 60 logs.
 * exercise_id → melhor 1RM estimado (kg)
 */
export async function getPersonalRecords(
  userId: string
): Promise<Record<string, number>> {
  const logs = await getWorkoutLogs(userId, 60);
  const records: Record<string, number> = {};

  for (const log of logs) {
    for (const perf of log.performance) {
      let sets: SetPerformance[];

      if (perf.sets && perf.sets.length > 0) {
        sets = perf.sets;
      } else if (
        perf.weight_lifted !== undefined &&
        perf.reps_done !== undefined
      ) {
        sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
      } else {
        continue;
      }

      const pr = best1RMFromSets(sets);
      if (pr > (records[perf.exercise_id] ?? 0)) {
        records[perf.exercise_id] = pr;
      }
    }
  }

  return records;
}

/**
 * Busca os últimos 60 logs uma única vez e deriva:
 * - lastPerfMap: última performance por exercício (sets mais recentes)
 * - personalRecords: melhor 1RM histórico (Epley) por exercício
 * Substitui chamar getLastPerformanceMap + getPersonalRecords separadamente.
 */
export async function getPerfAndRecords(userId: string): Promise<{
  lastPerfMap: Record<string, SetPerformance[]>;
  personalRecords: Record<string, number>;
}> {
  const logs = await getWorkoutLogs(userId, 60);
  const lastPerfMap: Record<string, SetPerformance[]> = {};
  const personalRecords: Record<string, number> = {};

  for (const log of logs) {
    for (const perf of log.performance) {
      let sets: SetPerformance[];

      if (perf.sets && perf.sets.length > 0) {
        sets = perf.sets;
      } else if (
        perf.weight_lifted !== undefined &&
        perf.reps_done !== undefined
      ) {
        sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
      } else {
        continue;
      }

      // lastPerfMap: só guarda a primeira aparição (log mais recente)
      if (!lastPerfMap[perf.exercise_id]) {
        lastPerfMap[perf.exercise_id] = sets;
      }

      // personalRecords: guarda o máximo histórico
      const pr = best1RMFromSets(sets);
      if (pr > (personalRecords[perf.exercise_id] ?? 0)) {
        personalRecords[perf.exercise_id] = pr;
      }
    }
  }

  return { lastPerfMap, personalRecords };
}
