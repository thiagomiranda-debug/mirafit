# Progressive Overload & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar cálculo de 1RM (Epley), rastreamento de recorde pessoal em tempo real na tela de treino, e dashboard de evolução com gráfico recharts na aba Perfil.

**Architecture:** Lógica de métricas centralizada em `src/lib/metrics.ts` (puro, sem dependências). `getPersonalRecords()` adicionada a `workoutLogs.ts` reutilizando `getWorkoutLogs`. Tela `/treino` carrega o PR map em paralelo com os dados existentes. `ProgressChart` busca seus próprios logs e computa séries de dados localmente.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Firebase/Firestore, recharts, Tailwind CSS 4 + CSS vars.

> **Nota sobre testes:** O projeto não tem infraestrutura de testes configurada (sem jest/vitest). Cada task inclui passos de verificação via `npx tsc --noEmit` e dev server visual.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/metrics.ts` | Criar | Fórmula de Epley, best1RM, volume total |
| `src/lib/workoutLogs.ts` | Modificar | Adicionar `getPersonalRecords()` |
| `src/app/treino/page.tsx` | Modificar | Carregar prMap, passar `personalRecord` ao ExerciseCard, renderizar badge |
| `src/components/ProgressChart.tsx` | Criar | Gráfico recharts com toggle 1RM/Volume |
| `src/app/profile/page.tsx` | Modificar | Adicionar seção "Análise de Força" com ProgressChart |

---

## Task 1: Instalar recharts

**Files:**
- Modify: `package.json` (automático via npm)

- [ ] **Step 1: Instalar a dependência**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npm install recharts
```

Saída esperada: `added N packages` sem erros.

- [ ] **Step 2: Verificar a instalação**

```bash
ls node_modules/recharts
```

Saída esperada: diretório `recharts` existe em `node_modules`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install recharts for progress chart"
```

---

## Task 2: Criar `src/lib/metrics.ts`

**Files:**
- Create: `src/lib/metrics.ts`

- [ ] **Step 1: Criar o arquivo com as três funções**

Crie `src/lib/metrics.ts` com o seguinte conteúdo:

```typescript
import { SetPerformance } from "@/types";

/**
 * Fórmula de Epley: estima o peso máximo para 1 repetição.
 * 1RM = peso × (1 + reps / 30)
 * Casos especiais: reps === 0 retorna peso; weight === 0 retorna 0.
 */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0) return 0;
  if (reps <= 0) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Retorna o melhor 1RM estimado (Epley) de um array de sets.
 * Retorna 0 para array vazio.
 */
export function best1RMFromSets(sets: SetPerformance[]): number {
  if (sets.length === 0) return 0;
  return Math.max(...sets.map((s) => epley1RM(s.weight, s.reps)));
}

/**
 * Volume total de um array de sets: Σ(peso × reps).
 * Retorna 0 para array vazio.
 */
