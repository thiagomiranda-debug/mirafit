# Modo TAF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar eventos de corrida 300m / 1600m ao modo TAF, criar um fluxo dedicado para registrar tentativas (TAF completo ou evento avulso) e exibir histórico de evolução por evento.

**Architecture:** Nova coleção Firestore `taf_attempts` (imutável, por usuário). `TafDashboard` lê dela + `workout_history` existente para mostrar PR. Nova página `/taf/tentativa` implementa o wizard. Histórico renderiza via `recharts` + lista. Funções de pontuação são puras, validadas por um smoke script Node.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Client SDK (Firestore), Tailwind CSS 4, recharts, React 19.

**Verification model:** O projeto não tem framework de testes. Seguimos a convenção do `CLAUDE.md`: `npm run lint`, `npx tsc --noEmit`, execução manual em browser. Para funções puras (scoring/parse/format) criamos um smoke script Node rodável via `node scripts/smoke-taf.mjs` — mesmo padrão de `scripts/seed-exercises.mjs`.

**Referência:** Spec em `docs/superpowers/specs/2026-04-18-taf-mode-design.md`. Dados do edital: CBMAL BGO Nº 145 (03/08/2023), Anexo A, Tabelas 1 (Masculino) e 2 (Feminino).

---

## File Structure

### New files

| Caminho | Responsabilidade |
|---|---|
| `src/lib/tafAttempts.ts` | CRUD tipado da coleção Firestore `taf_attempts` |
| `src/app/taf/tentativa/page.tsx` | Página do wizard TAF completo + evento avulso |
| `src/components/TafHistoryChart.tsx` | Mini-gráficos recharts (1 por evento) |
| `src/components/TafAttemptList.tsx` | Lista cronológica das tentativas |
| `scripts/smoke-taf.mjs` | Sanity check das funções puras de `tafData.ts` |
| `docs/superpowers/specs/taf-edital-cbmal.md` | Transcrição em markdown das Tabelas 1 e 2 (fonte única de verdade para os tiers) |

### Modified files

| Caminho | O que muda |
|---|---|
| `src/lib/tafData.ts` | Adiciona `TafRunKey`, `TafEventKey`, `tafRunStandards`, `scoreRunTime`, `parseTimeInput`, `formatRunTime`, `TAF_EVENT_LABELS`, `getTafEventsForGender` |
| `src/components/TafDashboard.tsx` | Integra leitura de `taf_attempts`, adiciona 2 cards de corrida, adiciona botão "Iniciar Modo TAF", adiciona seção de histórico |
| `firestore.rules` | Adiciona regra para coleção `taf_attempts` (create/read/delete por dono, update bloqueado) |
| `CLAUDE.md` | Documenta a nova coleção e o índice composto `taf_attempts(user_id ASC, date DESC)` |

---

## Pre-requisite: Transcrever tabela do edital

A pontuação das corridas depende de ~40 linhas de dados por gênero (homens têm mais tiers pelas 3 faixas etárias). Antes da Task 2, a engenharia precisa do conteúdo exato das tabelas.

**Ação da Task 0 (abaixo):** criar `docs/superpowers/specs/taf-edital-cbmal.md` transcrevendo em markdown as Tabelas 1 e 2 do BGO Nº 145. Esse arquivo vira a fonte única consultada pela Task 2 para popular os tiers.

Se o arquivo já existir, pular para Task 1.

---

## Task 0: Transcrever tabela do edital para markdown

**Files:**
- Create: `docs/superpowers/specs/taf-edital-cbmal.md`

**Contexto:** O edital BGO Nº 145 do CBMAL (03/08/2023) — Anexo A, Tabela 1 (Masculino) e Tabela 2 (Feminino) — define as pontuações por faixa etária e performance nos 5 eventos. Apenas as colunas 4.a (Corrida 300m) e 5.a (Corrida 1600m) nos interessam, além da coluna de pontuação por faixa etária (≤30, 31-40, >40).

- [ ] **Step 1: Localizar a fonte**

Opções (em ordem de preferência):
1. PDF oficial do BGO Nº 145 do CBMAL (pesquisar por `"BGO 145" CBMAL TAF corrida 300m`).
2. Screenshot anexado pelo usuário na issue que originou este feature (contexto da brainstorming).

- [ ] **Step 2: Transcrever em markdown**

Criar `docs/superpowers/specs/taf-edital-cbmal.md` com o formato:

````markdown
# TAF CBMAL — BGO Nº 145 (03/08/2023)

Tabelas 1 e 2 do Anexo A, apenas colunas relevantes para o modo TAF do app (corrida 300m e 1600m).

## Tabela 1 — Masculino

### Corrida 300m (coluna 4.a)

| Tempo (máximo inclusive) | Pts ≤30 anos | Pts 31-40 anos | Pts >40 anos |
|---|---|---|---|
| > 1'46"99 | 0 | — | — |
| 1'44"00–1'46"99 | 10 | 0 | — |
| 1'42"00–1'43"99 | 20 | 10 | 0 |
| ... (transcrever todas as linhas da tabela) |
| < 1'05"00 | 100 | 100 | 100 |

### Corrida 1600m (coluna 5.a)

| Tempo (máximo inclusive) | Pts ≤30 anos | Pts 31-40 anos | Pts >40 anos |
|---|---|---|---|
| > 11'17"99 | 0 | — | — |
| ... |
| < 06'25" | 100 | 100 | 100 |

## Tabela 2 — Feminino

### Corrida 300m (coluna 4.a)

(mesmo formato)

### Corrida 1600m (coluna 5.a)

(mesmo formato)
````

Regras de transcrição:
- Converter notação `mm'ss"cc` para segundos com 2 casas decimais (ex: `1'22"99` = `82.99`)
- `> X` significa "pior que X" — corresponde à linha `0 pts`
- `< X` significa "melhor que X" — corresponde à linha `100 pts`
- Faixas intermediárias são do tipo `min–max`; gravar o `max` (tempo pior aceito para ganhar essa nota)
- Células com `—` (vazias) indicam que aquela faixa etária não pontua naquele tier (o tier não é o mínimo dela)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/taf-edital-cbmal.md
git commit -m "docs: transcribe TAF CBMAL score tables from BGO Nº 145"
```

---

## Task 1: Adicionar tipos + utilitários de tempo em `tafData.ts`

**Files:**
- Modify: `src/lib/tafData.ts`

Adiciona tipos para eventos de corrida e helpers de conversão de tempo. Sem lógica de scoring ainda — isso vem na Task 2.

- [ ] **Step 1: Adicionar tipos no topo do arquivo (após `TafAgeGroup`)**

Em `src/lib/tafData.ts`, após a linha `export type TafAgeGroup = ...`, adicionar:

```ts
export type TafRunKey = 'run_300m' | 'run_1600m';
export type TafEventKey = TafExerciseKey | TafRunKey;

