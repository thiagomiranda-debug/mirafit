# Motor de Periodização — Design

**Data:** 2026-04-19
**Escopo:** geração de treino (Academia e Quartel)
**Constraint absoluto:** nenhuma alteração no ecossistema do **Modo TAF** (`src/lib/tafData.ts`, rotas `/taf/*`, `TafDashboard`, `TafHistoryChart`, `TafAttemptList`, `createTafAttempt`, coleções `taf_attempts`). O isolamento deve ser verificado no review.

## Motivação

O gerador atual (`src/lib/workoutGenerator.ts`) produz uma ficha estática a partir do perfil. Regenerar não traz evolução — o mesmo conjunto de grupos musculares por dia, mesmos padrões de equipamento, mesmas séries/reps. Queremos transformar a geração em um **Motor de Mesociclo**: cada nova geração produz uma ficha que rompe a adaptação anterior via três eixos de variação:

1. **Divisão muscular** — embaralha a composição dos dias usando variantes curadas.
2. **Equipamento** — penaliza repetir o mesmo (músculo, equipamento) do ciclo anterior.
3. **Volume/Intensidade** — alterna entre duas fases (acumulação ↔ intensificação).

Adicionalmente, um **alerta de proteção de ciclo** desencoraja regerar antes de 30 dias, período mínimo para adaptação fisiológica.

## Decisões-chave

| Eixo | Opção escolhida | Motivo |
|---|---|---|
| Embaralhamento de grupos | **Híbrido:** variantes curadas + seletor determinístico round-robin | Reproduzível, fisiologicamente sólido, explicável |
| Rotação de fase | **2 fases alternadas:** Acumulação ↔ Intensificação | Mínimo viável de periodização com sentido biomecânico |
| Substituição de equipamento | **Penalidade suave no scoring** (-20 por par repetido) | Consistente com arquitetura atual; fallback natural em catálogo pobre |
| UX do alerta | **Modal estilizado** (bottom-sheet dark-theme) | Coerência com o resto do app |
| Testes | **Validação manual** (sem adicionar framework ao projeto) | Projeto não tem suite; funções puras facilitam teste futuro |

## Arquitetura

### Novos campos no doc `Workout`

```ts
interface Workout {
  // campos existentes...
  split_variant_id?: string;                      // ex: "abcd_sinergista"
  cycle_phase?: 'acumulacao' | 'intensificacao';
}
```

Retrocompatível: docs antigos sem esses campos são tratados como "primeira geração".

### Fluxo da API `POST /api/generate-workout`

1. Verifica token (inalterado).
2. Busca perfil (inalterado).
3. Busca catálogo (inalterado).
4. **NOVO:** busca treino ativo anterior do mesmo `locationType` + suas `routines`. Constrói `PreviousCycleContext | undefined`.
5. Chama `generateWorkout(profile, catalog, locationType, daysAvailable, previousCycle)`.
6. Desativa treinos ativos anteriores (inalterado).
7. Cria novo doc `Workout` gravando `split_variant_id` e `cycle_phase` retornados pelo generator.
8. Batch commit (inalterado).

**Custo extra:** 1 leitura da subcoleção `routines` do treino anterior (2–6 docs). Desprezível.

### Contrato do `PreviousCycleContext`

```ts
export interface PreviousCycleContext {
  splitVariantId: string;
  cyclePhase: 'acumulacao' | 'intensificacao';
  muscleEquipmentHistory: Record<string, string[]>;
  // ex: { "Peitorais": ["barbell"], "Dorsal": ["cable", "dumbbell"], ... }
}
```

`muscleEquipmentHistory` ignora cardio (`CARDIO_EQUIPMENTS`) — aquecimento não é progressivo.

### Contrato de retorno do generator

```ts
export interface GenerateWorkoutResult {
  workout_type: string;
  split_variant_id: string;
  cycle_phase: 'acumulacao' | 'intensificacao';
  routines: GeneratedRoutine[];
}

export function generateWorkout(
  profile: UserProfile,
  catalog: CatalogExercise[],
  locationType: LocationType = 'gym',
  daysAvailable?: number,
  previousCycle?: PreviousCycleContext,
): GenerateWorkoutResult;
```

## Variantes de Split (SPLIT_VARIANTS)

Substitui a constante `SPLITS` atual. Estrutura:

```ts
interface SplitVariant {
  id: string;
  type: string;
  groups: string[][];
  notes?: string;
}

const SPLIT_VARIANTS: Record<number, SplitVariant[]> = { ... };
```

### 1 dia — Full Body

