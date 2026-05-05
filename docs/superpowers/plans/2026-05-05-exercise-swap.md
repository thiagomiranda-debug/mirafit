# Exercise Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar o modal de troca de exercícios com cards visuais (foto + músculo + equipamento) e persistir as trocas permanentemente na rotina do Firestore.

**Architecture:** Quatro mudanças independentes em sequência: (1) liberar escrita de rotinas nas regras do Firestore, (2) adicionar função de update em `workouts.ts`, (3) chamar o update no handler da treino page, (4) redesenhar os cards do modal de troca.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Firebase Firestore (client SDK) / Tailwind CSS 4

---

## Files Affected

| File | Change |
|---|---|
| `firestore.rules` | Permitir write autenticado pelo dono na subcoleção `routines` |
| `src/lib/workouts.ts` | Nova função exportada `updateRoutineExercise()` |
| `src/app/treino/page.tsx` | Chamar `updateRoutineExercise` + estado `swapError` + toast de erro |
| `src/components/ExerciseSearchModal.tsx` | Cards visuais para modo `swap`: foto + músculo + equipamento; sheet 90vh |

---

## Task 1: Firestore rules — permitir escrita de rotinas pelo dono

**Files:**
- Modify: `firestore.rules:21-25`

- [ ] **Step 1: Atualizar a regra da subcoleção `routines`**

Em `firestore.rules`, substitua o bloco `match /routines/{routineId}` existente (linhas 21-24):

```
// ANTES
match /routines/{routineId} {
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/workouts/$(workoutId)).data.user_id == request.auth.uid;
  allow write: if false; // Apenas via API Route (Admin SDK)
}

// DEPOIS
match /routines/{routineId} {
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/workouts/$(workoutId)).data.user_id == request.auth.uid;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/workouts/$(workoutId)).data.user_id == request.auth.uid;
}
```

- [ ] **Step 2: Verificar que o arquivo ficou correto**

O bloco completo de `workouts` deve ficar assim:

```
match /workouts/{workoutId} {
  allow read: if request.auth != null && resource.data.user_id == request.auth.uid;
  allow write: if false; // Apenas via API Route (Admin SDK)

  match /routines/{routineId} {
    allow read: if request.auth != null
      && get(/databases/$(database)/documents/workouts/$(workoutId)).data.user_id == request.auth.uid;
    allow write: if request.auth != null
      && get(/databases/$(database)/documents/workouts/$(workoutId)).data.user_id == request.auth.uid;
  }
}
```

- [ ] **Step 3: Fazer deploy das regras**

As regras do Firestore são deployadas manualmente. Acesse: Firebase Console → Firestore → Rules → cole o conteúdo atualizado de `firestore.rules` → Publish.

> ⚠️ Sem este deploy, o save client-side falhará com `PERMISSION_DENIED`.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): allow authenticated owner to write routines client-side"
```

---

## Task 2: Função `updateRoutineExercise` em `workouts.ts`

**Files:**
- Modify: `src/lib/workouts.ts`

- [ ] **Step 1: Adicionar `updateDoc` aos imports do firebase/firestore**

Na linha 1 de `src/lib/workouts.ts`, a linha de imports atual é:

```typescript
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
```

Adicione `updateDoc` à lista:

```typescript
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  updateDoc,
} from "firebase/firestore";
```

- [ ] **Step 2: Adicionar a função no final do arquivo**

Ao final de `src/lib/workouts.ts` (após a linha 217), adicione:

```typescript
// Troca um exercício em uma rotina já salva — persiste a mudança no Firestore
export async function updateRoutineExercise(
  workoutId: string,
  routineId: string,
  oldExerciseId: string,
  newExerciseId: string
): Promise<void> {
  const db = getFirebaseDb();
  const routineRef = doc(db, "workouts", workoutId, "routines", routineId);
  const snap = await getDoc(routineRef);
  if (!snap.exists()) return;
  const exercises = (
    snap.data().exercises as Array<{ exercise_id: string } & Record<string, unknown>>
  ).map((ex) =>
    ex.exercise_id === oldExerciseId ? { ...ex, exercise_id: newExerciseId } : ex
  );
  await updateDoc(routineRef, { exercises });
}
```

- [ ] **Step 3: Checar tipos**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workouts.ts
git commit -m "feat(workouts): add updateRoutineExercise to persist exercise swaps"
```

