import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { Workout, Routine, LibraryExercise, LocationType } from "@/types";

// Busca exercícios por grupo muscular (para modal de troca de exercício)
export async function getExercisesByMuscle(
  muscle: string,
  maxResults: number = 40
): Promise<LibraryExercise[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "library_exercises"),
      where("target_muscle", "==", muscle),
      limit(maxResults)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryExercise));
}

// Busca os grupos musculares distintos do catálogo
export async function getDistinctMuscleGroups(): Promise<string[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, "library_exercises"));
  const muscles = new Set<string>();
  snap.docs.forEach((d) => {
    const m = d.data().target_muscle as string;
    if (m) muscles.add(m);
  });
  return Array.from(muscles).sort();
}

// Busca todos os exercícios do catálogo (apenas id, name, target_muscle para o prompt)
export async function getExerciseCatalog(): Promise<
  Pick<LibraryExercise, "id" | "name" | "target_muscle">[]
> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, "library_exercises"));
  return snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name as string,
    target_muscle: d.data().target_muscle as string,
  }));
}

// Busca exercícios completos por IDs (para exibir na tela)
export async function getExercisesByIds(
  ids: string[]
): Promise<Record<string, LibraryExercise>> {
  const db = getFirebaseDb();
  const result: Record<string, LibraryExercise> = {};
  // Busca em lotes de 10 (limite do Firestore para 'in')
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(
      query(collection(db, "library_exercises"), where("__name__", "in", chunk))
    );
    snap.docs.forEach((d) => {
      result[d.id] = { id: d.id, ...d.data() } as LibraryExercise;
    });
  }
  return result;
}

// Salva o treino gerado e suas rotinas (subcoleção)
export async function saveGeneratedWorkout(
  userId: string,
  workoutType: string,
  routines: Omit<Routine, "id">[]
): Promise<string> {
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  // Desativa treino anterior ativo
  const activeSnap = await getDocs(
    query(
      collection(db, "workouts"),
      where("user_id", "==", userId),
      where("is_active", "==", true)
    )
  );
  activeSnap.docs.forEach((d) => {
    batch.update(d.ref, { is_active: false });
  });

  // Cria novo workout
  const workoutRef = doc(collection(db, "workouts"));
  batch.set(workoutRef, {
    user_id: userId,
    workout_type: workoutType,
    is_active: true,
    created_at: serverTimestamp(),
  });

  // Cria rotinas na subcoleção
  routines.forEach((routine, idx) => {
    const routineRef = doc(collection(db, "workouts", workoutRef.id, "routines"));
    batch.set(routineRef, {
      name: routine.name,
      exercises: routine.exercises,
      order: idx,
    });
  });

  await batch.commit();
  return workoutRef.id;
}

// Busca o treino ativo do usuário com suas rotinas
export async function getActiveWorkout(
  userId: string
): Promise<(Workout & { routines: Routine[] }) | null> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "workouts"),
      where("user_id", "==", userId),
      where("is_active", "==", true),
      orderBy("created_at", "desc"),
      limit(1)
    )
  );

  if (snap.empty) return null;

  const workoutDoc = snap.docs[0];
  const workout = { id: workoutDoc.id, ...workoutDoc.data() } as Workout;

  const routinesSnap = await getDocs(
    query(
      collection(db, "workouts", workoutDoc.id, "routines"),
      orderBy("order", "asc")
    )
  );
  const routines = routinesSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as Routine)
  );

  return { ...workout, routines };
}

// Busca o treino ativo do usuário para um local específico (gym ou quartel)
export async function getActiveWorkoutByLocation(
  userId: string,
  locationType: LocationType
): Promise<(Workout & { routines: Routine[] }) | null> {
  const db = getFirebaseDb();

  let snap;
  try {
    // Query com índice composto (user_id + is_active + location_type + created_at)
    snap = await getDocs(
      query(
        collection(db, "workouts"),
        where("user_id", "==", userId),
        where("is_active", "==", true),
        where("location_type", "==", locationType),
        orderBy("created_at", "desc"),
        limit(1)
      )
    );
  } catch {
    // Fallback: busca todos os ativos e filtra client-side (índice ainda não criado)
    const allActive = await getDocs(
      query(
        collection(db, "workouts"),
        where("user_id", "==", userId),
        where("is_active", "==", true),
        orderBy("created_at", "desc")
      )
    );
    const matched = allActive.docs.find(
      (d) => (d.data().location_type || "gym") === locationType
    );
    if (!matched) return null;
    const workout = { id: matched.id, ...matched.data() } as Workout;
    const routinesSnap = await getDocs(
      query(
        collection(db, "workouts", matched.id, "routines"),
        orderBy("order", "asc")
      )
    );
    const routines = routinesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Routine)
    );
    return { ...workout, routines };
  }

  if (snap.empty) return null;

  const workoutDoc = snap.docs[0];
  const workout = { id: workoutDoc.id, ...workoutDoc.data() } as Workout;

  const routinesSnap = await getDocs(
    query(
      collection(db, "workouts", workoutDoc.id, "routines"),
      orderBy("order", "asc")
    )
  );
  const routines = routinesSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as Routine)
  );

  return { ...workout, routines };
}
