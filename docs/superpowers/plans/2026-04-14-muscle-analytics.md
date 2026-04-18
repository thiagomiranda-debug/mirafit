# Muscle Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a tela `/analytics` com distribuição de volume por grupo muscular e drill-down de evolução por músculo, acessível via novo ícone no BottomNav.

**Architecture:** Dois novos arquivos (`analytics/page.tsx` + `MuscleAnalytics.tsx`) mais uma modificação no `BottomNav.tsx`. Toda a computação é client-side sobre os logs já buscados do Firestore — sem novas escritas. Reutiliza `getWorkoutLogs`, `getExercisesByIds`, `best1RMFromSets`, `totalVolume` e recharts (já instalado).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 com CSS vars, Firebase Firestore (read-only), recharts.

---

## Estrutura de Arquivos

| Arquivo | Ação |
|---|---|
| `src/components/BottomNav.tsx` | Modificar — adicionar 4º item "Análise" entre Home e Histórico |
| `src/app/analytics/page.tsx` | Criar — auth guard + renderiza MuscleAnalytics + BottomNav |
| `src/components/MuscleAnalytics.tsx` | Criar — toda a lógica e UI (distribuição + drill-down) |

---

### Task 1: Adicionar ícone "Análise" no BottomNav

**Files:**
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Inserir o novo item na array NAV_ITEMS**

O novo item vai entre `"/"` (Início) e `"/history"` (Histórico). O ícone usa barras ascendentes para diferenciar visualmente do ícone de Histórico.

Substituir o array `NAV_ITEMS` atual por:

```typescript
const NAV_ITEMS = [
  {
    href: "/",
    label: "Início",
    icon: (active: boolean) => (
      <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" />
        )}
      </svg>
    ),
  },
  {
    href: "/analytics",
    label: "Análise",
    icon: (active: boolean) => (
      <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path d="M3 20v-5h3v5H3zm5.5 0V10h3v10h-3zm5.5 0V6h3v14h-3z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 20v-5h3v5H3zm5.5 0V10h3v10h-3zm5.5 0V6h3v14h-3z" />
        )}
      </svg>
    ),
  },
  {
    href: "/history",
    label: "Histórico",
    icon: (active: boolean) => (
      <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0v-4a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0v-4a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        )}
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Perfil",
    icon: (active: boolean) => (
      <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        )}
      </svg>
    ),
  },
];
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: add Analytics icon to BottomNav"
```

---

### Task 2: Criar `src/app/analytics/page.tsx`

**Files:**
- Create: `src/app/analytics/page.tsx`

- [ ] **Step 1: Criar o arquivo**

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import MuscleAnalytics from "@/components/MuscleAnalytics";
import BottomNav from "@/components/BottomNav";

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <MuscleAnalytics userId={user.uid} />
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: erro de módulo `MuscleAnalytics` não encontrado (ainda não criado) — normal, será resolvido na Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat: add /analytics page shell"
```

---

### Task 3: Criar `src/components/MuscleAnalytics.tsx`

**Files:**
- Create: `src/components/MuscleAnalytics.tsx`

- [ ] **Step 1: Criar o componente completo**

```typescript
"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { getExercisesByIds } from "@/lib/workouts";
import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import { translateExerciseName } from "@/lib/exerciseNames";
import { WorkoutLog, LibraryExercise, SetPerformance } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionPoint {
  dateLabel: string;
  avg1RM: number;
  volume: number;
}

interface ExerciseSummary {
  exerciseId: string;
  name: string;
  bestPR: number;
  lastDate: Date;
}

interface MuscleData {
  muscle: string;
  sessions: SessionPoint[]; // ordenado cronologicamente (mais antigo → mais recente)
  exercises: ExerciseSummary[]; // ordenado por lastDate desc
}

type Period = 7 | 30 | 90;
type Metric = "1rm" | "volume";

// ─── Component ────────────────────────────────────────────────────────────────