---

## Task 3: Chamar o save + toast de erro na treino page

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Atualizar o import de `workouts`**

Na linha 6 de `src/app/treino/page.tsx`:

```typescript
// ANTES
import { getExercisesByIds } from "@/lib/workouts";

// DEPOIS
import { getExercisesByIds, updateRoutineExercise } from "@/lib/workouts";
```

- [ ] **Step 2: Adicionar estado `swapError`**

Após a linha `const [saved, setSaved] = useState(false);` (linha 67), adicione:

```typescript
const [swapError, setSwapError] = useState(false);
```

- [ ] **Step 3: Atualizar a assinatura de `handleSwapExercise` para receber `oldExerciseId`**

Substitua a assinatura atual da função (linha 222):

```typescript
// ANTES
async function handleSwapExercise(exIdx: number, newExercise: LibraryExercise) {

// DEPOIS
function handleSwapExercise(exIdx: number, newExercise: LibraryExercise, oldExerciseId: string) {
```

(Remova o `async` — a função não precisa mais aguardar nada diretamente.)

- [ ] **Step 4: Adicionar o save fire-and-forget no final de `handleSwapExercise`**

O corpo atual da função termina com `setSwapModal(null)` (linha 246). Substitua o bloco completo da função pelo abaixo — os passos de estado são idênticos, só acrescentamos o save e a limpeza do `swapError`:

```typescript
function handleSwapExercise(exIdx: number, newExercise: LibraryExercise, oldExerciseId: string) {
  setRoutine((prev) => {
    if (!prev) return prev;
    const sorted = [...prev.exercises].sort((a, b) => a.order - b.order);
    sorted[exIdx] = { ...sorted[exIdx], exercise_id: newExercise.id };
    return { ...prev, exercises: sorted };
  });

  setExercises((prev) => ({ ...prev, [newExercise.id]: newExercise }));

  const prev = lastPerf[newExercise.id] || [];
  setInputs((prevInputs) => {
    const next = [...prevInputs];
    next[exIdx] = {
      exercise_id: newExercise.id,
      sets: Array.from({ length: next[exIdx].sets.length }, (_, i) => ({
        weight: prev[i]?.weight?.toString() || prev[0]?.weight?.toString() || "",
        reps: prev[i]?.reps?.toString() || prev[0]?.reps?.toString() || "",
        done: false,
      })),
    };
    return next;
  });

  setSwapModal(null);
  setSwapError(false);

  if (workoutId && routineId) {
    updateRoutineExercise(workoutId, routineId, oldExerciseId, newExercise.id).catch(() =>
      setSwapError(true)
    );
  }
}
```

- [ ] **Step 5: Passar `oldExerciseId` na chamada do handler**

No JSX onde o modal é renderizado (linha 489), atualize o `onSelect`:

```tsx
// ANTES
onSelect={(ex) => handleSwapExercise(swapModal.exIdx, ex)}

// DEPOIS
onSelect={(ex) => handleSwapExercise(swapModal.exIdx, ex, swapModal.exerciseId)}
```

- [ ] **Step 6: Adicionar o toast de erro no JSX**

Logo após o bloco `{error && ...}` existente (linha 449-451), adicione:

```tsx
{swapError && (
  <div className="animate-fade-in flex items-center gap-2 rounded-xl border border-[var(--red-500)]/30 bg-[var(--red-600)]/10 px-4 py-3">
    <svg className="h-4 w-4 shrink-0 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
    </svg>
    <p className="text-xs font-medium text-[var(--red-500)]">
      Exercício trocado na sessão, mas não foi possível salvar. Verifique sua conexão.
    </p>
  </div>
)}
```

