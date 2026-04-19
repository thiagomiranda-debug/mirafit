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
  mandatory?: boolean;
}[] = [
  // ── Obrigatórios (sempre presentes no quartel) ───────────────────
  { key: 'crossover_cable',  label: 'Cross Over e Polia',   tokens: ['cable'],                                      mandatory: true },
  { key: 'adjustable_bench', label: 'Banco Articulado',      tokens: ['leverage machine', 'leverage_machine'],        mandatory: true },
  { key: 'treadmill',        label: 'Esteira Ergométrica',   tokens: ['cardio'],                                     mandatory: true },
  { key: 'stationary_bike',  label: 'Bicicleta Ergométrica', tokens: ['stationary bike'],                            mandatory: true },
  { key: 'power_rack',       label: 'Power Rack',            tokens: ['barbell', 'olympic barbell'],                 mandatory: true },
  { key: 'weight_plates',    label: 'Anilhas',               tokens: ['barbell', 'olympic barbell'],                 mandatory: true },
  { key: 'barbell_bars',     label: 'Barras',                tokens: ['barbell', 'olympic barbell', 'ez barbell'],   mandatory: true },
  { key: 'dumbbell',         label: 'Halteres',              tokens: ['dumbbell'],                                   mandatory: true },
  // ── Opcionais (selecionáveis pelo usuário) ───────────────────────
  { key: 'barbell',          label: 'Barra',               tokens: ['barbell'] },
  { key: 'olympic_barbell',  label: 'Barra olímpica',      tokens: ['olympic barbell'] },
  { key: 'ez_barbell',       label: 'Barra EZ / W',        tokens: ['ez barbell'] },
  { key: 'trap_bar',         label: 'Trap bar',            tokens: ['trap bar'] },
  { key: 'kettlebell',       label: 'Kettlebell',          tokens: ['kettlebell'] },
  { key: 'cable',            label: 'Cabo / Polia',        tokens: ['cable'] },
  { key: 'body_weight',      label: 'Peso corporal',       tokens: ['body weight', 'body_weight', 'weighted_body_weight', 'weighted'] },
  { key: 'assisted',         label: 'Barra fixa / assistida', tokens: ['assisted'] },
  { key: 'leverage_machine', label: 'Máquina articulada',  tokens: ['leverage machine', 'leverage_machine'] },
  { key: 'smith_machine',    label: 'Smith machine',       tokens: ['smith machine'] },
  { key: 'sled_machine',     label: 'Leg press / Sled',    tokens: ['sled machine'] },
  { key: 'band',             label: 'Banda / elástico',    tokens: ['band', 'resistance band'] },
  { key: 'medicine_ball',    label: 'Medicine ball',       tokens: ['medicine ball'] },
  { key: 'stability_ball',   label: 'Bola suíça',          tokens: ['stability ball'] },
  { key: 'bosu_ball',        label: 'Bosu',                tokens: ['bosu ball'] },
  { key: 'rope',             label: 'Corda naval',         tokens: ['rope'] },
  { key: 'roller',           label: 'Roller / Rolo',       tokens: ['roller', 'wheel roller'] },
  { key: 'tire',             label: 'Pneu',                tokens: ['tire'] },
  { key: 'hammer',           label: 'Marreta',             tokens: ['hammer'] },
  { key: 'elliptical',       label: 'Elíptico',            tokens: ['elliptical machine'] },
  { key: 'stepmill',         label: 'Escada / Stepmill',   tokens: ['stepmill machine'] },
  { key: 'skierg',           label: 'SkiErg',              tokens: ['skierg machine'] },
  { key: 'ergometer',        label: 'Ergômetro superior',  tokens: ['upper body ergometer'] },
  { key: 'cardio',           label: 'Cardio (genérico)',   tokens: ['cardio'] },
];

/**
 * Default do Quartel: lista que geralmente existe nos quartéis (retro-compat
 * com o comportamento anterior à adição de categorias avançadas).
 */
export const QUARTEL_DEFAULT_EQUIPMENT_KEYS = [
  'kettlebell',
  'body_weight',
  'leverage_machine',
  'elliptical',
];

/** Whitelist de tokens (retro-compat): todos os tokens das categorias */
export const QUARTEL_EQUIPMENT_WHITELIST = QUARTEL_EQUIPMENT_CATEGORIES.flatMap((c) => c.tokens);

