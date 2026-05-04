/**
 * Gerador de treino baseado em regras — sem IA, sem custos.
 *
 * Distribui grupos musculares pelos dias disponíveis,
 * seleciona exercícios do catálogo por grupo muscular,
 * e define sets/reps com base no objetivo do usuário.
 */

import { UserProfile, LocationType, RestrictionTag, CyclePhase } from "@/types";

export interface CatalogExercise {
  id: string;
  name: string;
  muscle: string;
  equipment?: string;
}

export interface SplitVariant {
  /** ID estável da variante — gravado em Workout.split_variant_id */
  id: string;
  /** Label exibido ao usuário (ex: "ABCD", "Push/Pull/Legs x2"). Variantes do mesmo número de dias podem compartilhar o mesmo label. */
  type: string;
  /** Matriz dias × grupos musculares */
  groups: string[][];
  /** Gênero para qual esta variante é otimizada. Feminino: ênfase inferior/glúteo. Masculino: ênfase superior. */
  gender: 'masculino' | 'feminino';
}

export interface PreviousCycleContext {
  splitVariantId: string;
  cyclePhase: CyclePhase;
  /** Map músculo → lista de equipamentos (tokens lowercase) usados no ciclo anterior. Cardio é filtrado. */
  muscleEquipmentHistory: Record<string, string[]>;
  /** Data do último treino gerado. Usado pela Camada 2 (mesociclo) — a fase
   *  só alterna se o ciclo anterior tem ≥ 4 semanas. Mantém periodização real. */
  previousGeneratedAt?: Date;
}

