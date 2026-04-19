# Quartel Equipment + Gender Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 8 equipamentos obrigatórios ao quartel (sempre ativos no gerador) e fortalecer a distribuição muscular por gênero em academia e quartel.

**Architecture:** Todas as mudanças no gerador ficam em `src/lib/workoutGenerator.ts` (dados + lógica). A UI do perfil em `src/app/profile/page.tsx` é atualizada para exibir os obrigatórios como bloqueados. Nenhuma mudança de schema no Firestore ou nas APIs.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Tailwind CSS 4 com CSS vars.

---

## Arquivos Modificados

| Arquivo | O que muda |
|---|---|
| `src/lib/workoutGenerator.ts` | `QUARTEL_EQUIPMENT_CATEGORIES` (campo `mandatory`, 8 itens), `QUARTEL_DEFAULT_EQUIPMENT_KEYS`, `resolveQuartelTokens()`, `GENDER_MUSCLE_BOOSTS` (novo), `allocateBudget()` (parâmetro `gender`), `scoreExercise()` (viés masculino) |
| `src/app/profile/page.tsx` | Seção de equipamentos dividida em "Equipamentos Fixos" (travados) + "Equipamentos Opcionais" (toggleáveis) |

---

### Task 1: Atualizar `QUARTEL_EQUIPMENT_CATEGORIES` com campo `mandatory` e 8 itens obrigatórios

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (linhas 23–62)

- [ ] **Step 1: Substituir o array `QUARTEL_EQUIPMENT_CATEGORIES` completo**

Localizar o bloco inteiro (linhas 23–62). Substituir por:

```ts
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
```

- [ ] **Step 2: Atualizar `QUARTEL_DEFAULT_EQUIPMENT_KEYS`**

Localizar (linhas 64–78):
```ts
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
```

Substituir por (remove itens que agora são obrigatórios):
```ts
export const QUARTEL_DEFAULT_EQUIPMENT_KEYS = [
  'kettlebell',
  'body_weight',
  'leverage_machine',
  'elliptical',
];
```

- [ ] **Step 3: Verificar tipagem**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && git add src/lib/workoutGenerator.ts && git commit -m "feat(quartel): add mandatory equipment field and 8 fixed quartel items"
```

---

### Task 2: Reescrever `resolveQuartelTokens()` para sempre incluir obrigatórios

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (linhas 83–91)

- [ ] **Step 1: Substituir `resolveQuartelTokens`**

Localizar a função (linhas 83–91):
```ts
function resolveQuartelTokens(keys?: string[]): Set<string> {
  const source = keys && keys.length > 0 ? keys : QUARTEL_DEFAULT_EQUIPMENT_KEYS;
  const tokens = new Set<string>();
  for (const key of source) {
    const cat = QUARTEL_EQUIPMENT_CATEGORIES.find((c) => c.key === key);
    if (cat) cat.tokens.forEach((t) => tokens.add(t));
  }
  return tokens;
}
```

Substituir por:
```ts
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
```

- [ ] **Step 2: Verificar tipagem**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && git add src/lib/workoutGenerator.ts && git commit -m "feat(quartel): resolveQuartelTokens always includes mandatory equipment tokens"
```

---

### Task 3: Adicionar `GENDER_MUSCLE_BOOSTS` e atualizar `allocateBudget()`

**Files:**
- Modify: `src/lib/workoutGenerator.ts`

- [ ] **Step 1: Adicionar constante `GENDER_MUSCLE_BOOSTS`**

Localizar a constante `MUSCLE_WEIGHTS` (linha ~107). Adicionar IMEDIATAMENTE APÓS o bloco `MUSCLE_WEIGHTS` (após o `};` de fechamento, antes de `EQUIPMENT_SCORE`):

```ts
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
```

- [ ] **Step 2: Atualizar assinatura e internals de `allocateBudget()`**

Localizar a função `allocateBudget` (linha ~499). Substituir apenas a assinatura e a linha de `entries`:

Encontrar:
```ts
function allocateBudget(
  muscles: string[],
  budget: number,
  focusMuscle: string | undefined,
): Map<string, number> {
  const result = new Map<string, number>();
  if (muscles.length === 0) return result;

  const entries = muscles.map((m) => ({
    muscle: m,
    weight: (MUSCLE_WEIGHTS[m] ?? 1) + (m === focusMuscle ? 2 : 0),
  }));
```

Substituir por:
```ts
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
```

- [ ] **Step 3: Atualizar chamada de `allocateBudget` em `generateWorkout`**

