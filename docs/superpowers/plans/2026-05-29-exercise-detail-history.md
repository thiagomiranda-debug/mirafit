# Tela de Detalhe e Histórico por Exercício — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma tela dedicada de detalhe por exercício (estilo Hevy "exercise history") com GIF/instruções, painel de recordes, gráfico com toggle de métrica e histórico sessão a sessão, acessível ao toque a partir da página de Histórico.

**Architecture:** Nova função pura-ish `getExerciseDetail` em `workoutLogs.ts` lê 120 logs do cache e deriva sessões + recordes de um exercício. Nova rota `/exercicio?id=<id>` (query-param + Suspense, padrão `/treino`) renderiza GIF/instruções, recordes, gráfico recharts (`ExerciseProgressChart`) e a lista de sessões. A página `/history` ganha dois pontos de entrada (card da aba Evolução + nome do exercício no `LogCard`).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Firebase/Firestore, recharts, Tailwind CSS 4 + CSS vars.

> **Nota sobre testes:** O projeto não tem infraestrutura de testes (sem jest/vitest). Cada task verifica via `npx tsc --noEmit`, `npm run lint` e verificação visual no dev server. O smoke de lógica pura é feito com `node` ad-hoc onde aplicável.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/workoutLogs.ts` | Modificar | Adicionar tipos `ExerciseSession`/`ExerciseRecords`/`ExerciseDetail` + `getExerciseDetail`; remover `getExerciseHistory` órfão |
| `src/components/ExerciseProgressChart.tsx` | Criar | Gráfico recharts por exercício, recebe pontos já formatados + label da métrica |
| `src/app/exercicio/page.tsx` | Criar | Página de detalhe (Suspense + query-param), GIF/instruções, recordes, gráfico+toggle, lista de sessões |
| `src/app/history/page.tsx` | Modificar | `EvolutionCard` clicável + nome do exercício no `LogCard` clicável → `/exercicio?id=` |

---

## Task 1: Adicionar `getExerciseDetail` e tipos em `workoutLogs.ts`

**Files:**
- Modify: `src/lib/workoutLogs.ts`

- [ ] **Step 1: Remover a função órfã `getExerciseHistory`**

Em `src/lib/workoutLogs.ts`, apagar o bloco inteiro da função `getExerciseHistory` (linhas ~92-118, da assinatura `export async function getExerciseHistory(` até o `}` final que retorna `history`). Nenhum outro arquivo a importa.

- [ ] **Step 2: Garantir os imports necessários**

No topo do arquivo, confirmar que existem (já existem hoje):

```typescript
import { best1RMFromSets, epley1RM, totalVolume } from "@/lib/metrics";
import { getCachedWorkoutLogs, invalidateWorkoutLogs } from "@/lib/workoutLogsCache";
```

O arquivo hoje importa apenas `best1RMFromSets` de `@/lib/metrics` (linha 14). Substituir essa linha pela linha acima (adiciona `epley1RM` e `totalVolume`).

- [ ] **Step 3: Adicionar tipos e a função `getExerciseDetail` no final do arquivo**

Adicionar ao final de `src/lib/workoutLogs.ts`:

```typescript
export interface ExerciseSession {
  date: Date;
  sets: SetPerformance[];
}

export interface ExerciseRecords {
  /** Melhor 1RM estimado (Epley) de qualquer série. */
  best1RM: number;
  /** Maior peso usado em qualquer série (kg). */
  maxWeight: number;
  /** Série com o maior 1RM estimado. */
  bestSet: { weight: number; reps: number } | null;
  /** Mais repetições numa única série. */
  maxReps: number;
  /** Maior volume Σ(peso×reps) somado numa única sessão. */
  bestSessionVol: number;
}

export interface ExerciseDetail {
  /** Sessões que contêm o exercício, mais recente → mais antiga. */
  sessions: ExerciseSession[];
  records: ExerciseRecords;
}

/**
 * Normaliza a performance de um exercício para SetPerformance[].
 * Lida com o formato novo (sets) e o legado (weight_lifted/reps_done).
 * Retorna [] se não houver dado utilizável.
 */
function normalizePerfSets(perf: ExercisePerformance): SetPerformance[] {
  if (perf.sets && perf.sets.length > 0) return perf.sets;
  if (perf.weight_lifted !== undefined && perf.reps_done !== undefined) {
    return [{ weight: perf.weight_lifted, reps: perf.reps_done }];
  }
  return [];
}

/**
 * Detalhe completo de um exercício: todas as sessões registradas (mais recente
 * primeiro) e os recordes pessoais. Lê os últimos 120 logs do cache.
 */
