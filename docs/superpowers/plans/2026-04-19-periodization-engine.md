# Periodization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o gerador de treinos em um motor de mesociclo com variação de divisão muscular, rotação de fase (acumulação↔intensificação) e penalidade de equipamento entre ciclos.

**Architecture:** Cada geração consome o treino ativo anterior do mesmo `locationType` para (1) escolher variante de split diferente via round-robin determinístico sobre um pool curado, (2) inverter a fase de treino, e (3) penalizar pares (músculo, equipamento) repetidos. Metadados persistem em `split_variant_id` e `cycle_phase` no doc `Workout`. Frontend exibe modal de proteção quando treino atual tem <30 dias.

**Tech Stack:** TypeScript, Next.js 16 (App Router), React 19, Firebase Admin SDK (server) + Firestore Client SDK (client), Tailwind CSS 4 com variáveis CSS.

**Constraint Absoluto:** NENHUM arquivo do Modo TAF pode ser modificado — `src/lib/tafData.ts`, `src/app/taf/**`, `src/components/TafDashboard.tsx`, `src/components/TafHistoryChart.tsx`, `src/components/TafAttemptList.tsx`, e a coleção Firestore `taf_attempts`. Cada task deve ser conferida via `git diff --stat` antes do commit.

**Nota sobre testes:** o projeto não tem framework de testes configurado (confirmado em `package.json`). Cada task termina com validação manual (type-check + smoke test no dev server quando aplicável) em lugar de testes automatizados. Manter as funções puras bem isoladas para facilitar adicionar `vitest` no futuro.

---

## File Structure

**Arquivos a criar:**
- `src/components/CycleProtectionModal.tsx` — novo modal de alerta de <30 dias

**Arquivos a modificar:**
- `src/types/index.ts` — estender interface `Workout` com `split_variant_id` e `cycle_phase`
- `src/lib/workoutGenerator.ts` — novos tipos exportados, constante `SPLIT_VARIANTS`, helpers puros (`selectNextVariant`, `nextCyclePhase`, `applyCyclePhase`, `shiftRepsDown`, `shiftRepsDownSlight`), extensão de `scoreExercise`, refatoração de `generateWorkout` para novo contrato
- `src/app/api/generate-workout/route.ts` — ler routines do treino anterior, construir `PreviousCycleContext`, passar ao generator, persistir novos campos
- `src/app/page.tsx` — refatorar `handleGenerateWorkout` em dois estágios (checagem + geração), integrar modal

**Arquivos intocáveis (TAF + fora de escopo):**
- Toda pasta `src/app/taf/`
- `src/lib/tafData.ts`
- `src/lib/tafAttempts.ts`
- `src/components/Taf*.tsx`
- `src/lib/workoutGenerator.ts` seção do `/taf` (não existe — é isolado)

---

## Task 1: Estender Workout com campos de periodização

**Files:**
- Modify: `src/types/index.ts:59-67`

- [ ] **Step 1: Adicionar campos opcionais ao interface `Workout`**

Editar a interface `Workout` em `src/types/index.ts` para incluir dois novos campos opcionais. Localização atual (linhas 59-67):

```ts
export interface Workout {
  id?: string;
  user_id: string;
  workout_type: string;
  is_active: boolean;
  created_at: Date;
  location_type?: LocationType;
  routines?: Routine[];
}
```

Substituir por:

```ts
export interface Workout {
  id?: string;
  user_id: string;
  workout_type: string;
  is_active: boolean;
  created_at: Date;
  location_type?: LocationType;
  routines?: Routine[];
  /** ID da variante curada usada nesta geração (ex: "abcd_sinergista"). Undefined em workouts pré-periodização. */
  split_variant_id?: string;
  /** Fase do mesociclo — alterna a cada geração para alternar volume/intensidade. */
  cycle_phase?: 'acumulacao' | 'intensificacao';
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (sem erros novos)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add split_variant_id and cycle_phase to Workout"
```

---

## Task 2: Adicionar tipos exportados do generator (PreviousCycleContext, SplitVariant, GenerateWorkoutResult)

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (adicionar após linha 16, antes de `QUARTEL_EQUIPMENT_CATEGORIES`)

- [ ] **Step 1: Adicionar interfaces exportadas**

No topo do arquivo, logo após `interface CatalogExercise` (linha 16), adicionar:

```ts
export interface SplitVariant {
  /** ID estável da variante — gravado em Workout.split_variant_id */
  id: string;
  /** Label exibido ao usuário (ex: "ABCD", "Push/Pull/Legs x2"). Variantes do mesmo número de dias podem compartilhar o mesmo label. */
  type: string;
  /** Matriz dias × grupos musculares */
  groups: string[][];
}

export interface PreviousCycleContext {
  splitVariantId: string;
  cyclePhase: 'acumulacao' | 'intensificacao';
  /** Map músculo → lista de equipamentos (tokens lowercase) usados no ciclo anterior. Cardio é filtrado. */
  muscleEquipmentHistory: Record<string, string[]>;
}

export interface GenerateWorkoutResult {
  workout_type: string;
  split_variant_id: string;
  cycle_phase: 'acumulacao' | 'intensificacao';
  routines: GeneratedRoutine[];
}
```