function resolveQuartelTokens(keys?: string[]): Set<string> {
  const tokens = new Set<string>();
  // 1. Sempre inclui tokens dos equipamentos obrigatórios
  for (const cat of QUARTEL_EQUIPMENT_CATEGORIES) {
    if (cat.mandatory) cat.tokens.forEach((t) => tokens.add(t));
  }
  // 2. Adiciona tokens dos opcionais selecionados pelo usuário
  const optionalKeys = keys && keys.length > 0 ? keys : QUARTEL_DEFAULT_EQUIPMENT_KEYS;
  for (const key of optionalKeys) {
    const cat = QUARTEL_EQUIPMENT_CATEGORIES.find((c) => c.key === key && !c.mandatory);
    if (cat) cat.tokens.forEach((t) => tokens.add(t));
  }
  return tokens;
}

/** Músculos trabalhados por exercícios compostos (multi-articulares) */
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

/** Peso muscular para distribuição de volume dentro da rotina.
 * Músculos maiores recebem proporcionalmente mais exercícios. */
const MUSCLE_WEIGHTS: Record<string, number> = {
  "Peitorais": 3,
  "Dorsal": 3,
  "Quadríceps": 3,
  "Posterior de Coxa": 2,
  "Glúteos": 2,
  "Costas Superior": 2,
  "Deltoides": 2,
  "Trapézio": 1,
  "Bíceps": 1,
  "Tríceps": 1,
  "Abdômen": 1,
  "Panturrilhas": 1,
  "Adutores": 1,
  "Abdutores": 1,
  "Antebraços": 1,
};

/** Boost adicional de peso muscular por gênero, somado ao MUSCLE_WEIGHTS base.
 * Mulheres recebem mais volume em inferiores/glúteos; homens em superiores. */
const GENDER_MUSCLE_BOOSTS: Record<string, Record<string, number>> = {
  feminino: {
    "Glúteos": 3,
    "Posterior de Coxa": 2,
    "Quadríceps": 1,
    "Adutores": 1,
  },
  masculino: {
    "Peitorais": 2,
    "Dorsal": 2,
    "Deltoides": 1,
    "Bíceps": 1,
    "Tríceps": 1,
  },
};

/** Score base por equipamento (maior = mais preferido) — reflete hierarquia
 * clássica: pesos livres > máquinas articuladas > máquinas de isolamento. */
const EQUIPMENT_SCORE: Record<string, number> = {
  "barbell": 35,
  "olympic barbell": 35,
  "trap bar": 32,
  "dumbbell": 28,
  "ez barbell": 24,
  "kettlebell": 22,
  "body weight": 20,
  "weighted_body_weight": 18,
  "weighted": 18,
  "smith machine": 16,
  "cable": 18,
  "leverage machine": 14,
  "leverage_machine": 14,
  "sled machine": 14,
  "assisted": 10,
  "resistance band": 8,
  "band": 8,
  "medicine ball": 6,
  "stability ball": 5,
  "bosu ball": 4,
  "rope": 8,
  "roller": 3,
};

const CARDIO_EQUIPMENTS = new Set<string>([
  'cardio',
  'stationary bike',
  'elliptical machine',
  'stepmill machine',
  'skierg machine',
  'upper body ergometer',
]);

/**
 * Keywords dos exercícios "gold" por grupo muscular — os movimentos mais
 * efetivos e estudados de cada grupo. Matches em `name` (inglês do catálogo)
 * ganham um boost grande no score.
 */
