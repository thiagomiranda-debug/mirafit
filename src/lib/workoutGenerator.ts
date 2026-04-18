/**
 * Gerador de treino baseado em regras — sem IA, sem custos.
 *
 * Distribui grupos musculares pelos dias disponíveis,
 * seleciona exercícios do catálogo por grupo muscular,
 * e define sets/reps com base no objetivo do usuário.
 */

import { UserProfile, LocationType, RestrictionTag } from "@/types";

export interface CatalogExercise {
  id: string;
  name: string;
  muscle: string;
  equipment?: string;
}

/**
 * Categorias de equipamento visíveis ao usuário no inventário do quartel.
 * Cada `key` é a chave persistida em UserProfile.quartel_equipment,
 * e `tokens` são os valores reais do campo `equipment` no catálogo Firestore.
 */
export const QUARTEL_EQUIPMENT_CATEGORIES: {
  key: string;
  label: string;
  tokens: string[];
}[] = [
  { key: 'barbell', label: 'Barra', tokens: ['barbell'] },
  { key: 'olympic_barbell', label: 'Barra olímpica', tokens: ['olympic barbell'] },
  { key: 'ez_barbell', label: 'Barra EZ / W', tokens: ['ez barbell'] },
  { key: 'trap_bar', label: 'Trap bar', tokens: ['trap bar'] },
  { key: 'dumbbell', label: 'Halter', tokens: ['dumbbell'] },
  { key: 'kettlebell', label: 'Kettlebell', tokens: ['kettlebell'] },
  { key: 'cable', label: 'Cabo / Polia', tokens: ['cable'] },
  {
    key: 'body_weight',
    label: 'Peso corporal',
    tokens: ['body weight', 'body_weight', 'weighted_body_weight', 'weighted'],
  },
  { key: 'assisted', label: 'Barra fixa / assistida', tokens: ['assisted'] },
  {
    key: 'leverage_machine',
    label: 'Máquina articulada',
    tokens: ['leverage machine', 'leverage_machine'],
  },
  { key: 'smith_machine', label: 'Smith machine', tokens: ['smith machine'] },
  { key: 'sled_machine', label: 'Leg press / Sled', tokens: ['sled machine'] },
  { key: 'band', label: 'Banda / elástico', tokens: ['band', 'resistance band'] },
  { key: 'medicine_ball', label: 'Medicine ball', tokens: ['medicine ball'] },
  { key: 'stability_ball', label: 'Bola suíça', tokens: ['stability ball'] },
  { key: 'bosu_ball', label: 'Bosu', tokens: ['bosu ball'] },
  { key: 'rope', label: 'Corda naval', tokens: ['rope'] },
  { key: 'roller', label: 'Roller / Rolo', tokens: ['roller', 'wheel roller'] },
  { key: 'tire', label: 'Pneu', tokens: ['tire'] },
  { key: 'hammer', label: 'Marreta', tokens: ['hammer'] },
  { key: 'stationary_bike', label: 'Bike ergométrica', tokens: ['stationary bike'] },
  { key: 'elliptical', label: 'Elíptico', tokens: ['elliptical machine'] },
  { key: 'stepmill', label: 'Escada / Stepmill', tokens: ['stepmill machine'] },
  { key: 'skierg', label: 'SkiErg', tokens: ['skierg machine'] },
  { key: 'ergometer', label: 'Ergômetro superior', tokens: ['upper body ergometer'] },
  { key: 'cardio', label: 'Cardio (genérico)', tokens: ['cardio'] },
];

/**
 * Default do Quartel: lista que geralmente existe nos quartéis (retro-compat
 * com o comportamento anterior à adição de categorias avançadas).
 */
export const QUARTEL_DEFAULT_EQUIPMENT_KEYS = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'cable',
  'body_weight',
  'leverage_machine',
  'stationary_bike',
  'elliptical',
  'cardio',
];

/** Whitelist de tokens (retro-compat): todos os tokens das categorias */
export const QUARTEL_EQUIPMENT_WHITELIST = QUARTEL_EQUIPMENT_CATEGORIES.flatMap((c) => c.tokens);

function resolveQuartelTokens(keys?: string[]): Set<string> {
  const source = keys && keys.length > 0 ? keys : QUARTEL_DEFAULT_EQUIPMENT_KEYS;
  const tokens = new Set<string>();
  for (const key of source) {
    const cat = QUARTEL_EQUIPMENT_CATEGORIES.find((c) => c.key === key);
    if (cat) cat.tokens.forEach((t) => tokens.add(t));
  }
  return tokens;
}

/** Músculos que tipicamente são trabalhados com exercícios compostos (multi-articulares) */
const COMPOUND_MUSCLES = new Set<string>([
  "Peitorais",
  "Dorsal",
  "Costas Superior",
  "Quadríceps",
  "Posterior de Coxa",
  "Deltoides",
  "Glúteos",
  "Trapézio",
]);

/** Prioridade de equipamento dentro da mesma categoria (menor = primeiro) */
const EQUIPMENT_PRIORITY: Record<string, number> = {
  "barbell": 0,
  "dumbbell": 1,
  "body weight": 2,
  "body_weight": 2,
  "weighted_body_weight": 2,
  "kettlebell": 3,
  "leverage machine": 4,
  "leverage_machine": 4,
  "cable": 5,
};