export async function getExerciseDetail(
  userId: string,
  exerciseId: string
): Promise<ExerciseDetail> {
  const logs = await getCachedWorkoutLogs(userId, 120);
  const sessions: ExerciseSession[] = [];

  for (const log of logs) {
    const perf = log.performance.find((p) => p.exercise_id === exerciseId);
    if (!perf) continue;
    const sets = normalizePerfSets(perf);
    if (sets.length === 0) continue;
    const date = log.date instanceof Date ? log.date : new Date(log.date);
    sessions.push({ date, sets });
  }

  // Logs do cache já vêm date desc; garante a ordem mesmo assim.
  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());

  const records: ExerciseRecords = {
    best1RM: 0,
    maxWeight: 0,
    bestSet: null,
    maxReps: 0,
    bestSessionVol: 0,
  };

  for (const session of sessions) {
    const sessionVol = totalVolume(session.sets);
    if (sessionVol > records.bestSessionVol) records.bestSessionVol = sessionVol;

    for (const s of session.sets) {
      if (s.weight > records.maxWeight) records.maxWeight = s.weight;
      if (s.reps > records.maxReps) records.maxReps = s.reps;
      const rm = epley1RM(s.weight, s.reps);
      if (rm > records.best1RM) {
        records.best1RM = rm;
        records.bestSet = { weight: s.weight, reps: s.reps };
      }
    }
  }

  return { sessions, records };
}
```

- [ ] **Step 4: Verificar tipos**

Run: `cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit`
Expected: sem erros. (Se aparecer "best1RMFromSets is declared but never used", ele ainda é usado por `getPersonalRecords`/`getPerfAndRecords` — não deve aparecer.)

- [ ] **Step 5: Smoke da lógica pura com node**

Run:
```bash
cd c:/Users/Teste/Desktop/MiraFit && node -e "const {epley1RM}=require('./src/lib/metrics.ts')" 2>/dev/null; echo "skip-if-ts"
```
Expected: o comando acima pode falhar (TS não roda direto no node) — tudo bem, a verificação real é o `tsc` do Step 4. Não há lógica para smoke isolado aqui além de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workoutLogs.ts
git commit -m "feat(workoutLogs): add getExerciseDetail + types, remove orphan getExerciseHistory"
```

---

## Task 2: Criar `ExerciseProgressChart`

**Files:**
- Create: `src/components/ExerciseProgressChart.tsx`

- [ ] **Step 1: Criar o componente**

Criar `src/components/ExerciseProgressChart.tsx` com o conteúdo:

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

export interface ExerciseChartPoint {
  dateLabel: string;
  value: number;
}

interface ExerciseProgressChartProps {
  data: ExerciseChartPoint[];
  /** Sufixo exibido no tooltip (ex.: "kg", "reps"). */
  unit: string;
}

export default function ExerciseProgressChart({
  data,
  unit,
}: ExerciseProgressChartProps) {
  const [colors, setColors] = useState({
    red: "#EF4444",
    amber: "#F59E0B",
    muted: "#6B7280",
  });

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const red = style.getPropertyValue("--red-500").trim();
    const amber = style.getPropertyValue("--amber-500").trim();
    const muted = style.getPropertyValue("--text-dim").trim();
    setColors({
      red: red || "#EF4444",
      amber: amber || "#F59E0B",
      muted: muted || "#6B7280",
    });
  }, []);

  if (data.length < 2) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-xl bg-[var(--surface-2)] px-4">
        <p className="text-center text-sm text-[var(--text-dim)]">
          Registre este exercício em pelo menos 2 treinos para ver o gráfico
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <XAxis
          dataKey="dateLabel"
          stroke={colors.muted}
          tick={{ fontSize: 10, fill: colors.muted }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke={colors.muted}
          tick={{ fontSize: 10, fill: colors.muted }}
          tickLine={false}
          axisLine={false}
          width={44}
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
          formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => [`${value ?? ""} ${unit}`, ""]}
          labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={colors.red}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: colors.amber, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseProgressChart.tsx
git commit -m "feat(components): add ExerciseProgressChart (recharts, runtime colors)"
```

---

## Task 3: Criar a página `/exercicio`

**Files:**
- Create: `src/app/exercicio/page.tsx`

- [ ] **Step 1: Criar o arquivo da página**

Criar `src/app/exercicio/page.tsx` com o conteúdo:

```tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getExercisesByIds } from "@/lib/workouts";
import { getExerciseDetail, ExerciseDetail } from "@/lib/workoutLogs";
import { LibraryExercise } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";
import { generatePortugueseInstructions } from "@/lib/exerciseInstructions";
import { best1RMFromSets, totalVolume } from "@/lib/metrics";
import ExerciseProgressChart, {
  ExerciseChartPoint,
} from "@/components/ExerciseProgressChart";
import { haptic } from "@/lib/haptics";