export const TAF_EVENT_LABELS: Record<TafEventKey, string> = {
  pull_up: 'Barra Fixa',
  push_up: 'Flexão de Braço',
  crunch: 'Abdominal',
  run_300m: 'Corrida 300m',
  run_1600m: 'Corrida 1600m',
};
```

Remover o export `TAF_LABELS` antigo (era `Record<TafExerciseKey, string>`) e ajustar o import em `TafDashboard.tsx` para usar `TAF_EVENT_LABELS` — **atenção**: fazer isso no Step 5, depois de garantir que o novo mapa existe.

- [ ] **Step 2: Adicionar `getTafEventsForGender`**

Após `getTafExercisesForGender`, adicionar:

```ts
/** Retorna todos os eventos TAF aplicáveis ao sexo informado, na ordem padrão do edital. */
export function getTafEventsForGender(gender: TafGender): TafEventKey[] {
  if (gender === 'masculino') {
    return ['pull_up', 'push_up', 'crunch', 'run_300m', 'run_1600m'];
  }
  return ['push_up', 'crunch', 'run_300m', 'run_1600m'];
}
```

- [ ] **Step 3: Adicionar helpers de tempo no final do arquivo**

```ts
/**
 * Converte string de tempo em segundos (float).
 * Aceita formatos: "mm:ss", "mm:ss.cc", "ss.cc", "ss".
 * Retorna null se inválido.
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Formato "mm:ss" ou "mm:ss.cc"
  const withMinutes = trimmed.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (withMinutes) {
    const min = parseInt(withMinutes[1], 10);
    const sec = parseInt(withMinutes[2], 10);
    const cs = withMinutes[3] ? parseInt(withMinutes[3].padEnd(2, '0'), 10) : 0;
    if (sec >= 60) return null;
    return min * 60 + sec + cs / 100;
  }

  // Formato "ss" ou "ss.cc"
  const onlySeconds = trimmed.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (onlySeconds) {
    const sec = parseInt(onlySeconds[1], 10);
    const cs = onlySeconds[2] ? parseInt(onlySeconds[2].padEnd(2, '0'), 10) : 0;
    return sec + cs / 100;
  }

  return null;
}

/**
 * Formata segundos no formato apropriado para o evento.
 * 300m  → "m:ss.cc" (com centésimos)
 * 1600m → "mm:ss"   (sem centésimos)
 */
export function formatRunTime(seconds: number, event: TafRunKey): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
  if (event === 'run_300m') {
    return `${min}:${sec.toFixed(2).padStart(5, '0')}`;
  }
  return `${min.toString().padStart(2, '0')}:${Math.round(sec).toString().padStart(2, '0')}`;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (nenhum erro).

- [ ] **Step 5: Atualizar import em TafDashboard**

Abrir `src/components/TafDashboard.tsx`, na lista de imports de `@/lib/tafData`:
- Trocar `TAF_LABELS` por `TAF_EVENT_LABELS`
- Em `TAF_LABELS[r.key]` no JSX, trocar para `TAF_EVENT_LABELS[r.key]`

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tafData.ts src/components/TafDashboard.tsx
git commit -m "feat(taf): add run event types and time utilities"
```

---

## Task 2: Adicionar scoring de corridas + tiers do edital

**Files:**
- Modify: `src/lib/tafData.ts`
- Reference: `docs/superpowers/specs/taf-edital-cbmal.md`

- [ ] **Step 1: Adicionar estrutura dos tiers**

Após `tafStandards` em `tafData.ts`:

```ts
/**
 * Tier de pontuação por tempo. `maxSeconds` é o pior tempo (inclusive)
 * que ainda ganha `score` pontos nesta faixa etária.
 * Ordenados do melhor (menor tempo) para o pior (maior tempo).
 */
export interface TafRunTier {
  maxSeconds: number;
  score: number; // 0..100
}

/**
 * Tabela de pontuação das corridas, transcrita do edital CBMAL BGO Nº 145.
 * Ver docs/superpowers/specs/taf-edital-cbmal.md para a fonte.
 */
export const tafRunStandards: Record<
  TafGender,
  Record<TafAgeGroup, Record<TafRunKey, TafRunTier[]>>
> = {
  masculino: {
    under_30: {
      run_300m: [
        // Transcrever da Tabela 1 → Corrida 300m → coluna "Pts ≤30 anos"
        // Ordem: do melhor para o pior tempo.
        // Exemplo: { maxSeconds: 65, score: 100 }, { maxSeconds: 67.99, score: 90 }, ...
      ],
      run_1600m: [/* Tabela 1 → 1600m → ≤30 */],
    },
    '31_40': {
      run_300m: [/* Tabela 1 → 300m → 31-40 */],
      run_1600m: [/* Tabela 1 → 1600m → 31-40 */],
    },
    over_40: {
      run_300m: [/* Tabela 1 → 300m → >40 */],
      run_1600m: [/* Tabela 1 → 1600m → >40 */],
    },
  },
  feminino: {
    under_30: {
      run_300m: [/* Tabela 2 → 300m → ≤30 */],
      run_1600m: [/* Tabela 2 → 1600m → ≤30 */],
    },
    '31_40': {
      run_300m: [/* Tabela 2 → 300m → 31-40 */],
      run_1600m: [/* Tabela 2 → 1600m → 31-40 */],
    },
    over_40: {
      run_300m: [/* Tabela 2 → 300m → >40 */],
      run_1600m: [/* Tabela 2 → 1600m → >40 */],
    },
  },
};
```

- [ ] **Step 2: Popular os tiers a partir do markdown**

Ler `docs/superpowers/specs/taf-edital-cbmal.md`. Para cada linha da tabela onde a coluna de faixa etária tem um valor (não `—`), criar um `{ maxSeconds, score }`.

Regras:
- Linha `< X` (a melhor) — `maxSeconds` = `X convertido em segundos - 0.01` OU simplesmente usar o X como "teto". Para simplificar, usamos `maxSeconds: X - 0.01`, tratando a melhor tier como fronteira inferior.
- Linha `min–max` — `maxSeconds = max convertido em segundos`
- Linha `> X` (a pior) — ignorar (é a linha de 0 pts; o scoring retorna 0 implicitamente)

Ordenar cada array do MENOR `maxSeconds` (maior nota) para o MAIOR (menor nota).

Exemplo masculino ≤30 anos, 300m (ilustrativo — transcrever valores reais):
```ts
run_300m: [
  { maxSeconds: 64.99, score: 100 }, // "< 1'05"00"
  { maxSeconds: 67.99, score: 90 },  // "1'05"00–1'07"99"
  { maxSeconds: 70.99, score: 80 },  // "1'08"00–1'10"99"
  // ... até a última tier com pontos (não incluir a de 0 pts)
],
```

- [ ] **Step 3: Adicionar função `scoreRunTime`**

Após `repsForScore` em `tafData.ts`:

```ts
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
```

- [ ] **Step 4: Adicionar helper para o "faltam X segundos"**

```ts
/**
 * Retorna quantos segundos o candidato precisa reduzir no tempo atual
 * para atingir `targetScore`, considerando a tabela do sexo/idade/evento.
 * Retorna 0 se já atingiu ou superou. Retorna null se não há tier para esse alvo.
 */
export function secondsToReachScore(
  currentSeconds: number,
  targetScore: number,
  gender: TafGender,
  age: TafAgeGroup,
  event: TafRunKey
): number | null {
  const tiers = tafRunStandards[gender][age][event];
  // Melhor tier que tem score >= targetScore (menor maxSeconds que atinge o alvo)
  const target = tiers.find((t) => t.score >= targetScore);
  if (!target) return null;
  const delta = currentSeconds - target.maxSeconds;
  return delta <= 0 ? 0 : delta;
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tafData.ts
git commit -m "feat(taf): score runs via tiered lookup from CBMAL edital"
```

---

## Task 3: Smoke test das funções puras de `tafData.ts`

**Files:**
- Create: `scripts/smoke-taf.mjs`

Script Node puro que importa funções de `tafData.ts` (via `.ts`/tsx loader) — como o projeto já roda `.mjs` scripts (ex: `seed-exercises.mjs`), seguimos o mesmo padrão. Usa `tsx` caso esteja disponível ou `node --experimental-strip-types` (Node ≥ 22).

- [ ] **Step 1: Criar o script**

```javascript
// scripts/smoke-taf.mjs
// Run: npx tsx scripts/smoke-taf.mjs
//   (ou: node --experimental-strip-types scripts/smoke-taf.mjs se tiver Node 22+)

import {
  parseTimeInput,
  formatRunTime,
  scoreRunTime,
  calculateTafScore,
  secondsToReachScore,
} from '../src/lib/tafData.ts';

let failures = 0;
function assertEq(actual, expected, label) {
  const ok = actual === expected || (typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) < 0.001);
  const status = ok ? 'OK' : 'FAIL';
  console.log(`[${status}] ${label} — got ${actual}, expected ${expected}`);
  if (!ok) failures++;
}