export default function MuscleAnalytics({ userId }: { userId: string }) {
  const [allLogs, setAllLogs] = useState<WorkoutLog[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, LibraryExercise>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(30);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("1rm");
  const [chartColors, setChartColors] = useState({
    red: "#EF4444",
    amber: "#F59E0B",
    muted: "#6B7280",
  });

  // Resolve CSS vars para recharts (precisa do DOM)
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setChartColors({
      red: style.getPropertyValue("--red-500").trim() || "#EF4444",
      amber: style.getPropertyValue("--amber-500").trim() || "#F59E0B",
      muted: style.getPropertyValue("--text-dim").trim() || "#6B7280",
    });
  }, []);

  // Busca logs + exercícios uma única vez
  useEffect(() => {
    async function load() {
      try {
        const logs = await getWorkoutLogs(userId, 90);
        const ids = [
          ...new Set(logs.flatMap((l) => l.performance.map((p) => p.exercise_id))),
        ];
        const exMap = ids.length > 0 ? await getExercisesByIds(ids) : {};
        setAllLogs(logs);
        setExerciseMap(exMap);
      } catch {
        // falha silenciosa — não quebra a tela
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  // ─── Computa MuscleData para todos os 90 logs (para sessions e exercises) ──

  const muscleDataMap = useMemo((): Record<string, MuscleData> => {
    if (allLogs.length === 0 || Object.keys(exerciseMap).length === 0) return {};

    const map: Record<string, MuscleData> = {};

    // logs vêm do Firestore em ordem desc (mais recente primeiro)
    for (const log of allLogs) {
      // Acumula 1RM e volume por músculo nesta sessão
      const sessionAcc: Record<string, { rms: number[]; vol: number }> = {};

      for (const perf of log.performance) {
        const ex = exerciseMap[perf.exercise_id];
        if (!ex) continue;
        const muscle = ex.target_muscle;

        // Normaliza sets (suporta formato legado)
        let sets: SetPerformance[];
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
        const vol = totalVolume(sets);

        // Accumula para SessionPoint desta sessão
        if (!sessionAcc[muscle]) sessionAcc[muscle] = { rms: [], vol: 0 };
        sessionAcc[muscle].rms.push(pr);
        sessionAcc[muscle].vol += vol;

        // Garante que o músculo existe no map
        if (!map[muscle]) {
          map[muscle] = { muscle, sessions: [], exercises: [] };
        }

        // ExerciseSummary — primeira aparição = mais recente (logs são desc)
        const existing = map[muscle].exercises.find(
          (e) => e.exerciseId === perf.exercise_id
        );
        if (!existing) {
          map[muscle].exercises.push({
            exerciseId: perf.exercise_id,
            name: translateExerciseName(ex.name),
            bestPR: pr,
            lastDate: log.date,
          });
        } else {
          if (pr > existing.bestPR) existing.bestPR = pr;
          // lastDate já é a mais recente (primeira inserção)
        }
      }

      // Cria SessionPoint para cada músculo desta sessão
      const dateLabel = log.date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      });
      for (const [muscle, acc] of Object.entries(sessionAcc)) {
        if (!map[muscle]) map[muscle] = { muscle, sessions: [], exercises: [] };
        const avg1RM =
          acc.rms.length > 0
            ? Math.round(acc.rms.reduce((a, b) => a + b, 0) / acc.rms.length)
            : 0;
        map[muscle].sessions.push({
          dateLabel,
          avg1RM,
          volume: Math.round(acc.vol),
        });
      }
    }

    // Inverte sessions para ordem cronológica (antigo → recente)
    for (const d of Object.values(map)) {
      d.sessions.reverse();
      d.exercises.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
    }

    return map;
  }, [allLogs, exerciseMap]);

  // ─── Distribuição filtrada pelo período selecionado ───────────────────────

  const distribution = useMemo(() => {
    const cutoff = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
    const periodLogs = allLogs.filter((l) => l.date >= cutoff);

    const volByMuscle: Record<string, number> = {};
    for (const log of periodLogs) {
      for (const perf of log.performance) {
        const ex = exerciseMap[perf.exercise_id];
        if (!ex) continue;
        let sets: SetPerformance[];
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
        volByMuscle[ex.target_muscle] =
          (volByMuscle[ex.target_muscle] ?? 0) + totalVolume(sets);
      }
    }

    return Object.entries(volByMuscle)
      .map(([muscle, vol]) => ({ muscle, vol: Math.round(vol) }))
      .sort((a, b) => b.vol - a.vol);
  }, [allLogs, exerciseMap, period]);

  const periodLogCount = allLogs.filter(
    (l) => l.date >= new Date(Date.now() - period * 24 * 60 * 60 * 1000)
  ).length;
  const maxVol = distribution[0]?.vol ?? 1;

  // Dados do drill-down
  const drillData = selectedMuscle ? muscleDataMap[selectedMuscle] : null;
  const chartData =
    drillData?.sessions.map((s) => ({
      dateLabel: s.dateLabel,
      value: metric === "1rm" ? s.avg1RM : s.volume,
    })) ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="px-5 pb-1 pt-6">
        <h1
          className="text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          ANÁLISE MUSCULAR
        </h1>
        <p className="text-xs text-[var(--text-dim)]">
          Distribuição de volume por grupo
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {/* Toggle de período */}
        <div className="flex gap-2">
          {([7, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                period === p
                  ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
                  : "bg-[var(--surface-2)] text-[var(--text-dim)]"
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>

        {/* Empty state */}
        {periodLogCount < 3 && (
          <div className="flex h-32 items-center justify-center rounded-xl bg-[var(--surface-2)] px-4">
            <p className="text-center text-sm text-[var(--text-dim)]">
              Complete pelo menos 3 treinos neste período para ver a análise
            </p>
          </div>
        )}

        {/* Barras de distribuição */}
        {periodLogCount >= 3 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="space-y-4">
              {distribution.map(({ muscle, vol }) => (
                <button
                  key={muscle}
                  onClick={() => setSelectedMuscle(muscle)}
                  className="w-full text-left"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-[var(--foreground)]">
                      {muscle}
                    </span>
                    <span className="text-xs text-[var(--text-dim)]">
                      {vol.toLocaleString("pt-BR")} kg
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-2 rounded-full bg-[var(--red-500)] transition-all duration-700"
                      style={{ width: `${(vol / maxVol) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Drill-down bottom-sheet */}
      {selectedMuscle && drillData && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSelectedMuscle(null)}
          />

          {/* Painel */}
          <div className="animate-slide-up fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5">
            {/* Cabeçalho */}
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-2xl uppercase text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {selectedMuscle}
              </h2>
              <button
                onClick={() => setSelectedMuscle(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Toggle de métrica */}
            <div className="mb-3 flex gap-2">
              {(["1rm", "volume"] as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    metric === m
                      ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
                      : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {m === "1rm" ? "Força (1RM)" : "Volume"}
                </button>
              ))}
            </div>

            {/* Gráfico de linha */}
            {chartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                >
                  <XAxis
                    dataKey="dateLabel"
                    stroke={chartColors.muted}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={chartColors.muted}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
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
                    formatter={(
                      value:
                        | number
                        | string
                        | ReadonlyArray<number | string>
                        | undefined
                    ) => [
                      `${value ?? ""} ${metric === "1rm" ? "kg (1RM)" : "kg total"}`,
                      "",
                    ]}
                    labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={chartColors.red}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: chartColors.amber, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="mb-4 flex h-20 items-center justify-center rounded-xl bg-[var(--surface-2)]">
                <p className="text-xs text-[var(--text-dim)]">
                  Treine mais vezes para ver a evolução
                </p>
              </div>
            )}

            {/* Cards de exercícios */}
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                Exercícios
              </p>
              {drillData.exercises.map((ex) => {
                const daysAgo = Math.floor(
                  (Date.now() - ex.lastDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                const daysLabel =
                  daysAgo === 0
                    ? "hoje"
                    : daysAgo === 1
                    ? "há 1 dia"
                    : `há ${daysAgo} dias`;
                return (
                  <div
                    key={ex.exerciseId}
                    className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2.5"
                  >
                    <span className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                      {ex.name}
                    </span>
                    <div className="ml-2 flex shrink-0 flex-col items-end">
                      <span className="text-xs font-bold text-[var(--amber-500)]">
                        PR: {ex.bestPR.toFixed(1)} kg
                      </span>
                      <span className="text-[10px] text-[var(--text-dim)]">
                        {daysLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Verificar no browser**

Abrir `http://localhost:3000/analytics`:
1. BottomNav exibe 4 ícones: Início · Análise · Histórico · Perfil
2. Ícone "Análise" ativo (vermelho) na tela `/analytics`
3. Header "ANÁLISE MUSCULAR" visível em Bebas Neue
4. Toggle 7/30/90 dias funciona
5. Se usuário tem ≥ 3 logs no período: barras horizontais aparecem ordenadas por volume
6. Toque em uma barra: bottom-sheet desliza (animate-slide-up)
7. Bottom-sheet exibe nome do músculo, toggle Força/Volume, gráfico (se ≥ 2 sessões), cards de exercício com PR e "há X dias"
8. Toque no overlay ou × fecha o bottom-sheet
9. Se usuário tem < 3 logs: empty state aparece

- [ ] **Step 4: Commit**

```bash
git add src/components/MuscleAnalytics.tsx
git commit -m "feat: add MuscleAnalytics component with distribution bars and drill-down"
```

---

## Verificação Final

```bash
npx tsc --noEmit   # zero erros de tipo
npm run build      # build de produção sem erros
```

Navegar pela tela em modo mobile (DevTools → iPhone SE):
- Barras de progresso animam ao carregar (duration-700)
- Bottom-sheet não ultrapassa 80vh em telas pequenas (overflow-y-auto)
- 4 ícones do BottomNav cabem sem quebrar layout
