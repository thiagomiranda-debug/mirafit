# Design: Análise Muscular por Grupo

**Data:** 2026-04-14
**Status:** Aprovado

---

## Visão Geral

Implementar uma tela dedicada de análise muscular (`/analytics`) acessível pelo BottomNav. O usuário vê a distribuição de volume por grupo muscular no período selecionado e pode fazer drill-down em qualquer músculo para ver a evolução de força e volume ao longo do tempo, além dos PRs individuais por exercício.

---

## Escopo

### O que está incluído
1. Nova rota `/analytics` com página wrapper
2. Componente `MuscleAnalytics` com distribuição de volume por músculo
3. Toggle de período (7 / 30 / 90 dias)
4. Bottom-sheet de drill-down por músculo com gráfico de linha e cards de exercício
5. Adição do 4º ícone "Análise" no `BottomNav`

### O que não está incluído
- Persistência de dados de análise no Firestore (tudo computado on-the-fly)
- Notificações de músculos negligenciados
- Comparação entre usuários
- Exportação de dados

---

## Arquitetura

```
src/app/analytics/page.tsx          ← novo: wrapper com Suspense + auth guard
src/components/MuscleAnalytics.tsx  ← novo: toda lógica e UI
src/components/BottomNav.tsx        ← modificado: 4º ícone "Análise"
```

**Fluxo de dados (client-side, sem novas escritas no Firestore):**
```
getWorkoutLogs(uid, 90)          ← workoutLogs.ts (existente)
getExercisesByIds(ids)           ← workouts.ts (existente)
        ↓
Agrupa ExercisePerformance por exercise.target_muscle
        ↓
Distribuição: totalVolume(sets) por músculo, filtrado pelo período
Evolução:     avg best1RMFromSets + totalVolume por sessão de um músculo
```

**Funções reutilizadas:**
- `getWorkoutLogs(userId, 90)` — `src/lib/workoutLogs.ts`
- `getExercisesByIds(ids)` — `src/lib/workouts.ts`
- `best1RMFromSets(sets)` — `src/lib/metrics.ts`
- `totalVolume(sets)` — `src/lib/metrics.ts`

---

## Seção 1: Página `/analytics`

**`src/app/analytics/page.tsx`**

- Auth guard: redireciona para `/login` se não autenticado (padrão existente)
- Wrapper `<Suspense>` com spinner padrão do projeto
- Container raiz com `pb-20` (espaço para o BottomNav)
- Renderiza `<MuscleAnalytics userId={user.uid} />`

---

## Seção 2: Distribuição Muscular

**Componente:** `MuscleAnalytics` (`"use client"`)

**Estado interno:**
- `period: 7 | 30 | 90` — padrão 30
- `selectedMuscle: string | null` — controla abertura do drill-down
- `data: MuscleData[]` — computado no mount e quando `period` muda
- `loading: boolean`

**Tipo `MuscleData`:**
```ts
interface MuscleData {
  muscle: string;               // target_muscle do Firestore (PT-BR)
  totalVolume: number;          // Σ(peso × reps) no período
  sessions: SessionPoint[];     // para o gráfico de evolução
  exercises: ExerciseSummary[]; // PR e última data por exercício
}

interface SessionPoint {
  dateLabel: string;  // dd/mmm em pt-BR
  avg1RM: number;     // média do best1RM dos exercícios do grupo na sessão
  volume: number;     // Σ volume dos exercícios do grupo na sessão
}
// Nota: sessions sempre usa os 90 logs completos (independente do toggle de período).
// O toggle de período afeta apenas as barras de distribuição, não o gráfico do drill-down.

interface ExerciseSummary {
  exerciseId: string;
  name: string;       // nome traduzido via translateExerciseName()
  bestPR: number;     // best1RMFromSets() máximo histórico (todos os logs)
  lastDate: Date;     // data do log mais recente com esse exercício
}
```

**Toggle de período:**
```
[7 dias]  [30 dias]  [90 dias]
```
Pill buttons com estado ativo em âmbar (`bg-[var(--amber-500)]/20 text-[var(--amber-500)]`), padrão do `ProgressChart`.

**Barras horizontais (sem recharts — HTML puro):**
```
[nome músculo]  [████████████░░░░]  4.200 kg
```
- Container: `w-full bg-[var(--surface-2)] rounded-full h-2`
- Fill: `bg-[var(--red-500)] rounded-full h-2 transition-all duration-700`
- Largura proporcional ao maior volume (= 100%)
- Toque na linha → `setSelectedMuscle(muscle)` — abre o drill-down
- Ordenação: maior volume primeiro

**Empty state:** `< 3 logs` no período → mensagem padrão do projeto.

**Loading:** spinner `h-8 w-8` centralizado.

---

## Seção 3: Drill-down por Músculo (Bottom-Sheet)

Disparado por `selectedMuscle !== null`. Bottom-sheet com `animate-slide-up` (keyframe existente em `globals.css`).

**Overlay:** `fixed inset-0 bg-black/50 z-40` — toque fora fecha (via `onClick` no overlay).

**Painel:**
```
fixed bottom-0 left-0 right-0 z-50
rounded-t-3xl bg-[var(--surface)] p-5
max-h-[80vh] overflow-y-auto
animate-slide-up
```

**Cabeçalho:**
- Nome do músculo em Bebas Neue (`text-2xl`)
- Botão × no canto direito

**Toggle de métrica:** `Força (1RM) · Volume` — mesmo padrão do `ProgressChart`

**Gráfico de linha (recharts):**
- `<ResponsiveContainer width="100%" height={160}>`
- `<LineChart>` com configuração idêntica ao `ProgressChart` existente
- `dataKey="avg1RM"` ou `"volume"` conforme toggle
- Sem CartesianGrid, `dot={false}`, stroke `var(--red-500)`, activeDot âmbar
- Mínimo 2 pontos para renderizar; abaixo disso mostra apenas os cards

**Cards de exercício (abaixo do gráfico):**
```
[nome traduzido]    PR: 120,0 kg    há 3 dias
[nome traduzido]    PR: 95,0 kg     há 10 dias
```
- "há X dias" calculado a partir de `lastDate` vs hoje
- PR em kg com 1 casa decimal
- Ordenado por `lastDate` desc (mais recente primeiro)

---

## Seção 4: BottomNav

**`src/components/BottomNav.tsx`** — adicionar 4º item entre Home e Histórico:

```
Home  |  Análise  |  Histórico  |  Perfil
```

- Ícone SVG: gráfico de barras (3 barras verticais, inline como os demais)
- Label: "Análise"
- `href="/analytics"`
- Ativo quando `pathname === "/analytics"`
- Cores: `text-[var(--red-500)]` ativo, `text-[var(--text-dim)]` inativo

---

## Considerações Técnicas

- **Leituras Firestore:** uma query de 90 logs + uma batch de exercícios por IDs únicos. Ambas já usadas em outras partes do app.
- **Barras horizontais sem recharts:** a distribuição muscular é melhor renderizada com HTML/CSS puro (sem overhead de SVG para um elemento simples).
- **Formato legado:** `ExercisePerformance` pode ter `weight_lifted`/`reps_done` em vez de `sets[]` — tratar da mesma forma que `getPersonalRecords` e `getPerfAndRecords`.
- **Nomes de músculo:** `target_muscle` já vem em PT-BR do Firestore (seeded). Usar diretamente.
- **Nomes de exercício:** usar `translateExerciseName(exercise.name)` para exibição.