- [ ] **Step 7: Checar tipos**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): persist exercise swap to Firestore + show error toast on failure"
```

---

## Task 4: Cards visuais no modal de troca

**Files:**
- Modify: `src/components/ExerciseSearchModal.tsx`

- [ ] **Step 1: Aumentar altura do sheet para 90vh**

Na linha 150, o `style` atual é `maxHeight: "85vh"`. Altere para `90vh`:

```tsx
// ANTES
style={{ maxHeight: "85vh" }}

// DEPOIS
style={{ maxHeight: "90vh" }}
```

- [ ] **Step 2: Substituir o card de exercício no modo swap**

Localize o bloco do `filtered.map` na área da lista (linha 241 em diante). O card atual é um único `<button>` com layout horizontal simples. Substitua **apenas** o conteúdo interno do `filtered.map` para ter uma branch por modo:

```tsx
<div className="space-y-2">
  {filtered.map((ex) => (
    <div key={ex.id}>
      {mode === "swap" ? (
        /* ── Card visual para troca ── */
        <button
          onClick={() => handleSwapSelect(ex)}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left transition-all hover:border-[var(--red-500)]/30 hover:bg-[var(--red-600)]/8 active:scale-[0.98]"
        >
          {/* Thumbnail */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-3)]">
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <img
              src={`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${ex.id}/0.jpg`}
              alt=""
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              className="relative h-full w-full object-cover"
            />
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
              {translateExerciseName(ex.name)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-dim)]">
              {translateMuscleName(ex.target_muscle || "")}
              {ex.equipment ? ` · ${ex.equipment}` : ""}
            </p>
          </div>
          <svg className="h-4 w-4 shrink-0 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        /* ── Card builder (sem alteração) ── */
        <>
          <button
            onClick={() => handleBuilderExpand(ex)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
              addedIds.has(ex.id)
                ? "border-[var(--success)]/40 bg-[var(--success)]/10"
                : expandedId === ex.id
                ? "border-[var(--red-500)]/40 bg-[var(--red-600)]/10"
                : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--red-500)]/30 hover:bg-[var(--red-600)]/8"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                {translateExerciseName(ex.name)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-dim)]">
                {ex.category || ex.equipment || "—"}
              </p>
            </div>
            {addedIds.has(ex.id) ? (
              <svg className="h-5 w-5 shrink-0 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className={`h-4 w-4 shrink-0 text-[var(--text-dim)] transition-transform ${expandedId === ex.id ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {/* Inline detail expansion (builder mode only) */}
          {expandedId === ex.id && (
            <div className="animate-fade-in mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-3.5 py-3">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                    Séries
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={detailSets}
                    onChange={(e) => setDetailSets(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center text-sm font-bold text-[var(--foreground)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                    Reps
                  </label>
                  <input
                    type="text"
                    value={detailReps}
                    onChange={(e) => setDetailReps(e.target.value)}
                    placeholder="ex: 10-12"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center text-sm font-bold text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)]"
                  />
                </div>
                <button
                  onClick={() => handleBuilderConfirm(ex)}
                  disabled={!detailReps.trim()}
                  className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-white shadow transition-all hover:shadow-md disabled:opacity-50 gradient-red"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 3: Checar tipos**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Checar lint**

```bash
npm run lint
```

Saída esperada: sem erros.

- [ ] **Step 5: Testar manualmente**

```bash
npm run dev
```

Abrir `localhost:3000`, navegar até um treino ativo, clicar no ícone de troca de um exercício e verificar:
- [ ] Bottom sheet abre com altura ~90% da tela
- [ ] Cada exercício mostra uma foto à esquerda (64×64px)
- [ ] Foto com erro de carregamento exibe ícone de câmera cinza no lugar
- [ ] Linha inferior mostra músculo alvo + equipamento
- [ ] Ao selecionar, o exercício muda imediatamente na tela
- [ ] Ao recarregar a página, o exercício trocado persiste
- [ ] Se offline: toast de aviso aparece após falha no save

- [ ] **Step 6: Commit**

```bash
git add src/components/ExerciseSearchModal.tsx
git commit -m "feat(modal): visual exercise cards for swap mode with thumbnail and muscle info"
```