export interface GenerateWorkoutResult {
  workout_type: string;
  split_variant_id: string;
  cycle_phase: CyclePhase;
  routines: GeneratedRoutine[];
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

/** Normaliza aliases e formas variantes de nomes de grupos musculares para a
 *  forma canônica usada no Firestore. Resolve o mismatch entre o que o Split
 *  pede (ex: "Dorsal") e o que o banco armazena (ex: "Dorsais"). */
const MUSCLE_NORMALIZER: Record<string, string> = {
  "Peitoral": "Peitorais",
  "Peito": "Peitorais",
  "Ombro": "Deltoides",
  "Ombros": "Deltoides",
  "Costas": "Dorsais",
  "Dorsal": "Dorsais",
  "Glúteo": "Glúteos",
  "Panturrilha": "Panturrilhas",
  "Bíceps": "Bíceps",
  "Tríceps": "Tríceps",
  "Trapézio": "Trapézio",
  "Abdômen": "Abdômen",
};

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

export const CARDIO_EQUIPMENTS = new Set<string>([
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

/**
 * CHANGE #4/#5: Padrões de movimento — base para:
 *   (a) restrições articulares que banem PADRÕES, não músculos inteiros;
 *   (b) distinção entre exercício BASE (composto primário) e ACESSÓRIO,
 *       que define onde aplicar a penalidade de variedade de equipamento.
 */
const MOVEMENT_PATTERNS = {
  knee_dominant: /\bsquat\b|agachamento|leg press|leg extension|extensora|hack squat|\blunge\b|afundo|step.?up|bulgarian/i,
  hip_dominant: /deadlift|levantamento terra|\brdl\b|stiff|hip thrust|elevação pélvica|good.?morning|glute bridge|\bleg curl\b|flexora|kickback/i,
  overhead: /overhead press|shoulder press|desenvolvimento|military press|push.?press|arnold/i,
  horizontal_press: /bench press|supino|chest press|push.?up|flexão|\bdip\b|mergulho|chest fly|crucifixo/i,
  vertical_pull: /pull.?up|chin.?up|barra fixa|lat.?pull.?down|puxada/i,
  horizontal_pull: /\brow\b|remada|face.?pull|reverse fly|crucifixo invertido/i,
  spinal_axial_load: /\bsquat\b|agachamento|deadlift|levantamento terra|overhead press|desenvolvimento|military press|front squat/i,
  wrist_flexed_loaded: /barbell curl|rosca|\bcurl\b(?!.*incline)|wrist curl/i,
} as const;

type MovementPattern = keyof typeof MOVEMENT_PATTERNS;

function exerciseHasPattern(ex: CatalogExercise, pattern: MovementPattern): boolean {
  return MOVEMENT_PATTERNS[pattern].test(ex.name || "");
}

/** Compostos primários: a "espinha dorsal" do treino — onde a progressão de
 *  carga acontece. Trocar estes por variedade mata o ganho de força. */
const PRIMARY_COMPOUND_RE =
  /(?:bench press|supino|overhead press|desenvolvimento|military press|push.?press|\bsquat\b|agachamento|hack|leg press|deadlift|levantamento terra|romanian|\brdl\b|stiff|hip thrust|elevação pélvica|pull.?up|chin.?up|barra fixa|lat.?pull.?down|puxada|bent.?over row|barbell row|remada)/i;

function isPrimaryCompound(ex: CatalogExercise): boolean {
  return PRIMARY_COMPOUND_RE.test(ex.name || "");
}

function isAccessoryOrIsolation(ex: CatalogExercise): boolean {
  return !isPrimaryCompound(ex);
}

/**
 * CHANGE #5: Restrições banem PADRÕES DE MOVIMENTO, não músculos inteiros.
 * "Joelho ruim" não tira o dia de perna — tira agachamento e empurra pra
 * RDL/hip thrust/leg curl. Isso preserva volume e gluteo/posterior.
 */
const RESTRICTION_BAN_PATTERNS: Record<RestrictionTag, MovementPattern[]> = {
  joelho:    ['knee_dominant'],
  ombro:     ['overhead'],
  lombar:    ['spinal_axial_load'],
  cervical:  ['overhead'],
  punho:     ['wrist_flexed_loaded'],
  cotovelo:  [],
  tornozelo: [],
  quadril:   [],
};

/** Padrões a PROMOVER quando há restrição (substitui o que foi banido) */
const RESTRICTION_PREFER_PATTERNS: Record<RestrictionTag, MovementPattern[]> = {
  joelho:    ['hip_dominant'],
  ombro:     ['horizontal_press', 'horizontal_pull'],
  lombar:    ['horizontal_press', 'horizontal_pull'],
  cervical:  ['horizontal_press', 'horizontal_pull'],
  punho:     [],
  cotovelo:  [],
  tornozelo: [],
  quadril:   ['knee_dominant'],
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


/**
 * Pool de variantes curadas por número de dias. O seletor escolhe via
 * round-robin, priorizando uma variante DIFERENTE da última gerada para
 * romper adaptação.
 */
const SPLIT_VARIANTS: Record<number, SplitVariant[]> = {
  1: [
    {
      id: 'fullbody_classico',
      type: 'Full Body',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal", "Deltoides", "Quadríceps", "Posterior de Coxa", "Bíceps", "Tríceps", "Abdômen"],
      ],
    },
  ],
  2: [
    // ── Masculino ────────────────────────────────────────────────────────────
    {
      id: 'ab_sinergista',
      type: 'AB',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps", "Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
      ],
    },
    {
      id: 'ab_upper_lower',
      type: 'AB',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal", "Costas Superior", "Deltoides", "Bíceps", "Tríceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas", "Abdômen"],
      ],
    },
    {
      id: 'm_ab_push_pull',
      type: 'AB',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps", "Quadríceps", "Abdômen"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps", "Posterior de Coxa"],
      ],
    },
    // ── Feminino ─────────────────────────────────────────────────────────────
    {
      id: 'f_ab_lower_upper',
      type: 'AB',
      gender: 'feminino',
      groups: [
        ["Quadríceps", "Glúteos", "Posterior de Coxa", "Adutores", "Panturrilhas", "Abdômen"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps", "Glúteos", "Abdômen"],
      ],
    },
    {
      id: 'f_ab_posterior_anterior',
      type: 'AB',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa", "Dorsal", "Costas Superior", "Abdômen"],
        ["Quadríceps", "Adutores", "Peitorais", "Deltoides", "Bíceps", "Tríceps"],
      ],
    },
    {
      id: 'f_ab_glutes_full',
      type: 'AB',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa", "Quadríceps", "Adutores", "Abdômen"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps", "Glúteos", "Panturrilhas"],
      ],
    },
  ],
  3: [
    // ── Masculino ────────────────────────────────────────────────────────────
    {
      id: 'abc_push_pull_legs',
      type: 'ABC',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos", "Abdômen"],
      ],
    },
    {
      id: 'abc_upper_lower_full',
      type: 'ABC',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Dorsal", "Costas Superior", "Bíceps", "Abdômen"],
      ],
    },
    {
      id: 'abc_antagonista',
      type: 'ABC',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Deltoides", "Trapézio", "Bíceps", "Tríceps", "Abdômen"],
      ],
    },
    // ── Feminino ─────────────────────────────────────────────────────────────
    {
      id: 'f_abc_lower_lower_upper',
      type: 'ABC',
      gender: 'feminino',
      groups: [
        ["Quadríceps", "Adutores", "Panturrilhas", "Glúteos", "Abdômen"],
        ["Glúteos", "Posterior de Coxa", "Adutores", "Abdômen"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps", "Costas Superior", "Abdômen"],
      ],
    },
    {
      id: 'f_abc_glutes_quads_upper',
      type: 'ABC',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa", "Abdômen"],
        ["Quadríceps", "Adutores", "Panturrilhas", "Abdômen"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps"],
      ],
    },
    {
      id: 'f_abc_lower_glutes_upper',
      type: 'ABC',
      gender: 'feminino',
      groups: [
        ["Quadríceps", "Posterior de Coxa", "Adutores", "Panturrilhas", "Abdômen"],
        ["Glúteos", "Posterior de Coxa", "Abdômen"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps", "Costas Superior"],
      ],
    },
  ],
  4: [
    // ── Masculino ────────────────────────────────────────────────────────────
    {
      id: 'abcd_sinergista',
      type: 'ABCD',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Tríceps"],
        ["Dorsal", "Costas Superior", "Bíceps"],
        ["Deltoides", "Trapézio", "Abdômen"],
        ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
      ],
    },
    {
      id: 'abcd_antagonista',
      type: 'ABCD',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal"],
        ["Quadríceps", "Panturrilhas"],
        ["Deltoides", "Trapézio", "Bíceps", "Tríceps"],
        ["Posterior de Coxa", "Glúteos", "Abdômen"],
      ],
    },
    {
      id: 'abcd_upper_lower',
      type: 'ABCD',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal", "Deltoides"],
        ["Quadríceps", "Panturrilhas"],
        ["Costas Superior", "Trapézio", "Bíceps", "Tríceps"],
        ["Posterior de Coxa", "Glúteos", "Abdômen"],
      ],
    },
    // ── Feminino ─────────────────────────────────────────────────────────────
    {
      id: 'f_abcd_lower2_upper1_glutes1',
      type: 'ABCD',
      gender: 'feminino',
      groups: [
        ["Quadríceps", "Adutores", "Panturrilhas", "Abdômen"],
        ["Glúteos", "Posterior de Coxa"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps"],
        ["Glúteos", "Adutores", "Posterior de Coxa", "Abdômen"],
      ],
    },
    {
      id: 'f_abcd_lower_push_lower_pull',
      type: 'ABCD',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa"],
        ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
        ["Quadríceps", "Adutores", "Panturrilhas"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps", "Glúteos"],
      ],
    },
    {
      id: 'f_abcd_lower2_full_chain',
      type: 'ABCD',
      gender: 'feminino',
      groups: [
        ["Quadríceps", "Adutores", "Panturrilhas", "Abdômen"],
        ["Glúteos", "Posterior de Coxa"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps"],
        ["Glúteos", "Posterior de Coxa", "Trapézio", "Dorsal", "Costas Superior"],
      ],
    },
  ],
  5: [
    // ── Masculino ────────────────────────────────────────────────────────────
    {
      id: 'abcde_classico',
      type: 'ABCDE',
      gender: 'masculino',
      groups: [
        ["Peitorais"],
        ["Dorsal", "Costas Superior"],
        ["Deltoides", "Trapézio"],
        ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
        ["Bíceps", "Tríceps", "Abdômen"],
      ],
    },
    {
      id: 'abcde_arnold',
      type: 'ABCDE',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal"],
        ["Deltoides", "Bíceps", "Tríceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Peitorais", "Dorsal", "Costas Superior"],
        ["Deltoides", "Trapézio", "Bíceps", "Tríceps", "Abdômen"],
      ],
    },
    {
      id: 'abcde_ppl_plus',
      type: 'ABCDE',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Peitorais", "Dorsal", "Deltoides"],
        ["Bíceps", "Tríceps", "Abdômen"],
      ],
    },
    // ── Feminino ─────────────────────────────────────────────────────────────
    {
      id: 'f_abcde_lower3_upper2',
      type: 'ABCDE',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa"],
        ["Quadríceps", "Adutores", "Panturrilhas"],
        ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
        ["Glúteos", "Adutores", "Posterior de Coxa"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
      ],
    },
    {
      id: 'f_abcde_glutes_quads_full',
      type: 'ABCDE',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa"],
        ["Quadríceps", "Adutores", "Panturrilhas", "Abdômen"],
        ["Peitorais", "Dorsal", "Deltoides", "Bíceps", "Tríceps"],
        ["Glúteos", "Posterior de Coxa", "Dorsal", "Costas Superior"],
        ["Peitorais", "Deltoides", "Bíceps", "Tríceps", "Abdômen"],
      ],
    },
  ],
  6: [
    // ── Masculino ────────────────────────────────────────────────────────────
    {
      id: 'ppl_x2_classico',
      type: 'Push/Pull/Legs x2',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
        ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos", "Abdômen"],
      ],
    },
    {
      id: 'ppl_x2_antagonista',
      type: 'Push/Pull/Legs x2',
      gender: 'masculino',
      groups: [
        ["Peitorais", "Dorsal"],
        ["Quadríceps", "Panturrilhas"],
        ["Deltoides", "Bíceps", "Tríceps"],
        ["Peitorais", "Dorsal", "Costas Superior"],
        ["Posterior de Coxa", "Glúteos"],
        ["Bíceps", "Tríceps", "Abdômen"],
      ],
    },
    {
      id: 'bro_split_plus',
      type: 'Bro Split+',
      gender: 'masculino',
      groups: [
        ["Peitorais"],
        ["Dorsal", "Costas Superior"],
        ["Quadríceps", "Panturrilhas"],
        ["Deltoides", "Trapézio"],
        ["Bíceps", "Tríceps"],
        ["Posterior de Coxa", "Glúteos", "Abdômen"],
      ],
    },
    // ── Feminino ─────────────────────────────────────────────────────────────
    {
      id: 'f_abcdef_3lower_2upper_1glutes',
      type: 'ABCDEF',
      gender: 'feminino',
      groups: [
        ["Quadríceps", "Adutores", "Panturrilhas"],
        ["Glúteos", "Posterior de Coxa"],
        ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
        ["Quadríceps", "Glúteos", "Posterior de Coxa", "Adutores"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Glúteos", "Adutores", "Abdômen"],
      ],
    },
    {
      id: 'f_abcdef_chain_split',
      type: 'ABCDEF',
      gender: 'feminino',
      groups: [
        ["Glúteos", "Posterior de Coxa"],
        ["Quadríceps", "Adutores", "Panturrilhas"],
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Glúteos", "Adutores", "Posterior de Coxa"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps", "Abdômen"],
        ["Quadríceps", "Panturrilhas", "Glúteos"],
      ],
    },
  ],
};