- `fullbody_classico`: `[[Peito, Costas, Ombro, Quad, Posterior, Bíceps, Tríceps, Abs]]`

### 2 dias — AB

- `ab_sinergista` (atual): `[[Peito, Ombro, Tríceps, Abs], [Costas, Costas Sup., Trap, Bíceps, Quad, Posterior, Panturrilha, Glúteo]]`
- `ab_upper_lower`: `[[Peito, Dorsal, Costas Sup., Ombro, Bíceps, Tríceps], [Quad, Posterior, Glúteo, Panturrilha, Abs]]`

### 2 dias — AB Quartel (override especial, `locationType === 'quartel'`)

- `ab_quartel_full`: mantém o override atual da linha 600 do generator (`AB Full Body`).

### 3 dias — ABC

- `abc_push_pull_legs` (atual): `[[Peito, Ombro, Tríceps], [Dorsal, Costas Sup., Trap, Bíceps], [Quad, Posterior, Panturrilha, Glúteo, Abs]]`
- `abc_upper_lower_full`: `[[Peito, Ombro, Tríceps], [Quad, Posterior, Glúteo, Panturrilha], [Dorsal, Costas Sup., Bíceps, Abs]]`
- `abc_antagonista`: `[[Peito, Dorsal], [Quad, Posterior, Glúteo, Panturrilha], [Ombro, Trap, Bíceps, Tríceps, Abs]]`

### 4 dias — ABCD

- `abcd_sinergista` (atual): `[[Peito, Tríceps], [Dorsal, Costas Sup., Bíceps], [Ombro, Trap, Abs], [Quad, Posterior, Panturrilha, Glúteo]]`
- `abcd_antagonista`: `[[Peito, Dorsal], [Quad, Panturrilha], [Ombro, Trap, Bíceps, Tríceps], [Posterior, Glúteo, Abs]]`
- `abcd_upper_lower`: `[[Peito, Dorsal, Ombro], [Quad, Panturrilha], [Costas Sup., Trap, Bíceps, Tríceps], [Posterior, Glúteo, Abs]]`

### 5 dias — ABCDE

- `abcde_classico` (atual): `[[Peito], [Dorsal, Costas Sup.], [Ombro, Trap], [Quad, Posterior, Panturrilha, Glúteo], [Bíceps, Tríceps, Abs]]`
- `abcde_arnold`: `[[Peito, Dorsal], [Ombro, Bíceps, Tríceps], [Quad, Posterior, Glúteo, Panturrilha], [Peito, Dorsal, Costas Sup.], [Ombro, Trap, Bíceps, Tríceps, Abs]]`
- `abcde_ppl_plus`: `[[Peito, Ombro, Tríceps], [Dorsal, Costas Sup., Trap, Bíceps], [Quad, Posterior, Glúteo, Panturrilha], [Peito, Dorsal, Ombro], [Bíceps, Tríceps, Abs]]`

### 6 dias — PPL×2

- `ppl_x2_classico` (atual): P/P/L/P/P/L como no código atual
- `ppl_x2_antagonista`: `[[Peito, Dorsal], [Quad, Panturrilha], [Ombro, Bíceps, Tríceps], [Peito, Dorsal, Costas Sup.], [Posterior, Glúteo], [Bíceps, Tríceps, Abs]]`
- `bro_split_plus`: `[[Peito], [Dorsal, Costas Sup.], [Quad, Panturrilha], [Ombro, Trap], [Bíceps, Tríceps], [Posterior, Glúteo, Abs]]`

### Seleção de variante

```ts
function selectNextVariant(
  days: number,
  locationType: LocationType,
  previousVariantId?: string,
): SplitVariant {
  const variants = getVariantsFor(days, locationType);  // quartel 2d → ab_quartel_full
  if (!previousVariantId || variants.length === 1) return variants[0];
  const idx = variants.findIndex(v => v.id === previousVariantId);
  if (idx === -1) return variants[0];  // variante anterior não está mais na lista
  return variants[(idx + 1) % variants.length];
}
```

Determinística, pura, testável isoladamente.

## Rotação de Fase

### Seleção da próxima fase

```ts
function nextCyclePhase(previous?: 'acumulacao' | 'intensificacao') {
  if (!previous) return 'acumulacao';
  return previous === 'acumulacao' ? 'intensificacao' : 'acumulacao';
}
```

### Aplicação da fase

