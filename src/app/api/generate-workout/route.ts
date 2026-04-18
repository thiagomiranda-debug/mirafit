import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { generateWorkout } from "@/lib/workoutGenerator";
import { UserProfile, LocationType } from "@/types";

// Inicializa Firebase Admin (server-side)
function initAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Valida token de autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    initAdmin();
    let userId: string;
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const db = getFirestore();

    // Lê parâmetros do body
    const body = await req.json().catch(() => ({}));
    const locationType: LocationType = body.locationType === 'quartel' ? 'quartel' : 'gym';
    const daysAvailable: number | undefined = typeof body.daysAvailable === 'number'
      ? Math.max(1, Math.min(6, Math.floor(body.daysAvailable)))
      : undefined;

    // 1. Busca perfil do usuário
    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
    }
    const profile = userSnap.data() as UserProfile;

    // 2. Busca catálogo de exercícios (id, name, target_muscle, equipment)
    const exercisesSnap = await db.collection("library_exercises").get();
    const catalog = exercisesSnap.docs.map((d) => ({
      id: d.id,
      name: d.data().name as string,
      muscle: d.data().target_muscle as string,
      equipment: (d.data().equipment as string) || '',
    }));

    // 3. Gera treino com regras (sem IA, sem custo)
    const generated = generateWorkout(profile, catalog, locationType, daysAvailable);

    // 4. Desativa treinos anteriores DO MESMO LOCAL e salva novo no Firestore
    const activeSnap = await db
      .collection("workouts")
      .where("user_id", "==", userId)
      .where("is_active", "==", true)
      .where("location_type", "==", locationType)
      .get();

    const batch = db.batch();
    activeSnap.docs.forEach((d) => batch.update(d.ref, { is_active: false }));

    const workoutRef = db.collection("workouts").doc();
    batch.set(workoutRef, {
      user_id: userId,
      workout_type: generated.workout_type,
      is_active: true,
      location_type: locationType,
      created_at: new Date(),
    });

    generated.routines.forEach((routine, idx) => {
      const routineRef = workoutRef.collection("routines").doc();
      batch.set(routineRef, {
        name: routine.name,
        exercises: routine.exercises,
        order: idx,
      });
    });

    await batch.commit();

    return NextResponse.json({
      workoutId: workoutRef.id,
      workout_type: generated.workout_type,
      routines: generated.routines,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-workout]", message, err);
    return NextResponse.json(
      { error: `Erro ao gerar treino: ${message}` },
      { status: 500 }
    );
  }
}