/** Override especial para Quartel com 2 dias — evita split de braço/perna quando inventário é restrito. Neutro por gênero (full-body). */
const QUARTEL_2DAY_VARIANT: SplitVariant = {
  id: 'ab_quartel_full',
  type: 'AB Full Body',
  gender: 'masculino',
  groups: [
    ["Peitorais", "Dorsal", "Quadríceps", "Deltoides", "Tríceps", "Abdômen"],
    ["Peitorais", "Dorsal", "Posterior de Coxa", "Deltoides", "Bíceps", "Glúteos"],
  ],
};

/**
 * Seleciona a próxima variante de split para um dado número de dias.
 * Round-robin determinístico dentro do pool de gênero do usuário.
 * Quartel 2-dias usa variante fixa (neutro por gênero).
 * 1-dia full-body é caso especial (neutro).
 */
function selectNextVariant(
  days: number,
  locationType: LocationType,
  gender: 'masculino' | 'feminino',
  previousVariantId?: string,
): SplitVariant {
  if (locationType === 'quartel' && days === 2) return QUARTEL_2DAY_VARIANT;
  if (days === 1) return SPLIT_VARIANTS[1][0];

  const allVariants = SPLIT_VARIANTS[days] ?? SPLIT_VARIANTS[3];
  const genderPool = allVariants.filter((v) => v.gender === gender);
  const pool = genderPool.length > 0 ? genderPool : allVariants;

  if (!previousVariantId || pool.length === 1) return pool[0];
  const idx = pool.findIndex((v) => v.id === previousVariantId);
  if (idx === -1) return pool[0];
  return pool[(idx + 1) % pool.length];
}