const MUSCLE_NAME_PT: Record<string, string> = {
  abductors: "Abdutores",
  abs: "Abdômen",
  adductors: "Adutores",
  biceps: "Bíceps",
  calves: "Panturrilhas",
  cardiovascular_system: "Sistema Cardiovascular",
  delts: "Deltoides",
  forearms: "Antebraços",
  glutes: "Glúteos",
  hamstrings: "Posterior de Coxa",
  lats: "Dorsal",
  levator_scapulae: "Levantador da Escápula",
  pectorals: "Peitorais",
  quads: "Quadríceps",
  serratus_anterior: "Serrátil Anterior",
  spine: "Coluna",
  traps: "Trapézio",
  triceps: "Tríceps",
  upper_back: "Costas Superior",
};

function translateMuscle(name: string | undefined): string {
  if (!name) return "";
  return MUSCLE_NAME_PT[name.toLowerCase()] || name;
}

type Metric = "weight" | "1rm" | "volume" | "reps";

const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "weight", label: "Peso máx", unit: "kg" },
  { key: "1rm", label: "1RM", unit: "kg" },
  { key: "volume", label: "Volume", unit: "kg" },
  { key: "reps", label: "Reps", unit: "reps" },
];

export default function ExercisePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ExerciseContent />
    </Suspense>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
    </div>
  );
}

function ExerciseContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const exerciseId = searchParams.get("id");

  const [lib, setLib] = useState<LibraryExercise | null>(null);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [metric, setMetric] = useState<Metric>("weight");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    async function load() {
      if (!user || !exerciseId) return;
      setLoading(true);
      setError(false);
      try {
        const [exMap, det] = await Promise.all([
          getExercisesByIds([exerciseId]),
          getExerciseDetail(user.uid, exerciseId),
        ]);
        setLib(exMap[exerciseId] ?? null);
        setDetail(det);
      } catch (err) {
        console.error("[ExercisePage]", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (user && exerciseId) load();
  }, [user, exerciseId]);

  const chartData: ExerciseChartPoint[] = useMemo(() => {
    if (!detail) return [];
    // Mais antigo → mais recente para o gráfico.
    const asc = [...detail.sessions].reverse();
    return asc.map((s) => {
      const dateLabel = s.date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      });
      let value = 0;
      if (metric === "weight") value = Math.max(...s.sets.map((x) => x.weight));
      else if (metric === "1rm") value = Math.round(best1RMFromSets(s.sets));
      else if (metric === "volume") value = Math.round(totalVolume(s.sets));
      else value = Math.max(...s.sets.map((x) => x.reps));
      return { dateLabel, value };
    });
  }, [detail, metric]);

  const activeUnit = METRICS.find((m) => m.key === metric)!.unit;
  const exName = lib
    ? translateExerciseName(lib.name)
    : exerciseId
    ? translateExerciseName(exerciseId.replace(/-/g, " "))
    : "Exercício";

  if (authLoading || loading) return <Spinner />;

  if (!exerciseId || error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--background)] px-8 text-center">
        <p className="text-sm font-semibold text-[var(--text-muted)]">
          Não foi possível carregar este exercício.
        </p>
        <button
          onClick={() => router.back()}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-2)]"
        >
          Voltar
        </button>
      </div>
    );
  }

  const records = detail?.records;
  const sessions = detail?.sessions ?? [];
  const instructions = lib
    ? generatePortugueseInstructions(lib.target_muscle, lib.equipment)
    : [];

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-6">
        <button
          onClick={() => {
            haptic("light");
            router.back();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--foreground)]"
          aria-label="Voltar"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1
            className="truncate text-2xl capitalize text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            {exName}
          </h1>
          {lib?.target_muscle && (
            <p className="text-xs text-[var(--text-dim)]">
              {translateMuscle(lib.target_muscle)}
            </p>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 py-3">
        {/* GIF */}
        {lib?.gif_url && imgOk ? (
          <div className="flex justify-center overflow-hidden rounded-2xl bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lib.gif_url}
              alt={exName}
              loading="lazy"
              onError={() => setImgOk(false)}
              className="max-h-56 object-contain"
            />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/fallback-exercise.svg" alt="Exercício" className="h-12 w-12 opacity-30" />
          </div>
        )}

        {/* Instruções */}
        {instructions.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Como executar
            </h2>
            <ol className="space-y-1.5">
              {instructions.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-[var(--text-muted)]">
                  <span className="font-bold text-[var(--red-500)]">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Recordes */}
        {records && sessions.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Recordes
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <RecordCard label="🏆 Melhor 1RM" value={`${records.best1RM} kg`} />
              <RecordCard label="Peso máximo" value={`${records.maxWeight} kg`} />
              <RecordCard
                label="Melhor série"
                value={
                  records.bestSet
                    ? `${records.bestSet.weight}kg × ${records.bestSet.reps}`
                    : "—"
                }
              />
              <RecordCard
                label="Maior volume"
                value={`${records.bestSessionVol.toLocaleString("pt-BR")} kg`}
              />
            </div>
          </section>
        )}

        {/* Gráfico + toggle */}
        {sessions.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              Evolução
            </h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => {
                    haptic("light");
                    setMetric(m.key);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    metric === m.key
                      ? "bg-[var(--amber-500)]/20 text-[var(--amber-500)]"
                      : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <ExerciseProgressChart data={chartData} unit={activeUnit} />
          </section>
        )}

        {/* Histórico sessão a sessão */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
            Histórico
          </h2>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">
              <p className="text-sm font-medium text-[var(--text-muted)]">
                Você ainda não registrou este exercício
              </p>
              <p className="mt-1 text-xs text-[var(--text-dim)]">
                Complete um treino com ele para ver o histórico aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sessions.map((s, i) => (
                <SessionRow key={i} date={s.date} sets={s.sets} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function RecordCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-3.5 py-3"
      style={{ background: "var(--surface-gradient)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {label}
      </p>
      <p
        className="mt-1 text-xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SessionRow({
  date,
  sets,
}: {
  date: Date;
  sets: { weight: number; reps: number }[];
}) {
  const formatted = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: "var(--surface-gradient)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="mb-1.5 text-xs font-semibold text-[var(--text-dim)]">{formatted}</p>
      <div className="flex flex-wrap gap-1.5">
        {sets.map((s, i) => (
          <span
            key={i}
            className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text-muted)]"
          >
            {s.weight}kg × {s.reps}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificar lint**

Run: `cd c:/Users/Teste/Desktop/MiraFit && npm run lint`
Expected: sem erros (os comentários `eslint-disable-next-line @next/next/no-img-element` silenciam o aviso de `<img>`, igual ao padrão usado em `/treino`).

- [ ] **Step 4: Verificação visual (dev server)**

Iniciar `npm run dev`. Acessar manualmente `http://localhost:3000/exercicio?id=<ALGUM_ID_VALIDO>` (pegar um id real do histórico). Conferir: header com voltar, GIF, instruções, 4 cards de recorde, toggle de 4 métricas alternando o gráfico, lista de sessões. Testar também `/exercicio?id=inexistente-xyz` → deve mostrar página sem recordes/gráfico, com estado vazio do histórico; e `/exercicio` (sem id) → tela de erro com "Voltar".

- [ ] **Step 5: Commit**

```bash
git add src/app/exercicio/page.tsx
git commit -m "feat(exercicio): per-exercise detail page (GIF, records, chart toggle, session history)"
```

---

## Task 4: Pontos de entrada em `/history`

**Files:**
- Modify: `src/app/history/page.tsx`

- [ ] **Step 1: Importar `useRouter`**

No topo de `src/app/history/page.tsx`, a linha de import já traz `useRouter`:

```typescript
import { useRouter } from "next/navigation";
```

Confirmar que existe (já existe — linha 4). O componente `HistoryPage` já cria `const router = useRouter();` (linha 51). Os subcomponentes `LogCard` e `EvolutionCard` NÃO têm acesso a esse `router`, então cada um criará o seu próprio.

- [ ] **Step 2: Tornar o `EvolutionCard` clicável**

Em `src/app/history/page.tsx`, no componente `EvolutionCard`, adicionar `import { useRouter } from "next/navigation";` já está no topo. Dentro da função `EvolutionCard`, adicionar no início do corpo (antes do `const first = data[0];`):

```typescript
  const router = useRouter();
```

Depois, no JSX do `EvolutionCard`, transformar o `<div className="animate-fade-in overflow-hidden rounded-2xl border ...">` externo em clicável. Substituir a abertura da `<div>` raiz:

```tsx
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
```

por:

```tsx
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        haptic("light");
        router.push(`/exercicio?id=${encodeURIComponent(exerciseId)}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/exercicio?id=${encodeURIComponent(exerciseId)}`);
        }
      }}
      className="tactile animate-fade-in cursor-pointer overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 transition-colors hover:border-[var(--red-500)]/40"
    >
```

(`haptic` já está importado no arquivo — linha 15.)

- [ ] **Step 3: Tornar o nome do exercício no `LogCard` clicável**

No componente `LogCard`, adicionar no início do corpo da função (antes do `const date = ...`):

```typescript
  const router = useRouter();
```

No JSX da tabela do `LogCard`, encontrar a célula que renderiza o nome:

```tsx
                    <td className="py-2 capitalize text-[var(--text-muted)]">
                      {name}
                    </td>
```

Substituir por um botão que navega:

```tsx
                    <td className="py-2 capitalize">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic("light");
                          router.push(
                            `/exercicio?id=${encodeURIComponent(p.exercise_id)}`
                          );
                        }}
                        className="text-left capitalize text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--red-500)] hover:underline"
                      >
                        {name}
                      </button>
                    </td>
```

- [ ] **Step 4: Verificar tipos**

Run: `cd c:/Users/Teste/Desktop/MiraFit && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Verificar lint**

Run: `cd c:/Users/Teste/Desktop/MiraFit && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Verificação visual (dev server)**

Com `npm run dev` rodando, acessar `http://localhost:3000/history`:
- Aba "Evolução": tocar num card → navega para `/exercicio?id=...` correto.
- Aba "Treinos": expandir um `LogCard` → tocar no nome de um exercício → navega para o detalhe daquele exercício (e o clique no nome NÃO recolhe/expande o card, graças ao `stopPropagation`).

- [ ] **Step 7: Commit**

```bash
git add src/app/history/page.tsx
git commit -m "feat(history): link Evolução cards and LogCard exercise names to /exercicio detail"
```

---

## Self-Review

### Cobertura do Spec

| Requisito do spec | Task |
|---|---|
| Rota `/exercicio?id=` com Suspense + query-param | Task 3 |
| `getExerciseDetail(uid, exerciseId)` lendo 120 logs | Task 1 |
| Tipos `ExerciseSession`/`ExerciseRecords`/`ExerciseDetail` | Task 1 |
| Remover `getExerciseHistory` órfão | Task 1 (Step 1) |
| Normalização de formato legado | Task 1 (`normalizePerfSets`) |
| `ExerciseProgressChart` recharts com cores runtime | Task 2 |
| Header (voltar + nome traduzido + músculo) | Task 3 |
| GIF + instruções PT-BR | Task 3 |
| Painel de 4 recordes (1RM, peso máx, melhor série, maior volume) | Task 3 |
| Gráfico com toggle de 4 métricas (peso/1RM/volume/reps) | Task 3 |
| Histórico sessão a sessão | Task 3 |
| Estado: sem id / inexistente / 1 sessão / erro / loading | Task 3 (gráfico oculto <2 pts via Task 2; erro/loading/empty na página) |
| Sem BottomNav, `pb-20` | Task 3 (container `pb-20`, sem `<BottomNav/>`) |
| Entrada aba Evolução (card clicável) | Task 4 (Step 2) |
| Entrada aba Treinos (nome no LogCard) | Task 4 (Step 3) |
| Não tocar `/treino` | Respeitado (nenhuma task modifica `src/app/treino`) |

### Scan de Placeholders

Nenhum "TBD"/"TODO"/"handle edge cases" — todo passo de código traz o código completo. ✓

### Consistência de Tipos

- `getExerciseDetail` retorna `ExerciseDetail { sessions: ExerciseSession[]; records: ExerciseRecords }` (Task 1) — consumido em Task 3 via `detail.sessions`/`detail.records`. ✓
- `ExerciseRecords.bestSet` é `{ weight; reps } | null` (Task 1) — Task 3 guarda com `records.bestSet ? ... : "—"`. ✓
- `ExerciseProgressChart` props `{ data: ExerciseChartPoint[]; unit: string }` (Task 2) — Task 3 passa `data={chartData}` (tipo `ExerciseChartPoint[]`) e `unit={activeUnit}` (string). ✓
- `ExerciseChartPoint { dateLabel; value }` (Task 2) — `chartData` em Task 3 produz exatamente esse shape. ✓
- `getExerciseDetail` importado em Task 3 de `@/lib/workoutLogs` — exportado em Task 1. ✓
- `best1RMFromSets`/`totalVolume`/`epley1RM` de `@/lib/metrics` — já existentes (lidos no spec). ✓

### Decisão sobre dados

`getExerciseDetail` usa `getCachedWorkoutLogs(userId, 120)` (teto do cache). `EvolutionCard` na `/history` continua usando seus próprios dados (30 logs); a discrepância é aceitável — o card é só preview; a página de detalhe é a fonte completa (120). Documentado aqui para o executor não "consertar".