console.log('--- parseTimeInput ---');
assertEq(parseTimeInput('1:20.50'), 80.5, 'parse mm:ss.cc');
assertEq(parseTimeInput('8:45'), 525, 'parse mm:ss');
assertEq(parseTimeInput('45.30'), 45.3, 'parse ss.cc');
assertEq(parseTimeInput('45'), 45, 'parse ss');
assertEq(parseTimeInput('1:60'), null, 'reject seconds >= 60');
assertEq(parseTimeInput('abc'), null, 'reject garbage');
assertEq(parseTimeInput(''), null, 'reject empty');

console.log('\n--- formatRunTime ---');
assertEq(formatRunTime(72.5, 'run_300m'), '1:12.50', 'format 300m');
assertEq(formatRunTime(525, 'run_1600m'), '08:45', 'format 1600m');
assertEq(formatRunTime(0, 'run_300m'), '0:00.00', 'format zero 300m');

console.log('\n--- calculateTafScore (reps) ---');
// Sanity: base=24, mult=5 (flexão masculino ≤30) → 24 reps = 50 pts, 34 reps = 100 pts
assertEq(calculateTafScore(24, 24, 5), 50, 'flexão 24 reps = 50 pts');
assertEq(calculateTafScore(34, 24, 5), 100, 'flexão 34 reps = 100 pts (clamped)');
assertEq(calculateTafScore(14, 24, 5), 0, 'flexão 14 reps = 0 pts (clamped)');

console.log('\n--- scoreRunTime monotonicity ---');
// Propriedade: tempo menor (melhor) nunca tem score menor que tempo maior (pior)
const times = [60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120];
let lastScore = 101;
for (const t of times) {
  const s = scoreRunTime(t, 'masculino', 'under_30', 'run_300m');
  const monotone = s <= lastScore;
  console.log(`  300m ${t}s (masc ≤30) → ${s} pts ${monotone ? 'OK' : 'FAIL (não-monotônico)'}`);
  if (!monotone) failures++;
  lastScore = s;
}

console.log('\n--- scoreRunTime endpoints ---');
// Tempo absurdamente bom → 100
assertEq(scoreRunTime(10, 'masculino', 'under_30', 'run_300m'), 100, '10s 300m masc ≤30 = 100 pts');
// Tempo absurdamente ruim → 0
assertEq(scoreRunTime(999, 'masculino', 'under_30', 'run_300m'), 0, '999s 300m masc ≤30 = 0 pts');

console.log('\n--- secondsToReachScore ---');
// Se já tem 100 pts, delta para 100 = 0
const fastTime = 30; // 30s em 300m é garantido 100 pts
assertEq(secondsToReachScore(fastTime, 100, 'masculino', 'under_30', 'run_300m'), 0, 'já 100 pts → 0s para reduzir');