const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;

/**
 * Alterna a fase do mesociclo.
 * Primeira geração (sem histórico) começa em acumulacao.
 *
 * CHANGE #7: Mesociclo só alterna se o ciclo anterior tem ≥ 4 semanas.
 * Antes alternava a cada clique no botão "gerar" — usuário curioso clica 3x
 * em 5 minutos e perde toda a periodização. Agora a fase persiste até o
 * tempo biológico mínimo de adaptação ser respeitado.
 */
function nextCyclePhase(previous?: CyclePhase, previousGeneratedAt?: Date): CyclePhase {
  if (!previous) return 'acumulacao';
  if (previousGeneratedAt) {
    const ageMs = Date.now() - previousGeneratedAt.getTime();
    if (ageMs < FOUR_WEEKS_MS) return previous;
  }
  return previous === 'acumulacao' ? 'intensificacao' : 'acumulacao';
}

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

/**
 * CHANGE #3: Em HIPERTROFIA (8-12), compostos genéricos PERMANECEM em 8-12.
 * Antes a função baixava todo composto pra 6-10, e na intensificação caía
 * pra 4-6 — faixa de força pura, não hipertrofia. Agora só compostos
 * primários (`isPrimary=true`) na intensificação descem pra faixa de
 * força-hipertrofia (6-8). Isoladores ganham reps a mais.
 */
