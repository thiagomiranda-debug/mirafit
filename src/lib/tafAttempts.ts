import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { TafAgeGroup, TafEventKey, TafGender } from "@/lib/tafData";

export interface TafEventResult {
  event: TafEventKey;
  /** reps (inteiro) ou segundos (float, para corridas) */
  value: number;
  score: number;
  skipped?: boolean;
}

export type TafAttemptType = "full" | "single";

export interface TafAttempt {
  id: string;
  user_id: string;
  date: Date;
  type: TafAttemptType;
  gender: TafGender;
  age_group: TafAgeGroup;
  results: TafEventResult[];
  total_score: number;
}

interface CreateTafAttemptInput {
  user_id: string;
  type: TafAttemptType;
  gender: TafGender;
  age_group: TafAgeGroup;
  results: TafEventResult[];
}

export async function createTafAttempt(
  input: CreateTafAttemptInput
): Promise<string> {
  const db = getFirebaseDb();
  const sanitizedResults = input.results.map((result) => {
    const payload: TafEventResult = {
      event: result.event,
      value: result.value,
      score: result.score,
    };

    if (result.skipped) {
      payload.skipped = true;
    }

    return payload;
  });

  const total_score = sanitizedResults.reduce(
    (sum, result) => sum + result.score,
    0
  );

  const payload: Record<string, unknown> = {
    user_id: input.user_id,
    date: serverTimestamp(),
    type: input.type,
    gender: input.gender,
    age_group: input.age_group,
    results: sanitizedResults,
    total_score,
  };

  const docRef = await addDoc(collection(db, "taf_attempts"), payload);
  return docRef.id;
}

export async function getTafAttempts(
  userId: string,
  maxResults: number = 30
): Promise<TafAttempt[]> {
  const db = getFirebaseDb();
  try {
    const snap = await getDocs(
      query(
        collection(db, "taf_attempts"),
        where("user_id", "==", userId),
        orderBy("date", "desc"),
        limit(maxResults)
      )
    );

    return mapAttemptDocs(snap.docs);
  } catch {
    // Fallback enquanto o indice composto ainda nao foi criado no Firestore.
    const snap = await getDocs(
      query(
        collection(db, "taf_attempts"),
        where("user_id", "==", userId),
        limit(maxResults * 3)
      )
    );

    return mapAttemptDocs(snap.docs)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, maxResults);
  }
}

/**
 * Melhor valor por evento (menor tempo para corridas, maior reps para reps).
 * Retorna `{ event: { value, score } }`.
 */
export async function getBestTafResults(
  userId: string
): Promise<Partial<Record<TafEventKey, { value: number; score: number }>>> {
  const attempts = await getTafAttempts(userId, 100);
  const best: Partial<Record<TafEventKey, { value: number; score: number }>> = {};

  for (const attempt of attempts) {
    for (const result of attempt.results) {
      if (result.skipped) continue;

      const current = best[result.event];
      const isRun =
        result.event === "run_300m" || result.event === "run_1600m";

      if (!current || result.score > current.score) {
        best[result.event] = { value: result.value, score: result.score };
        continue;
      }

      if (result.score < current.score) continue;

      const isBetterValue = isRun
        ? result.value < current.value
        : result.value > current.value;

      if (isBetterValue) {
        best[result.event] = { value: result.value, score: result.score };
      }
    }
  }

  return best;
}

function mapAttemptDocs(
  docs: Array<{
    id: string;
    data: () => Record<string, unknown>;
  }>
): TafAttempt[] {
  return docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      user_id: data.user_id as string,
      date:
        data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date as string),
      type: data.type as TafAttemptType,
      gender: data.gender as TafGender,
      age_group: data.age_group as TafAgeGroup,
      results: (data.results ?? []) as TafEventResult[],
      total_score: (data.total_score as number | undefined) ?? 0,
    };
  });
}
