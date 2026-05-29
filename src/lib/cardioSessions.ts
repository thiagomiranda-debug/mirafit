import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import type { CardioModality, CardioSession } from "@/types";

export interface ModalityPR {
  sessionsCount4w: number;
  maxDistanceKm?: number;
  bestPaceSecPerKm?: number;
}

export const MODALITY_LABELS: Record<
  CardioModality,
  { label: string; emoji: string; supportsPace: boolean }
> = {
  corrida_ar_livre: { label: "Corrida", emoji: "🏃", supportsPace: true },
  esteira: { label: "Esteira", emoji: "🏃", supportsPace: true },
  bike: { label: "Bike", emoji: "🚴", supportsPace: false },
  eliptico: { label: "Elíptico", emoji: "⚡", supportsPace: false },
  stepper: { label: "Stepper", emoji: "🪜", supportsPace: false },
  remo: { label: "Remo", emoji: "🚣", supportsPace: false },
};

export function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function formatDistance(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export async function createCardioSession(
  session: Omit<CardioSession, "id">
): Promise<string> {
  const db = getFirebaseDb();
  const docRef = await addDoc(collection(db, "cardio_sessions"), {
    user_id: session.user_id,
    date: Timestamp.fromDate(session.date),
    modality: session.modality,
    duration_sec: session.duration_sec,
    ...(session.distance_km !== undefined && {
      distance_km: session.distance_km,
    }),
  });
  return docRef.id;
}

export async function deleteCardioSession(id: string): Promise<void> {
  const db = getFirebaseDb();
  await deleteDoc(doc(db, "cardio_sessions", id));
}

export async function getCardioSessions(
  uid: string,
  max = 200
): Promise<CardioSession[]> {
  const db = getFirebaseDb();
  try {
    const snap = await getDocs(
      query(
        collection(db, "cardio_sessions"),
        where("user_id", "==", uid),
        orderBy("date", "desc"),
        limit(max)
      )
    );
    return mapSessionDocs(snap.docs);
  } catch {
    // Fallback enquanto o índice composto ainda não foi criado no Firestore.
    const snap = await getDocs(
      query(
        collection(db, "cardio_sessions"),
        where("user_id", "==", uid),
        limit(max * 3)
      )
    );
    return mapSessionDocs(snap.docs)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, max);
  }
}

export function getCardioPRs(
  sessions: CardioSession[]
): Record<CardioModality, ModalityPR> {
  const now = Date.now();
  const fourWeeksMs = 28 * 24 * 60 * 60 * 1000;

  const result = {} as Record<CardioModality, ModalityPR>;
  const modalities = Object.keys(MODALITY_LABELS) as CardioModality[];
  for (const m of modalities) {
    result[m] = { sessionsCount4w: 0 };
  }

  for (const s of sessions) {
    const pr = result[s.modality];
    if (!pr) continue; // modalidade desconhecida/legada — ignora em vez de crashar
    if (now - s.date.getTime() <= fourWeeksMs) {
      pr.sessionsCount4w += 1;
    }
    if (s.distance_km !== undefined) {
      if (pr.maxDistanceKm === undefined || s.distance_km > pr.maxDistanceKm) {
        pr.maxDistanceKm = s.distance_km;
      }
      const info = MODALITY_LABELS[s.modality];
      if (info.supportsPace && s.distance_km >= 1) {
        const pace = s.duration_sec / s.distance_km;
        if (pr.bestPaceSecPerKm === undefined || pace < pr.bestPaceSecPerKm) {
          pr.bestPaceSecPerKm = pace;
        }
      }
    }
  }

  return result;
}

function mapSessionDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): CardioSession[] {
  return docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      user_id: data.user_id as string,
      date:
        data.date instanceof Timestamp
          ? data.date.toDate()
          : data.date
          ? new Date(data.date as string)
          : new Date(),
      modality: data.modality as CardioModality,
      duration_sec: data.duration_sec as number,
      distance_km: data.distance_km as number | undefined,
    };
  });
}
