import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { Workout, Routine, LibraryExercise, LocationType, WorkoutExercise } from "@/types";
import { buildGeneratedProgramName } from "@/lib/workoutPrograms";

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
}

function mapWorkoutDoc(workoutDoc: {
  id: string;
  data: () => Record<string, unknown>;
}): Workout {
  const data = workoutDoc.data();
  return {
    ...(data as Omit<Workout, "id" | "created_at" | "ended_at">),
    id: workoutDoc.id,
    created_at: toDate(data.created_at),
    ended_at: data.ended_at ? toDate(data.ended_at) : null,
  };
}

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
  const snap = await getDocs(query(collection(db, "library_exercises"), limit(500)));
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
  const snap = await getDocs(query(collection(db, "library_exercises"), limit(500)));
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
    batch.update(d.ref, { is_active: false, ended_at: serverTimestamp() });
  });

  // Cria novo workout
  const workoutRef = doc(collection(db, "workouts"));
  batch.set(workoutRef, {
    user_id: userId,
    workout_type: workoutType,
    display_name: buildGeneratedProgramName(workoutType),
    source: "generated",
    is_active: true,
    created_at: serverTimestamp(),
    ended_at: null,
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
  const workout = mapWorkoutDoc(workoutDoc);

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
    const workout = mapWorkoutDoc(matched);
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
  const workout = mapWorkoutDoc(workoutDoc);

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

/** Lista os programas do usuário do mais recente para o mais antigo. */
export async function getWorkoutPrograms(userId: string): Promise<Workout[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, "workouts"), where("user_id", "==", userId))
  );

  return snap.docs
    .map(mapWorkoutDoc)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

// Sobrescreve o array completo de exercises de uma routine — usado pelo modo edição
// (add/delete/reorder) e pela troca de exercício. As regras do Firestore validam
// o user_id do workout pai.
export async function updateRoutineExercises(
  workoutId: string,
  routineId: string,
  exercises: WorkoutExercise[]
): Promise<void> {
  const db = getFirebaseDb();
  const routineRef = doc(db, "workouts", workoutId, "routines", routineId);
  await updateDoc(routineRef, { exercises });
}