export function totalVolume(sets: SetPerformance[]): number {
  if (sets.length === 0) return 0;
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/metrics.ts
git commit -m "feat: add metrics lib with Epley 1RM, best1RM, and volume helpers"
```

---

## Task 3: Adicionar `getPersonalRecords()` em `workoutLogs.ts`

**Files:**
- Modify: `src/lib/workoutLogs.ts`

- [ ] **Step 1: Adicionar o import de `best1RMFromSets`**

No topo de `src/lib/workoutLogs.ts`, adicionar o import após as importações do Firebase:

```typescript
import { best1RMFromSets } from "@/lib/metrics";
```

- [ ] **Step 2: Adicionar a função `getPersonalRecords` no final do arquivo**

Adicionar após a função `getExerciseHistory`:

```typescript
/**
 * Retorna o melhor 1RM histórico (Epley) por exercício,
 * calculado a partir dos últimos 60 logs.
 * exercise_id → melhor 1RM estimado (kg)
 */
export async function getPersonalRecords(
  userId: string
): Promise<Record<string, number>> {
  const logs = await getWorkoutLogs(userId, 60);
  const records: Record<string, number> = {};

  for (const log of logs) {
    for (const perf of log.performance) {
      let sets: import("@/types").SetPerformance[];

      if (perf.sets && perf.sets.length > 0) {
        sets = perf.sets;
      } else if (
        perf.weight_lifted !== undefined &&
        perf.reps_done !== undefined
      ) {
        sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
      } else {
        continue;
      }

      const pr = best1RMFromSets(sets);
      if (pr > (records[perf.exercise_id] ?? 0)) {
        records[perf.exercise_id] = pr;
      }
    }
  }

  return records;
}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workoutLogs.ts src/lib/metrics.ts
git commit -m "feat: add getPersonalRecords() to compute historical 1RM per exercise"
```

---

## Task 4: Carregar PR Map na tela de treino

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Adicionar imports no topo do arquivo**

Após a linha de import do `RestTimer`, adicionar:

```typescript
import { getPersonalRecords } from "@/lib/workoutLogs";
import { epley1RM } from "@/lib/metrics";
```

- [ ] **Step 2: Adicionar state para `prMap`**

Dentro de `TreinoContent`, após a linha `const [lastPerf, setLastPerf] = ...`:

```typescript
const [prMap, setPrMap] = useState<Record<string, number>>({});
```

- [ ] **Step 3: Atualizar `Promise.all` em `loadRoutine`**

Encontrar o bloco `Promise.all` existente (linha ~96):

```typescript
const [exMap, perfMap] = await Promise.all([
  ids.length > 0 ? getExercisesByIds(ids) : Promise.resolve({}),
  getLastPerformanceMap(user.uid),
]);
setExercises(exMap);
setLastPerf(perfMap);
```

Substituir por:

```typescript
const [exMap, perfMap, personalRecords] = await Promise.all([
  ids.length > 0 ? getExercisesByIds(ids) : Promise.resolve({}),
  getLastPerformanceMap(user.uid),
  getPersonalRecords(user.uid),
]);
setExercises(exMap);
setLastPerf(perfMap);
setPrMap(personalRecords);
```

- [ ] **Step 4: Verificar tipos**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat: load personal records map on treino page"
```

---

## Task 5: Passar `personalRecord` ao `ExerciseCard` e renderizar badge

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Adicionar `personalRecord` à interface de props do `ExerciseCard`**

Encontrar a interface de props de `ExerciseCard` (em torno da linha 461). Adicionar `personalRecord` após `lastSets`:

```typescript
  lastSets: SetPerformance[];
  personalRecord: number;
  onSetUpdate: (setIdx: number, field: "weight" | "reps", value: string) => void;
```

- [ ] **Step 2: Atualizar a assinatura da função `ExerciseCard`**

Na desestruturação dos parâmetros da função, adicionar `personalRecord` após `lastSets`:

```typescript
function ExerciseCard({
  name,
  gifUrl,
  targetMuscle,
  equipment,
  instructions,
  sets,
  reps,
  index,
  training,
  setInputs,
  lastSets,
  personalRecord,
  onSetUpdate,
  onSetDone,
  onSwap,
}: { ... })
```

- [ ] **Step 3: Adicionar o badge de PR no loop de sets**

Dentro de `ExerciseCard`, encontrar o `{setInputs.map((s, si) => (` que renderiza cada linha de set (em torno da linha 567). Substituir o conteúdo do map para incluir o badge:

```tsx
{setInputs.map((s, si) => {
  const w = parseFloat(s.weight);
  const r = parseInt(s.reps);
  const current1RM =
    w > 0 && r > 0 ? epley1RM(w, r) : 0;
  const isNewPR =
    current1RM > personalRecord && personalRecord > 0 && !s.done;

  return (
    <div key={si}>
      <div className="flex items-center gap-2">
        {/* Set badge */}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all ${
            s.done
              ? "bg-[var(--success)] text-white"
              : "bg-[var(--surface-2)] text-[var(--text-dim)]"
          }`}
        >
          {si + 1}
        </span>

        {/* Weight */}
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={s.weight}
          onChange={(e) => onSetUpdate(si, "weight", e.target.value)}
          disabled={s.done}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2.5 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] disabled:opacity-50"
        />

        {/* Reps */}
        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={s.reps}
          onChange={(e) => onSetUpdate(si, "reps", e.target.value)}
          disabled={s.done}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2.5 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] disabled:opacity-50"
        />

        {/* Done toggle */}
        <button
          onClick={() => onSetDone(si)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
            s.done
              ? "border-[var(--success)] bg-[var(--success)] text-white shadow-[0_0_10px_rgba(34,197,94,0.2)]"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] hover:border-[var(--red-500)] hover:text-[var(--red-500)]"
          }`}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>

      {/* PR Badge */}
      {isNewPR && (
        <div className="animate-scale-in mt-1.5 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--amber-500)]/15 px-3 py-1.5">
          <span className="text-xs font-bold text-[var(--amber-500)]">
            🏆 Novo PR!
          </span>
          <span className="text-[10px] text-[var(--amber-500)]/70">
            {current1RM.toFixed(1)} kg
          </span>
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 4: Passar `personalRecord` no uso do `ExerciseCard` no JSX**

Encontrar onde `<ExerciseCard` é renderizado (em torno da linha 344). Adicionar a prop `personalRecord`:

```tsx
<ExerciseCard
  key={ex.exercise_id + idx}
  name={name}
  gifUrl={lib?.gif_url}
  targetMuscle={lib?.target_muscle}
  equipment={lib?.equipment}
  instructions={
    lib
      ? generatePortugueseInstructions(lib.target_muscle, lib.equipment)
      : []
  }
  sets={ex.sets}
  reps={ex.reps}
  index={idx}
  training={training}
  setInputs={exInput.sets}
  lastSets={lastPerf[ex.exercise_id] || []}
  personalRecord={prMap[ex.exercise_id] ?? 0}
  onSetUpdate={(setIdx, field, value) =>
    updateSetInput(idx, setIdx, field, value)
  }
  onSetDone={(setIdx) => markSetDone(idx, setIdx)}
  onSwap={
    lib?.target_muscle
      ? () =>
          setSwapModal({
            exIdx: idx,
            exerciseId: ex.exercise_id,
            muscle: lib.target_muscle,
          })
      : undefined
  }