```ts
function applyCyclePhase(
  sets: number,
  reps: string,
  isCompound: boolean,
  phase: 'acumulacao' | 'intensificacao',
): { sets: number; reps: string } {
  if (phase === 'acumulacao') return { sets, reps };  // baseline atual
  if (isCompound) return { sets: sets + 1, reps: shiftRepsDown(reps) };
  return { sets, reps: shiftRepsDownSlight(reps) };
}

function shiftRepsDown(reps: string): string {
  const map: Record<string, string> = {
    '4-6': '3-5',     // já é força; pouco espaço
    '6-10': '4-6',
    '8-12': '6-8',
    '10-12': '8-10',
    '12-15': '10-12',
    '15-20': '12-15',
  };
  return map[reps] ?? reps;
}

function shiftRepsDownSlight(reps: string): string {
  const map: Record<string, string> = {
    '8-12': '8-10',
    '10-12': '10-12',  // sem mudança
    '12-15': '10-12',
    '15-20': '12-15',
  };
  return map[reps] ?? reps;
}
```

Aplicação ocorre DEPOIS de `adjustSets` e `adjustReps` já terem rodado — fase é uma camada externa.

## Penalidade de Equipamento

### Alteração em `scoreExercise`

```ts
function scoreExercise(
  ex: CatalogExercise,
  muscle: string,
  profile: UserProfile,
  previousEquipmentForMuscle?: string[],
): number {
  // ... lógica atual inalterada ...

  if (previousEquipmentForMuscle && previousEquipmentForMuscle.length > 0) {
    const equipLower = (ex.equipment || '').toLowerCase();
    if (!CARDIO_EQUIPMENTS.has(equipLower) && previousEquipmentForMuscle.includes(equipLower)) {
      score -= 20;
    }
  }
  return score;
}
```

**Por que -20:** os boosts positivos hoje somam até ~80 (equipamento + composto + gold pattern). -20 é forte o bastante para mudar a ordem entre pares próximos, mas suave o bastante para não bloquear quando a alternativa seria muito pior. Nunca gera rotina vazia.

### Propagação

A API constrói `muscleEquipmentHistory` a partir do treino anterior (join via `catalogMap`). O generator passa a lista correta ao scorer dentro do loop por músculo.

## Frontend — Modal de Proteção de Ciclo

### Novo componente

`src/components/CycleProtectionModal.tsx` — bottom-sheet dark-theme reaproveitando o padrão visual de `WorkoutConfigModal`.

**Props:**

```ts
interface Props {
  daysOld: number;                     // idade do treino atual em dias
  nextPhase: 'acumulacao' | 'intensificacao';
  onCancel: () => void;                // "Manter treino atual"
  onConfirm: () => void;               // "Gerar mesmo assim"
}
```

**Conteúdo:**

- Ícone ⚠️ em amber
- Título: *"Seu treino ainda é recente"*
- Corpo: `"Seu treino atual tem X dias (menos de 4 semanas). Fisiologicamente, o ideal é manter a mesma ficha por 4 a 6 semanas para garantir a progressão de carga e adaptação neural. Gerar um novo treino agora vai mudar o estímulo antes do tempo ideal."`
- Linha informativa: `"Próximo ciclo: Intensificação"` ou `"Próximo ciclo: Acumulação"`
- Botões:
  - **"Manter treino atual"** — `gradient-red` (primário)
  - **"Gerar mesmo assim"** — outline secundário

### Integração em `src/app/page.tsx`

Refatora `handleGenerateWorkout` em duas funções:

```tsx
async function handleGenerateWorkout(loc: LocationType, daysAvailable: number) {
  // Só valida quando gerando para o mesmo locationType do treino em memória
  if (loc === locationType && workout?.created_at) {
    const createdAt = toDate(workout.created_at);  // lida com Timestamp do Firestore
    const daysOld = (Date.now() - createdAt.getTime()) / 86_400_000;
    if (daysOld < 30) {
      setPendingGenArgs({ loc, days: daysAvailable, daysOld });
      setShowCycleProtection(true);
      return;
    }
  }
  await doGenerate(loc, daysAvailable);
}

async function doGenerate(loc: LocationType, daysAvailable: number) {
  // corpo atual de handleGenerateWorkout: fetch + loadData + error handling
}
```

**Estados novos:**

```tsx
const [showCycleProtection, setShowCycleProtection] = useState(false);
const [pendingGenArgs, setPendingGenArgs] = useState<{loc: LocationType; days: number; daysOld: number} | null>(null);
```

**Comportamento:**