**Nota:** `GeneratedRoutine` já existe localmente (linha 316). Não exportar ainda — será usado apenas internamente.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/workoutGenerator.ts
git commit -m "feat(generator): export periodization types"
```

---

## Task 3: Substituir SPLITS por SPLIT_VARIANTS (pool de variantes curadas)

**Files:**
- Modify: `src/lib/workoutGenerator.ts:326-379` (constante `SPLITS`)

- [ ] **Step 1: Substituir a constante `SPLITS` por `SPLIT_VARIANTS`**

Localizar a constante `SPLITS` (linhas 326-379) e substituir por:

```ts
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
      groups: [
        ["Peitorais", "Dorsal", "Deltoides", "Quadríceps", "Posterior de Coxa", "Bíceps", "Tríceps", "Abdômen"],
      ],
    },
  ],
  2: [
    {
      id: 'ab_sinergista',
      type: 'AB',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps", "Abdômen"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps", "Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos"],
      ],
    },
    {
      id: 'ab_upper_lower',
      type: 'AB',
      groups: [
        ["Peitorais", "Dorsal", "Costas Superior", "Deltoides", "Bíceps", "Tríceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas", "Abdômen"],
      ],
    },
  ],
  3: [
    {
      id: 'abc_push_pull_legs',
      type: 'ABC',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Quadríceps", "Posterior de Coxa", "Panturrilhas", "Glúteos", "Abdômen"],
      ],
    },
    {
      id: 'abc_upper_lower_full',
      type: 'ABC',
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Dorsal", "Costas Superior", "Bíceps", "Abdômen"],
      ],
    },
    {
      id: 'abc_antagonista',
      type: 'ABC',
      groups: [
        ["Peitorais", "Dorsal"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Deltoides", "Trapézio", "Bíceps", "Tríceps", "Abdômen"],
      ],
    },
  ],
  4: [
    {
      id: 'abcd_sinergista',
      type: 'ABCD',
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
      groups: [
        ["Peitorais", "Dorsal", "Deltoides"],
        ["Quadríceps", "Panturrilhas"],
        ["Costas Superior", "Trapézio", "Bíceps", "Tríceps"],
        ["Posterior de Coxa", "Glúteos", "Abdômen"],
      ],
    },
  ],
  5: [
    {
      id: 'abcde_classico',
      type: 'ABCDE',
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
      groups: [
        ["Peitorais", "Deltoides", "Tríceps"],
        ["Dorsal", "Costas Superior", "Trapézio", "Bíceps"],
        ["Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilhas"],
        ["Peitorais", "Dorsal", "Deltoides"],
        ["Bíceps", "Tríceps", "Abdômen"],
      ],
    },
  ],
  6: [
    {
      id: 'ppl_x2_classico',
      type: 'Push/Pull/Legs x2',
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
      groups: [
        ["Peitorais"],
        ["Dorsal", "Costas Superior"],
        ["Quadríceps", "Panturrilhas"],
        ["Deltoides", "Trapézio"],
        ["Bíceps", "Tríceps"],
        ["Posterior de Coxa", "Glúteos", "Abdômen"],
      ],
    },
  ],
};

/** Override especial para Quartel com 2 dias — evita split de braço/perna quando inventário é restrito. */
const QUARTEL_2DAY_VARIANT: SplitVariant = {
  id: 'ab_quartel_full',
  type: 'AB Full Body',
  groups: [
    ["Peitorais", "Dorsal", "Quadríceps", "Deltoides", "Tríceps", "Abdômen"],
    ["Peitorais", "Dorsal", "Posterior de Coxa", "Deltoides", "Bíceps", "Glúteos"],
  ],
};
```

- [ ] **Step 2: Localizar e remover o uso atual de `SPLITS` em `generateWorkout`**

No corpo de `generateWorkout` (linha 598 em diante), localizar:

```ts
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
```

Substituir por (ainda sem `selectNextVariant` — vem em Task 4):

```ts
let variants = SPLIT_VARIANTS[days];
if (locationType === 'quartel' && days === 2) {
  variants = [QUARTEL_2DAY_VARIANT];
}
const split = variants[0];  // seletor real vem em Task 4
```

**Nota:** `split` continua sendo usado downstream (`split.groups`, `split.type`). Mantém interface.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Smoke test — confirmar que geração sem histórico continua funcionando**

Iniciar dev server: `npm run dev`

No browser (localhost:3000), logar, abrir modal "Configurar Treino", gerar treino. Confirmar que o treino gerado é idêntico ao comportamento anterior (variantes `_sinergista`, `_push_pull_legs`, `_classico` são as primeiras de cada pool — correspondem ao SPLITS antigo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutGenerator.ts
git commit -m "feat(generator): replace SPLITS with curated SPLIT_VARIANTS pool"
```

