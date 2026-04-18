/**
 * Gerador de treino baseado em regras — sem IA, sem custos.
 *
 * Distribui grupos musculares pelos dias disponíveis,
 * seleciona exercícios do catálogo por grupo muscular,
 * e define sets/reps com base no objetivo do usuário.
 */

import { UserProfile, LocationType } from "@/types";

export interface CatalogExercise {
  id: string;
  name: string;
  muscle: string;
  equipment?: string;
}

/** Equipamentos disponíveis no quartel */
export const QUARTEL_EQUIPMENT_WHITELIST = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'cable',
  'body weight',
  'body_weight',
  'weighted_body_weight',
  'stationary bike',
  'elliptical machine',
  'cardio',
  'leverage machine',
  'leverage_machine',
];

interface GeneratedExercise {
  exercise_id: string;
  sets: number;
  reps: string;
  order: number;
}

interface GeneratedRoutine {
  name: string;
  exercises: GeneratedExercise[];
}

interface GeneratedWorkout {
  workout_type: string;
  routines: GeneratedRoutine[];
}

// Mapeamento de splits por número de dias
const SPLITS: Record<number, { type: string; groups: string[][] }> = {
  1: {
    type: "Full Body",
    groups: [
      ["Peitorais", "Dorsal", "Deltoides", "Quadríceps", "Posterior de Coxa", "Bíceps", "Tríceps", "Abdômen"],
    ],
  },
  2: {
    type: "AB",
    groups: [
      ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
      ["Dorsal", "Costas Superior", "Trapézio", "Bíceps", "Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
    ],
  },
  3: {
    type: "ABC",
    groups: [
      ["Peitorais", "Deltoides", "Tríceps"],
      ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
      ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos", "Abdômen"],
    ],
  },
  4: {
    type: "ABCD",
    groups: [
      ["Peitorais", "Tríceps"],
      ["Dorsal", "Costas Superior", "Bíceps"],
      ["Deltoides", "Trapézio", "Abdômen"],
      ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
    ],
  },
  5: {
    type: "ABCDE",
    groups: [
      ["Peitorais"],
      ["Dorsal", "Costas Superior"],
      ["Deltoides", "Trapézio"],
      ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
      ["Bíceps", "Tríceps", "Abdômen"],
    ],
  },
  6: {
    type: "Push/Pull/Legs x2",
    groups: [
      ["Peitorais", "Deltoides", "Tríceps"],
      ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
      ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
      ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
      ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
      ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos", "Abdômen"],
    ],
  },
};

// Nomes das rotinas por letra
const ROUTINE_LABELS = ["A", "B", "C", "D", "E", "F"];

// Nomes amigáveis para grupos musculares
const MUSCLE_GROUP_NAMES: Record<string, string> = {
  "Peitorais": "Peito",
  "Dorsal": "Costas",
  "Costas Superior": "Costas",
  "Deltoides": "Ombros",
  "Trapézio": "Trapézio",
  "Quadríceps": "Pernas",
  "Posterior de Coxa": "Pernas",
  "Panturrilhas": "Panturrilhas",
  "Glúteos": "Glúteos",
  "Bíceps": "Bíceps",
  "Tríceps": "Tríceps",
  "Abdômen": "Abdômen",
};

// Configuração de sets/reps por objetivo
function getSetsReps(goal: string, level: string): { sets: number; reps: string } {
  const isInitiante = level === "iniciante";

  if (goal.toLowerCase().includes("hipertrofia") || goal.toLowerCase().includes("massa")) {
    return { sets: isInitiante ? 3 : 4, reps: "8-12" };
  }
  if (goal.toLowerCase().includes("força")) {
    return { sets: isInitiante ? 3 : 5, reps: "4-6" };
  }
  if (goal.toLowerCase().includes("emagrecimento")) {
    return { sets: 3, reps: "12-15" };
  }
  if (goal.toLowerCase().includes("condicionamento")) {
    return { sets: 3, reps: "15-20" };
  }
  // Default: saúde e bem-estar
  return { sets: 3, reps: "10-12" };
}

// Quantos exercícios por rotina baseado no tempo disponível
function getExercisesPerRoutine(timePerSession: number): number {
  if (timePerSession <= 45) return 5;
  if (timePerSession <= 60) return 6;
  if (timePerSession <= 75) return 7;
  return 8;
}

// Shuffle array (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Gera o nome da rotina baseado nos grupos musculares
function getRoutineName(label: string, muscleGroups: string[]): string {
  const uniqueNames = [...new Set(muscleGroups.map((m) => MUSCLE_GROUP_NAMES[m] || m))];
  return `${label} - ${uniqueNames.slice(0, 3).join(" e ")}`;
}

export function generateWorkout(
  profile: UserProfile,
  catalog: CatalogExercise[],
  locationType: LocationType = 'gym',
  daysAvailable?: number
): GeneratedWorkout {
  const rawDays = daysAvailable ?? profile.days_per_week;
  const days = Math.max(1, Math.min(6, rawDays));
  let split = SPLITS[days];

  // Quartel com 2 dias: AB Full Body (cobre o corpo todo em cada sessão)
  if (locationType === 'quartel' && days === 2) {
    split = {
      type: "AB Full Body",
      groups: [
        ["Peitorais", "Dorsal", "Quadríceps", "Deltoides", "Tríceps", "Abdômen"],
        ["Peitorais", "Dorsal", "Posterior de Coxa", "Deltoides", "Bíceps", "Glúteos"],
      ],
    };
  }
  const { sets, reps } = getSetsReps(profile.goal, profile.level);
  const maxExercises = getExercisesPerRoutine(profile.time_per_session);

  // Filtra catálogo por equipamento quando no quartel
  const filteredCatalog = locationType === 'quartel'
    ? catalog.filter(ex => QUARTEL_EQUIPMENT_WHITELIST.includes((ex.equipment || '').toLowerCase()))
    : catalog;

  // Indexa catálogo por músculo
  const byMuscle: Record<string, CatalogExercise[]> = {};
  for (const ex of filteredCatalog) {
    const muscle = ex.muscle;
    if (!byMuscle[muscle]) byMuscle[muscle] = [];
    byMuscle[muscle].push(ex);
  }

  // Músculos a evitar baseado nas restrições médicas
  const restrictions = (profile.medical_restrictions || "").toLowerCase();
  const avoidMuscles: string[] = [];
  if (restrictions.includes("joelho") || restrictions.includes("knee")) {
    avoidMuscles.push("Quadríceps", "Panturrilhas");
  }
  if (restrictions.includes("ombro") || restrictions.includes("shoulder")) {
    avoidMuscles.push("Deltoides");
  }
  if (restrictions.includes("coluna") || restrictions.includes("costas") || restrictions.includes("hérnia") || restrictions.includes("hernia")) {
    avoidMuscles.push("Coluna");
  }
  if (restrictions.includes("punho") || restrictions.includes("wrist")) {
    avoidMuscles.push("Antebraços");
  }

  const routines: GeneratedRoutine[] = split.groups.map((muscleGroups, idx) => {
    const label = ROUTINE_LABELS[idx];
    const selected: GeneratedExercise[] = [];
    const usedIds = new Set<string>();

    // Filtra grupos musculares evitando restrições
    const safeMuscles = muscleGroups.filter((m) => !avoidMuscles.includes(m));

    // Distribui exercícios igualmente entre os grupos musculares
    const exercisesPerMuscle = Math.max(1, Math.floor(maxExercises / safeMuscles.length));
    let remaining = maxExercises;

    // ── Prioridade de equipamentos para o Quartel ──────────────────────────
    if (locationType === 'quartel') {
      // 1. Aquecimento/Cárdio obrigatório (Esteira / Bike)
      const cardioExs = shuffle(
        filteredCatalog.filter(
          (ex) => ['cardio', 'stationary bike', 'elliptical machine'].includes((ex.equipment || '').toLowerCase())
        )
      );
      if (cardioExs.length > 0 && remaining > 0) {
        const cardio = cardioExs[0];
        usedIds.add(cardio.id);
        selected.push({ exercise_id: cardio.id, sets: 1, reps: "10 min", order: selected.length });
        remaining--;
      }

      // 2. Núcleo de força: 1-2 exercícios compostos com barbell (relevantes aos músculos do dia)
      const barbellExs = shuffle(
        filteredCatalog.filter(
          (ex) =>
            (ex.equipment || '').toLowerCase() === 'barbell' &&
            !usedIds.has(ex.id) &&
            safeMuscles.includes(ex.muscle)
        )
      );
      const barbellCount = Math.min(2, barbellExs.length, remaining);
      for (let i = 0; i < barbellCount; i++) {
        usedIds.add(barbellExs[i].id);
        selected.push({ exercise_id: barbellExs[i].id, sets, reps, order: selected.length });
        remaining--;
      }

      // 3. Acessórios: 1-2 exercícios de cabo (cable)
      const cableExs = shuffle(
        filteredCatalog.filter(
          (ex) =>
            (ex.equipment || '').toLowerCase() === 'cable' &&
            !usedIds.has(ex.id)
        )
      );
      const cableCount = Math.min(2, cableExs.length, remaining);
      for (let i = 0; i < cableCount; i++) {
        usedIds.add(cableExs[i].id);
        selected.push({ exercise_id: cableExs[i].id, sets, reps, order: selected.length });
        remaining--;
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    for (const muscle of safeMuscles) {
      if (remaining <= 0) break;

      const available = shuffle(byMuscle[muscle] || []).filter(
        (ex) => !usedIds.has(ex.id)
      );

      const count = Math.min(exercisesPerMuscle, available.length, remaining);

      for (let i = 0; i < count; i++) {
        usedIds.add(available[i].id);
        selected.push({
          exercise_id: available[i].id,
          sets,
          reps,
          order: selected.length,
        });
        remaining--;
      }
    }

    // Se sobrar espaço, preenche com exercícios dos grupos com mais opções
    if (remaining > 0) {
      for (const muscle of safeMuscles) {
        if (remaining <= 0) break;
        const available = shuffle(byMuscle[muscle] || []).filter(
          (ex) => !usedIds.has(ex.id)
        );
        for (const ex of available) {
          if (remaining <= 0) break;
          usedIds.add(ex.id);
          selected.push({
            exercise_id: ex.id,
            sets,
            reps,
            order: selected.length,
          });
          remaining--;
        }
      }
    }

    // Prioriza foco muscular do usuário: coloca exercícios do foco primeiro
    const focusMuscle = profile.focus_muscle;
    if (focusMuscle && focusMuscle !== "Sem foco específico") {
      selected.sort((a, b) => {
        const aFocus = filteredCatalog.find((c) => c.id === a.exercise_id)?.muscle === focusMuscle;
        const bFocus = filteredCatalog.find((c) => c.id === b.exercise_id)?.muscle === focusMuscle;
        if (aFocus && !bFocus) return -1;
        if (!aFocus && bFocus) return 1;
        return 0;
      });
      // Re-numera order
      selected.forEach((ex, i) => (ex.order = i));
    }

    // Para o quartel, garante que o exercício de cárdio permaneça na posição 0
    if (locationType === 'quartel' && selected.length > 0) {
      const cardioEquipments = ['cardio', 'stationary bike', 'elliptical machine'];
      const cardioIdx = selected.findIndex((ex) => {
        const cat = filteredCatalog.find((c) => c.id === ex.exercise_id);
        return cat && cardioEquipments.includes((cat.equipment || '').toLowerCase());
      });
      if (cardioIdx > 0) {
        const [cardio] = selected.splice(cardioIdx, 1);
        selected.unshift(cardio);
        selected.forEach((ex, i) => (ex.order = i));
      }
    }

    return {
      name: getRoutineName(label, safeMuscles),
      exercises: selected,
    };
  });

  return {
    workout_type: split.type,
    routines,
  };
}