console.log(`\n${failures === 0 ? 'ALL OK' : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Rodar o script**

Run: `npx tsx scripts/smoke-taf.mjs`
Expected: todas as linhas `[OK]`, exit code 0.

Se `tsx` não estiver instalado: `npm install -D tsx` (ou rodar via `node --experimental-strip-types` em Node 22+).

Se quaisquer linhas falharem em `scoreRunTime endpoints`, significa que os tiers não foram transcritos corretamente na Task 2 — voltar e corrigir.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-taf.mjs
git commit -m "chore: add smoke test for TAF scoring functions"
```

---

## Task 4: Criar `src/lib/tafAttempts.ts`

**Files:**
- Create: `src/lib/tafAttempts.ts`

Helpers Firestore para a nova coleção `taf_attempts`. Seguir padrão de `src/lib/workoutLogs.ts`: funções exportadas, uso de `getFirebaseDb()`, mapeamento explícito de `Timestamp → Date` na leitura.

- [ ] **Step 1: Criar o arquivo**

```ts
// src/lib/tafAttempts.ts
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { TafEventKey, TafGender, TafAgeGroup } from "@/lib/tafData";

export interface TafEventResult {
  event: TafEventKey;
  /** reps (inteiro) OU segundos (float, para corridas) */
  value: number;
  score: number; // 0..100
  skipped?: boolean;
}

export type TafAttemptType = 'full' | 'single';

export interface TafAttempt {
  id: string;
  user_id: string;
  date: Date;
  type: TafAttemptType;
  gender: TafGender;
  age_group: TafAgeGroup;
  results: TafEventResult[];
  total_score: number;
}

interface CreateTafAttemptInput {
  user_id: string;
  type: TafAttemptType;
  gender: TafGender;
  age_group: TafAgeGroup;
  results: TafEventResult[];
}

export async function createTafAttempt(input: CreateTafAttemptInput): Promise<string> {
  const db = getFirebaseDb();
  const total_score = input.results.reduce((sum, r) => sum + r.score, 0);

  const payload: Record<string, unknown> = {
    user_id: input.user_id,
    date: serverTimestamp(),
    type: input.type,
    gender: input.gender,
    age_group: input.age_group,
    results: input.results,
    total_score,
  };

  const docRef = await addDoc(collection(db, "taf_attempts"), payload);
  return docRef.id;
}

export async function getTafAttempts(
  userId: string,
  maxResults: number = 30
): Promise<TafAttempt[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "taf_attempts"),
      where("user_id", "==", userId),
      orderBy("date", "desc"),
      limit(maxResults)
    )
  );

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      user_id: data.user_id,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
      type: data.type,
      gender: data.gender,
      age_group: data.age_group,
      results: data.results ?? [],
      total_score: data.total_score ?? 0,
    } as TafAttempt;
  });
}

/**
 * Melhor valor por evento (menor tempo para corridas, maior reps para reps).
 * Retorna `{ event: { value, score } }`.
 */
export async function getBestTafResults(
  userId: string
): Promise<Partial<Record<TafEventKey, { value: number; score: number }>>> {
  const attempts = await getTafAttempts(userId, 100);
  const best: Partial<Record<TafEventKey, { value: number; score: number }>> = {};

  for (const attempt of attempts) {
    for (const r of attempt.results) {
      if (r.skipped) continue;
      const current = best[r.event];
      // Score mais alto ganha. Empate → valor "melhor" ganha: mais reps (reps) OU menor tempo (corrida).
      if (!current || r.score > current.score) {
        best[r.event] = { value: r.value, score: r.score };
      }
    }
  }

  return best;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tafAttempts.ts
git commit -m "feat(taf): add taf_attempts Firestore helpers"
```

---

## Task 5: Atualizar `firestore.rules` para `taf_attempts`

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Adicionar bloco de regras**

Após o bloco `match /workout_history/{logId}`, adicionar:

```javascript
// Tentativas de TAF: imutáveis após criação, só o dono acessa
match /taf_attempts/{attemptId} {
  allow read, delete: if request.auth != null && resource.data.user_id == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.user_id == request.auth.uid;
  allow update: if false;
}
```

- [ ] **Step 2: Deploy manual (usuário)**

As regras precisam ser deployadas manualmente via Firebase Console → Firestore → Rules → colar o conteúdo atualizado. O `CLAUDE.md` já documenta esse fluxo.

Observação: enquanto as regras não forem deployadas, leituras/escritas do client falharão com `permission-denied`. O desenvolvedor pode testar ad-hoc com `allow read, write: if request.auth != null` temporariamente, **jamais em produção**.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(taf): firestore rules for taf_attempts collection"
```

---

## Task 6: Mesclar leitura de `taf_attempts` no `TafDashboard`

**Files:**
- Modify: `src/components/TafDashboard.tsx`

Mudar o hook de load para também buscar `getBestTafResults`. Pra reps (pull_up, push_up, crunch): PR do dashboard = `max(PR via workout_history, valor de taf_attempts)`. Pra runs: só `taf_attempts`.

- [ ] **Step 1: Adicionar imports e estender o tipo `TafResult`**

No topo de `TafDashboard.tsx`, adicionar/alterar imports:

```ts
import {
  TafGender,
  TafAgeGroup,
  TafEventKey,
  TafExerciseKey,
  TafRunKey,
  tafStandards,
  tafRunStandards,
  calculateTafScore,
  scoreRunTime,
  repsForScore,
  secondsToReachScore,
  matchExerciseToTaf,
  getTafEventsForGender,
  formatRunTime,
  TAF_EVENT_LABELS,
  AGE_GROUP_LABELS,
} from "@/lib/tafData";
import { getBestTafResults } from "@/lib/tafAttempts";
```

Substituir a interface `TafResult` por uma união discriminada:

```ts
type TafResult =
  | {
      kind: 'reps';
      key: TafExerciseKey;
      maxReps: number;
      score: number;
      base: number;
      mult: number;
    }
  | {
      kind: 'run';
      key: TafRunKey;
      bestSeconds: number | null;
      score: number;
    };
```

- [ ] **Step 2: Reescrever o `load()` do `useEffect`**

Substituir o corpo atual do `load()` pelo seguinte:

```ts
async function load() {
  setLoading(true);
  try {
    // 1) Logs de treino (PRs automáticos por nome, como antes)
    const logs = await getWorkoutLogs(userId, 60);
    const idsSet = new Set<string>();
    for (const log of logs) for (const perf of log.performance) idsSet.add(perf.exercise_id);

    const exerciseMap = idsSet.size > 0
      ? await getExercisesByIds(Array.from(idsSet))
      : {};

    const idToTaf: Record<string, TafExerciseKey> = {};
    for (const [id, ex] of Object.entries(exerciseMap)) {
      const cat = matchExerciseToTaf(ex.name);
      if (cat) idToTaf[id] = cat;
    }

    const maxRepsFromLogs: Partial<Record<TafExerciseKey, number>> = {};
    for (const log of logs) {
      for (const perf of log.performance) {
        const cat = idToTaf[perf.exercise_id];
        if (!cat) continue;
        let reps = 0;
        if (perf.sets && perf.sets.length > 0) {
          reps = Math.max(...perf.sets.map((s) => s.reps));
        } else if (perf.reps_done !== undefined) {
          reps = perf.reps_done;
        }
        if (reps > (maxRepsFromLogs[cat] ?? 0)) maxRepsFromLogs[cat] = reps;
      }
    }

    // 2) Best de taf_attempts
    const bestFromAttempts = await getBestTafResults(userId);

    // 3) Merge por evento
    const events = getTafEventsForGender(gender!);
    const repsStandards = tafStandards[gender!][ageGroup!];
    const runStandards = tafRunStandards[gender!][ageGroup!];

    const built: TafResult[] = events.map((key): TafResult => {
      if (key === 'run_300m' || key === 'run_1600m') {
        const attempt = bestFromAttempts[key];
        return {
          kind: 'run',
          key,
          bestSeconds: attempt?.value ?? null,
          score: attempt?.score ?? 0,
        };
      }
      const std = repsStandards[key];
      const logsReps = maxRepsFromLogs[key] ?? 0;
      const attemptValue = bestFromAttempts[key]?.value ?? 0;
      const maxReps = Math.max(logsReps, attemptValue);
      const score = std ? calculateTafScore(maxReps, std.base, std.mult) : 0;
      return {
        kind: 'reps',
        key,
        maxReps,
        score,
        base: std?.base ?? 0,
        mult: std?.mult ?? 0,
      };
    });

    setResults(built);
    setReady(true);

    // Silence unused var warning — runStandards é consultado implicitamente por scoreRunTime dentro de getBestTafResults; manter como hint explícito de contrato.
    void runStandards;
  } catch {
    setReady(true);
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: Atualizar render dos cards**

Substituir o `results.map(...)` que renderiza cada card pelo abaixo. Cada tipo de resultado renderiza formato diferente:

```tsx
{results.map((r) => {
  const scoreColor =
    r.score >= 100
      ? 'var(--success)'
      : r.score >= 50
      ? 'var(--amber-500)'
      : 'var(--red-500)';

  const barColor =
    r.score >= 100
      ? 'bg-[var(--success)]'
      : r.score >= 50
      ? 'bg-[var(--amber-500)]'
      : 'bg-[var(--red-500)]';

  return (
    <div
      key={r.key}
      className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="mb-3 flex items-start justify-between">
        <p className="text-sm font-bold text-[var(--foreground)]">
          {TAF_EVENT_LABELS[r.key]}
        </p>
        <span
          className="text-2xl leading-none"
          style={{ fontFamily: "var(--font-bebas)", color: scoreColor }}
        >
          {Math.round(r.score)} pts
        </span>
      </div>

      {r.kind === 'reps' ? (
        <RepsCardBody r={r} />
      ) : (
        <RunCardBody r={r} gender={gender!} ageGroup={ageGroup!} />
      )}

      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.round(r.score)}%` }}
        />
      </div>

      <p className="text-xs font-semibold" style={{ color: scoreColor }}>
        {indicatorTextFor(r, gender!, ageGroup!)}
      </p>
    </div>
  );
})}
```

- [ ] **Step 4: Adicionar subcomponentes e helper no mesmo arquivo**

No fim do arquivo (após o `export default`):

```tsx
function RepsCardBody({ r }: {
  r: Extract<TafResult, { kind: 'reps' }>;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-1">
      <span className="text-3xl text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)" }}>
        {r.maxReps}
      </span>
      <span className="text-xs text-[var(--text-dim)]">reps (seu PR)</span>
      <span className="ml-auto text-xs text-[var(--text-dim)]">
        mínimo: {r.base} reps
      </span>
    </div>
  );
}

function RunCardBody({ r, gender, ageGroup }: {
  r: Extract<TafResult, { kind: 'run' }>;
  gender: TafGender;
  ageGroup: TafAgeGroup;
}) {
  const tiers = tafRunStandards[gender][ageGroup][r.key];
  const minSecondsForApproval = tiers.find((t) => t.score >= 50)?.maxSeconds;

  return (
    <div className="mb-3 flex items-baseline gap-1">
      <span className="text-3xl text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)" }}>
        {r.bestSeconds != null ? formatRunTime(r.bestSeconds, r.key) : '—'}
      </span>
      <span className="text-xs text-[var(--text-dim)]">melhor tempo</span>
      {minSecondsForApproval != null && (
        <span className="ml-auto text-xs text-[var(--text-dim)]">
          mínimo: {formatRunTime(minSecondsForApproval, r.key)}
        </span>
      )}
    </div>
  );
}