---

## Task 4: Adicionar `selectNextVariant` e `nextCyclePhase` e plugar no generator

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (novas funções após `SPLIT_VARIANTS`, integração em `generateWorkout`)

- [ ] **Step 1: Adicionar `selectNextVariant` após a definição de `QUARTEL_2DAY_VARIANT`**

```ts
/**
 * Seleciona a próxima variante de split para um dado número de dias.
 * Round-robin determinístico: sempre avança para a próxima da lista.
 * Se não houver histórico, retorna a primeira (comportamento pré-periodização).
 */
function selectNextVariant(
  days: number,
  locationType: LocationType,
  previousVariantId?: string,
): SplitVariant {
  const variants = (locationType === 'quartel' && days === 2)
    ? [QUARTEL_2DAY_VARIANT]
    : (SPLIT_VARIANTS[days] ?? SPLIT_VARIANTS[3]);

  if (!previousVariantId || variants.length === 1) return variants[0];
  const idx = variants.findIndex((v) => v.id === previousVariantId);
  if (idx === -1) return variants[0];
  return variants[(idx + 1) % variants.length];
}

/**
 * Alterna a fase do mesociclo.
 * Primeira geração (sem histórico) começa em acumulação.
 */
function nextCyclePhase(previous?: 'acumulacao' | 'intensificacao'): 'acumulacao' | 'intensificacao' {
  if (!previous) return 'acumulacao';
  return previous === 'acumulacao' ? 'intensificacao' : 'acumulacao';
}
```

- [ ] **Step 2: Substituir o bloco de seleção de variante em `generateWorkout`**

Localizar o bloco adicionado em Task 3:

```ts
let variants = SPLIT_VARIANTS[days];
if (locationType === 'quartel' && days === 2) {
  variants = [QUARTEL_2DAY_VARIANT];
}
const split = variants[0];  // seletor real vem em Task 4
```

Substituir por:

```ts
const split = selectNextVariant(days, locationType, previousCycle?.splitVariantId);
const cyclePhase = nextCyclePhase(previousCycle?.cyclePhase);
```

**Nota:** `previousCycle` ainda não é parâmetro de `generateWorkout`. A próxima sub-step resolve isso.

- [ ] **Step 3: Atualizar assinatura de `generateWorkout`**

Localizar a assinatura atual (linha 590-595):

```ts
export function generateWorkout(
  profile: UserProfile,
  catalog: CatalogExercise[],
  locationType: LocationType = 'gym',
  daysAvailable?: number
): GeneratedWorkout {
```

Substituir por:

```ts
export function generateWorkout(
  profile: UserProfile,
  catalog: CatalogExercise[],
  locationType: LocationType = 'gym',
  daysAvailable?: number,
  previousCycle?: PreviousCycleContext,
): GenerateWorkoutResult {
```

- [ ] **Step 4: Atualizar o retorno de `generateWorkout`**

Localizar o retorno atual no final da função (linhas 805-808):

```ts
return {
  workout_type: split.type,
  routines,
};
```

Substituir por:

```ts
return {
  workout_type: split.type,
  split_variant_id: split.id,
  cycle_phase: cyclePhase,
  routines,
};
```

- [ ] **Step 5: Remover o tipo interno `GeneratedWorkout` se não for mais usado**

Localizar a interface `GeneratedWorkout` (linhas 321-324):

```ts
interface GeneratedWorkout {
  workout_type: string;
  routines: GeneratedRoutine[];
}
```

Remover — `GenerateWorkoutResult` (exportada) substitui.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. Se falhar apontando para `src/app/api/generate-workout/route.ts`, é esperado (próxima task resolve). Commitar mesmo assim apenas se o tsc passar completo — se houver erros, pular para Task 6 que atualiza a API, depois voltar aqui para commitar o conjunto.

**Alternativa se houver erro no route.ts:** pular para Task 6 (atualizar API), voltar e commitar ambas as mudanças juntas com mensagem `feat(generator): add variant selection and cycle phase rotation`.

- [ ] **Step 7: Smoke test — confirmar geração ainda funciona**

`npm run dev`, gerar treino. Deve funcionar igual (sem histórico → primeira variante, fase acumulação).

- [ ] **Step 8: Commit**

```bash
git add src/lib/workoutGenerator.ts
git commit -m "feat(generator): add variant selection and cycle phase rotation"
```

