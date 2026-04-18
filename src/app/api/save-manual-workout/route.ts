import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { LocationType } from "@/types";

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

interface RoutinePayload {
  name: string;
  exercises: {
    exercise_id: string;
    sets: number;
    reps: string;
    order: number;
  }[];
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
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

    // 2. Parse body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const locationType: LocationType = body.locationType === "quartel" ? "quartel" : "gym";
    const planName: string = (typeof body.planName === "string" ? body.planName.trim() : "").slice(0, 50) || "Treino Manual";
    const routines: RoutinePayload[] = body.routines;

    // 3. Validate
    if (!Array.isArray(routines) || routines.length === 0) {
      return NextResponse.json({ error: "Pelo menos uma rotina é necessária" }, { status: 400 });
    }

    for (const routine of routines) {
      if (!routine.name || !Array.isArray(routine.exercises) || routine.exercises.length === 0) {
        return NextResponse.json({ error: `Rotina "${routine.name || "?"}" precisa de pelo menos um exercício` }, { status: 400 });
      }
      for (const ex of routine.exercises) {
        if (!ex.exercise_id || !ex.reps || typeof ex.sets !== "number" || ex.sets < 1) {
          return NextResponse.json({ error: "Exercício com dados incompletos" }, { status: 400 });
        }
      }
    }

    // 4. Deactivate previous workouts of same location_type
    const db = getFirestore();
    const activeSnap = await db
      .collection("workouts")
      .where("user_id", "==", userId)
      .where("is_active", "==", true)
      .where("location_type", "==", locationType)
      .get();

    const batch = db.batch();
    activeSnap.docs.forEach((d) => batch.update(d.ref, { is_active: false }));

    // 5. Create new workout + routines
    const workoutRef = db.collection("workouts").doc();
    batch.set(workoutRef, {
      user_id: userId,
      workout_type: planName,
      is_active: true,
      location_type: locationType,
      created_at: new Date(),
    });

    routines.forEach((routine, idx) => {
      const routineRef = workoutRef.collection("routines").doc();
      batch.set(routineRef, {
        name: routine.name,
        exercises: routine.exercises.map((ex, i) => ({
          exercise_id: ex.exercise_id,
          sets: ex.sets,
          reps: ex.reps,
          order: i,
        })),
        order: idx,
      });
    });

    await batch.commit();

    return NextResponse.json({ workoutId: workoutRef.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[save-manual-workout]", message, err);
    return NextResponse.json(
      { error: `Erro ao salvar treino: ${message}` },
      { status: 500 }
    );
  }
}