/>
```

- [ ] **Step 5: Verificar tipos**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 6: Verificar visualmente no dev server**

Abrir `http://localhost:3000` e navegar para uma rotina de treino. Entrar no modo de treino. Digitar um peso e reps suficientemente altos (ex: 200 kg × 10 reps) em um exercício com histórico. O badge dourado "🏆 Novo PR! 266.7 kg" deve aparecer abaixo da linha do set.

- [ ] **Step 7: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat: show live PR badge on set when Epley 1RM exceeds personal record"
```

---

## Task 6: Criar `src/components/ProgressChart.tsx`

**Files:**
- Create: `src/components/ProgressChart.tsx`

- [ ] **Step 1: Criar o componente**

Crie `src/components/ProgressChart.tsx` com o seguinte conteúdo:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import { SetPerformance } from "@/types";

type Metric = "1rm" | "volume";

interface ChartPoint {
  dateLabel: string;
  value: number;
}

interface ProgressChartProps {
  userId: string;
}

export default function ProgressChart({ userId }: ProgressChartProps) {
  const [metric, setMetric] = useState<Metric>("1rm");
  const [rm1Data, setRm1Data] = useState<ChartPoint[]>([]);
  const [volumeData, setVolumeData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const logs = await getWorkoutLogs(userId, 60);
        // Ordenar do mais antigo para o mais recente para o gráfico
        const sorted = [...logs].reverse();

        const rm1: ChartPoint[] = [];
        const vol: ChartPoint[] = [];

        for (const log of sorted) {
          const dateLabel = log.date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });

          // Coletar todos os sets de todos os exercícios da sessão
          const allSets: SetPerformance[] = [];
          for (const perf of log.performance) {
            if (perf.sets && perf.sets.length > 0) {
              allSets.push(...perf.sets);
            } else if (
              perf.weight_lifted !== undefined &&
              perf.reps_done !== undefined
            ) {
              allSets.push({ weight: perf.weight_lifted, reps: perf.reps_done });
            }
          }

          if (allSets.length === 0) continue;

          // 1RM médio: média do best1RM de cada exercício
          const perExercise1RM = log.performance.map((perf) => {
            let sets: SetPerformance[] = [];
            if (perf.sets && perf.sets.length > 0) {
              sets = perf.sets;
            } else if (
              perf.weight_lifted !== undefined &&
              perf.reps_done !== undefined
            ) {
              sets = [{ weight: perf.weight_lifted, reps: perf.reps_done }];
            }
            return best1RMFromSets(sets);
          }).filter((v) => v > 0);

          const avg1RM =
            perExercise1RM.length > 0
              ? Math.round(
                  perExercise1RM.reduce((a, b) => a + b, 0) /
                    perExercise1RM.length
                )
              : 0;

          const vol_total = totalVolume(allSets);

          if (avg1RM > 0) rm1.push({ dateLabel, value: avg1RM });
          if (vol_total > 0) vol.push({ dateLabel, value: Math.round(vol_total) });
        }

        setRm1Data(rm1);
        setVolumeData(vol);
      } catch {
        // Erro silencioso — não quebra a página de perfil
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  const chartData = metric === "1rm" ? rm1Data : volumeData;
  const yLabel = metric === "1rm" ? "kg (1RM)" : "kg total";

  if (loading) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (chartData.length < 3) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-xl bg-[var(--surface-2)] px-4">
        <p className="text-center text-sm text-[var(--text-dim)]">
          Complete pelo menos 3 treinos para ver sua evolução
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toggle */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setMetric("1rm")}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
            metric === "1rm"
              ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
              : "bg-[var(--surface-2)] text-[var(--text-dim)]"
          }`}
        >
          Força (1RM)
        </button>
        <button
          onClick={() => setMetric("volume")}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
            metric === "volume"
              ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
              : "bg-[var(--surface-2)] text-[var(--text-dim)]"
          }`}
        >
          Volume
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
        >
          <XAxis
            dataKey="dateLabel"
            stroke="#6B7280"
            tick={{ fontSize: 10, fill: "#6B7280" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#6B7280"
            tick={{ fontSize: 10, fill: "#6B7280" }}
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
            }
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              fontSize: "12px",
              color: "var(--foreground)",
            }}
            formatter={(value: number) => [`${value} ${yLabel}`, ""]}
            labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#EF4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#F59E0B", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProgressChart.tsx
git commit -m "feat: add ProgressChart component with recharts and 1RM/volume toggle"
```