const TOP_EXERCISE_PATTERNS: Record<string, RegExp[]> = {
  "Peitorais": [
    /bench press/i,
    /incline.*(press|bench)/i,
    /decline.*(press|bench)/i,
    /dumbbell press/i,
    /dumbbell fly|chest fly/i,
    /push.?up/i,
    /\bdip\b/i,
    /cable crossover/i,
  ],
  "Dorsal": [
    /pull.?up/i,
    /chin.?up/i,
    /lat.?pull.?down|pulldown/i,
    /\brow\b/i,
    /pullover/i,
  ],
  "Costas Superior": [
    /bent.?over row|barbell row|seal row/i,
    /\brow\b/i,
    /face.?pull/i,
    /reverse fly/i,
  ],
  "Trapézio": [
    /shrug/i,
    /upright.?row/i,
    /farmer/i,
    /rack pull/i,
  ],
  "Quadríceps": [
    /\bsquat\b/i,
    /leg press/i,
    /front squat/i,
    /\blunge\b/i,
    /bulgarian.*split/i,
    /leg extension/i,
    /hack squat/i,
    /step.?up/i,
  ],
  "Posterior de Coxa": [
    /deadlift/i,
    /romanian|\brdl\b/i,
    /stiff.?leg/i,
    /good.?morning/i,
    /\bleg curl\b|hamstring curl/i,
    /glute.?ham/i,
  ],
  "Glúteos": [
    /hip thrust/i,
    /glute bridge/i,
    /romanian|\brdl\b/i,
    /bulgarian.*split/i,
    /cable.*pull.?through/i,
    /kickback/i,
    /\bsquat\b/i,
  ],
  "Deltoides": [
    /overhead press|shoulder press/i,
    /military press/i,
    /push.?press/i,
    /arnold press/i,
    /lateral raise/i,
    /front raise/i,
    /rear delt/i,
    /upright.?row/i,
  ],
  "Bíceps": [
    /barbell curl/i,
    /dumbbell curl/i,
    /hammer curl/i,
    /preacher/i,
    /incline.*curl/i,
    /chin.?up/i,
  ],
  "Tríceps": [
    /close.?grip.*(press|bench)/i,
    /skull.?crusher|lying triceps/i,
    /triceps.*extension|french press/i,
    /\bpushdown\b|push.?down/i,
    /\bdip\b/i,
    /overhead.*triceps/i,
  ],
  "Abdômen": [
    /plank/i,
    /crunch/i,
    /leg raise/i,
    /ab.?wheel/i,
    /hanging.*raise/i,
    /russian twist/i,
    /hollow/i,
    /\bsit.?up\b/i,
  ],
  "Panturrilhas": [
    /calf raise/i,
    /calf press/i,
    /donkey calf/i,
  ],
  "Antebraços": [
    /wrist curl/i,
    /reverse curl/i,
    /farmer/i,
  ],
};

/** Regex amplo para detectar movimento composto (multi-articular) */
const COMPOUND_NAME_RE =
  /(?:bench press|overhead press|shoulder press|military press|push.?press|\bsquat\b|leg press|deadlift|romanian|\brdl\b|good.?morning|\blunge\b|bulgarian|step.?up|\brow\b|pull.?up|pull.?down|chin.?up|\bdip\b|hip thrust|clean|snatch|thruster|trap.?bar|hack squat)/i;

const ISOLATION_NAME_RE =
  /(?:curl|fly|raise|extension|kickback|pullover|crunch|shrug|calf|wrist|pushdown|push.?down|skull|triceps.*extension)/i;

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

/** Base sets/reps por objetivo e nível. Valores são ajustados depois por
 * experiência (months_training), idade (age_group) e tipo de exercício
 * (compound vs isolation). */
function getSetsReps(goal: string, level: string): { sets: number; reps: string } {
  const isInitiante = level === "iniciante";
  const g = goal.toLowerCase();

  if (g.includes("hipertrofia") || g.includes("massa")) {
    return { sets: isInitiante ? 3 : 4, reps: "8-12" };
  }
  if (g.includes("força")) {
    return { sets: isInitiante ? 3 : 5, reps: "4-6" };
  }
  if (g.includes("emagrecimento")) {
    return { sets: 3, reps: "12-15" };
  }
  if (g.includes("condicionamento")) {
    return { sets: 3, reps: "15-20" };
  }
  return { sets: 3, reps: "10-12" };
}

/** Reps ajustadas pelo tipo do exercício: compostos com reps um pouco mais
 * baixas (carga mais alta), isoladores com reps mais altas. */
function adjustReps(baseReps: string, isCompound: boolean): string {
  if (isCompound) {
    if (baseReps === "8-12") return "6-10";
    if (baseReps === "10-12") return "8-10";
    if (baseReps === "12-15") return "10-12";
    if (baseReps === "15-20") return "12-15";
    return baseReps;
  }
  if (baseReps === "4-6") return "8-10";
  if (baseReps === "6-10") return "10-12";
  if (baseReps === "8-12") return "10-15";
  if (baseReps === "10-12") return "12-15";
  return baseReps;
}

/** Ajuste de sets por experiência e idade. Iniciantes recentes e 40+
 * reduzem 1 set pra controlar volume e risco de overuse. */