function adjustReps(baseReps: string, isCompound: boolean, isPrimary: boolean): string {
  if (isCompound) {
    // Hipertrofia/condicionamento: mantém faixa de hipertrofia mesmo em compostos
    if (baseReps === "8-12") return "8-12";
    if (baseReps === "10-12") return "8-12";
    if (baseReps === "12-15") return "10-12";
    if (baseReps === "15-20") return "12-15";
    if (baseReps === "4-6" && !isPrimary) return "6-8"; // assistência em treino de força
    return baseReps;
  }
  // Isoladores: faixas mais altas (foco em estímulo metabólico)
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

/** Baixa o rep range para compostos na fase de intensificação. */
function shiftRepsDown(reps: string): string {
  const map: Record<string, string> = {
    '4-6': '3-5',
    '6-10': '4-6',
    '8-12': '6-8',
    '10-12': '8-10',
    '12-15': '10-12',
    '15-20': '12-15',
  };
  return map[reps] ?? reps;
}

/** Baixa suavemente o rep range para isoladores (sem cair demais). */
function shiftRepsDownSlight(reps: string): string {
  const map: Record<string, string> = {
    '8-12': '8-10',
    '12-15': '10-12',
    '15-20': '12-15',
  };
  return map[reps] ?? reps;
}

/**
 * Camada final que modula sets/reps de acordo com a fase do mesociclo.
 *
 * CHANGE #3: Intensificação só baixa reps em compostos PRIMÁRIOS
 * (agachamento, supino, levantamento). Compostos secundários e isoladores
 * mantêm faixa de hipertrofia, e primários ganham +1 set. Preserva estímulo
 * metabólico e adiciona estímulo neural — sem cair pra força pura.
 */
function applyCyclePhase(
  sets: number,
  reps: string,
  isCompound: boolean,
  isPrimary: boolean,
  phase: CyclePhase,
): { sets: number; reps: string } {
  if (phase === 'acumulacao') return { sets, reps };
  if (isPrimary) return { sets: sets + 1, reps: shiftRepsDown(reps) };
  if (isCompound) return { sets, reps };
  return { sets, reps: shiftRepsDownSlight(reps) };
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
  previousEquipmentForMuscle?: string[],
  restrictionTags?: RestrictionTag[],
): number {
  const name = ex.name || "";
  const equip = (ex.equipment || "").toLowerCase();
  let score = EQUIPMENT_SCORE[equip] ?? 0;

  if (COMPOUND_NAME_RE.test(name)) score += 22;
  else if (ISOLATION_NAME_RE.test(name)) score += 6;

  const patterns = TOP_EXERCISE_PATTERNS[muscle] || [];
  if (patterns.some((re) => re.test(name))) score += 40;

  // Viés por gênero: boost em exercícios prioritários por grupo muscular.
  if (profile.gender === "feminino") {
    if (["Glúteos", "Posterior de Coxa", "Quadríceps", "Adutores"].includes(muscle)) {
      if (/hip thrust|romanian|\brdl\b|bridge|kickback|bulgarian|\bsquat\b|\blunge\b|leg press/i.test(name)) {
        score += 15;
      }
    }
  }
  if (profile.gender === "masculino") {
    if (["Peitorais", "Dorsal", "Deltoides"].includes(muscle)) {
      if (/bench press|overhead press|military press|\brow\b|pull.?up|lat.?pull/i.test(name)) {
        score += 12;
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

  // CHANGE #4: Penalidade de variedade de equipamento SÓ em acessórios.
  // Compostos primários (supino, agachamento, levantamento) precisam
  // repetir equipamento ciclo após ciclo pra haver progressão de carga
  // mensurável. Variedade obrigatória vai nos isoladores/auxiliares.
  if (previousEquipmentForMuscle && previousEquipmentForMuscle.length > 0) {
    const isAccessory = isAccessoryOrIsolation(ex);
    if (isAccessory && !CARDIO_EQUIPMENTS.has(equip) && previousEquipmentForMuscle.includes(equip)) {
      score -= 20;
    }
  }

  // CHANGE #5: Aplica banimento/preferência de padrão de movimento por restrição.
  // Banimento é HARD (-1000); preferência é boost suave (+10) pra não
  // sequestrar o ranking dos exercícios "gold" (que dão +40).
  const tags = restrictionTags ?? profile.medical_restriction_tags ?? [];
  for (const tag of tags) {
    for (const pat of RESTRICTION_BAN_PATTERNS[tag]) {
      if (exerciseHasPattern(ex, pat)) score -= 1000;
    }
    for (const pat of RESTRICTION_PREFER_PATTERNS[tag]) {
      if (exerciseHasPattern(ex, pat)) score += 10;
    }
  }

  return score;
}

/** Distribui `budget` exercícios entre `muscles` respeitando pesos musculares
 * e adicionando boost para o músculo-foco. Garante mínimo 1 por músculo
 * (priorizando os mais pesados) e soma exatamente o orçamento. */
function allocateBudget(
  muscles: string[],
  budget: number,
  focusMuscle: string | undefined,
  gender?: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (muscles.length === 0 || budget <= 0) return result;

  const genderBoosts = gender ? (GENDER_MUSCLE_BOOSTS[gender] ?? {}) : {};
  const entries = muscles.map((m) => ({
    muscle: m,
    weight: (MUSCLE_WEIGHTS[m] ?? 1) + (m === focusMuscle ? 2 : 0) + (genderBoosts[m] ?? 0),
  }));

  // CHANGE #2: Ordena por peso DECRESCENTE antes do baseline. Antes a
  // garantia de "1 por músculo" caminhava na ordem do array original do
  // split — se o orçamento fosse menor que o nº de músculos, o foco (que
  // costuma vir por último na lista do split) ficava com 0 exercícios.
  // Agora prioridade vai pra peito/costas/perna/foco antes de tríceps/abs.
  const sortedByWeight = [...entries].sort((a, b) => b.weight - a.weight);

  for (const e of entries) result.set(e.muscle, 0);

  const baseline = Math.min(muscles.length, budget);
  for (let i = 0; i < baseline; i++) {
    result.set(sortedByWeight[i].muscle, 1);
  }
  let remaining = budget - baseline;

  // Distribui resto proporcionalmente (mesma ordem decrescente de peso)
  while (remaining > 0) {
    let allocated = false;
    for (const e of sortedByWeight) {
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

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** PRNG determinístico (Mulberry32) — usado pra testes de mesa quando seed
 *  é fornecida em generateWorkout. Sem seed, geração usa Math.random. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  daysAvailable?: number,
  previousCycle?: PreviousCycleContext,
  /** CHANGE: seed opcional pra determinismo em testes de mesa.
   *  Sem seed, geração usa Math.random (comportamento normal em produção). */
  seed?: number,
): GenerateWorkoutResult {
  const rawDays = daysAvailable ?? profile.days_per_week;
  const days = Math.max(1, Math.min(6, rawDays));
  const split = selectNextVariant(days, locationType, profile.gender, previousCycle?.splitVariantId);
  // CHANGE #7: passa data do ciclo anterior pra janela de 4 semanas
  const cyclePhase = nextCyclePhase(previousCycle?.cyclePhase, previousCycle?.previousGeneratedAt);

  // CHANGE: RNG determinístico quando seed é fornecida
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;

  const { sets: baseSets, reps: baseReps } = getSetsReps(profile.goal, profile.level);
  const maxExercises = getExercisesPerRoutine(profile.time_per_session, baseSets);

  // Catálogo filtrado por equipamento (só aplica no quartel)
  const quartelTokens = resolveQuartelTokens(profile.quartel_equipment);
  const filteredCatalog = locationType === 'quartel'
    ? catalog.filter((ex) => quartelTokens.has((ex.equipment || '').toLowerCase()))
    : catalog;

  // CHANGE #5: Tags estruturadas + tags inferidas do texto livre.
  // Antes restrições removiam músculos do split; agora viram tags que o
  // scoreExercise usa pra banir/preferir PADRÕES de movimento.
  const effectiveRestrictionTags = new Set<RestrictionTag>(profile.medical_restriction_tags || []);
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
    if (freeText.includes(kw)) effectiveRestrictionTags.add(tag);
  }
  const restrictionTagsList = Array.from(effectiveRestrictionTags);

  // Catálogo por músculo, já ordenado por score de efetividade (maior 1º)
  const byMuscle: Record<string, CatalogExercise[]> = {};
  for (const ex of filteredCatalog) {
    let m = ex.muscle || 'Outros';
    m = MUSCLE_NORMALIZER[m] || m;
    if (!byMuscle[m]) byMuscle[m] = [];
    byMuscle[m].push(ex);
  }
  for (const m of Object.keys(byMuscle)) {
    const prevEquip = previousCycle?.muscleEquipmentHistory[m];
    byMuscle[m] = byMuscle[m]
      .map((ex) => ({ ex, s: scoreExercise(ex, m, profile, prevEquip, restrictionTagsList) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.ex);
  }

  const focusMuscle =
    profile.focus_muscle && profile.focus_muscle !== "Sem foco específico"
      ? profile.focus_muscle
      : undefined;

  const routines: GeneratedRoutine[] = split.groups.map((muscleGroups, idx) => {
    const label = ROUTINE_LABELS[idx];
    // CHANGE #5: NÃO filtra músculos por restrição. A restrição vira penalidade
    // no scoreExercise (banimento de padrão = -1000). Se sobrar exercício
    // viável, ele aparece. Se não sobrar, o pool simplesmente fica vazio.
    const safeMuscles = muscleGroups.map((m) => MUSCLE_NORMALIZER[m] || m);

    let remaining = maxExercises;
    const usedIds = new Set<string>();
    const usedPatterns = new Set<string>();
    const selected: GeneratedExercise[] = [];
    // CHANGE #6: rastreia músculo de cada exercício pra ordenação final por bloco
    const muscleOfExercise = new Map<string, string>();

    // ── 1) Aquecimento cardio (quando disponível) ────────────────────────
    const cardioPool = filteredCatalog.filter((ex) =>
      CARDIO_EQUIPMENTS.has((ex.equipment || '').toLowerCase())
    );
    if (cardioPool.length > 0 && remaining > 0) {
      const cardio = shuffle(cardioPool, rng)[0];
      usedIds.add(cardio.id);
      muscleOfExercise.set(cardio.id, '__cardio__');
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
    // Track de quanto cada músculo já consumiu — usado pra impor o cap em TODAS as fases
    const consumed = new Map<string, number>();
    for (const m of safeMuscles) consumed.set(m, 0);

    // Helper local: adiciona exercício e atualiza contadores.
    // CHANGE #3: passa isPrimary pra adjustReps e applyCyclePhase.
    const addExercise = (ex: CatalogExercise, muscle: string) => {
      const isCompound = isCompoundExercise(ex);
      const isPrimary = isPrimaryCompound(ex);
      const baseSetsAdj = adjustSets(baseSets, profile.months_training, profile.age_group, isCompound);
      const baseRepsAdj = adjustReps(baseReps, isCompound, isPrimary);
      const { sets, reps } = applyCyclePhase(baseSetsAdj, baseRepsAdj, isCompound, isPrimary, cyclePhase);
      usedIds.add(ex.id);
      usedPatterns.add(patternKey(ex));
      muscleOfExercise.set(ex.id, muscle);
      consumed.set(muscle, (consumed.get(muscle) ?? 0) + 1);
      selected.push({ exercise_id: ex.id, sets, reps, order: selected.length });
      remaining--;
    };

    // Ordem de PROCESSAMENTO (controla quem ganha orçamento se acabar):
    // foco → grandes → pequenos. Independente da ordem final.
    const processingOrder = [...safeMuscles].sort((a, b) => {
      if (a === focusMuscle) return -1;
      if (b === focusMuscle) return 1;
      const wa = MUSCLE_WEIGHTS[a] ?? 1;
      const wb = MUSCLE_WEIGHTS[b] ?? 1;
      if (wa !== wb) return wb - wa;
      return (COMPOUND_MUSCLES.has(a) ? 0 : 1) - (COMPOUND_MUSCLES.has(b) ? 0 : 1);
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
        addExercise(ex, muscle);
      }
    }

    // ── 3) Preenche sobras RESPEITANDO cap por músculo ───────────────────
    // CHANGE #1 (vazamento real): Antes a fase de leftover ranqueava
    // exercícios globalmente e enchia até `remaining`, podendo dar 5
    // exercícios pro mesmo músculo. Agora cada músculo tem um cap absoluto
    // (alocação inicial + 1 de tolerância) e o pool é filtrado por isso.
    if (remaining > 0) {
      const leftoverCap = (m: string) => (allocation.get(m) ?? 0) + 1;
      const leftovers: { ex: CatalogExercise; muscle: string; s: number }[] = [];
      for (const m of safeMuscles) {
        if ((consumed.get(m) ?? 0) >= leftoverCap(m)) continue;
        const prevEquip = previousCycle?.muscleEquipmentHistory[m];
        for (const ex of byMuscle[m] || []) {
          if (usedIds.has(ex.id) || usedPatterns.has(patternKey(ex))) continue;
          leftovers.push({ ex, muscle: m, s: scoreExercise(ex, m, profile, prevEquip, restrictionTagsList) });
        }
      }
      leftovers.sort((a, b) => b.s - a.s);
      for (const { ex, muscle } of leftovers) {
        if (remaining <= 0) break;
        if ((consumed.get(muscle) ?? 0) >= leftoverCap(muscle)) continue;
        addExercise(ex, muscle);
      }
    }

    // ── 4) Ordenação final: cardio → blocos musculares EMBARALHADOS ──────
    // CHANGE #6: Embaralha a ORDEM dos blocos musculares (a fadiga não cai
    // sempre no mesmo músculo). Dentro de cada bloco mantém ordem fisiológica:
    // composto primário → composto secundário → isolador. Foco continua
    // promovido pro primeiro bloco não-cardio.
    const catMap = new Map(filteredCatalog.map((c) => [c.id, c]));
    const cardioItems = selected.filter((e) => muscleOfExercise.get(e.exercise_id) === '__cardio__');
    const nonCardio = selected.filter((e) => muscleOfExercise.get(e.exercise_id) !== '__cardio__');

    // Agrupa por músculo
    const byMuscleSelected = new Map<string, GeneratedExercise[]>();
    for (const e of nonCardio) {
      const m = muscleOfExercise.get(e.exercise_id) ?? '__unknown__';
      if (!byMuscleSelected.has(m)) byMuscleSelected.set(m, []);
      byMuscleSelected.get(m)!.push(e);
    }

    // Ordena dentro do bloco: primário → composto → isolador → score equip desc
    for (const [, group] of byMuscleSelected) {
      group.sort((a, b) => {
        const ca = catMap.get(a.exercise_id)!;
        const cb = catMap.get(b.exercise_id)!;
        const rankA = isPrimaryCompound(ca) ? 0 : isCompoundExercise(ca) ? 1 : 2;
        const rankB = isPrimaryCompound(cb) ? 0 : isCompoundExercise(cb) ? 1 : 2;
        if (rankA !== rankB) return rankA - rankB;
        return (EQUIPMENT_SCORE[(cb.equipment || '').toLowerCase()] ?? 0)
             - (EQUIPMENT_SCORE[(ca.equipment || '').toLowerCase()] ?? 0);
      });
    }

    // Embaralha ordem dos blocos, mas promove foco pro 1º (após cardio)
    const muscleOrder = shuffle([...byMuscleSelected.keys()], rng);
    if (focusMuscle && muscleOrder.includes(focusMuscle)) {
      const i = muscleOrder.indexOf(focusMuscle);
      muscleOrder.splice(i, 1);
      muscleOrder.unshift(focusMuscle);
    }

    const finalOrdered: GeneratedExercise[] = [...cardioItems];
    for (const m of muscleOrder) finalOrdered.push(...(byMuscleSelected.get(m) ?? []));
    finalOrdered.forEach((ex, i) => (ex.order = i));

    return {
      name: getRoutineName(label, safeMuscles),
      exercises: finalOrdered,
    };
  });

  return {
    workout_type: split.type,
    split_variant_id: split.id,
    cycle_phase: cyclePhase,
    routines,
  };
}
