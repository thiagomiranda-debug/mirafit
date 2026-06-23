import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  getCountFromServer,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { WorkoutLog, ExercisePerformance, SetPerformance, LocationType } from "@/types";
import { best1RMFromSets, epley1RM, totalVolume } from "@/lib/metrics";
import { getCachedWorkoutLogs, invalidateWorkoutLogs } from "@/lib/workoutLogsCache";

interface SaveWorkoutLogInput {
  userId: string;
  workoutId: string;
  routineId: string;
  workoutName: string;
  routineName: string;
  performance: ExercisePerformance[];
  durationSec?: number;
  notes?: string;
  locationType?: LocationType;
}

export async function saveWorkoutLog({
  userId,
  workoutId,
  routineId,
  workoutName,
  routineName,
  performance,
  durationSec,
  notes,
  locationType,
}: SaveWorkoutLogInput): Promise<string> {
  const db = getFirebaseDb();
  const payload: Record<string, unknown> = {
    user_id: userId,
    date: serverTimestamp(),
    workout_id: workoutId,
    routine_id: routineId,
    workout_name_snapshot: workoutName,
    routine_name: routineName,
    performance,
  };
  if (durationSec && durationSec > 0) payload.duration_sec = Math.round(durationSec);
  if (notes && notes.trim()) payload.notes = notes.trim();
  if (locationType) payload.location_type = locationType;
  const docRef = await addDoc(collection(db, "workout_history"), payload);
  invalidateWorkoutLogs(userId);
  return docRef.id;
}

/**
 * Conta o total de sessões de treino do usuário via agregação server-side
 * (não baixa os documentos). Usado no KPI "Treinos" da home, que não pode
 * depender de logs.length — limitado pela janela carregada em memória (≤120).
 */
export async function getWorkoutCount(userId: string): Promise<number> {
  const db = getFirebaseDb();
  const snap = await getCountFromServer(
    query(collection(db, "workout_history"), where("user_id", "==", userId))
  );
  return snap.data().count;
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
  return snap.docs.map(mapWorkoutLogDoc);
}

/** Busca todas as sessões vinculadas a um programa específico. */
export async function getWorkoutLogsByWorkout(
  userId: string,
  workoutId: string,
  maxResults: number = 300
): Promise<WorkoutLog[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "workout_history"),
      where("user_id", "==", userId),
      where("workout_id", "==", workoutId),
      orderBy("date", "desc"),
      limit(maxResults)
    )
  );
  return snap.docs.map(mapWorkoutLogDoc);
}

function mapWorkoutLogDoc(logDoc: {
  id: string;
  data: () => Record<string, unknown>;
}): WorkoutLog {
  const data = logDoc.data();
  const rawDate = data.date;
  const log: WorkoutLog = {
    id: logDoc.id,
    user_id: data.user_id as string,
    date: rawDate instanceof Timestamp
      ? rawDate.toDate()
      : rawDate
        ? new Date(rawDate as string | number | Date)
        : new Date(),
    routine_name: data.routine_name as string,
    performance: data.performance as ExercisePerformance[],
  };
  if (data.workout_id) log.workout_id = data.workout_id as string;
  if (data.routine_id) log.routine_id = data.routine_id as string;
  if (data.workout_name_snapshot) {
    log.workout_name_snapshot = data.workout_name_snapshot as string;
  }
  if (typeof data.duration_sec === "number") log.duration_sec = data.duration_sec;
  if (data.notes) log.notes = data.notes as string;
  if (data.location_type) log.location_type = data.location_type as LocationType;
  return log;
}

/**
 * Retorna um mapa de exercise_id -> sets da última vez que o exercício foi executado.
 * Usado para pré-preencher os inputs de peso/reps no treino atual.
 */
export async function getLastPerformanceMap(
  userId: string
): Promise<Record<string, SetPerformance[]>> {
  const logs = await getWorkoutLogs(userId, 60);
  const map: Record<string, SetPerformance[]> = {};

  for (const log of logs) {
    for (const perf of log.performance) {
      if (map[perf.exercise_id]) continue; // já encontrou o mais recente

      const sets = normalizePerfSets(perf);
      if (sets.length === 0) continue;
      map[perf.exercise_id] = sets;
    }
  }

  return map;
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
      const sets = normalizePerfSets(perf);
      if (sets.length === 0) continue;

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
  const logs = await getCachedWorkoutLogs(userId, 60);
  const lastPerfMap: Record<string, SetPerformance[]> = {};
  const personalRecords: Record<string, number> = {};

  for (const log of logs) {
    for (const perf of log.performance) {
      const sets = normalizePerfSets(perf);
      if (sets.length === 0) continue;

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

export interface ExerciseSession {
  date: Date;
  sets: SetPerformance[];
}

export interface ExerciseRecords {
  /** Melhor 1RM estimado (Epley) de qualquer série. */
  best1RM: number;
  /** Maior peso usado em qualquer série (kg). */
  maxWeight: number;
  /** Série com o maior 1RM estimado. */
  bestSet: { weight: number; reps: number } | null;
  /** Mais repetições numa única série. */
  maxReps: number;
  /** Maior volume Σ(peso×reps) somado numa única sessão. */
  bestSessionVol: number;
}

export interface ExerciseDetail {
  /** Sessões que contêm o exercício, mais recente → mais antiga. */
  sessions: ExerciseSession[];
  records: ExerciseRecords;
}

/**
 * Normaliza a performance de um exercício para SetPerformance[].
 * Lida com o formato novo (sets) e o legado (weight_lifted/reps_done).
 * Retorna [] se não houver dado utilizável.
 */
function normalizePerfSets(perf: ExercisePerformance): SetPerformance[] {
  if (perf.sets && perf.sets.length > 0) return perf.sets;
  if (perf.weight_lifted !== undefined && perf.reps_done !== undefined) {
    return [{ weight: perf.weight_lifted, reps: perf.reps_done }];
  }
  return [];
}

/**
 * Detalhe completo de um exercício: todas as sessões registradas (mais recente
 * primeiro) e os recordes pessoais. Lê os últimos 120 logs do cache.
 */
export async function getExerciseDetail(
  userId: string,
  exerciseId: string
): Promise<ExerciseDetail> {
  const logs = await getCachedWorkoutLogs(userId, 120);
  const sessions: ExerciseSession[] = [];

  for (const log of logs) {
    const perf = log.performance.find((p) => p.exercise_id === exerciseId);
    if (!perf) continue;
    const sets = normalizePerfSets(perf);
    if (sets.length === 0) continue;
    const date = log.date instanceof Date ? log.date : new Date(log.date);
    sessions.push({ date, sets });
  }

  // Logs do cache já vêm date desc; garante a ordem mesmo assim.
  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());

  const records: ExerciseRecords = {
    best1RM: 0,
    maxWeight: 0,
    bestSet: null,
    maxReps: 0,
    bestSessionVol: 0,
  };

  for (const session of sessions) {
    const sessionVol = totalVolume(session.sets);
    if (sessionVol > records.bestSessionVol) records.bestSessionVol = sessionVol;

    for (const s of session.sets) {
      if (s.weight > records.maxWeight) records.maxWeight = s.weight;
      if (s.reps > records.maxReps) records.maxReps = s.reps;
      const rm = epley1RM(s.weight, s.reps);
      if (rm > records.best1RM) {
        records.best1RM = rm;
        records.bestSet = { weight: s.weight, reps: s.reps };
      }
    }
  }

  return { sessions, records };
}
