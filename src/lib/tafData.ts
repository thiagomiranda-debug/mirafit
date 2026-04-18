// TAF — Teste de Aptidão Física | Edital CBMAL (BGO Nº 145)
// Pontuação por interpolação linear: 50 pts no base, ±mult por rep extra/faltante.

export type TafExerciseKey = 'pull_up' | 'push_up' | 'crunch';
export type TafGender = 'masculino' | 'feminino';
export type TafAgeGroup = 'under_30' | '31_40' | 'over_40';

interface TafStandard {
  base: number; // reps necessárias para 50 pts
  mult: number; // pontos por rep extra ou faltante
}

export const tafStandards: Record<
  TafGender,
  Record<TafAgeGroup, Partial<Record<TafExerciseKey, TafStandard>>>
> = {
  masculino: {
    under_30: {
      pull_up: { base: 5, mult: 10 },
      push_up: { base: 24, mult: 5 },
      crunch: { base: 40, mult: 5 },
    },
    '31_40': {
      pull_up: { base: 2, mult: 10 },
      push_up: { base: 18, mult: 5 },
      crunch: { base: 34, mult: 5 },
    },
    over_40: {
      pull_up: { base: 1, mult: 10 },
      push_up: { base: 14, mult: 5 },
      crunch: { base: 30, mult: 5 },
    },
  },
  feminino: {
    under_30: {
      push_up: { base: 30, mult: 5 },
      crunch: { base: 34, mult: 5 },
    },
    '31_40': {
      push_up: { base: 24, mult: 5 },
      crunch: { base: 28, mult: 5 },
    },
    over_40: {
      push_up: { base: 20, mult: 5 },
      crunch: { base: 24, mult: 5 },
    },
  },
};

/**
 * Calcula a pontuação TAF para um exercício.
 * Fórmula: 50 + (reps - base) * mult, clampado em [0, 100].
 */
export function calculateTafScore(reps: number, base: number, mult: number): number {
  return Math.max(0, Math.min(100, 50 + (reps - base) * mult));
}

/**
 * Reps necessárias para atingir uma pontuação-alvo (útil para "faltam X reps").
 * Para score=50: retorna base. Para score=100: retorna base + (50 / mult).
 */
export function repsForScore(targetScore: number, base: number, mult: number): number {
  return Math.ceil(base + (targetScore - 50) / mult);
}

// Patterns para identificar exercícios TAF nos nomes do banco (inglês).
export const TAF_EXERCISE_PATTERNS: Record<TafExerciseKey, RegExp> = {
  pull_up: /pull[\s-]?up|chin[\s-]?up/i,
  push_up: /push[\s-]?up/i,
  crunch: /crunch|sit[\s-]?up/i,
};

/** Retorna a categoria TAF para um nome de exercício, ou null se não corresponder. */
export function matchExerciseToTaf(name: string): TafExerciseKey | null {
  for (const [key, pattern] of Object.entries(TAF_EXERCISE_PATTERNS) as [TafExerciseKey, RegExp][]) {
    if (pattern.test(name)) return key;
  }
  return null;
}

/** Retorna as categorias TAF aplicáveis ao sexo informado. */
export function getTafExercisesForGender(gender: TafGender): TafExerciseKey[] {
  return gender === 'masculino'
    ? ['pull_up', 'push_up', 'crunch']
    : ['push_up', 'crunch'];
}

export const TAF_LABELS: Record<TafExerciseKey, string> = {
  pull_up: 'Barra Fixa',
  push_up: 'Flexão de Braço',
  crunch: 'Abdominal',
};

export const AGE_GROUP_LABELS: Record<TafAgeGroup, string> = {
  under_30: 'Até 30 anos',
  '31_40': '31 a 40 anos',
  over_40: 'Acima de 40 anos',
};