function adjustSets(
  base: number,
  monthsTraining: number | undefined,
  ageGroup: string | undefined,
  isCompound: boolean,
): number {
  let s = base;
  if ((monthsTraining ?? 99) < 3) s = Math.max(2, s - 1);
  if (ageGroup === "over_40") s = Math.max(2, s - 1);
  // Compostos podem carregar 1 set extra quando avançado e sem restrição — já
  // embutido no base pra "força"; aqui só garantimos mínimo 2.
  if (!isCompound && base >= 4) s = Math.min(s, 4);
  return s;
}

/** Orçamento de exercícios por rotina baseado em sets/tempo.
 * Aproximação: cada set com descanso ≈ 2.5 min; 10 min de aquecimento.
 * exercises ≈ (time - 10) / (sets * 2.5) */
function getExercisesPerRoutine(timePerSession: number, setsPerEx: number): number {
  const warmup = 10;
  const minutesPerSet = 2.4;
  const raw = Math.floor((timePerSession - warmup) / (setsPerEx * minutesPerSet));
  return Math.max(4, Math.min(9, raw));
}

function isCompoundExercise(ex: CatalogExercise): boolean {
  const name = ex.name || "";
  if (ISOLATION_NAME_RE.test(name)) return false;
  if (COMPOUND_NAME_RE.test(name)) return true;
  return COMPOUND_MUSCLES.has(ex.muscle);
}

/** Score de efetividade do exercício para o músculo-alvo.
 * Combina: equipamento (free weights > machines), padrão composto,
 * correspondência com lista "gold" por músculo, viés por gênero. */
function scoreExercise(
  ex: CatalogExercise,
  muscle: string,
  profile: UserProfile,
): number {
  const name = ex.name || "";
  const equip = (ex.equipment || "").toLowerCase();
  let score = EQUIPMENT_SCORE[equip] ?? 0;

  if (COMPOUND_NAME_RE.test(name)) score += 22;
  else if (ISOLATION_NAME_RE.test(name)) score += 6;

  const patterns = TOP_EXERCISE_PATTERNS[muscle] || [];
  if (patterns.some((re) => re.test(name))) score += 40;

  // Viés por gênero: ênfase em glúteo/posterior para público feminino.
  if (profile.gender === "feminino") {
    if (muscle === "Glúteos" || muscle === "Posterior de Coxa") {
      if (/hip thrust|romanian|\brdl\b|bridge|kickback|bulgarian/i.test(name)) {
        score += 15;
      }
    }
  }

  // Iniciante absoluto: prefere máquinas guiadas (menor risco) sobre barra
  const isRawBeginner =
    profile.level === "iniciante" && (profile.months_training ?? 0) < 3;
  if (isRawBeginner && (equip === "leverage machine" || equip === "smith machine")) {
    score += 10;
  }

  // 40+: reduz levemente score de exercícios com alto stress articular
  if (profile.age_group === "over_40") {
    if (/\bsquat\b|deadlift|clean|snatch|jump/i.test(name)) score -= 8;
  }

  return score;
}

/** Distribui `budget` exercícios entre `muscles` respeitando pesos musculares
 * e adicionando boost para o músculo-foco. Garante mínimo 1 por músculo e
 * soma exatamente o orçamento. */
function allocateBudget(
  muscles: string[],
  budget: number,
  focusMuscle: string | undefined,
  gender?: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (muscles.length === 0) return result;

  const genderBoosts = gender ? (GENDER_MUSCLE_BOOSTS[gender] ?? {}) : {};
  const entries = muscles.map((m) => ({
    muscle: m,
    weight: (MUSCLE_WEIGHTS[m] ?? 1) + (m === focusMuscle ? 2 : 0) + (genderBoosts[m] ?? 0),
  }));

  // Garante 1 por músculo quando cabe
  const baseline = Math.min(muscles.length, budget);
  for (const e of entries) result.set(e.muscle, 0);
  for (let i = 0; i < baseline; i++) {
    result.set(entries[i].muscle, 1);
  }
  let remaining = budget - baseline;

  // Distribui resto proporcionalmente (ordem decrescente de peso)
  const sorted = [...entries].sort((a, b) => b.weight - a.weight);
  while (remaining > 0) {
    let allocated = false;
    for (const e of sorted) {
      if (remaining <= 0) break;
      // teto: músculos grandes podem receber até 4, pequenos até 2
      const cap = (MUSCLE_WEIGHTS[e.muscle] ?? 1) >= 2 ? 4 : 2;
      const cur = result.get(e.muscle) ?? 0;
      if (cur < cap) {
        result.set(e.muscle, cur + 1);
        remaining--;
        allocated = true;
      }
    }
    if (!allocated) break;
  }

  return result;
}