const CARDIO_EQUIPMENTS = new Set<string>([
  'cardio',
  'stationary bike',
  'elliptical machine',
]);

/** Mapeia tags estruturadas de restrição para músculos a evitar no split */
const RESTRICTION_TO_MUSCLES: Record<RestrictionTag, string[]> = {
  joelho: ["Quadríceps", "Panturrilhas"],
  ombro: ["Deltoides"],
  lombar: [],
  cervical: ["Trapézio"],
  punho: [],
  cotovelo: ["Bíceps", "Tríceps"],
  tornozelo: ["Panturrilhas"],
  quadril: ["Glúteos", "Posterior de Coxa"],
};

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

  // Filtra catálogo por equipamento quando no quartel, usando inventário
  // personalizado do usuário (fallback: whitelist padrão se não editou).
  const quartelTokens = resolveQuartelTokens(profile.quartel_equipment);
  const filteredCatalog = locationType === 'quartel'
    ? catalog.filter((ex) => quartelTokens.has((ex.equipment || '').toLowerCase()))
    : catalog;

  // Indexa catálogo por músculo
  const byMuscle: Record<string, CatalogExercise[]> = {};
  for (const ex of filteredCatalog) {
    const muscle = ex.muscle;
    if (!byMuscle[muscle]) byMuscle[muscle] = [];
    byMuscle[muscle].push(ex);
  }

  // Músculos a evitar — prioriza tags estruturadas, com fallback para texto livre
  const avoidSet = new Set<string>();
  const tags = profile.medical_restriction_tags || [];
  for (const tag of tags) {
    for (const m of RESTRICTION_TO_MUSCLES[tag] || []) avoidSet.add(m);
  }
  // Fallback: parse texto livre (usuário pode descrever em "outras")
  const freeText = (profile.medical_restrictions || "").toLowerCase();
  if (freeText.includes("joelho") || freeText.includes("knee")) {
    RESTRICTION_TO_MUSCLES.joelho.forEach((m) => avoidSet.add(m));
  }
  if (freeText.includes("ombro") || freeText.includes("shoulder")) {
    RESTRICTION_TO_MUSCLES.ombro.forEach((m) => avoidSet.add(m));
  }
  if (freeText.includes("cotovelo") || freeText.includes("elbow")) {
    RESTRICTION_TO_MUSCLES.cotovelo.forEach((m) => avoidSet.add(m));
  }
  if (freeText.includes("quadril") || freeText.includes("hip")) {
    RESTRICTION_TO_MUSCLES.quadril.forEach((m) => avoidSet.add(m));
  }
  const avoidMuscles = Array.from(avoidSet);

  const routines: GeneratedRoutine[] = split.groups.map((muscleGroups, idx) => {
    const label = ROUTINE_LABELS[idx];
    const selected: GeneratedExercise[] = [];
    const usedIds = new Set<string>();

    // Filtra grupos musculares evitando restrições
    const safeMuscles = muscleGroups.filter((m) => !avoidMuscles.includes(m));

    // Distribui exercícios igualmente entre os grupos musculares
    const exercisesPerMuscle = Math.max(1, Math.floor(maxExercises / safeMuscles.length));
    let remaining = maxExercises;

    // ── Aquecimento (Cárdio) — academia e quartel ────────────────────────
    const cardioExs = shuffle(
      filteredCatalog.filter(
        (ex) => CARDIO_EQUIPMENTS.has((ex.equipment || '').toLowerCase())
      )
    );
    if (cardioExs.length > 0 && remaining > 0) {
      const cardio = cardioExs[0];
      usedIds.add(cardio.id);
      selected.push({ exercise_id: cardio.id, sets: 1, reps: "10 min", order: selected.length });
      remaining--;
    }

    // ── Núcleo de força no Quartel: garante compostos (barbell + cable) ──
    if (locationType === 'quartel') {
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

    // Ordenação final: cardio primeiro → músculo foco → compostos → isoladores → equipamento
    const focusMuscle = profile.focus_muscle;
    const hasFocus = focusMuscle && focusMuscle !== "Sem foco específico";
    const catMap = new Map(filteredCatalog.map((c) => [c.id, c]));

    selected.sort((a, b) => {
      const catA = catMap.get(a.exercise_id);
      const catB = catMap.get(b.exercise_id);
      const equipA = (catA?.equipment || '').toLowerCase();
      const equipB = (catB?.equipment || '').toLowerCase();
      const muscleA = catA?.muscle || '';
      const muscleB = catB?.muscle || '';

      const scoreA =
        (CARDIO_EQUIPMENTS.has(equipA) ? 0 : 1000) +
        (hasFocus && muscleA === focusMuscle ? 0 : 100) +
        (COMPOUND_MUSCLES.has(muscleA) ? 0 : 50) +
        (EQUIPMENT_PRIORITY[equipA] ?? 6);
      const scoreB =
        (CARDIO_EQUIPMENTS.has(equipB) ? 0 : 1000) +
        (hasFocus && muscleB === focusMuscle ? 0 : 100) +
        (COMPOUND_MUSCLES.has(muscleB) ? 0 : 50) +
        (EQUIPMENT_PRIORITY[equipB] ?? 6);

      return scoreA - scoreB;
    });
    selected.forEach((ex, i) => (ex.order = i));

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