function indicatorTextFor(r: TafResult, gender: TafGender, ageGroup: TafAgeGroup): string {
  if (r.kind === 'reps') {
    if (r.score >= 100) return 'Nota máxima! Excelente desempenho.';
    if (r.score >= 50) {
      const repsTo100 = repsForScore(100, r.base, r.mult) - r.maxReps;
      return `Aprovado! Faltam ${repsTo100} rep${repsTo100 !== 1 ? 's' : ''} para a pontuação máxima.`;
    }
    const repsTo50 = r.base - r.maxReps;
    return r.maxReps === 0
      ? `Reprovado. Mínimo: ${r.base} reps (50 pts).`
      : `Reprovado. Faltam ${repsTo50} rep${repsTo50 !== 1 ? 's' : ''} para o mínimo (50 pts).`;
  }

  // kind === 'run'
  if (r.bestSeconds == null) return 'Nenhum registro. Toque em "Iniciar Modo TAF" para registrar.';
  if (r.score >= 100) return 'Nota máxima! Excelente desempenho.';

  if (r.score >= 50) {
    const delta = secondsToReachScore(r.bestSeconds, 100, gender, ageGroup, r.key);
    return delta == null || delta === 0
      ? 'Aprovado!'
      : `Aprovado! Reduza ${delta.toFixed(2)}s para a pontuação máxima.`;
  }

  const delta = secondsToReachScore(r.bestSeconds, 50, gender, ageGroup, r.key);
  return delta == null
    ? 'Reprovado. Tempo fora da tabela.'
    : `Reprovado. Reduza ${delta.toFixed(2)}s para atingir o mínimo (50 pts).`;
}
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/TafDashboard.tsx
git commit -m "feat(taf): merge taf_attempts and render run cards"
```

---

## Task 7: Botão "Iniciar Modo TAF" no `TafDashboard`

**Files:**
- Modify: `src/components/TafDashboard.tsx`

- [ ] **Step 1: Importar Link**

No topo: `import Link from "next/link";`

- [ ] **Step 2: Renderizar botão**

No JSX do `TafDashboard`, acima do `{/* Empty state */}`, adicionar:

```tsx
{/* CTA: Iniciar Modo TAF */}
{gender && ageGroup && (
  <Link
    href="/taf/tentativa"
    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--red-500)] to-[var(--amber-500)] px-4 py-3.5 text-sm font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
  >
    <span>⏱️</span>
    <span>INICIAR MODO TAF</span>
  </Link>
)}
```

- [ ] **Step 3: Type-check + verificação manual**

Run: `npx tsc --noEmit`
Expected: PASS.

Manual: abrir `/profile`, aba TAF, confirmar visualmente que o botão aparece com gradiente vermelho→âmbar acima dos cards e navega para `/taf/tentativa` (a rota ainda não existe; Next mostra 404 — aceitável até Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/components/TafDashboard.tsx
git commit -m "feat(taf): add 'Iniciar Modo TAF' CTA button"
```

---

## Task 8: Scaffold `/taf/tentativa` — tela de seleção de tipo

**Files:**
- Create: `src/app/taf/tentativa/page.tsx`

- [ ] **Step 1: Criar arquivo com tela inicial**

```tsx
// src/app/taf/tentativa/page.tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile } from "@/lib/userProfile";
import { useEffect } from "react";
import {
  TafGender,
  TafAgeGroup,
  TafEventKey,
  getTafEventsForGender,
  TAF_EVENT_LABELS,
} from "@/lib/tafData";

type Screen = 'select_type' | 'wizard' | 'single' | 'summary';

function TentativaInner() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [gender, setGender] = useState<TafGender | null>(null);
  const [ageGroup, setAgeGroup] = useState<TafAgeGroup | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>('select_type');

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then((p) => {
      if (p?.gender && p.age_group) {
        setGender(p.gender as TafGender);
        setAgeGroup(p.age_group as TafAgeGroup);
      }
      setProfileLoaded(true);
    });
  }, [user]);

  if (authLoading || !profileLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  if (!gender || !ageGroup) {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6">
        <p className="text-sm text-[var(--foreground)]">
          Complete seu perfil (sexo e faixa etária) antes de iniciar o Modo TAF.
        </p>
        <button
          onClick={() => router.push('/profile')}
          className="mt-4 rounded-xl bg-[var(--red-500)] px-4 py-2 text-white"
        >
          Ir para Perfil
        </button>
      </div>
    );
  }

  if (screen === 'select_type') {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6">
        <header className="mb-6">
          <button
            onClick={() => router.push('/profile')}
            className="text-sm text-[var(--text-dim)]"
          >
            ← Voltar
          </button>
          <h1
            className="mt-4 text-3xl text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            MODO TAF
          </h1>
          <p className="text-xs text-[var(--text-dim)]">
            Escolha como quer registrar sua tentativa.
          </p>
        </header>

        <div className="space-y-3">
          <button
            onClick={() => setScreen('wizard')}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--red-500)]"
          >
            <p className="text-xs font-bold uppercase text-[var(--red-500)]">TAF Completo</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              Registrar os {gender === 'masculino' ? '5' : '4'} eventos em sequência
            </p>
            <p className="mt-2 text-xs text-[var(--text-dim)]">
              Uma tentativa = nota total somada dos eventos.
            </p>
          </button>

          <button
            onClick={() => setScreen('single')}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--amber-500)]"
          >
            <p className="text-xs font-bold uppercase text-[var(--amber-500)]">Evento Avulso</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              Registrar apenas um exercício
            </p>
            <p className="mt-2 text-xs text-[var(--text-dim)]">
              Útil pra testar um evento específico de cada vez.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // Placeholders — Tasks 9 e 10 implementam.
  return <div className="p-4 text-white">Tela {screen} em construção.</div>;
}

export default function TentativaPage() {
  return (
    <Suspense fallback={null}>
      <TentativaInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verificação manual**

- `npm run dev`
- Abrir `http://localhost:3000/taf/tentativa`
- Deve mostrar tela com dois cards: "TAF Completo" e "Evento Avulso"
- Botão "← Voltar" leva para `/profile`
- Se sexo/faixa etária não configurados: mostra prompt para ir ao perfil

- [ ] **Step 4: Commit**

```bash
git add src/app/taf/tentativa/page.tsx
git commit -m "feat(taf): scaffold /taf/tentativa with type selection"
```

---

## Task 9: Wizard "TAF Completo"

**Files:**
- Modify: `src/app/taf/tentativa/page.tsx`

- [ ] **Step 1: Adicionar estados do wizard**

Logo após os `useState` existentes em `TentativaInner`:

```ts
const [wizardIndex, setWizardIndex] = useState(0);
const [wizardResults, setWizardResults] = useState<Record<TafEventKey, { value: number; skipped: boolean }>>({} as Record<TafEventKey, { value: number; skipped: boolean }>);
const [repsInput, setRepsInput] = useState("");
const [minInput, setMinInput] = useState("");
const [secInput, setSecInput] = useState("");
const [csInput, setCsInput] = useState("");
```

- [ ] **Step 2: Adicionar helper para o evento atual**

Dentro de `TentativaInner`, antes do `return`:

```ts
const events = gender && ageGroup ? getTafEventsForGender(gender) : [];
const currentEvent = events[wizardIndex];
const isRunEvent = currentEvent === 'run_300m' || currentEvent === 'run_1600m';

const currentValue = (() => {
  if (!currentEvent) return 0;
  if (isRunEvent) {
    const m = parseInt(minInput || '0', 10);
    const s = parseInt(secInput || '0', 10);
    const c = parseInt(csInput || '0', 10);
    if (s >= 60) return NaN;
    return m * 60 + s + (currentEvent === 'run_300m' ? c / 100 : 0);
  }
  const r = parseInt(repsInput || '0', 10);
  return Number.isFinite(r) ? r : 0;
})();

const currentScore = (() => {
  if (!currentEvent || !gender || !ageGroup || !Number.isFinite(currentValue)) return 0;
  if (isRunEvent) {
    return scoreRunTime(currentValue, gender, ageGroup, currentEvent);
  }
  const std = tafStandards[gender][ageGroup][currentEvent as TafExerciseKey];
  return std ? calculateTafScore(currentValue, std.base, std.mult) : 0;
})();

function resetInputs() {
  setRepsInput("");
  setMinInput("");
  setSecInput("");
  setCsInput("");
}

function recordCurrent(skipped: boolean) {
  if (!currentEvent) return;
  setWizardResults((prev) => ({
    ...prev,
    [currentEvent]: { value: skipped ? 0 : currentValue, skipped },
  }));
  resetInputs();
  if (wizardIndex < events.length - 1) {
    setWizardIndex(wizardIndex + 1);
  } else {
    setScreen('summary');
  }
}
```

