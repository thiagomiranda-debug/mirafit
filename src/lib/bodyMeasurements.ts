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
import { BodyMeasurement } from "@/types";

type MeasurementInput = Omit<BodyMeasurement, "id" | "user_id" | "date">;

export async function saveBodyMeasurement(
  userId: string,
  data: MeasurementInput
): Promise<string> {
  const db = getFirebaseDb();
  const payload: Record<string, unknown> = {
    user_id: userId,
    date: serverTimestamp(),
  };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      payload[key] = value;
    }
  }
  const docRef = await addDoc(collection(db, "body_measurements"), payload);
  return docRef.id;
}

export async function getBodyMeasurements(
  userId: string,
  maxResults: number = 50
): Promise<BodyMeasurement[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "body_measurements"),
      where("user_id", "==", userId),
      orderBy("date", "desc"),
      limit(maxResults)
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const entry: BodyMeasurement = {
      id: d.id,
      user_id: data.user_id,
      date:
        data.date instanceof Timestamp
          ? data.date.toDate()
          : data.date
          ? new Date(data.date)
          : new Date(),
    };
    const fields: (keyof MeasurementInput)[] = [
      "weight_kg",
      "waist_cm",
      "hip_cm",
      "chest_cm",
      "shoulder_cm",
      "neck_cm",
      "bicep_r_cm",
      "bicep_l_cm",
      "forearm_r_cm",
      "forearm_l_cm",
      "thigh_r_cm",
      "thigh_l_cm",
      "calf_r_cm",
      "calf_l_cm",
    ];
    for (const field of fields) {
      if (data[field] !== undefined) {
        (entry as unknown as Record<string, unknown>)[field] = data[field];
      }
    }
    return entry;
  });
}
