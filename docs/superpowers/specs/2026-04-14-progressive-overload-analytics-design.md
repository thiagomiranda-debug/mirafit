# Design: Análise de Dados e Sobrecarga Progressiva

**Data:** 2026-04-14  
**Status:** Aprovado  

---

## Visão Geral

Implementar o Pilar de Análise de Dados e Sobrecarga Progressiva do MiraFit. O objetivo é dar ao usuário feedback em tempo real sobre recordes pessoais durante o treino e um dashboard de evolução de força na aba Perfil.

---

## Escopo

### O que está incluído
1. `src/lib/metrics.ts` — utilitário puro com fórmula de Epley (1RM) e volume total
2. `getPersonalRecords()` em `workoutLogs.ts` — PR histórico por exercício
3. Badge "🏆 Novo PR!" no `ExerciseCard` da tela `/treino`
4. Componente `ProgressChart` com recharts na aba Perfil

### O que não está incluído
- Persistência de PRs no Firestore (computados on-the-fly a partir do histórico)
- Notificações push de PR
- Comparação de PR entre usuários

---

## Arquitetura (Opção A — Lógica centralizada)

Toda computação de métricas vive em `lib/`, separada dos componentes. Os componentes recebem dados computados via props ou hooks locais.

```
src/lib/metrics.ts          ← novo: epley1RM, best1RMFromSets, totalVolume
src/lib/workoutLogs.ts      ← estendido: getPersonalRecords()
src/app/treino/page.tsx     ← estendido: carrega prMap via Promise.all
src/components/ProgressChart.tsx  ← novo: gráfico recharts
src/app/profile/page.tsx    ← estendido: seção "Análise de Força"
```

---

## Seção 1: `src/lib/metrics.ts`

Arquivo novo, zero dependências externas.

```ts
import { SetPerformance } from "@/types";

/** Fórmula de Epley: 1RM = peso × (1 + reps/30) */
export function epley1RM(weight: number, reps: number): number

/** Melhor 1RM estimado de um array de sets */
export function best1RMFromSets(sets: SetPerformance[]): number

/** Volume total: Σ(peso × reps) de todos os sets */
export function totalVolume(sets: SetPerformance[]): number
```

**Regras de borda:**
- `reps === 0` → retorna `weight` (sem multiplicar)
- `weight === 0` → retorna `0`
- Array vazio → retorna `0`
- Arredondamento para 1 casa decimal

---

## Seção 2: `getPersonalRecords()` em `workoutLogs.ts`

```ts
export async function getPersonalRecords(
  userId: string
): Promise<Record<string, number>>  // exercise_id → melhor 1RM histórico
```

- Busca os últimos **60 logs** via `getWorkoutLogs(userId, 60)`
- Para cada log, para cada `ExercisePerformance`, computa `best1RMFromSets()`
- Guarda o máximo global por `exercise_id`
- Compatível com formato legado (`weight_lifted` / `reps_done`)

**Integração em `/treino`:**

```ts
const [exMap, perfMap, prMap] = await Promise.all([
  getExercisesByIds(ids),
  getLastPerformanceMap(user.uid),
  getPersonalRecords(user.uid),
]);
```

`prMap` é armazenado em `useState<Record<string, number>>({})` e passado ao `ExerciseCard` via prop `personalRecord`.

---

## Seção 3: Badge de PR no `ExerciseCard`

**Nova prop:** `personalRecord: number` (0 se não houver histórico)

**Lógica por set (calculada inline no render):**
```ts
const w = parseFloat(s.weight)
const r = parseInt(s.reps)
const current1RM = (w > 0 && r > 0) ? epley1RM(w, r) : 0
const isNewPR = current1RM > personalRecord && personalRecord > 0 && !s.done
```

**Posicionamento:** Badge em linha separada, abaixo dos inputs de Carga/Reps, antes do botão de concluir. Ocupa a largura total da linha do set quando `isNewPR === true`.