Localizar (linha ~657):
```ts
    const allocation = allocateBudget(safeMuscles, remaining, focusMuscle);
```

Substituir por:
```ts
    const allocation = allocateBudget(safeMuscles, remaining, focusMuscle, profile.gender);
```

- [ ] **Step 4: Verificar tipagem**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && git add src/lib/workoutGenerator.ts && git commit -m "feat(generator): add gender-based muscle volume distribution"
```

---

### Task 4: Expandir viés de gênero em `scoreExercise()`

**Files:**
- Modify: `src/lib/workoutGenerator.ts` (linhas 472–479)

- [ ] **Step 1: Substituir o bloco de viés de gênero**

Localizar (linhas 472–479):
```ts
  // Viés por gênero: ênfase em glúteo/posterior para público feminino.
  if (profile.gender === "feminino") {
    if (muscle === "Glúteos" || muscle === "Posterior de Coxa") {
      if (/hip thrust|romanian|\brdl\b|bridge|kickback|bulgarian/i.test(name)) {
        score += 15;
      }
    }
  }
```

Substituir por:
```ts
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
```

- [ ] **Step 2: Verificar tipagem**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && git add src/lib/workoutGenerator.ts && git commit -m "feat(generator): expand gender exercise score bias to masculine upper body"
```

---

### Task 5: Atualizar UI de equipamentos no perfil

**Files:**
- Modify: `src/app/profile/page.tsx` (linhas 469–509)

- [ ] **Step 1: Substituir a seção "Equipamentos do Quartel"**

Localizar o bloco completo (linhas 469–509):
```tsx
            {/* Equipamentos do Quartel */}
            <Section title="Equipamentos do Quartel">
              <p className="-mt-2 mb-3 text-xs text-[var(--text-dim)]">
                Marque apenas o que existe no seu quartel. Usado quando gera treinos no modo 🚒 Quartel.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUARTEL_EQUIPMENT_CATEGORIES.map(({ key, label }) => {
                  const active = form.quartel_equipment.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleEquipment(key)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        active
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => set("quartel_equipment", QUARTEL_DEFAULT_EQUIPMENT_KEYS)}
                  className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={() => set("quartel_equipment", [])}
                  className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  Limpar
                </button>
              </div>
            </Section>
```

Substituir por:
```tsx
            {/* Equipamentos do Quartel */}
            <Section title="Equipamentos do Quartel">
              <p className="-mt-2 mb-3 text-xs text-[var(--text-dim)]">
                Usado quando gera treinos no modo 🚒 Quartel.
              </p>

              {/* Fixos — sempre disponíveis, não podem ser desmarcados */}
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--amber-500)]">
                Equipamentos Fixos
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {QUARTEL_EQUIPMENT_CATEGORIES.filter((c) => c.mandatory).map(({ key, label }) => (
                  <div
                    key={key}
                    className="cursor-default rounded-xl border border-[var(--amber-500)] bg-[var(--amber-500)]/15 py-2.5 text-center text-sm font-semibold text-[var(--amber-500)]"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Opcionais — selecionáveis */}
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Equipamentos Opcionais
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUARTEL_EQUIPMENT_CATEGORIES.filter((c) => !c.mandatory).map(({ key, label }) => {
                  const active = form.quartel_equipment.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleEquipment(key)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        active
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "quartel_equipment",
                      QUARTEL_EQUIPMENT_CATEGORIES.filter((c) => !c.mandatory).map((c) => c.key),
                    )
                  }
                  className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={() => set("quartel_equipment", [])}
                  className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  Limpar
                </button>
              </div>
            </Section>
```

- [ ] **Step 2: Verificar tipagem**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Verificar lint**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npm run lint
```

Esperado: sem novos erros.

- [ ] **Step 4: Build de produção**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && npm run build
```

Esperado: build concluído sem erros.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/Teste/Desktop/MiraFit" && git add src/app/profile/page.tsx && git commit -m "feat(profile): split quartel equipment into fixed and optional sections"
```

---

## Verificação Manual

Após implementação completa:

1. Abrir `/profile` → seção "Equipamentos do Quartel" mostra bloco âmbar travado com os 8 itens fixos, e bloco vermelho toggleável com opcionais
2. Gerar treino no modo Quartel → exercícios com cabo (cable), barra, halter, bicicleta ergométrica aparecem mesmo sem nenhum opcional selecionado
3. Gerar treino para usuária feminina → treino com mais quadríceps, glúteos e posterior; gerar para masculino → mais peitoral, costas, deltoides
