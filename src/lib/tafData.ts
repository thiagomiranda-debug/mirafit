// TAF - Teste de Aptidao Fisica | Edital CBMAL (BGO No 145)
// Pontuacao por interpolacao linear: 50 pts no base, +/- mult por rep extra/faltante.

export type TafExerciseKey = "pull_up" | "push_up" | "crunch";
export type TafGender = "masculino" | "feminino";
export type TafAgeGroup = "under_30" | "31_40" | "over_40";
export type TafRunKey = "run_300m" | "run_1600m";
export type TafEventKey = TafExerciseKey | TafRunKey;

interface TafStandard {
  base: number;
  mult: number;
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
    "31_40": {
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
    "31_40": {
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
 * Tier de pontuacao por tempo. `maxSeconds` e o pior tempo (inclusive)
 * que ainda ganha `score` pontos nesta faixa etaria.
 * Ordenados do melhor (menor tempo) para o pior (maior tempo).
 */
export interface TafRunTier {
  maxSeconds: number;
  score: number;
}

/**
 * Tabela de pontuacao das corridas, transcrita do edital CBMAL BGO No 145
 * (03/08/2023), Anexo A, Tabelas 1 e 2.
 * Ver docs/superpowers/specs/taf-edital-cbmal.md para a transcricao.
 */
export const tafRunStandards: Record<
  TafGender,
  Record<TafAgeGroup, Record<TafRunKey, TafRunTier[]>>
> = {
  masculino: {
    under_30: {
      run_300m: [
        { maxSeconds: 64.99, score: 100 },
        { maxSeconds: 67.99, score: 90 },
        { maxSeconds: 70.99, score: 80 },
        { maxSeconds: 73.99, score: 70 },
        { maxSeconds: 76.99, score: 60 },
        { maxSeconds: 79.99, score: 50 },
        { maxSeconds: 82.99, score: 40 },
        { maxSeconds: 85.99, score: 30 },
        { maxSeconds: 88.99, score: 20 },
        { maxSeconds: 106.99, score: 10 },
      ],
      run_1600m: [
        { maxSeconds: 384.99, score: 100 },
        { maxSeconds: 397.99, score: 90 },
        { maxSeconds: 411.99, score: 80 },
        { maxSeconds: 426.99, score: 70 },
        { maxSeconds: 444.99, score: 60 },
        { maxSeconds: 461.99, score: 50 },
        { maxSeconds: 480.99, score: 40 },
        { maxSeconds: 500.99, score: 30 },
        { maxSeconds: 677.99, score: 20 },
        { maxSeconds: 720, score: 10 },
      ],
    },
    "31_40": {
      run_300m: [
        { maxSeconds: 73.99, score: 100 },
        { maxSeconds: 76.99, score: 90 },
        { maxSeconds: 79.99, score: 80 },
        { maxSeconds: 82.99, score: 70 },
        { maxSeconds: 85.99, score: 60 },
        { maxSeconds: 88.99, score: 50 },
        { maxSeconds: 91.99, score: 40 },
        { maxSeconds: 94.99, score: 30 },
        { maxSeconds: 97.99, score: 20 },
        { maxSeconds: 100.99, score: 10 },
      ],
      run_1600m: [
        { maxSeconds: 426.99, score: 100 },
        { maxSeconds: 444.99, score: 90 },
        { maxSeconds: 461.99, score: 80 },
        { maxSeconds: 480.99, score: 70 },
        { maxSeconds: 500.99, score: 60 },
        { maxSeconds: 516.99, score: 50 },
        { maxSeconds: 549.99, score: 40 },
        { maxSeconds: 575.99, score: 30 },
        { maxSeconds: 606.99, score: 20 },
        { maxSeconds: 640.99, score: 10 },
      ],
    },
    over_40: {
      run_300m: [
        { maxSeconds: 64.99, score: 100 },
        { maxSeconds: 67.99, score: 90 },
        { maxSeconds: 70.99, score: 80 },
        { maxSeconds: 73.99, score: 70 },
        { maxSeconds: 76.99, score: 60 },
        { maxSeconds: 79.99, score: 50 },
        { maxSeconds: 82.99, score: 40 },
        { maxSeconds: 85.99, score: 30 },
        { maxSeconds: 88.99, score: 20 },
        { maxSeconds: 91.99, score: 10 },
      ],
      run_1600m: [
        { maxSeconds: 384.99, score: 100 },
        { maxSeconds: 397.99, score: 90 },
        { maxSeconds: 411.99, score: 80 },
        { maxSeconds: 426.99, score: 70 },
        { maxSeconds: 444.99, score: 60 },
        { maxSeconds: 461.99, score: 50 },
        { maxSeconds: 480.99, score: 40 },
        { maxSeconds: 500.99, score: 30 },
        { maxSeconds: 546.99, score: 20 },
        { maxSeconds: 575.99, score: 10 },
      ],
    },
  },
  feminino: {
    under_30: {
      run_300m: [
        { maxSeconds: 76.99, score: 100 },
        { maxSeconds: 79.99, score: 90 },
        { maxSeconds: 82.99, score: 80 },
        { maxSeconds: 85.99, score: 70 },
        { maxSeconds: 88.99, score: 60 },
        { maxSeconds: 91.99, score: 50 },
        { maxSeconds: 94.99, score: 40 },
        { maxSeconds: 97.99, score: 30 },
        { maxSeconds: 100.99, score: 20 },
        { maxSeconds: 118.99, score: 10 },
      ],
      run_1600m: [
        { maxSeconds: 444.99, score: 100 },
        { maxSeconds: 461.99, score: 90 },
        { maxSeconds: 480.99, score: 80 },
        { maxSeconds: 500.99, score: 70 },
        { maxSeconds: 516.99, score: 60 },
        { maxSeconds: 549.99, score: 50 },
        { maxSeconds: 575.99, score: 40 },
        { maxSeconds: 606.99, score: 30 },
        { maxSeconds: 888.99, score: 20 },
        { maxSeconds: 960, score: 10 },
      ],
    },
    "31_40": {
      run_300m: [
        { maxSeconds: 85.99, score: 100 },
        { maxSeconds: 88.99, score: 90 },
        { maxSeconds: 91.99, score: 80 },
        { maxSeconds: 94.99, score: 70 },
        { maxSeconds: 97.99, score: 60 },
        { maxSeconds: 100.99, score: 50 },
        { maxSeconds: 103.99, score: 40 },
        { maxSeconds: 106.99, score: 30 },
        { maxSeconds: 109.99, score: 20 },
        { maxSeconds: 112.99, score: 10 },
      ],
      run_1600m: [
        { maxSeconds: 480.99, score: 100 },
        { maxSeconds: 500.99, score: 90 },
        { maxSeconds: 516.99, score: 80 },
        { maxSeconds: 549.99, score: 70 },
        { maxSeconds: 575.99, score: 60 },
        { maxSeconds: 606.99, score: 50 },
        { maxSeconds: 640.99, score: 40 },
        { maxSeconds: 704.99, score: 30 },
        { maxSeconds: 764.99, score: 20 },
        { maxSeconds: 840, score: 10 },
      ],
    },
    over_40: {
      run_300m: [
        { maxSeconds: 76.99, score: 100 },
        { maxSeconds: 79.99, score: 90 },
        { maxSeconds: 82.99, score: 80 },
        { maxSeconds: 85.99, score: 70 },
        { maxSeconds: 88.99, score: 60 },
        { maxSeconds: 91.99, score: 50 },
        { maxSeconds: 94.99, score: 40 },
        { maxSeconds: 97.99, score: 30 },
        { maxSeconds: 100.99, score: 20 },
        { maxSeconds: 103.99, score: 10 },
      ],
      run_1600m: [
        { maxSeconds: 444.99, score: 100 },
        { maxSeconds: 461.99, score: 90 },
        { maxSeconds: 480.99, score: 80 },
        { maxSeconds: 500.99, score: 70 },
        { maxSeconds: 516.99, score: 60 },
        { maxSeconds: 549.99, score: 50 },
        { maxSeconds: 575.99, score: 40 },
        { maxSeconds: 606.99, score: 30 },
        { maxSeconds: 640.99, score: 20 },
        { maxSeconds: 677.99, score: 10 },
      ],
    },
  },
};

/**
 * Calcula a pontuacao TAF para um exercicio.
 * Formula: 50 + (reps - base) * mult, clampado em [0, 100].
 */
export function calculateTafScore(reps: number, base: number, mult: number): number {
  return Math.max(0, Math.min(100, 50 + (reps - base) * mult));
}

/**
 * Reps necessarias para atingir uma pontuacao-alvo.
 * Para score=50: retorna base. Para score=100: retorna base + (50 / mult).
 */
export function repsForScore(targetScore: number, base: number, mult: number): number {
  return Math.ceil(base + (targetScore - 50) / mult);
}

/**
 * Calcula pontos (0-100) para um tempo de corrida.
 * Percorre os tiers do melhor (menor tempo) para o pior (maior tempo);
 * retorna o score do primeiro tier cujo `maxSeconds` >= tempo do candidato.
 * Se o tempo for pior que o pior tier cadastrado, retorna 0.
 */
export function scoreRunTime(
  seconds: number,
  gender: TafGender,
  age: TafAgeGroup,
  event: TafRunKey
): number {
  const tiers = tafRunStandards[gender][age][event];
  if (!tiers || tiers.length === 0) return 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;

  for (const tier of tiers) {
    if (seconds <= tier.maxSeconds) return tier.score;
  }
  return 0;
}

/**
 * Retorna quantos segundos o candidato precisa reduzir no tempo atual
 * para atingir `targetScore`.
 */
export function secondsToReachScore(
  currentSeconds: number,
  targetScore: number,
  gender: TafGender,
  age: TafAgeGroup,
  event: TafRunKey
): number | null {
  const tiers = tafRunStandards[gender][age][event];
  const target = [...tiers]
    .reverse()
    .find((tier) => tier.score >= targetScore);
  if (!target) return null;
  const delta = currentSeconds - target.maxSeconds;
  return delta <= 0 ? 0 : delta;
}

// Patterns para identificar exercicios TAF nos nomes do banco (ingles).
export const TAF_EXERCISE_PATTERNS: Record<TafExerciseKey, RegExp> = {
  pull_up: /pull[\s-]?up|chin[\s-]?up/i,
  push_up: /push[\s-]?up/i,
  crunch: /crunch|sit[\s-]?up/i,
};

/** Retorna a categoria TAF para um nome de exercicio, ou null se nao corresponder. */
export function matchExerciseToTaf(name: string): TafExerciseKey | null {
  for (const [key, pattern] of Object.entries(TAF_EXERCISE_PATTERNS) as [
    TafExerciseKey,
    RegExp,
  ][]) {
    if (pattern.test(name)) return key;
  }
  return null;
}

/** Retorna as categorias TAF aplicaveis ao sexo informado. */
export function getTafExercisesForGender(gender: TafGender): TafExerciseKey[] {
  return gender === "masculino"
    ? ["pull_up", "push_up", "crunch"]
    : ["push_up", "crunch"];
}

/** Retorna todos os eventos TAF aplicaveis ao sexo informado, na ordem padrao do edital. */
export function getTafEventsForGender(gender: TafGender): TafEventKey[] {
  if (gender === "masculino") {
    return ["pull_up", "push_up", "crunch", "run_300m", "run_1600m"];
  }
  return ["push_up", "crunch", "run_300m", "run_1600m"];
}

export const TAF_EVENT_LABELS: Record<TafEventKey, string> = {
  pull_up: "Barra Fixa",
  push_up: "Flexao de Braco",
  crunch: "Abdominal",
  run_300m: "Corrida 300m",
  run_1600m: "Corrida 1600m",
};

export const AGE_GROUP_LABELS: Record<TafAgeGroup, string> = {
  under_30: "Ate 30 anos",
  "31_40": "31 a 40 anos",
  over_40: "Acima de 40 anos",
};

/**
 * Converte string de tempo em segundos (float).
 * Aceita formatos: "mm:ss", "mm:ss.cc", "ss.cc", "ss".
 * Retorna null se invalido.
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withMinutes = trimmed.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (withMinutes) {
    const min = Number.parseInt(withMinutes[1], 10);
    const sec = Number.parseInt(withMinutes[2], 10);
    const cs = withMinutes[3]
      ? Number.parseInt(withMinutes[3].padEnd(2, "0"), 10)
      : 0;
    if (sec >= 60) return null;
    return min * 60 + sec + cs / 100;
  }

  const onlySeconds = trimmed.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (onlySeconds) {
    const sec = Number.parseInt(onlySeconds[1], 10);
    const cs = onlySeconds[2]
      ? Number.parseInt(onlySeconds[2].padEnd(2, "0"), 10)
      : 0;
    return sec + cs / 100;
  }

  return null;
}

/**
 * Formata segundos no formato apropriado para o evento.
 * 300m  -> "m:ss.cc" (com centesimos)
 * 1600m -> "mm:ss"   (sem centesimos)
 */
export function formatRunTime(seconds: number, event: TafRunKey): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
  if (event === "run_300m") {
    return `${min}:${sec.toFixed(2).padStart(5, "0")}`;
  }
  return `${min.toString().padStart(2, "0")}:${Math.round(sec)
    .toString()
    .padStart(2, "0")}`;
}