/** Chave de dedup por "padrão de movimento". Dois exercícios com o mesmo
 * equipamento + músculo alvo são considerados redundantes na mesma sessão. */
function patternKey(ex: CatalogExercise): string {
  return `${ex.muscle}|${(ex.equipment || "").toLowerCase()}`;
}

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

  if (locationType === 'quartel' && days === 2) {
    split = {
      type: "AB Full Body",
      groups: [
        ["Peitorais", "Dorsal", "Quadríceps", "Deltoides", "Tríceps", "Abdômen"],
        ["Peitorais", "Dorsal", "Posterior de Coxa", "Deltoides", "Bíceps", "Glúteos"],
      ],
    };
  }

  const { sets: baseSets, reps: baseReps } = getSetsReps(profile.goal, profile.level);
  const maxExercises = getExercisesPerRoutine(profile.time_per_session, baseSets);

  // Catálogo filtrado por equipamento (só aplica no quartel)
  const quartelTokens = resolveQuartelTokens(profile.quartel_equipment);
  const filteredCatalog = locationType === 'quartel'
    ? catalog.filter((ex) => quartelTokens.has((ex.equipment || '').toLowerCase()))
    : catalog;

  // Catálogo por músculo, já ordenado por score de efetividade (maior 1º)
  const byMuscle: Record<string, CatalogExercise[]> = {};
  for (const ex of filteredCatalog) {
    if (!byMuscle[ex.muscle]) byMuscle[ex.muscle] = [];
    byMuscle[ex.muscle].push(ex);
  }
  for (const m of Object.keys(byMuscle)) {
    byMuscle[m] = byMuscle[m]
      .map((ex) => ({ ex, s: scoreExercise(ex, m, profile) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.ex);
  }

  // Músculos a evitar (tags estruturadas + fallback texto livre)
  const avoidSet = new Set<string>();
  for (const tag of profile.medical_restriction_tags || []) {
    for (const m of RESTRICTION_TO_MUSCLES[tag] || []) avoidSet.add(m);
  }
  const freeText = (profile.medical_restrictions || "").toLowerCase();
  const freeTextMap: [string, RestrictionTag][] = [
    ["joelho", "joelho"], ["knee", "joelho"],
    ["ombro", "ombro"], ["shoulder", "ombro"],
    ["cotovelo", "cotovelo"], ["elbow", "cotovelo"],
    ["quadril", "quadril"], ["hip", "quadril"],
    ["lombar", "lombar"], ["cervical", "cervical"],
    ["punho", "punho"], ["wrist", "punho"],
    ["tornozelo", "tornozelo"], ["ankle", "tornozelo"],
  ];
  for (const [kw, tag] of freeTextMap) {
    if (freeText.includes(kw)) {
      for (const m of RESTRICTION_TO_MUSCLES[tag] || []) avoidSet.add(m);
    }
  }
  const avoidMuscles = Array.from(avoidSet);

  const focusMuscle =
    profile.focus_muscle && profile.focus_muscle !== "Sem foco específico"
      ? profile.focus_muscle
      : undefined;

  const routines: GeneratedRoutine[] = split.groups.map((muscleGroups, idx) => {
    const label = ROUTINE_LABELS[idx];
    const safeMuscles = muscleGroups.filter((m) => !avoidMuscles.includes(m));

    let remaining = maxExercises;
    const usedIds = new Set<string>();
    const usedPatterns = new Set<string>();
    const selected: GeneratedExercise[] = [];

    // ── 1) Aquecimento cardio (quando disponível) ────────────────────────
    const cardioPool = filteredCatalog.filter((ex) =>
      CARDIO_EQUIPMENTS.has((ex.equipment || '').toLowerCase())
    );
    if (cardioPool.length > 0 && remaining > 0) {
      const cardio = shuffle(cardioPool)[0];
      usedIds.add(cardio.id);
      selected.push({
        exercise_id: cardio.id,
        sets: 1,
        reps: "5-10 min",
        order: selected.length,
      });
      remaining--;
    }

    // ── 2) Orçamento por músculo (distribuição balanceada) ───────────────
    const allocation = allocateBudget(safeMuscles, remaining, focusMuscle, profile.gender);

    // Ordem de processamento: foco primeiro, depois compostos grandes,
    // depois auxiliares. Garante que compostos grandes entrem antes de
    // esgotar o orçamento com isoladores.
    const processingOrder = [...safeMuscles].sort((a, b) => {
      if (a === focusMuscle) return -1;
      if (b === focusMuscle) return 1;
      const wa = MUSCLE_WEIGHTS[a] ?? 1;
      const wb = MUSCLE_WEIGHTS[b] ?? 1;
      if (wa !== wb) return wb - wa;
      const ca = COMPOUND_MUSCLES.has(a) ? 0 : 1;
      const cb = COMPOUND_MUSCLES.has(b) ? 0 : 1;
      return ca - cb;
    });

    for (const muscle of processingOrder) {
      if (remaining <= 0) break;
      const want = allocation.get(muscle) ?? 0;
      if (want <= 0) continue;

      const pool = (byMuscle[muscle] || []).filter(
        (ex) => !usedIds.has(ex.id) && !usedPatterns.has(patternKey(ex))
      );

      // Garante pelo menos 1 composto por músculo quando possível
      const picked: CatalogExercise[] = [];
      const compoundFirst = pool.find((ex) => isCompoundExercise(ex));
      if (compoundFirst && picked.length < want) picked.push(compoundFirst);
      for (const ex of pool) {
        if (picked.length >= want) break;
        if (picked.some((p) => p.id === ex.id)) continue;
        picked.push(ex);
      }

      for (const ex of picked) {
        if (remaining <= 0) break;
        const isCompound = isCompoundExercise(ex);
        const sets = adjustSets(
          baseSets,
          profile.months_training,
          profile.age_group,
          isCompound,
        );
        const reps = adjustReps(baseReps, isCompound);
        usedIds.add(ex.id);
        usedPatterns.add(patternKey(ex));
        selected.push({
          exercise_id: ex.id,
          sets,
          reps,
          order: selected.length,
        });
        remaining--;
      }
    }

    // ── 3) Preenche sobras (se orçamento sobrou) com próximos melhores ───
    if (remaining > 0) {
      const leftovers: { ex: CatalogExercise; s: number }[] = [];
      for (const m of safeMuscles) {
        for (const ex of byMuscle[m] || []) {
          if (usedIds.has(ex.id) || usedPatterns.has(patternKey(ex))) continue;
          leftovers.push({ ex, s: scoreExercise(ex, m, profile) });
        }
      }
      leftovers.sort((a, b) => b.s - a.s);
      for (const { ex } of leftovers) {
        if (remaining <= 0) break;
        const isCompound = isCompoundExercise(ex);
        const sets = adjustSets(
          baseSets,
          profile.months_training,
          profile.age_group,
          isCompound,
        );
        const reps = adjustReps(baseReps, isCompound);
        usedIds.add(ex.id);
        usedPatterns.add(patternKey(ex));
        selected.push({
          exercise_id: ex.id,
          sets,
          reps,
          order: selected.length,
        });
        remaining--;
      }
    }

    // ── 4) Ordenação final: cardio → foco → compostos → auxiliares ───────
    const catMap = new Map(filteredCatalog.map((c) => [c.id, c]));
    selected.sort((a, b) => {
      const catA = catMap.get(a.exercise_id);
      const catB = catMap.get(b.exercise_id);
      if (!catA || !catB) return 0;
      const equipA = (catA.equipment || '').toLowerCase();
      const equipB = (catB.equipment || '').toLowerCase();
      const muscleA = catA.muscle;
      const muscleB = catB.muscle;

      const rankA =
        (CARDIO_EQUIPMENTS.has(equipA) ? 0 : 1000) +
        (focusMuscle && muscleA === focusMuscle ? 0 : 100) +
        (isCompoundExercise(catA) ? 0 : 50) -
        (EQUIPMENT_SCORE[equipA] ?? 0) * 0.1;
      const rankB =
        (CARDIO_EQUIPMENTS.has(equipB) ? 0 : 1000) +
        (focusMuscle && muscleB === focusMuscle ? 0 : 100) +
        (isCompoundExercise(catB) ? 0 : 50) -
        (EQUIPMENT_SCORE[equipB] ?? 0) * 0.1;
      return rankA - rankB;
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
