import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { generateWorkout, CARDIO_EQUIPMENTS, PreviousCycleContext, CatalogExercise } from "@/lib/workoutGenerator";
import { UserProfile, LocationType } from "@/types";
import { initAdmin } from "@/lib/firebaseAdmin";

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

    // 3. Busca treino ativo anterior (para construir contexto de periodização)
    const activeSnap = await db
      .collection("workouts")
      .where("user_id", "==", userId)
      .where("is_active", "==", true)
      .where("location_type", "==", locationType)
      .get();

    let previousCycle: PreviousCycleContext | undefined;
    if (!activeSnap.empty) {
      // Pega o mais recente (pode haver múltiplos ativos em casos degenerados)
      const sorted = activeSnap.docs.slice().sort((a, b) => {
        const ta = (a.data().created_at as any)?.toMillis?.() ?? 0;
        const tb = (b.data().created_at as any)?.toMillis?.() ?? 0;
        return tb - ta;
      });
      const prevDoc = sorted[0];
      const prevData = prevDoc.data();
      const prevVariantId = prevData.split_variant_id as string | undefined;
      const prevPhase = prevData.cycle_phase as ('acumulacao' | 'intensificacao' | undefined);

      const routinesSnap = await prevDoc.ref.collection("routines").get();
      const catalogMap = new Map<string, CatalogExercise>(catalog.map((c) => [c.id, c]));

      const history: Record<string, string[]> = {};
      for (const routineDoc of routinesSnap.docs) {
        const exercises = (routineDoc.data().exercises || []) as Array<{ exercise_id: string }>;
        for (const ex of exercises) {
          const catEx = catalogMap.get(ex.exercise_id);
          if (!catEx) continue;
          const equipLower = (catEx.equipment || "").toLowerCase();
          if (!equipLower || CARDIO_EQUIPMENTS.has(equipLower)) continue;
          const muscle = catEx.muscle;
          if (!history[muscle]) history[muscle] = [];
          if (!history[muscle].includes(equipLower)) history[muscle].push(equipLower);
        }
      }

      if (prevVariantId) {
        previousCycle = {
          splitVariantId: prevVariantId,
          cyclePhase: prevPhase ?? 'acumulacao',
          muscleEquipmentHistory: history,
        };
      }
    }

    // 4. Gera treino com regras + contexto do ciclo anterior
    const generated = generateWorkout(profile, catalog, locationType, daysAvailable, previousCycle);

    // 5. Desativa anteriores e grava o novo
    const batch = db.batch();
    activeSnap.docs.forEach((d) => batch.update(d.ref, { is_active: false }));

    const workoutRef = db.collection("workouts").doc();
    batch.set(workoutRef, {
      user_id: userId,
      workout_type: generated.workout_type,
      is_active: true,
      location_type: locationType,
      created_at: new Date(),
      split_variant_id: generated.split_variant_id,
      cycle_phase: generated.cycle_phase,
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
      split_variant_id: generated.split_variant_id,
      cycle_phase: generated.cycle_phase,
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