- Validação só roda quando `loc === locationType`. Se o usuário escolheu gerar para o outro local, a checagem é pulada (mesa lógica: provavelmente é primeiro treino daquele local, ou ele está consciente de estar criando um ciclo paralelo).
- "Próximo ciclo" calculado client-side a partir de `workout.cycle_phase` (novo campo); se ausente (treino antigo), exibe "Próximo ciclo: Acumulação".
- Opcional de UX: `sessionStorage.setItem('mirafit_cycle_protection_dismissed_<uid>', ts)` para evitar repetição na mesma sessão após "Gerar mesmo assim".

## Edge Cases

| Caso | Comportamento |
|---|---|
| Primeiro treino (sem histórico) | `previousCycle = undefined` → variante[0], fase = acumulacao, sem penalidade |
| Treino anterior sem `split_variant_id` | Tratado como primeira geração → variante[0] |
| Treino anterior sem `cycle_phase` | Assume `acumulacao` como anterior → próximo = intensificacao |
| Catálogo muito pobre após penalidade | -20 não zera; scoring elege melhor disponível; nunca retorna vazio |
| `daysAvailable` muda entre ciclos (4→3) | Reseta para variante[0] daquele dia; fase continua avançando |
| Quartel com whitelist restrita | Filtro quartel roda antes do scoring; penalidade opera no que sobrou |
| Gym vs Quartel | Ciclos independentes (query já filtra por `location_type`) |
| `created_at` como Timestamp do Firestore | Normalização via helper `toDate` (trata Date e Timestamp) |
| User regenera com `loc` diferente do atual | Alerta de <30 dias não dispara (intencional) |

## Retrocompatibilidade

- Docs antigos sem `split_variant_id` / `cycle_phase` seguem funcionando.
- Sem migração de dados.
- `workout_type` na UI (ex: "ABCD") continua igual — `split_variant_id` é metadado interno.
- Builder manual (`POST /api/save-manual-workout`), TAF e `workout_history` intactos.

## Isolamento do Modo TAF (CONSTRAINT)

Nenhum dos seguintes arquivos / pastas pode ser modificado nesta implementação:

- `src/lib/tafData.ts`
- `src/lib/tafAttempts.ts` (e correlatos)
- `src/app/taf/**/*`
- `src/components/TafDashboard.tsx`
- `src/components/TafHistoryChart.tsx`
- `src/components/TafAttemptList.tsx`
- Coleção Firestore `taf_attempts` e seu índice composto

O review deve validar explicitamente via `git diff --stat` que nenhum desses paths aparece.

## Testes

Validação manual (o projeto não possui suite de testes hoje):

1. Gerar treino inicial (usuário sem histórico). Verificar no Firestore que `split_variant_id` e `cycle_phase: 'acumulacao'` foram salvos.
2. Regerar imediatamente (aceitando o alerta de <30 dias). Verificar que `split_variant_id` mudou (próxima variante da lista) e `cycle_phase: 'intensificacao'`.
3. Regerar uma 3ª vez. Verificar que variante avança novamente (round-robin) e `cycle_phase` volta para `'acumulacao'`.
4. Comparar listas de exercícios: para músculos com mais de uma opção de equipamento no catálogo, a penalidade deve ter trocado o equipamento dominante.
5. Gerar treino para `locationType='quartel'` em conta com gym ativo — confirmar que gym não foi desativado (escopo por location já existente).
6. Testar quartel com whitelist mínima — confirmar que o algoritmo ainda produz rotinas válidas (fallback da penalidade).

**Opção futura:** adicionar `vitest` + suite para as funções puras (`selectNextVariant`, `nextCyclePhase`, `applyCyclePhase`, `shiftRepsDown`, `shiftRepsDownSlight`, `scoreExercise` com histórico).

## Ordem de Implementação

1. Tipos e estruturas em `src/types` e `src/lib/workoutGenerator.ts` (SplitVariant, PreviousCycleContext, GenerateWorkoutResult, SPLIT_VARIANTS)
2. Funções puras: `selectNextVariant`, `nextCyclePhase`, `applyCyclePhase`, `shiftRepsDown`, `shiftRepsDownSlight`
3. Ajuste de `scoreExercise` para receber `previousEquipmentForMuscle`
4. Refatoração do corpo de `generateWorkout` para consumir `previousCycle` e retornar o novo contrato
5. API route: leitura de routines anteriores + construção de `PreviousCycleContext` + persistência dos novos campos
6. Componente `CycleProtectionModal`
7. Integração em `src/app/page.tsx` (estados + split em `handleGenerateWorkout`/`doGenerate`)
8. Validação manual dos 6 cenários acima

Cada passo é reversível individualmente e mantém o sistema funcional (se o generator for atualizado sem a API, o novo parâmetro é opcional; se o modal for adicionado sem a API, a checagem usa valores default).