Atenção: adicionar os imports faltando no topo do arquivo:

```ts
import {
  tafStandards,
  calculateTafScore,
  scoreRunTime,
  TafExerciseKey,
} from "@/lib/tafData";
```

- [ ] **Step 3: Renderizar o passo do wizard**

Substituir o bloco placeholder `return <div>Tela {screen} em construção.</div>` por uma renderização condicional. Adicionar o bloco de `screen === 'wizard'` antes do fallback:

```tsx
if (screen === 'wizard' && currentEvent) {
  return (
    <div className="min-h-screen bg-[var(--background)] px-4 pb-32 pt-6">
      <header className="mb-6">
        <p className="text-xs text-[var(--text-dim)]">
          {wizardIndex + 1} de {events.length}
        </p>
        <h1
          className="mt-1 text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          {TAF_EVENT_LABELS[currentEvent]}
        </h1>
      </header>

      {isRunEvent ? (
        <div className="flex gap-2">
          <InputBlock
            label="MIN"
            value={minInput}
            onChange={setMinInput}
            maxLength={2}
          />
          <InputBlock
            label="SEG"
            value={secInput}
            onChange={setSecInput}
            maxLength={2}
          />
          {currentEvent === 'run_300m' && (
            <InputBlock
              label="CENT"
              value={csInput}
              onChange={setCsInput}
              maxLength={2}
            />
          )}
        </div>
      ) : (
        <InputBlock label="REPETIÇÕES" value={repsInput} onChange={setRepsInput} maxLength={3} wide />
      )}

      {/* Preview da nota */}
      <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center">
        <p className="text-xs text-[var(--text-dim)]">Nota prevista</p>
        <p
          className="text-3xl"
          style={{
            fontFamily: "var(--font-bebas)",
            color:
              currentScore >= 50 ? 'var(--amber-500)' : 'var(--red-500)',
          }}
        >
          {Number.isFinite(currentValue) ? Math.round(currentScore) : 0} pts
        </p>
      </div>

      {/* Footer fixo */}
      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
        <div className="mx-auto flex max-w-md gap-2">
          <button
            onClick={() => recordCurrent(true)}
            className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-muted)]"
          >
            Pular
          </button>
          <button
            onClick={() => recordCurrent(false)}
            disabled={!Number.isFinite(currentValue) || currentValue <= 0}
            className="flex-[2] rounded-xl bg-[var(--red-500)] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {wizardIndex === events.length - 1 ? 'Finalizar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Adicionar `InputBlock` subcomponente**

Fora de `TentativaInner` (no fim do arquivo, mas antes do `export default`):

```tsx
function InputBlock({
  label, value, onChange, maxLength, wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 ${wide ? 'flex-1' : 'w-20'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {label}
      </p>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        className="mt-1 w-full bg-transparent text-4xl text-[var(--foreground)] focus:outline-none"
        style={{ fontFamily: "var(--font-bebas)" }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verificação manual**

- `npm run dev`, abrir `/taf/tentativa`
- Clicar "TAF Completo"
- Para cada evento: digitar valor, ver nota prevista atualizando, clicar "Próximo" ou "Pular"
- Após último evento, deve ir para `screen === 'summary'` (placeholder ainda — Task 11)

- [ ] **Step 7: Commit**

```bash
git add src/app/taf/tentativa/page.tsx
git commit -m "feat(taf): wizard flow for TAF completo"
```

---

## Task 10: Fluxo "Evento Avulso"

**Files:**
- Modify: `src/app/taf/tentativa/page.tsx`

- [ ] **Step 1: Adicionar estado de evento selecionado**

Junto dos outros `useState`:

```ts
const [singleEvent, setSingleEvent] = useState<TafEventKey | null>(null);
```

- [ ] **Step 2: Renderizar tela de seleção + input**

Adicionar bloco antes do `if (screen === 'wizard' && currentEvent)`:

```tsx
if (screen === 'single') {
  // Se ainda não escolheu o evento
  if (!singleEvent) {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6">
        <header className="mb-6">
          <button
            onClick={() => { setScreen('select_type'); }}
            className="text-sm text-[var(--text-dim)]"
          >
            ← Voltar
          </button>
          <h1 className="mt-4 text-3xl text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)" }}>
            EVENTO AVULSO
          </h1>
          <p className="text-xs text-[var(--text-dim)]">Qual evento você quer registrar?</p>
        </header>

        <div className="space-y-2">
          {events.map((ev) => (
            <button
              key={ev}
              onClick={() => setSingleEvent(ev)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--amber-500)]"
            >
              {TAF_EVENT_LABELS[ev]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Tela de input (reusa a lógica do wizard mas com um evento único)
  const isRun = singleEvent === 'run_300m' || singleEvent === 'run_1600m';
  const val = (() => {
    if (isRun) {
      const m = parseInt(minInput || '0', 10);
      const s = parseInt(secInput || '0', 10);
      const c = parseInt(csInput || '0', 10);
      if (s >= 60) return NaN;
      return m * 60 + s + (singleEvent === 'run_300m' ? c / 100 : 0);
    }
    return parseInt(repsInput || '0', 10) || 0;
  })();
  const sc = (() => {
    if (!Number.isFinite(val)) return 0;
    if (isRun) return scoreRunTime(val, gender, ageGroup, singleEvent as TafRunKey);
    const std = tafStandards[gender][ageGroup][singleEvent as TafExerciseKey];
    return std ? calculateTafScore(val, std.base, std.mult) : 0;
  })();

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 pb-32 pt-6">
      <header className="mb-6">
        <button
          onClick={() => { setSingleEvent(null); resetInputs(); }}
          className="text-sm text-[var(--text-dim)]"
        >
          ← Trocar evento
        </button>
        <h1 className="mt-3 text-3xl text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)" }}>
          {TAF_EVENT_LABELS[singleEvent]}
        </h1>
      </header>

      {isRun ? (
        <div className="flex gap-2">
          <InputBlock label="MIN" value={minInput} onChange={setMinInput} maxLength={2} />
          <InputBlock label="SEG" value={secInput} onChange={setSecInput} maxLength={2} />
          {singleEvent === 'run_300m' && (
            <InputBlock label="CENT" value={csInput} onChange={setCsInput} maxLength={2} />
          )}
        </div>
      ) : (
        <InputBlock label="REPETIÇÕES" value={repsInput} onChange={setRepsInput} maxLength={3} wide />
      )}

      <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center">
        <p className="text-xs text-[var(--text-dim)]">Nota</p>
        <p className="text-3xl" style={{ fontFamily: "var(--font-bebas)", color: sc >= 50 ? 'var(--amber-500)' : 'var(--red-500)' }}>
          {Number.isFinite(val) ? Math.round(sc) : 0} pts
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => {
              setWizardResults({
                [singleEvent]: { value: val, skipped: false },
              } as Record<TafEventKey, { value: number; skipped: boolean }>);
              setScreen('summary');
            }}
            disabled={!Number.isFinite(val) || val <= 0}
            className="w-full rounded-xl bg-[var(--red-500)] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Registrar tentativa
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verificação manual**

- `/taf/tentativa` → "Evento Avulso" → escolher "Barra Fixa" → digitar 10 reps → ver nota → "Registrar tentativa"
- Deve ir para `screen === 'summary'` (ainda placeholder)

- [ ] **Step 5: Commit**

```bash
git add src/app/taf/tentativa/page.tsx
git commit -m "feat(taf): evento avulso flow"
```

---

## Task 11: Tela de resumo e persistência

**Files:**
- Modify: `src/app/taf/tentativa/page.tsx`

- [ ] **Step 1: Imports**

Adicionar no topo:

```ts
import { createTafAttempt, TafEventResult } from "@/lib/tafAttempts";
import { formatRunTime } from "@/lib/tafData";
```

- [ ] **Step 2: Estado de salvamento**

Junto dos outros estados:

```ts
const [saving, setSaving] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);
```

- [ ] **Step 3: Função de salvar**

Dentro de `TentativaInner`:

```ts
async function handleSave(type: 'full' | 'single') {
  if (!user || !gender || !ageGroup) return;
  setSaving(true);
  setSaveError(null);
  try {
    const resultsArray: TafEventResult[] = Object.entries(wizardResults).map(
      ([event, data]) => {
        const ev = event as TafEventKey;
        const isRun = ev === 'run_300m' || ev === 'run_1600m';
        const score = (() => {
          if (data.skipped) return 0;
          if (isRun) return scoreRunTime(data.value, gender, ageGroup, ev as TafRunKey);
          const std = tafStandards[gender][ageGroup][ev as TafExerciseKey];
          return std ? calculateTafScore(data.value, std.base, std.mult) : 0;
        })();
        return {
          event: ev,
          value: data.value,
          score,
          skipped: data.skipped || undefined,
        };
      }
    );

    await createTafAttempt({
      user_id: user.uid,
      type,
      gender,
      age_group: ageGroup,
      results: resultsArray,
    });

    router.push('/profile?tab=taf');
  } catch (e) {
    setSaveError(e instanceof Error ? e.message : 'Erro ao salvar');
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 4: Renderizar resumo**

Adicionar bloco `if (screen === 'summary')` antes do fallback. Calcular a nota total a partir de `wizardResults`:

```tsx
if (screen === 'summary') {
  const type: 'full' | 'single' = Object.keys(wizardResults).length === 1 ? 'single' : 'full';

  const resultRows = Object.entries(wizardResults).map(([event, data]) => {
    const ev = event as TafEventKey;
    const isRun = ev === 'run_300m' || ev === 'run_1600m';
    const score = (() => {
      if (data.skipped) return 0;
      if (isRun) return scoreRunTime(data.value, gender, ageGroup, ev as TafRunKey);
      const std = tafStandards[gender][ageGroup][ev as TafExerciseKey];
      return std ? calculateTafScore(data.value, std.base, std.mult) : 0;
    })();
    const display = data.skipped
      ? 'Pulado'
      : isRun
      ? formatRunTime(data.value, ev as TafRunKey)
      : `${data.value} reps`;
    return { ev, score, display, skipped: data.skipped };
  });
  const total = resultRows.reduce((s, r) => s + r.score, 0);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <h1
        className="text-3xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        RESUMO DA TENTATIVA
      </h1>

      <div className="mt-4 rounded-2xl bg-gradient-to-r from-[var(--red-500)]/10 to-[var(--amber-500)]/10 p-6 text-center">
        <p className="text-xs text-[var(--text-dim)]">Nota total</p>
        <p
          className="mt-1 text-5xl text-[var(--amber-500)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          {total} <span className="text-xl text-[var(--text-dim)]">pts</span>
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {resultRows.map((r) => (
          <div
            key={r.ev}
            className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <div>
              <p className="text-sm font-bold text-[var(--foreground)]">
                {TAF_EVENT_LABELS[r.ev]}
              </p>
              <p className={`text-xs ${r.skipped ? 'text-[var(--text-dim)]' : 'text-[var(--text-muted)]'}`}>
                {r.display}
              </p>
            </div>
            <span
              className="text-2xl"
              style={{
                fontFamily: "var(--font-bebas)",
                color: r.score >= 50 ? 'var(--amber-500)' : 'var(--red-500)',
              }}
            >
              {r.score}
            </span>
          </div>
        ))}
      </div>

      {saveError && (
        <p className="mt-4 text-sm text-[var(--red-500)]">{saveError}</p>
      )}

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => {
            setWizardResults({} as Record<TafEventKey, { value: number; skipped: boolean }>);
            setWizardIndex(0);
            setSingleEvent(null);
            setScreen('select_type');
          }}
          className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-muted)]"
        >
          Refazer
        </button>
        <button
          onClick={() => handleSave(type)}
          disabled={saving}
          className="flex-[2] rounded-xl bg-[var(--red-500)] py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar tentativa'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Verificação manual (end-to-end)**

- Fazer TAF completo: preencher 5 (ou 4) eventos → ver resumo → salvar
- Voltar para `/profile`, aba TAF → os cards devem refletir a nova tentativa
- Inspecionar Firestore Console → coleção `taf_attempts` tem novo doc

Se der `permission-denied`: Task 5 precisa ter sido deployada.

- [ ] **Step 7: Commit**

```bash
git add src/app/taf/tentativa/page.tsx
git commit -m "feat(taf): summary screen + persist attempt to Firestore"
```

---

## Task 12: `TafHistoryChart` — mini-gráficos por evento

**Files:**
- Create: `src/components/TafHistoryChart.tsx`

- [ ] **Step 1: Criar componente**

```tsx
// src/components/TafHistoryChart.tsx
"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { getTafAttempts, TafAttempt } from "@/lib/tafAttempts";
import { TafEventKey, TAF_EVENT_LABELS, getTafEventsForGender, TafGender } from "@/lib/tafData";

interface Props {
  userId: string;
  gender: TafGender;
}

interface Point {
  dateLabel: string;
  score: number;
}

export default function TafHistoryChart({ userId, gender }: Props) {
  const [attempts, setAttempts] = useState<TafAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [colors, setColors] = useState({ red: "#EF4444", amber: "#F59E0B", muted: "#6B7280" });

  useEffect(() => {
    getTafAttempts(userId, 50).then((a) => {
      // Ordenar do mais antigo → mais recente (para o eixo X crescer com o tempo)
      setAttempts([...a].reverse());
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    setColors({
      red: s.getPropertyValue("--red-500").trim() || "#EF4444",
      amber: s.getPropertyValue("--amber-500").trim() || "#F59E0B",
      muted: s.getPropertyValue("--text-dim").trim() || "#6B7280",
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-[120px] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  const events = getTafEventsForGender(gender);

  // Agrupar pontos por evento
  const byEvent: Record<string, Point[]> = {};
  for (const attempt of attempts) {
    const label = attempt.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    for (const r of attempt.results) {
      if (r.skipped) continue;
      const arr = byEvent[r.event] ?? (byEvent[r.event] = []);
      arr.push({ dateLabel: label, score: r.score });
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {events.map((ev) => {
        const data = byEvent[ev] ?? [];
        return (
          <div key={ev} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="mb-1 text-[11px] font-bold text-[var(--text-muted)]">
              {TAF_EVENT_LABELS[ev as TafEventKey]}
            </p>
            {data.length < 2 ? (
              <div className="flex h-[70px] items-center justify-center">
                <p className="text-[10px] text-[var(--text-dim)]">
                  Precisa ≥2 tentativas
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={70}>
                <LineChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                  <XAxis dataKey="dateLabel" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(v: number | string) => [`${v} pts`, ""]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={colors.red}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, fill: colors.amber, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/TafHistoryChart.tsx
git commit -m "feat(taf): history chart component (per-event mini sparklines)"
```

---

## Task 13: `TafAttemptList` — lista cronológica

**Files:**
- Create: `src/components/TafAttemptList.tsx`

- [ ] **Step 1: Criar componente**

```tsx
// src/components/TafAttemptList.tsx
"use client";

import { useEffect, useState } from "react";
import { getTafAttempts, TafAttempt } from "@/lib/tafAttempts";
import { TAF_EVENT_LABELS, formatRunTime, TafEventKey, TafRunKey } from "@/lib/tafData";

interface Props {
  userId: string;
}

function valueDisplay(event: TafEventKey, value: number, skipped: boolean | undefined): string {
  if (skipped) return 'Pulado';
  if (event === 'run_300m' || event === 'run_1600m') {
    return formatRunTime(value, event as TafRunKey);
  }
  return `${value} reps`;
}

export default function TafAttemptList({ userId }: Props) {
  const [attempts, setAttempts] = useState<TafAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTafAttempts(userId, 30).then((a) => {
      setAttempts(a);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="flex h-[80px] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-2)] px-4 py-5 text-center">
        <p className="text-sm text-[var(--text-dim)]">
          Nenhuma tentativa registrada. Toque em "Iniciar Modo TAF" para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {attempts.map((a) => (
        <div key={a.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--text-dim)]">
                {a.date.toLocaleDateString("pt-BR")} · {a.type === 'full' ? 'TAF Completo' : 'Avulso'}
              </p>
            </div>
            <span
              className="text-2xl text-[var(--amber-500)]"
              style={{ fontFamily: "var(--font-bebas)" }}
            >
              {a.total_score} pts
            </span>
          </div>

          <div className="space-y-1">
            {a.results.map((r) => (
              <div key={r.event} className="flex items-center justify-between text-xs">
                <span className={r.skipped ? 'text-[var(--text-dim)]' : 'text-[var(--foreground)]'}>
                  {TAF_EVENT_LABELS[r.event]}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-muted)]">
                    {valueDisplay(r.event, r.value, r.skipped)}
                  </span>
                  <span
                    className="w-10 text-right font-bold"
                    style={{
                      color: r.skipped
                        ? 'var(--text-dim)'
                        : r.score >= 50 ? 'var(--amber-500)' : 'var(--red-500)',
                    }}
                  >
                    {r.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/TafAttemptList.tsx
git commit -m "feat(taf): attempt list component"
```

---

## Task 14: Wire history section no `TafDashboard`

**Files:**
- Modify: `src/components/TafDashboard.tsx`

- [ ] **Step 1: Imports**

No topo de `TafDashboard.tsx`:

```ts
import TafHistoryChart from "@/components/TafHistoryChart";
import TafAttemptList from "@/components/TafAttemptList";
```

- [ ] **Step 2: Renderizar seção abaixo dos cards**

Antes do `</div>` que fecha o container principal do `TafDashboard`, logo depois do `{results.map(...)}`:

```tsx
{/* Histórico de evolução */}
{gender && ageGroup && (
  <section className="mt-6 space-y-4">
    <h3
      className="text-xl text-[var(--foreground)]"
      style={{ fontFamily: "var(--font-bebas)" }}
    >
      EVOLUÇÃO
    </h3>

    <TafHistoryChart userId={userId} gender={gender} />

    <div>
      <h4 className="mb-2 text-sm font-bold uppercase text-[var(--text-dim)]">
        Tentativas
      </h4>
      <TafAttemptList userId={userId} />
    </div>
  </section>
)}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Verificação manual**

- `/profile`, aba TAF → scroll até o final → deve ver "EVOLUÇÃO" com mini-gráficos e lista de tentativas
- Se houver <2 tentativas para um evento, mostra "Precisa ≥2 tentativas"
- Se não houver nenhuma: lista mostra placeholder

- [ ] **Step 5: Commit**

```bash
git add src/components/TafDashboard.tsx
git commit -m "feat(taf): history section with charts and attempt list"
```

---

## Task 15: Atualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar a nova coleção**

Na seção `### Firestore Collections`, adicionar linha:

```
| `taf_attempts/{id}` | Tentativas de TAF (imutáveis); `type: full | single`, snapshot de gender/age_group |
```

- [ ] **Step 2: Documentar índice composto**

Na seção `### Firestore Security Rules`, após a frase sobre o índice de `workout_history`:

```
A coleção `taf_attempts` também requer um índice composto em `(user_id ASC, date DESC)`.
```

- [ ] **Step 3: Adicionar fluxo em Key Flows**

Na seção `### Key Flows`, depois de `**Routine view + training**`, adicionar subseção:

```markdown
**TAF mode** (`/profile` aba TAF + `/taf/tentativa`):
- Dashboard lê `taf_attempts` + `workout_history` e mostra melhor PR por evento.
- Scoring: reps por interpolação linear (`calculateTafScore`), corridas por tiers tabelados do edital CBMAL (`scoreRunTime`) em `src/lib/tafData.ts`.
- `/taf/tentativa` é um wizard (TAF completo) ou seleção de evento único (avulso); ambos gravam em `taf_attempts` via `createTafAttempt`.
- Histórico: `TafHistoryChart` (sparklines por evento) + `TafAttemptList` (cards cronológicos, últimas 30).
- Tentativas são imutáveis — para corrigir, registra uma nova.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document TAF mode collection, index and flow"
```

---

## Task 16: Verificação final

- [ ] **Step 1: Rodar todos os checks**

```bash
npm run lint
npx tsc --noEmit
npx tsx scripts/smoke-taf.mjs
```

Expected: todos exit 0.

- [ ] **Step 2: QA manual — checklist**

No browser (`npm run dev`):

- [ ] `/profile` aba TAF mostra 5 cards (masc) ou 4 (fem)
- [ ] Os 2 cards de corrida mostram `—` como tempo se nunca houve tentativa, ou o melhor tempo formatado
- [ ] Barra de progresso e texto indicador aparecem corretamente para os 2 tipos de card
- [ ] Botão "INICIAR MODO TAF" aparece com gradiente e navega para `/taf/tentativa`
- [ ] Na rota nova: seleção de tipo funciona, voltar funciona
- [ ] Wizard: digita valor → nota prevista atualiza; "Pular" e "Próximo"/"Finalizar" funcionam
- [ ] Evento avulso: seleciona evento → digita valor → "Registrar tentativa"
- [ ] Resumo: nota total é a soma dos scores; "Salvar" grava e redireciona para `/profile?tab=taf`
- [ ] Após salvar: card do evento testado reflete o novo melhor resultado (se aplicável)
- [ ] Seção EVOLUÇÃO na aba TAF: mini-gráficos aparecem com ≥2 pontos; lista de tentativas mostra os registros
- [ ] Firestore Console: documentos em `taf_attempts` têm shape correto e `user_id == auth.uid`
- [ ] Tentativa de ler `taf_attempts` de outro usuário via console do browser → erro `permission-denied`

- [ ] **Step 3: Se tudo PASS, nada a commitar**

Caso haja bugs, voltar na task correspondente e corrigir antes de fechar.

---

## Pós-implementação (fora do escopo deste plano)

- Criar índice composto `taf_attempts(user_id ASC, date DESC)` no Firebase Console (o primeiro `getTafAttempts` vai falhar com link para criar — clicar resolve).
- Deploy das regras Firestore atualizadas (Firebase Console → Firestore → Rules).
