import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { UserProfile } from "@/types";

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const db = getFirebaseDb();
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, "users", userId);
  await setDoc(ref, profile);
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, "users", userId);
  await updateDoc(ref, data);
}