**Design:**
```tsx
{isNewPR && (
  <div className="animate-scale-in col-span-full flex items-center justify-center gap-1
                  rounded-lg bg-[var(--amber-500)]/15 px-3 py-1">
    <span className="text-xs font-bold text-[var(--amber-500)]">🏆 Novo PR!</span>
    <span className="text-[10px] text-[var(--amber-500)]/70">{current1RM.toFixed(1)} kg</span>
  </div>
)}
```

- Badge desaparece quando `s.done === true`
- Badge **não** aparece se `personalRecord === 0` (sem histórico suficiente)

---

## Seção 4: `ProgressChart` na Aba Perfil

**Novo arquivo:** `src/components/ProgressChart.tsx` — `"use client"`

**Dependência:** `recharts` (instalada via `npm install recharts`)

**Props:**
```ts
interface ProgressChartProps {
  userId: string;
}
```

**Dados computados internamente:**
- Busca `getWorkoutLogs(userId, 60)` no mount
- Para cada log, computa:
  - `avg1RM`: média do `best1RMFromSets` de todos os exercícios da sessão
  - `volume`: soma do `totalVolume` de todos os exercícios da sessão
- `dateLabel`: `date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })`
- Ordena cronologicamente (mais antigo → mais recente)

**Toggle de métrica:** `metric: "1rm" | "volume"` — state local. Dois botões pill:
- "Força (1RM)" → exibe `avg1RM`, label Y em "kg"
- "Volume" → exibe `volume`, label Y em "kg total"

**Config recharts:**
```tsx
<ResponsiveContainer width="100%" height={180}>
  <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
    <XAxis dataKey="dateLabel" stroke="var(--text-dim)" tick={{ fontSize: 10 }} tickLine={false} />
    <YAxis stroke="var(--text-dim)" tick={{ fontSize: 10 }} width={45} tickLine={false} axisLine={false} />
    <Tooltip
      contentStyle={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        fontSize: "12px",
      }}
    />
    <Line
      type="monotone"
      dataKey="value"
      stroke="var(--red-500)"
      strokeWidth={2}
      dot={false}
      activeDot={{ r: 4, fill: "var(--amber-500)" }}
    />
  </LineChart>
</ResponsiveContainer>
```

- Fundo transparente (sem `background` no wrapper)
- Sem `CartesianGrid`
- `dot={false}` para linha limpa; ponto ativo em âmbar no hover

**Estados:**
- Loading: spinner `animate-spin` padrão do projeto
- Vazio (< 3 logs): mensagem "Complete pelo menos 3 treinos para ver sua evolução"
- Erro: silencioso (não quebra a página de perfil)

**Integração em `profile/page.tsx`:**
- Nova `<Section title="Análise de Força">` inserida após o `<header>` e **antes** da seção "Dados pessoais"
- `<ProgressChart userId={user.uid} />` dentro da section

---

## Fluxo de Dados

```
workout_history (Firestore)
        ↓ getWorkoutLogs(uid, 60)
        ↓
getPersonalRecords()          getWorkoutLogs() [em ProgressChart]
        ↓                              ↓
prMap: Record<id, 1RM>        logs → computar avg1RM + volume por sessão
        ↓                              ↓
ExerciseCard (prop)           chartData: { dateLabel, value }[]
        ↓                              ↓
badge "🏆 Novo PR!"           <LineChart /> com toggle
```

---

## Considerações Técnicas

- **Bundle size:** recharts adiciona ~150kb (gzip ~50kb). Aceitável para uma PWA de fitness.
- **Leituras Firestore:** `getPersonalRecords` e `getLastPerformanceMap` fazem leituras separadas dos últimos 60 e 20 logs respectivamente. Podem ser unificadas futuramente, mas mantemos separadas por clareza agora.
- **CSS vars em recharts:** Recharts usa SVG inline; `stroke="var(--red-500)"` funciona porque o SVG herda o contexto de CSS do DOM.
- **`ExerciseCard` é função local** em `treino/page.tsx` (não exportada). A prop `personalRecord` é adicionada diretamente na assinatura da função.