---

## Task 5: Adicionar `applyCyclePhase`, `shiftRepsDown`, `shiftRepsDownSlight` e plugar no loop

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (adicionar após `adjustSets` linha ~454, integrar nos dois pontos de aplicação)

- [ ] **Step 1: Adicionar funções puras de rotação de fase**

Após a função `adjustSets` (linha ~454, antes de `getExercisesPerRoutine`), adicionar:

```ts
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
    '10-12': '10-12',
    '12-15': '10-12',
    '15-20': '12-15',
  };
  return map[reps] ?? reps;
}

/**
 * Camada final que modula sets/reps de acordo com a fase do mesociclo.
 * Acumulação = baseline do goal (mais reps, mesmos sets).
 * Intensificação = +1 set em compostos e redução de reps (foco em força).
 */
function applyCyclePhase(
  sets: number,
  reps: string,
  isCompound: boolean,
  phase: 'acumulacao' | 'intensificacao',
): { sets: number; reps: string } {
  if (phase === 'acumulacao') return { sets, reps };
  if (isCompound) return { sets: sets + 1, reps: shiftRepsDown(reps) };
  return { sets, reps: shiftRepsDownSlight(reps) };
}
```

- [ ] **Step 2: Aplicar `applyCyclePhase` no loop principal de seleção**

Localizar o bloco em `generateWorkout` onde sets/reps são calculados para exercícios principais (atualmente em torno das linhas 722-730):

```ts
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
```

Substituir o cálculo de `sets`/`reps` por:

```ts
for (const ex of picked) {
  if (remaining <= 0) break;
  const isCompound = isCompoundExercise(ex);
  const baseSetsAdj = adjustSets(
    baseSets,
    profile.months_training,
    profile.age_group,
    isCompound,
  );
  const baseRepsAdj = adjustReps(baseReps, isCompound);
  const { sets, reps } = applyCyclePhase(baseSetsAdj, baseRepsAdj, isCompound, cyclePhase);
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
```

- [ ] **Step 3: Aplicar `applyCyclePhase` também no loop de leftovers**

Localizar o bloco similar em torno das linhas 752-770 (`if (remaining > 0) { ... for (const { ex } of leftovers) { ... } }`):

```ts
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
  // ...
}
```

Substituir por:

```ts
for (const { ex } of leftovers) {
  if (remaining <= 0) break;
  const isCompound = isCompoundExercise(ex);
  const baseSetsAdj = adjustSets(
    baseSets,
    profile.months_training,
    profile.age_group,
    isCompound,
  );
  const baseRepsAdj = adjustReps(baseReps, isCompound);
  const { sets, reps } = applyCyclePhase(baseSetsAdj, baseRepsAdj, isCompound, cyclePhase);
  // ... resto inalterado (usedIds.add, usedPatterns.add, selected.push, remaining--)
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Smoke test — confirmar que treino ainda gera corretamente**

`npm run dev`, gerar treino (primeira vez → fase acumulação → sets/reps iguais ao atual). No Firestore, inspecionar o doc Workout gerado — `cycle_phase: "acumulacao"` deve estar salvo (salvamento real vem na Task 7, mas aqui já temos o valor no retorno).

- [ ] **Step 6: Commit**

```bash
git add src/lib/workoutGenerator.ts
git commit -m "feat(generator): apply cycle phase to sets/reps modulation"
```

---

## Task 6: Estender `scoreExercise` com penalidade de equipamento e exportar `CARDIO_EQUIPMENTS`

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (linha ~171 — export, ~476 — assinatura, e chamadas em ~627 e ~748)

- [ ] **Step 1: Exportar `CARDIO_EQUIPMENTS`**

Localizar (linha 171):

```ts
const CARDIO_EQUIPMENTS = new Set<string>([
```

Substituir por:

```ts
export const CARDIO_EQUIPMENTS = new Set<string>([
```

- [ ] **Step 2: Adicionar parâmetro opcional a `scoreExercise`**

Localizar a assinatura atual (linha ~476):

```ts
function scoreExercise(
  ex: CatalogExercise,
  muscle: string,
  profile: UserProfile,
): number {
```

Substituir por:

```ts
function scoreExercise(
  ex: CatalogExercise,
  muscle: string,
  profile: UserProfile,
  previousEquipmentForMuscle?: string[],
): number {
```

- [ ] **Step 3: Aplicar penalidade no final do corpo de `scoreExercise`**

Localizar o final da função (antes de `return score;`):

```ts
  // 40+: reduz levemente score de exercícios com alto stress articular
  if (profile.age_group === "over_40") {
    if (/\bsquat\b|deadlift|clean|snatch|jump/i.test(name)) score -= 8;
  }

  return score;
}
```

Substituir por:

```ts
  // 40+: reduz levemente score de exercícios com alto stress articular
  if (profile.age_group === "over_40") {
    if (/\bsquat\b|deadlift|clean|snatch|jump/i.test(name)) score -= 8;
  }

  // Penalidade de equipamento repetido do ciclo anterior (motor de periodização)
  if (previousEquipmentForMuscle && previousEquipmentForMuscle.length > 0) {
    const equipLower = (ex.equipment || "").toLowerCase();
    if (!CARDIO_EQUIPMENTS.has(equipLower) && previousEquipmentForMuscle.includes(equipLower)) {
      score -= 20;
    }
  }

  return score;
}
```

- [ ] **Step 4: Propagar `previousEquipmentForMuscle` no pré-cômputo do `byMuscle`**

Localizar no corpo de `generateWorkout` (linhas ~620-630):

```ts
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
```

Substituir por:

```ts
// Catálogo por músculo, já ordenado por score de efetividade (maior 1º)
const byMuscle: Record<string, CatalogExercise[]> = {};
for (const ex of filteredCatalog) {
  if (!byMuscle[ex.muscle]) byMuscle[ex.muscle] = [];
  byMuscle[ex.muscle].push(ex);
}
for (const m of Object.keys(byMuscle)) {
  const prevEquip = previousCycle?.muscleEquipmentHistory[m];
  byMuscle[m] = byMuscle[m]
    .map((ex) => ({ ex, s: scoreExercise(ex, m, profile, prevEquip) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.ex);
}
```

- [ ] **Step 5: Propagar `previousEquipmentForMuscle` no bloco de leftovers**

Localizar (linhas ~745-751):

```ts
if (remaining > 0) {
  const leftovers: { ex: CatalogExercise; s: number }[] = [];
  for (const m of safeMuscles) {
    for (const ex of byMuscle[m] || []) {
      if (usedIds.has(ex.id) || usedPatterns.has(patternKey(ex))) continue;
      leftovers.push({ ex, s: scoreExercise(ex, m, profile) });
    }
  }
  leftovers.sort((a, b) => b.s - a.s);
```

Substituir por:

```ts
if (remaining > 0) {
  const leftovers: { ex: CatalogExercise; s: number }[] = [];
  for (const m of safeMuscles) {
    const prevEquip = previousCycle?.muscleEquipmentHistory[m];
    for (const ex of byMuscle[m] || []) {
      if (usedIds.has(ex.id) || usedPatterns.has(patternKey(ex))) continue;
      leftovers.push({ ex, s: scoreExercise(ex, m, profile, prevEquip) });
    }
  }
  leftovers.sort((a, b) => b.s - a.s);
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (ainda pode haver erros em `route.ts` apontando para chamada antiga de `generateWorkout` sem `previousCycle` — mas o parâmetro é opcional, então não deve quebrar).

- [ ] **Step 7: Smoke test — gerar treino sem histórico**

`npm run dev`, gerar treino. Sem histórico, a penalidade não roda (ramo if curto-circuita). Comportamento idêntico ao atual.

- [ ] **Step 8: Commit**

```bash
git add src/lib/workoutGenerator.ts
git commit -m "feat(generator): penalize repeated equipment per muscle from previous cycle"
```

---

## Task 7: Atualizar API route para ler ciclo anterior e persistir metadados

**Files:**
- Modify: `src/app/api/generate-workout/route.ts` (corpo completo)

- [ ] **Step 1: Importar tipos novos e `CARDIO_EQUIPMENTS`**

Localizar os imports no topo (linhas 1-6):

```ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { generateWorkout } from "@/lib/workoutGenerator";
import { UserProfile, LocationType } from "@/types";
import { initAdmin } from "@/lib/firebaseAdmin";
```

Substituir por:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { generateWorkout, CARDIO_EQUIPMENTS, PreviousCycleContext, CatalogExercise } from "@/lib/workoutGenerator";
import { UserProfile, LocationType } from "@/types";
import { initAdmin } from "@/lib/firebaseAdmin";
```

**Nota:** `CatalogExercise` não está exportado atualmente. Adicionar export em `src/lib/workoutGenerator.ts` linha 11:

```ts
export interface CatalogExercise {
```

(Se já estiver exportado, ignorar.) Verificar com Grep.

- [ ] **Step 2: Refatorar o corpo da rota — fetch do ciclo anterior ANTES de desativar**

Localizar o trecho (linhas 52-62):

```ts
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
```

Substituir por:

```ts
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
    const ta = a.data().created_at?.toMillis?.() ?? 0;
    const tb = b.data().created_at?.toMillis?.() ?? 0;
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
```

- [ ] **Step 3: Adicionar campos `split_variant_id` e `cycle_phase` no set do novo doc**

Localizar (linhas ~64-71):

```ts
const workoutRef = db.collection("workouts").doc();
batch.set(workoutRef, {
  user_id: userId,
  workout_type: generated.workout_type,
  is_active: true,
  location_type: locationType,
  created_at: new Date(),
});
```

Substituir por:

```ts
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
```

- [ ] **Step 4: Retornar os novos metadados na resposta HTTP**

Localizar (linhas ~84-88):

```ts
return NextResponse.json({
  workoutId: workoutRef.id,
  workout_type: generated.workout_type,
  routines: generated.routines,
});
```

Substituir por:

```ts
return NextResponse.json({
  workoutId: workoutRef.id,
  workout_type: generated.workout_type,
  split_variant_id: generated.split_variant_id,
  cycle_phase: generated.cycle_phase,
  routines: generated.routines,
});
```

- [ ] **Step 5: Confirmar que `CatalogExercise` está exportado**

Run:
```bash
git grep -n "export interface CatalogExercise" src/lib/workoutGenerator.ts
```
Expected: retorna 1 linha. Se não retornar, editar manualmente.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Smoke test — gerar 2 treinos em sequência e inspecionar Firestore**

`npm run dev`. Logar. Gerar primeiro treino. No console Firestore, verificar que o doc `workouts` tem `split_variant_id` (ex: `abcd_sinergista`) e `cycle_phase: "acumulacao"`.

Gerar segundo treino (mesmo local, mesmo número de dias). Confirmar:
- `split_variant_id` mudou para a próxima variante (ex: `abcd_antagonista`)
- `cycle_phase: "intensificacao"`
- Os grupos musculares por dia são diferentes dos anteriores
- Para músculos com várias opções de equipamento no catálogo, a distribuição de equipamentos mudou

- [ ] **Step 8: Commit**

```bash
git add src/lib/workoutGenerator.ts src/app/api/generate-workout/route.ts
git commit -m "feat(api): build previous cycle context and persist periodization metadata"
```

---

## Task 8: Criar componente `CycleProtectionModal`

**Files:**
- Create: `src/components/CycleProtectionModal.tsx`

- [ ] **Step 1: Criar o arquivo com o modal completo**

```tsx
"use client";

interface CycleProtectionModalProps {
  daysOld: number;
  nextPhase: 'acumulacao' | 'intensificacao';
  onCancel: () => void;
  onConfirm: () => void;
}

const PHASE_LABELS: Record<'acumulacao' | 'intensificacao', string> = {
  acumulacao: 'Acumulação (volume)',
  intensificacao: 'Intensificação (força)',
};

export default function CycleProtectionModal({
  daysOld,
  nextPhase,
  onCancel,
  onConfirm,
}: CycleProtectionModalProps) {
  const daysRounded = Math.max(1, Math.round(daysOld));

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] px-5 pb-8 pt-4">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border)]" />

        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--amber-600)]/15 text-[var(--amber-500)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">
              Seu treino ainda é recente
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-dim)]">
              Ciclo atual tem {daysRounded} {daysRounded === 1 ? 'dia' : 'dias'}
            </p>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-[var(--text-muted)]">
          Fisiologicamente, o ideal é manter a mesma ficha por <strong className="text-[var(--foreground)]">4 a 6 semanas</strong> para
          garantir progressão de carga e adaptação neural. Gerar um novo treino agora vai mudar o estímulo antes do tempo ideal.
        </p>

        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)]">
            Próximo ciclo seria
          </p>
          <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">
            {PHASE_LABELS[nextPhase]}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onCancel}
            className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl gradient-red"
          >
            Manter treino atual
          </button>
          <button
            onClick={onConfirm}
            className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Gerar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Smoke test — renderização do modal (manual, via DevTools)**

`npm run dev`. Abrir React DevTools. Temporariamente em `src/app/page.tsx`, adicionar antes do return principal:

```tsx
const [debugModal, setDebugModal] = useState(true);
// ...
{debugModal && <CycleProtectionModal daysOld={12} nextPhase="intensificacao" onCancel={() => setDebugModal(false)} onConfirm={() => setDebugModal(false)} />}
```

Verificar no browser que o modal renderiza corretamente (dark theme, ícone amber, textos corretos). Remover o código de debug antes de commitar.

- [ ] **Step 4: Commit**

```bash
git add src/components/CycleProtectionModal.tsx
git commit -m "feat(ui): add CycleProtectionModal for sub-30-day regeneration warning"
```

---

## Task 9: Integrar modal de proteção em `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx` (imports, estados, `handleGenerateWorkout`, JSX de render)

- [ ] **Step 1: Adicionar import do modal e helper `toDate`**

Localizar os imports (linhas 1-20). Após a linha `import WorkoutConfigModal from "@/components/WorkoutConfigModal";`, adicionar:

```tsx
import CycleProtectionModal from "@/components/CycleProtectionModal";
```

- [ ] **Step 2: Adicionar helper `toDate` no topo do arquivo (fora do componente)**

Após os imports, antes de `type ActiveWorkout = ...`, adicionar:

```tsx
/** Normaliza Firestore Timestamp (objeto com seconds) ou Date para Date. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDateFn = (value as { toDate: () => Date }).toDate;
    if (typeof toDateFn === 'function') return toDateFn.call(value);
  }
  return null;
}
```

- [ ] **Step 3: Adicionar estados novos dentro do componente `Home`**

Localizar o bloco de estados (após linha 35, `const [showConfigModal, setShowConfigModal] = useState(false);`). Após esse trecho, adicionar:

```tsx
const [showCycleProtection, setShowCycleProtection] = useState(false);
const [pendingGenArgs, setPendingGenArgs] = useState<{
  loc: LocationType;
  days: number;
  daysOld: number;
  nextPhase: 'acumulacao' | 'intensificacao';
} | null>(null);
```

- [ ] **Step 4: Refatorar `handleGenerateWorkout` em duas funções**

Localizar o `handleGenerateWorkout` atual (linhas 85-112):

```tsx
async function handleGenerateWorkout(loc: LocationType, daysAvailable: number) {
  if (!user) return;
  setGenerating(true);
  setGenError("");
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/generate-workout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ locationType: loc, daysAvailable }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao gerar treino");
    if (loc !== locationType) {
      handleLocationChange(loc);
    }
    setShowConfigModal(false);
    await loadData();
  } catch (err) {
    setGenError(err instanceof Error ? err.message : "Erro ao gerar treino");
  } finally {
    setGenerating(false);
  }
}
```

Substituir por:

```tsx
async function handleGenerateWorkout(loc: LocationType, daysAvailable: number) {
  if (!user) return;

  // Proteção de ciclo: alerta se treino atual (mesmo local) tem menos de 30 dias
  if (loc === locationType && workout?.created_at) {
    const createdAt = toDate(workout.created_at);
    if (createdAt) {
      const daysOld = (Date.now() - createdAt.getTime()) / 86_400_000;
      if (daysOld < 30) {
        const prevPhase = workout.cycle_phase;
        const nextPhase: 'acumulacao' | 'intensificacao' =
          prevPhase === 'acumulacao' ? 'intensificacao' : 'acumulacao';
        setPendingGenArgs({ loc, days: daysAvailable, daysOld, nextPhase });
        setShowCycleProtection(true);
        return;
      }
    }
  }

  await doGenerate(loc, daysAvailable);
}

async function doGenerate(loc: LocationType, daysAvailable: number) {
  if (!user) return;
  setGenerating(true);
  setGenError("");
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/generate-workout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ locationType: loc, daysAvailable }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao gerar treino");
    if (loc !== locationType) {
      handleLocationChange(loc);
    }
    setShowConfigModal(false);
    await loadData();
  } catch (err) {
    setGenError(err instanceof Error ? err.message : "Erro ao gerar treino");
  } finally {
    setGenerating(false);
  }
}
```

- [ ] **Step 5: Renderizar o modal no JSX**

Localizar o bloco de `<WorkoutConfigModal ... />` perto do final do componente. Após o bloco `{showConfigModal && ...}`, adicionar:

```tsx
{showCycleProtection && pendingGenArgs && (
  <CycleProtectionModal
    daysOld={pendingGenArgs.daysOld}
    nextPhase={pendingGenArgs.nextPhase}
    onCancel={() => {
      setShowCycleProtection(false);
      setPendingGenArgs(null);
    }}
    onConfirm={async () => {
      const args = pendingGenArgs;
      setShowCycleProtection(false);
      setPendingGenArgs(null);
      await doGenerate(args.loc, args.days);
    }}
  />
)}
```

**Localizar exato:** fazer Grep em `src/app/page.tsx` por `WorkoutConfigModal` para achar o ponto exato de inserção. O novo modal deve ser sibling do `WorkoutConfigModal`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Smoke test — fluxo completo**

`npm run dev`. Logar.

**Cenário A — primeiro treino (sem histórico):**
- Abrir modal de config, gerar treino
- Não deve aparecer o CycleProtectionModal (não há workout atual)
- Treino gerado normalmente

**Cenário B — regerar imediatamente:**
- Após cenário A, abrir modal de config, gerar de novo para o MESMO local
- CycleProtectionModal DEVE aparecer
- Texto: "Ciclo atual tem 0 dias" (ou "Ciclo atual tem 1 dia" pelo arredondamento)
- "Próximo ciclo seria Intensificação (força)"
- Clicar "Manter treino atual" → modal fecha, nada acontece
- Reabrir config, gerar, clicar "Gerar mesmo assim" → treino é gerado

**Cenário C — regerar para o OUTRO local:**
- Tendo treino ativo em gym, abrir config, trocar para quartel, gerar
- CycleProtectionModal NÃO deve aparecer (loc !== locationType)
- Treino é gerado normalmente

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): integrate cycle protection modal into home generate flow"
```

---

## Task 10: Validação manual completa + verificação de isolamento TAF

**Files:** nenhum (somente validação)

- [ ] **Step 1: Verificar isolamento TAF**

Run:
```bash
git diff --stat main..HEAD -- 'src/lib/tafData.ts' 'src/lib/tafAttempts.ts' 'src/app/taf' 'src/components/Taf*.tsx'
```
Expected: output vazio ou "0 files changed". Se algum arquivo aparecer, reverter imediatamente e diagnosticar.

- [ ] **Step 2: Rodar build completo**

Run: `npm run build`
Expected: SUCCESS. Zero erros de TypeScript ou lint.

- [ ] **Step 3: Roteiro de validação manual no dev server**

`npm run dev`. Logar como usuário de teste. Executar os 6 cenários da spec (seção "Testes"):

1. **Primeiro treino (sem histórico):** Firestore deve mostrar `split_variant_id` e `cycle_phase: "acumulacao"`.
2. **Regerar imediatamente (aceitando alerta):** `split_variant_id` avançou, `cycle_phase: "intensificacao"`.
3. **Terceira geração:** variante avança round-robin, `cycle_phase` volta a `"acumulacao"`.
4. **Trocar equipamento dominante:** para um músculo como "Peitorais" (se catálogo tiver bench press barbell, dumbbell, cable), confirmar que o equipamento dominante mudou entre ciclos.
5. **Quartel com whitelist mínima:** configurar perfil com poucos equipamentos no quartel, gerar treino — confirmar que rotinas não ficam vazias (fallback da penalidade).
6. **Gym vs Quartel como ciclos independentes:** gerar gym, depois gerar quartel — confirmar que gym não foi desativado (já era comportamento correto, só revalidar).

- [ ] **Step 4: Limpar qualquer console.log ou código de debug residual**

Run:
```bash
git grep -n "console.log\|console.debug" src/lib/workoutGenerator.ts src/app/api/generate-workout/route.ts src/app/page.tsx src/components/CycleProtectionModal.tsx
```
Expected: nenhum resultado novo (linhas pré-existentes no arquivo podem estar OK — conferir no git diff se foram introduzidas por esta branch).

- [ ] **Step 5: Commit final (se houver limpeza) ou marcar completo**

Se houve limpeza:
```bash
git add -u
git commit -m "chore: remove debug logs from periodization implementation"
```

Se não houve limpeza, a Task 10 termina sem commit.

---

## Self-Review Checklist

**Cobertura da spec:**

| Seção da spec | Task correspondente |
|---|---|
| Novos campos em Workout (`split_variant_id`, `cycle_phase`) | Task 1 |
| Tipos `PreviousCycleContext`, `SplitVariant`, `GenerateWorkoutResult` | Task 2 |
| SPLIT_VARIANTS com todas as variantes | Task 3 |
| Override Quartel 2-dias | Task 3 (QUARTEL_2DAY_VARIANT) |
| `selectNextVariant` round-robin | Task 4 |
| `nextCyclePhase` | Task 4 |
| `applyCyclePhase`, `shiftRepsDown`, `shiftRepsDownSlight` | Task 5 |
| `scoreExercise` com penalidade | Task 6 |
| Export de `CARDIO_EQUIPMENTS` | Task 6 |
| API construindo `PreviousCycleContext` | Task 7 |
| API persistindo metadados | Task 7 |
| `CycleProtectionModal` | Task 8 |
| Integração no `page.tsx` + helper `toDate` | Task 9 |
| Isolamento TAF verificado via `git diff --stat` | Task 10 |
| Validação manual dos 6 cenários | Task 10 |

**Consistência de tipos:** `PreviousCycleContext.muscleEquipmentHistory` é `Record<string, string[]>` em toda a spec e no plan. `split_variant_id` é `string` (tipo do field no `SplitVariant.id`). `cycle_phase` é `'acumulacao' | 'intensificacao'` — literal union consistente.

**Sem placeholders:** confirmado — cada step tem código completo ou comando exato.

**Observação de edge case:** Task 7 Step 2 depende de `prevData.split_variant_id` existir. Se treino anterior foi criado antes desta feature, `prevVariantId` será `undefined` e `previousCycle` fica `undefined` — tratado explicitamente pelo `if (prevVariantId)`. Comportamento: primeira geração do usuário que já tinha treino pré-existente começa como se fosse fresh (variante[0], fase acumulação), sem penalidade de equipamento. Alinhado com a retrocompatibilidade da spec.
