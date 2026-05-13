import { WorkoutLog } from "@/types";
import { getWorkoutLogs } from "@/lib/workoutLogs";

const MAX_LIMIT = 120;
const TTL_MS = 60_000;

type CacheEntry = {
  promise: Promise<WorkoutLog[]>;
  timestamp: number;
};

const cache = new Map<string, CacheEntry>();

/**
 * Retorna os últimos `limit` workout logs do usuário, com cache em memória
 * compartilhado entre páginas. Sempre busca os últimos 120 do Firestore e
 * fatiá para atender qualquer limit ≤ 120. Múltiplas chamadas concorrentes
 * para o mesmo userId reusam a mesma Promise (dedupe inflight).
 */
export async function getCachedWorkoutLogs(
  userId: string,
  limit: number,
): Promise<WorkoutLog[]> {
  const now = Date.now();
  const cached = cache.get(userId);

  if (cached && now - cached.timestamp < TTL_MS) {
    const logs = await cached.promise;
    return limit >= MAX_LIMIT ? logs : logs.slice(0, limit);
  }

  const promise = getWorkoutLogs(userId, MAX_LIMIT);
  cache.set(userId, { promise, timestamp: now });

  try {
    const logs = await promise;
    return limit >= MAX_LIMIT ? logs : logs.slice(0, limit);
  } catch (err) {
    // Em caso de erro, remove do cache pra próxima chamada tentar de novo
    cache.delete(userId);
    throw err;
  }
}

/** Invalida o cache de um usuário. Chamar após salvar/editar workout_history. */
export function invalidateWorkoutLogs(userId: string): void {
  cache.delete(userId);
}