---

## Task 7: Integrar `ProgressChart` na página de Perfil

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Adicionar o import do `ProgressChart`**

No topo de `src/app/profile/page.tsx`, após o import do `BottomNav`:

```typescript
import ProgressChart from "@/components/ProgressChart";
```

- [ ] **Step 2: Adicionar a seção "Análise de Força" no JSX**

Dentro de `<main className="flex flex-1 flex-col gap-5 px-4 py-5">`, adicionar **antes** do `<Section title="Dados pessoais">`:

```tsx
{/* Análise de Força */}
<Section title="Análise de Força">
  <ProgressChart userId={user!.uid} />
</Section>
```

- [ ] **Step 3: Verificar tipos**

```bash
cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Verificar visualmente no dev server**

Abrir `http://localhost:3000` e navegar para a aba Perfil. Deve aparecer a seção "ANÁLISE DE FORÇA" no topo. Se houver menos de 3 treinos no histórico, aparece a mensagem de estado vazio. Se houver 3+, o gráfico de linha vermelho é exibido com toggle entre "Força (1RM)" e "Volume".

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: add strength analysis section with ProgressChart to profile page"
```

---

## Self-Review

### Cobertura do Spec

| Requisito | Task |
|---|---|
| Instalar recharts | Task 1 |
| `src/lib/metrics.ts` com fórmula Epley | Task 2 |
| `epley1RM`, `best1RMFromSets`, `totalVolume` | Task 2 |
| `getPersonalRecords()` buscando histórico | Task 3 |
| Carregar prMap via `Promise.all` no treino | Task 4 |
| Badge "🏆 Novo PR!" com `animate-scale-in` | Task 5 |
| Badge dourado com `--amber-500` | Task 5 |
| Badge desaparece quando set marcado done | Task 5 (condição `!s.done`) |
| `ProgressChart` com recharts LineChart | Task 6 |
| Toggle 1RM / Volume | Task 6 |
| Fundo transparente, linha vermelha, `monotone` | Task 6 |
| Tooltip tema escuro via CSS vars | Task 6 |
| Dados dos últimos 30-60 dias | Task 6 (60 logs) |
| Seção "Análise de Força" na aba Perfil | Task 7 |

### Consistência de Tipos

- `epley1RM(weight, reps)` definida em Task 2, usada em Task 5 — mesma assinatura ✓
- `best1RMFromSets(sets: SetPerformance[])` definida em Task 2, usada em Tasks 3 e 6 ✓
- `totalVolume(sets: SetPerformance[])` definida em Task 2, usada em Task 6 ✓
- `getPersonalRecords(userId)` definida em Task 3, usada em Task 4 ✓
- `prMap[ex.exercise_id] ?? 0` passa `number` para `personalRecord: number` ✓

### Sem Placeholders

Todas as tasks contêm código completo. Sem TBDs ou "similar à task anterior".
