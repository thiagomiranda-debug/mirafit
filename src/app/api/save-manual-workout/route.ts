import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { LocationType, UserProfile } from "@/types";
import { initAdmin } from "@/lib/firebaseAdmin";

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
    const requestedWeeklyTarget =
      typeof body.weeklyTarget === "number"
        ? Math.max(1, Math.min(6, Math.floor(body.weeklyTarget)))
        : undefined;

    // 3. Validate
    if (!Array.isArray(routines) || routines.length === 0) {
      return NextResponse.json({ error: "Pelo menos uma rotina é necessária" }, { status: 400 });
    }
    if (routines.length > 6) {
      return NextResponse.json({ error: "Máximo de 6 divisões por treino" }, { status: 400 });
    }

    for (const routine of routines) {
      if (!routine.name || !Array.isArray(routine.exercises) || routine.exercises.length === 0) {
        return NextResponse.json({ error: `Rotina "${routine.name || "?"}" precisa de pelo menos um exercício` }, { status: 400 });
      }
      if (routine.exercises.length > 30) {
        return NextResponse.json({ error: `Rotina "${routine.name}" tem exercícios demais (máx 30)` }, { status: 400 });
      }
      for (const ex of routine.exercises) {
        if (!ex.exercise_id || !ex.reps || typeof ex.sets !== "number" || ex.sets < 1) {
          return NextResponse.json({ error: "Exercício com dados incompletos" }, { status: 400 });
        }
      }
    }

    // 4. Deactivate previous workouts of same location_type
    const db = getFirestore();
    let weeklyTarget = requestedWeeklyTarget;
    if (!weeklyTarget) {
      const userSnap = await db.collection("users").doc(userId).get();
      const profile = userSnap.exists ? (userSnap.data() as UserProfile) : null;
      weeklyTarget = Math.max(
        1,
        Math.min(6, Math.floor(profile?.days_per_week ?? routines.length))
      );
    }

    const activeSnap = await db
      .collection("workouts")
      .where("user_id", "==", userId)
      .where("is_active", "==", true)
      .where("location_type", "==", locationType)
      .get();

    const batch = db.batch();
    const createdAt = new Date();
    activeSnap.docs.forEach((d) =>
      batch.update(d.ref, { is_active: false, ended_at: createdAt })
    );

    // 5. Create new workout + routines
    const workoutRef = db.collection("workouts").doc();
    batch.set(workoutRef, {
      user_id: userId,
      workout_type: planName,
      weekly_target: weeklyTarget,
      display_name: planName,
      source: "manual",
      is_active: true,
      location_type: locationType,
      created_at: createdAt,
      ended_at: null,
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

    return NextResponse.json({ workoutId: workoutRef.id, display_name: planName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[save-manual-workout]", message, err);
    return NextResponse.json(
      { error: `Erro ao salvar treino: ${message}` },
      { status: 500 }
    );
  }
}
