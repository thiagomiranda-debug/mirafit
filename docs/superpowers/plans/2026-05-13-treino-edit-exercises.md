# Editar exercícios na tela de treino — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à página `/treino` um modo de edição que permite ao usuário adicionar exercícios extras, excluir exercícios da rotina e reordená-los via drag-and-drop, com persistência no Firestore.

**Architecture:** Toggle de "modo edição" no header da página `/treino` que alterna entre os cards atuais (`ExerciseCard`) e cards compactos (`EditModeCard`) com drag handle + botão excluir. Reorder via `@dnd-kit/sortable` (long-press 150ms). Adição reusa `ExerciseSearchModal` em `mode="builder"`. Toda mutação atualiza `routine.exercises` + `inputs[]` em sincronia e persiste imediatamente (add/delete) ou com debounce 500ms (reorder) via nova função `updateRoutineExercises`. Optimistic update com rollback via refetch em caso de falha.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Firebase Firestore + `@dnd-kit/core` + `@dnd-kit/sortable`. Sem framework de teste — verificação manual via `npm run dev` + browser + `npx tsc --noEmit` + `npm run lint` (padrão do projeto, vide CLAUDE.md).

**Spec:** [docs/superpowers/specs/2026-05-13-treino-edit-exercises-design.md](../specs/2026-05-13-treino-edit-exercises-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/workouts.ts` | (modificar) Adicionar `updateRoutineExercises()` |
| `src/components/treino/EditModeCard.tsx` | (criar) Card compacto com drag handle + botão excluir |
| `src/components/treino/DeleteConfirmModal.tsx` | (criar) Bottom-sheet de confirmação de exclusão |
| `src/app/treino/page.tsx` | (modificar) Estado edit mode, helpers de mutação, integração dnd-kit, novos handlers |
| `package.json` | (modificar) Adicionar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

---

## Task 1: Instalar dependências do @dnd-kit

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar deps**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: 3 pacotes adicionados, sem warnings de peer deps. Verifica que `package.json` agora contém:
```json
"@dnd-kit/core": "^6.x.x",
"@dnd-kit/sortable": "^10.x.x",
"@dnd-kit/utilities": "^3.x.x"
```

- [ ] **Step 2: Verificar build segue funcionando**

Run:
```bash
npx tsc --noEmit
```

Expected: nenhum erro (deps recém-instaladas não devem quebrar nada existente).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): adiciona @dnd-kit pra drag-and-drop de exercicios"
```

---

## Task 2: Adicionar função `updateRoutineExercises` em `workouts.ts`

**Files:**
- Modify: `src/lib/workouts.ts` (append no fim do arquivo)

- [ ] **Step 1: Adicionar a função**

Edit `src/lib/workouts.ts`, appending depois da função `updateRoutineExercise` existente (após a linha 236):

```ts
// Sobrescreve o array completo de exercises de uma routine — usado pelo modo edição
// que faz add/delete/reorder. As regras do Firestore validam o user_id do workout pai.
export async function updateRoutineExercises(
  workoutId: string,
  routineId: string,
  exercises: WorkoutExercise[]
): Promise<void> {
  const db = getFirebaseDb();
  const routineRef = doc(db, "workouts", workoutId, "routines", routineId);
  await updateDoc(routineRef, { exercises });
}
```

E garantir que `WorkoutExercise` está no import de `@/types` (no topo do arquivo). A linha atual é:
```ts
import { Workout, Routine, LibraryExercise, LocationType } from "@/types";
```

Mudar para:
```ts
import { Workout, Routine, LibraryExercise, LocationType, WorkoutExercise } from "@/types";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workouts.ts
git commit -m "feat(workouts): adiciona updateRoutineExercises pra sobrescrever array completo"
```

---

## Task 3: Criar componente `EditModeCard`

**Files:**
- Create: `src/components/treino/EditModeCard.tsx`

- [ ] **Step 1: Criar diretório se necessário e o arquivo**

Run:
```bash
mkdir -p src/components/treino
```

(Em PowerShell: `New-Item -ItemType Directory -Force src/components/treino | Out-Null`)

Criar `src/components/treino/EditModeCard.tsx` com o conteúdo abaixo. Este card NÃO contém lógica de drag-and-drop ainda — só o layout compacto. A integração com dnd-kit acontece na Task 7.

```tsx
"use client";

interface EditModeCardProps {
  index: number;
  name: string;
  sets: number;
  reps: string;
  onDelete: () => void;
  // Props injetadas pelo dnd-kit (Task 7) — opcionais por enquanto
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  style?: React.CSSProperties;
  setNodeRef?: (el: HTMLElement | null) => void;
}

export default function EditModeCard({
  index,
  name,
  sets,
  reps,
  onDelete,
  dragHandleProps,
  isDragging = false,
  style,
  setNodeRef,
}: EditModeCardProps) {
  return (
    <div
      ref={setNodeRef}
      className="animate-fade-in flex items-center gap-2 rounded-2xl px-3 py-3"
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid var(--border-subtle)",
        opacity: isDragging ? 0.5 : 1,
        ...style,
      }}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Reordenar exercício"
        {...dragHandleProps}
        className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-lg text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] active:cursor-grabbing touch-none"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </button>

      {/* Index */}
      <span
        style={{
          fontFamily: "var(--font-bebas)",
          fontSize: "1.1rem",
          lineHeight: 1,
          color: "var(--text-dim)",
          letterSpacing: "0.04em",
          minWidth: "24px",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Name + sets/reps */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold capitalize text-[var(--foreground)]">
          {name}
        </p>
        <p className="text-xs text-[var(--text-dim)]">
          {sets} séries × {reps} reps
        </p>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Excluir exercício"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <svg className="h-4 w-4 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/treino/EditModeCard.tsx
git commit -m "feat(treino): cria EditModeCard com drag handle + botao excluir"
```

---

## Task 4: Criar componente `DeleteConfirmModal`

**Files:**
- Create: `src/components/treino/DeleteConfirmModal.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
"use client";

interface DeleteConfirmModalProps {
  exerciseName: string;
  doneSets: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({
  exerciseName,
  doneSets,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Sheet */}
      <div
        className="animate-slide-up relative w-full max-w-md rounded-t-3xl bg-[var(--surface)] px-5 pb-6 pt-4"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Drag handle */}
        <div
          className="mx-auto mb-3 h-1 w-12 rounded-full"
          style={{ background: "rgba(255,255,255,0.15)" }}
        />

        <h2 className="mb-2 text-lg font-bold text-[var(--foreground)]">
          Excluir &quot;{exerciseName}&quot;?
        </h2>

        <p className="mb-5 text-sm leading-relaxed text-[var(--text-muted)]">
          Esse exercício tem{" "}
          <span className="font-bold text-[var(--amber-500)]">
            {doneSets} {doneSets === 1 ? "série já marcada" : "séries já marcadas"}
          </span>
          . Ao excluir, essas séries{" "}
          <span className="font-bold text-[var(--red-500)]">
            não serão salvas no histórico
          </span>
          .
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="tactile flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] py-3.5 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="tactile flex-1 rounded-2xl py-3.5 text-sm font-bold text-white transition-all gradient-red"
            style={{ boxShadow: "var(--shadow-red)" }}
          >
            Excluir mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/treino/DeleteConfirmModal.tsx
git commit -m "feat(treino): cria DeleteConfirmModal pra confirmar exclusao com sets done"
```

---

## Task 5: Adicionar estado e botão de edit mode no header da `/treino`

**Files:**
- Modify: `src/app/treino/page.tsx` (vários pontos)

Esta task adiciona o toggle de edit mode e renderiza os `EditModeCard` no lugar dos `ExerciseCard` quando ativo. Ainda **sem** drag-and-drop, **sem** add, e **sem** delete funcional (botão lixeira só faz `console.log` por enquanto — vamos plugar nas Tasks 6 e 8).

- [ ] **Step 1: Adicionar imports**

No topo de `src/app/treino/page.tsx`, junto aos outros imports de componentes:

```tsx
import EditModeCard from "@/components/treino/EditModeCard";
```

- [ ] **Step 2: Adicionar estado `editMode` em `TreinoContent`**

Após a linha que declara `const [locationType, setLocationType] = useState<LocationType>("gym");` (linha 85), adicionar:

```tsx
const [editMode, setEditMode] = useState(false);
```

- [ ] **Step 3: Adicionar botão "Editar"/"Concluído" no header**

Localizar o bloco do header com o botão "Treinar"/cronômetro (linhas 425–460). Substituir o bloco inteiro do botão direito por:

```tsx
{editMode ? (
  <button
    onClick={() => {
      haptic("light");
      setEditMode(false);
    }}
    className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white transition-all"
    style={{
      background: "linear-gradient(135deg, #22C55E, #16A34A)",
      boxShadow: "var(--glow-success)",
    }}
  >
    Concluído
  </button>
) : training ? (
  <div className="flex items-center gap-2">
    <button
      onClick={() => {
        haptic("light");
        setEditMode(true);
      }}
      aria-label="Editar exercícios"
      className="tactile flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
    <div
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
      style={{
        background:
          "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))",
        border: "1px solid rgba(245,158,11,0.25)",
        boxShadow: "0 0 12px rgba(245,158,11,0.15)",
      }}
    >
      <span
        className="block h-1.5 w-1.5 rounded-full bg-[var(--amber-500)]"
        style={{
          boxShadow: "0 0 6px var(--amber-500)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <span
        className="text-sm font-bold text-[var(--amber-400)]"
        style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.05em" }}
      >
        {formatElapsed(elapsed)}
      </span>
    </div>
  </div>
) : (
  <div className="flex items-center gap-2">
    <button
      onClick={() => {
        haptic("light");
        setEditMode(true);
      }}
      aria-label="Editar exercícios"
      className="tactile flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
    <button
      onClick={() => {
        haptic("medium");
        setTraining(true);
      }}
      className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white gradient-red transition-all"
      style={{ boxShadow: "var(--shadow-red)" }}
    >
      Treinar
    </button>
  </div>
)}
```

- [ ] **Step 4: Mudar o título do header quando em edit mode**

Localizar o `<h1>` que mostra `{routine.name}` (linha 409):

```tsx
<h1 className="text-base font-bold text-[var(--foreground)]">
  {routine.name}
</h1>
```

Substituir por:

```tsx
<h1 className="text-base font-bold text-[var(--foreground)]">
  {editMode ? "Editando exercícios" : routine.name}
</h1>
```

- [ ] **Step 5: Renderizar `EditModeCard` em vez de `ExerciseCard` quando em edit mode**

Localizar o bloco `<div className="stagger space-y-3">` (linha 495) com o `.map` que renderiza os `ExerciseCard`. Substituir o `.map` inteiro por:

```tsx
<div className="stagger space-y-3">
  {sorted.map((ex, idx) => {
    const lib = exercises[ex.exercise_id];
    const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
    const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };

    if (editMode) {
      return (
        <div key={`edit-${ex.exercise_id}-${idx}`} data-exercise-idx={idx}>
          <EditModeCard
            index={idx}
            name={name}
            sets={ex.sets}
            reps={ex.reps}
            onDelete={() => {
              // TODO Task 6: hookup do delete
              console.log("delete", idx);
            }}
          />
        </div>
      );
    }

    // Active = first exercise with at least one pending set
    const firstActiveIdx = sorted.findIndex((_, i) => {
      const inp = inputs[i];
      if (!inp) return false;
      return inp.sets.some((s) => !s.done);
    });
    const allSetsDoneInThis = exInput.sets.length > 0 && exInput.sets.every((s) => s.done);
    const isActive = training && idx === firstActiveIdx && !allSetsDoneInThis;
    return (
      <div key={`${ex.exercise_id}-${idx}`} data-exercise-idx={idx}>
        <ExerciseCard
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
          isActive={isActive}
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
      </div>
    );
  })}
</div>
```

- [ ] **Step 6: Esconder o textarea de notas + o finish button quando em edit mode**

Localizar o bloco `{training && (` que renderiza a textarea de notas (linha 549) e mudar a condição para:

```tsx
{training && !editMode && (
```

E na seção `{/* Finish button */}` (linha 580), mudar:

```tsx
{training && (
```

para:

```tsx
{training && !editMode && (
```

- [ ] **Step 7: Type-check + lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```

Expected: sem erros. Pode aparecer um warning de variável não usada (`exInput`) dentro do bloco editMode — adicionar `// eslint-disable-next-line @typescript-eslint/no-unused-vars` antes da linha de `const exInput = ...` se necessário, ou simplesmente extrair só quando precisar (mover essa declaração pra dentro do bloco non-edit).

Para evitar o warning, **reescrever a parte do `.map` movendo a declaração `const exInput = ...` pra dentro do else** (apenas o bloco que precisa dela):

```tsx
{sorted.map((ex, idx) => {
  const lib = exercises[ex.exercise_id];
  const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");

  if (editMode) {
    return (
      <div key={`edit-${ex.exercise_id}-${idx}`} data-exercise-idx={idx}>
        <EditModeCard
          index={idx}
          name={name}
          sets={ex.sets}
          reps={ex.reps}
          onDelete={() => {
            console.log("delete", idx);
          }}
        />
      </div>
    );
  }

  const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };
  // ... resto igual
})}
```

- [ ] **Step 8: Verificação manual**

Run: `npm run dev`

No browser (mobile viewport, F12 → Toggle device toolbar):
1. Login + abrir uma rotina em `/treino?w=...&r=...`
2. Verificar que apareceu botão lápis ao lado do botão "Treinar"
3. Tocar no lápis → header muda pra "Editando exercícios", botão verde "Concluído" aparece, cards viram versão compacta (drag handle + nome + lixeira)
4. Tocar em "Concluído" → volta ao estado anterior
5. Tocar em "Treinar" → entra modo training, tocar no lápis → mesmo comportamento, mas cronômetro fica visível ao lado do botão lápis quando NÃO está editando, e some quando está

Expected: toggle funciona em ambos os modos, sem crash, layout limpo.

- [ ] **Step 9: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): adiciona modo edicao com toggle e EditModeCard (sem acoes ainda)"
```

---

## Task 6: Implementar exclusão de exercício (com confirmação contextual)

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Adicionar imports**

No topo de `src/app/treino/page.tsx`:

a) Adicionar import do modal:
```tsx
import DeleteConfirmModal from "@/components/treino/DeleteConfirmModal";
```

b) Atualizar import de `@/lib/workouts` (linha existente: `import { getExercisesByIds, updateRoutineExercise } from "@/lib/workouts";`) para:
```tsx
import { getExercisesByIds, updateRoutineExercise, updateRoutineExercises } from "@/lib/workouts";
```

c) Atualizar import de `@/types` (linha existente: `import { LibraryExercise, Routine, ExercisePerformance, SetPerformance, LocationType } from "@/types";`) para incluir `WorkoutExercise`:
```tsx
import { LibraryExercise, Routine, ExercisePerformance, SetPerformance, LocationType, WorkoutExercise } from "@/types";
```

- [ ] **Step 2: Adicionar estados de edit-related**

Logo após `const [editMode, setEditMode] = useState(false);` adicionar:

```tsx
const [deleteConfirm, setDeleteConfirm] = useState<{
  exIdx: number;
  exerciseName: string;
  doneSets: number;
} | null>(null);
const [editError, setEditError] = useState(false);
const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Adicionar helper de persistência**

Dentro de `TreinoContent`, após `loadRoutine` (depois da linha 144), adicionar:

```tsx
const persistExercises = useCallback(
  (exercises: WorkoutExercise[], immediate = false) => {
    if (!workoutId || !routineId) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const doIt = () => {
      updateRoutineExercises(workoutId, routineId, exercises).catch(() => {
        setEditError(true);
        loadRoutine();
      });
    };
    if (immediate) doIt();
    else persistTimerRef.current = setTimeout(doIt, 500);
  },
  [workoutId, routineId, loadRoutine]
);
```

- [ ] **Step 4: Implementar `applyDelete`**

Logo após `persistExercises`, adicionar:

```tsx
function applyDelete(exIdx: number) {
  if (!routine) return;
  const sortedEx = [...routine.exercises].sort((a, b) => a.order - b.order);
  const nextExercises = sortedEx
    .filter((_, i) => i !== exIdx)
    .map((ex, i) => ({ ...ex, order: i }));

  setRoutine({ ...routine, exercises: nextExercises });
  setInputs((prev) => prev.filter((_, i) => i !== exIdx));
  persistExercises(nextExercises, true);
  haptic("medium");
}
```

- [ ] **Step 5: Wireup do botão lixeira do `EditModeCard`**

Substituir o `onDelete` placeholder do `EditModeCard` (que era `console.log`):

```tsx
onDelete={() => {
  if (!routine) return;
  const doneSets = (inputs[idx]?.sets ?? []).filter((s) => s.done).length;
  const lib = exercises[ex.exercise_id];
  const exName = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
  if (doneSets > 0) {
    setDeleteConfirm({ exIdx: idx, exerciseName: exName, doneSets });
  } else {
    applyDelete(idx);
  }
}}
```

- [ ] **Step 6: Renderizar `DeleteConfirmModal`**

Antes do fechamento da `<div>` principal (perto do final do JSX, antes ou depois do `ExerciseSearchModal`), adicionar:

```tsx
{deleteConfirm && (
  <DeleteConfirmModal
    exerciseName={deleteConfirm.exerciseName}
    doneSets={deleteConfirm.doneSets}
    onCancel={() => setDeleteConfirm(null)}
    onConfirm={() => {
      applyDelete(deleteConfirm.exIdx);
      setDeleteConfirm(null);
    }}
  />
)}
```

- [ ] **Step 7: Renderizar banner de erro de edit**

Logo após o bloco `{swapError && (...)}` (linha ~567), adicionar:

```tsx
{editError && (
  <div className="animate-fade-in flex items-center gap-2 rounded-xl border border-[var(--red-500)]/30 bg-[var(--red-600)]/10 px-4 py-3">
    <svg className="h-4 w-4 shrink-0 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
    </svg>
    <p className="text-xs font-medium text-[var(--red-500)]">
      Não foi possível salvar a mudança. Verifique sua conexão.
    </p>
    <button
      onClick={() => setEditError(false)}
      className="ml-auto text-xs font-bold text-[var(--red-500)] underline"
    >
      Ok
    </button>
  </div>
)}
```

- [ ] **Step 8: Type-check + lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```

Expected: sem erros.

- [ ] **Step 9: Verificação manual**

Run: `npm run dev`

1. Abrir `/treino?w=...&r=...`, tocar lápis pra entrar em edit mode
2. Tocar na lixeira de um exercício → ele some imediatamente, lista compacta
3. Recarregar a página (F5) → exercício excluído NÃO volta (persistiu no Firestore)
4. Tocar "Treinar", marcar 1 set como done de um exercício, voltar pra edit mode (lápis), tocar lixeira → modal de confirmação aparece com "1 série já marcada"
5. Clicar "Cancelar" → modal some, exercício continua
6. Clicar lixeira de novo → "Excluir mesmo assim" → exercício some
7. Recarregar → confirma persistência

Expected: comportamento correto em todos os cenários.

- [ ] **Step 10: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): implementa exclusao de exercicio com modal de confirmacao"
```

---

## Task 7: Implementar reorder via @dnd-kit

**Files:**
- Modify: `src/app/treino/page.tsx`
- Modify: `src/components/treino/EditModeCard.tsx`

- [ ] **Step 1: Adicionar imports do dnd-kit em `page.tsx`**

```tsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

- [ ] **Step 2: Criar wrapper `SortableEditCard` em `page.tsx`**

Logo antes do componente `WorkoutComplete` (perto da linha 660), adicionar este wrapper que conecta o `EditModeCard` ao `useSortable`:

```tsx
function SortableEditCard({
  id,
  index,
  name,
  sets,
  reps,
  onDelete,
}: {
  id: string;
  index: number;
  name: string;
  sets: number;
  reps: string;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <EditModeCard
      index={index}
      name={name}
      sets={sets}
      reps={reps}
      onDelete={onDelete}
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      style={style}
      setNodeRef={setNodeRef}
    />
  );
}
```

- [ ] **Step 3: Configurar sensors em `TreinoContent`**

Dentro de `TreinoContent`, antes do `return`, adicionar:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);
```

- [ ] **Step 4: Implementar `applyReorder`**

Logo após `applyDelete`, adicionar:

```tsx
function applyReorder(fromIdx: number, toIdx: number) {
  if (!routine || fromIdx === toIdx) return;
  const sortedEx = [...routine.exercises].sort((a, b) => a.order - b.order);
  const movedEx = arrayMove(sortedEx, fromIdx, toIdx).map((ex, i) => ({
    ...ex,
    order: i,
  }));
  setRoutine({ ...routine, exercises: movedEx });
  setInputs((prev) => arrayMove(prev, fromIdx, toIdx));
  persistExercises(movedEx, false); // debounced
  haptic("light");
}

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const sortedEx = routine
    ? [...routine.exercises].sort((a, b) => a.order - b.order)
    : [];
  const fromIdx = sortedEx.findIndex((ex, i) => `${ex.exercise_id}-${i}` === active.id);
  const toIdx = sortedEx.findIndex((ex, i) => `${ex.exercise_id}-${i}` === over.id);
  if (fromIdx !== -1 && toIdx !== -1) {
    applyReorder(fromIdx, toIdx);
  }
}
```

- [ ] **Step 5: Envolver a lista de `EditModeCard` com `DndContext` e `SortableContext`**

Localizar o `.map` que renderiza os cards no editMode. Substituir o wrapper externo `<div className="stagger space-y-3">` por uma estrutura condicional: quando editMode, envolve em `DndContext` + `SortableContext`; quando não, mantém igual.

O bloco fica assim:

```tsx
{editMode ? (
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={handleDragEnd}
  >
    <SortableContext
      items={sorted.map((ex, i) => `${ex.exercise_id}-${i}`)}
      strategy={verticalListSortingStrategy}
    >
      <div className="space-y-3">
        {sorted.map((ex, idx) => {
          const lib = exercises[ex.exercise_id];
          const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
          return (
            <SortableEditCard
              key={`${ex.exercise_id}-${idx}`}
              id={`${ex.exercise_id}-${idx}`}
              index={idx}
              name={name}
              sets={ex.sets}
              reps={ex.reps}
              onDelete={() => {
                if (!routine) return;
                const doneSets = (inputs[idx]?.sets ?? []).filter((s) => s.done).length;
                const exName = name;
                if (doneSets > 0) {
                  setDeleteConfirm({ exIdx: idx, exerciseName: exName, doneSets });
                } else {
                  applyDelete(idx);
                }
              }}
            />
          );
        })}
      </div>
    </SortableContext>
  </DndContext>
) : (
  <div className="stagger space-y-3">
    {sorted.map((ex, idx) => {
      const lib = exercises[ex.exercise_id];
      const name = lib ? translateExerciseName(lib.name) : ex.exercise_id.replace(/-/g, " ");
      const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };
      const firstActiveIdx = sorted.findIndex((_, i) => {
        const inp = inputs[i];
        if (!inp) return false;
        return inp.sets.some((s) => !s.done);
      });
      const allSetsDoneInThis = exInput.sets.length > 0 && exInput.sets.every((s) => s.done);
      const isActive = training && idx === firstActiveIdx && !allSetsDoneInThis;
      return (
        <div key={`${ex.exercise_id}-${idx}`} data-exercise-idx={idx}>
          <ExerciseCard
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
            isActive={isActive}
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
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 6: Type-check + lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```

Expected: sem erros.

- [ ] **Step 7: Verificação manual**

Run: `npm run dev`

No browser (mobile viewport):
1. Entrar em edit mode
2. Long-press 150ms no drag handle de um card → card "cola" no dedo, outros animam pra abrir espaço
3. Mover pra outra posição → solta → ordem muda + haptic light
4. Esperar 500ms (debounce) → recarregar página → ordem persiste
5. Reorder rápido (3 trocas em < 500ms) → só uma escrita no Firestore (verifica via Network tab)
6. Reorder durante training (marcar 1 set, entrar edit, reordenar, sair edit) → o "exercício ativo" (borda vermelha) é recalculado corretamente

Expected: drag suave em mobile, sem competir com scroll vertical. Reorder persiste após refresh.

- [ ] **Step 8: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): implementa reorder com dnd-kit em modo edicao"
```

---

## Task 8: Implementar adição de exercício (botão + ExerciseSearchModal builder mode)

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Adicionar estado `addModal`**

Após os outros estados de edit (`editError`):

```tsx
const [addModal, setAddModal] = useState(false);
```

- [ ] **Step 2: Implementar `applyAdd`**

Logo após `applyReorder`/`handleDragEnd`, adicionar:

```tsx
function applyAdd(newEx: LibraryExercise, newSets: number, newReps: string) {
  if (!routine) return;
  const sortedEx = [...routine.exercises].sort((a, b) => a.order - b.order);
  const nextExercises = [
    ...sortedEx,
    {
      exercise_id: newEx.id,
      sets: newSets,
      reps: newReps,
      order: sortedEx.length,
    },
  ];

  // Pré-popular inputs com lastPerf
  const prev = lastPerf[newEx.id] || [];
  const newInput: ExerciseInput = {
    exercise_id: newEx.id,
    sets: Array.from({ length: newSets }, (_, i) => ({
      weight: prev[i]?.weight?.toString() || prev[0]?.weight?.toString() || "",
      reps: prev[i]?.reps?.toString() || prev[0]?.reps?.toString() || "",
      done: false,
    })),
  };

  setRoutine({ ...routine, exercises: nextExercises });
  setInputs((prevInputs) => [...prevInputs, newInput]);
  setExercises((prevEx) => ({ ...prevEx, [newEx.id]: newEx }));
  persistExercises(nextExercises, true);
  haptic("medium");
}
```

- [ ] **Step 3: Adicionar botão "+ Adicionar exercício" no fim da lista**

Dentro do bloco `editMode ? (...)`, dentro do `<DndContext>`, **fora** do `<SortableContext>` (logo após a div com `space-y-3` que contém os cards), adicionar:

```tsx
<button
  onClick={() => {
    haptic("light");
    setAddModal(true);
  }}
  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all hover:bg-[var(--red-600)]/8"
  style={{
    border: "1.5px dashed var(--border)",
    color: "var(--text-muted)",
  }}
>
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
  Adicionar exercício
</button>
```

- [ ] **Step 4: Renderizar `ExerciseSearchModal` em mode builder**

Logo após o `ExerciseSearchModal` de swap (no fim do JSX, perto da linha 614):

```tsx
{addModal && (
  <ExerciseSearchModal
    mode="builder"
    onSelectWithDetails={(ex, sets, reps) => {
      applyAdd(ex, sets, reps);
      setAddModal(false);
    }}
    onClose={() => setAddModal(false)}
    equipmentWhitelist={locationType === "quartel" ? QUARTEL_EQUIPMENT_WHITELIST : undefined}
  />
)}
```

- [ ] **Step 5: Empty state quando rotina fica vazia**

Dentro do bloco `editMode ? (...)`, antes do `<DndContext>`, adicionar condicional:

```tsx
{sorted.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <p className="text-sm font-medium text-[var(--text-muted)]">
      Rotina vazia
    </p>
    <p className="mt-1 text-xs text-[var(--text-dim)]">
      Adicione exercícios pra começar
    </p>
  </div>
) : (
  <DndContext ...>
    ...
  </DndContext>
)}

{/* Botão de adicionar SEMPRE visível em edit mode */}
<button onClick={...}>+ Adicionar exercício</button>
```

Refatorar a estrutura final do bloco editMode pra:

```tsx
{editMode ? (
  <>
    {sorted.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm font-medium text-[var(--text-muted)]">
          Rotina vazia
        </p>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          Adicione exercícios pra começar
        </p>
      </div>
    ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((ex, i) => `${ex.exercise_id}-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {sorted.map((ex, idx) => {
              // ... como antes
            })}
          </div>
        </SortableContext>
      </DndContext>
    )}

    <button
      onClick={() => {
        haptic("light");
        setAddModal(true);
      }}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all hover:bg-[var(--red-600)]/8"
      style={{
        border: "1.5px dashed var(--border)",
        color: "var(--text-muted)",
      }}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      Adicionar exercício
    </button>
  </>
) : (
  <div className="stagger space-y-3">
    {/* lista normal de ExerciseCard como antes */}
  </div>
)}
```

- [ ] **Step 6: Desabilitar botão "Treinar" quando rotina vazia**

Localizar o botão "Treinar" no header (não-edit, não-training):

```tsx
<button
  onClick={() => {
    haptic("medium");
    setTraining(true);
  }}
  className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white gradient-red transition-all"
  style={{ boxShadow: "var(--shadow-red)" }}
>
  Treinar
</button>
```

Adicionar `disabled` + estilo de disabled:

```tsx
<button
  onClick={() => {
    haptic("medium");
    setTraining(true);
  }}
  disabled={routine.exercises.length === 0}
  className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white gradient-red transition-all disabled:opacity-40 disabled:cursor-not-allowed"
  style={{ boxShadow: "var(--shadow-red)" }}
>
  Treinar
</button>
```

- [ ] **Step 7: Type-check + lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```

Expected: sem erros.

- [ ] **Step 8: Verificação manual**

Run: `npm run dev`

1. Entrar em edit mode, tocar "+ Adicionar exercício" → modal builder abre com chips de muscle group
2. Escolher um muscle, escolher um exercício, ajustar sets/reps, "Adicionar" → modal fecha, exercício aparece no fim da lista
3. Recarregar página → exercício persistiu
4. Excluir todos os exercícios → empty state aparece, botão "Treinar" do header desabilitado, botão "+ Adicionar" continua funcional
5. Adicionar um exercício no empty state → lista volta a ter conteúdo, botão "Treinar" reativa
6. Em locationType="quartel": abrir modal de add → lista de exercícios filtrada pelo whitelist

Expected: tudo funcional.

- [ ] **Step 9: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): adiciona exercicio extra com ExerciseSearchModal em builder mode"
```

---

## Task 9: Verificação final completa (todos os fluxos da spec)

Esta task não modifica código — só roda o checklist completo de verificação manual da spec.

- [ ] **Step 1: Verificações da spec (checklist completo)**

Run: `npm run dev`

Cenários:

1. **Browse → add → reload persiste:**
   - Abrir uma rotina em browse mode
   - Entrar em edit, adicionar 1 exercício (ex: Bíceps), sair do edit
   - F5 → exercício extra aparece e persiste

2. **Browse → reorder → reload persiste:**
   - Entrar em edit, drag o exercício 1 pra posição 3
   - F5 → ordem persiste

3. **Training → delete com sets done:**
   - Pressionar "Treinar"
   - Marcar 2 sets do Exercício A como done
   - Entrar em edit (botão lápis)
   - Tocar lixeira no A → modal "Excluir Exercício A?" com "2 séries já marcadas"
   - Clicar "Excluir mesmo assim" → A some
   - Sair do edit (Concluído) → continuar treino, marcar mais sets de outros exercícios
   - Finalizar → tela de sucesso → ir ao histórico → log NÃO inclui A

4. **Training → add mid-session:**
   - Em training mode, entrar em edit, adicionar Exercício X
   - Sair do edit → X aparece no fim da lista, sets pré-populados
   - Marcar sets de X → finalizar → log inclui X

5. **Training → reorder mid-session:**
   - Em training mode, com 2 sets de Exercício A done
   - Entrar em edit, reordenar (mover B antes de A)
   - Sair do edit → no modo training, o "exercício ativo" (borda vermelha) é recalculado: se A ainda tem sets pendentes, A continua ativo; se A está completo, o próximo na nova ordem fica ativo

6. **Offline:**
   - DevTools → Network → Offline
   - Entrar em edit, reordenar
   - Banner de erro "Não foi possível salvar" aparece + lista volta pro estado anterior
   - Tirar do offline, tentar de novo → funciona

7. **Touch (mobile real ou emulator):**
   - Long-press 150ms no drag handle → drag inicia
   - Scroll vertical normal não inicia drag (test: scroll a página sem segurar)
   - Soltar fora de qualquer alvo → card volta pra origem (animado)

8. **Teclado (acessibilidade):**
   - Tab até o drag handle de um card
   - Space pra pegar
   - ↓/↑ pra mover
   - Space pra soltar
   - Ordem muda corretamente

9. **Empty state:**
   - Excluir todos os exercícios → mensagem "Rotina vazia" + botão "Treinar" disabled + botão "+ Adicionar" funciona

10. **Light mode (DevTools → Rendering → prefers-color-scheme: light):**
    - Edit mode cards, delete confirm modal, botão de add — tudo respeita CSS vars sem cor hardcoded

11. **PWA standalone (iOS Safari → Add to Home Screen):**
    - Drag funciona em PWA standalone (não só no browser)
    - BottomNav não some quando entra em edit mode (a `/treino` não usa BottomNav, então N/A — confirmar que header fica no topo)

- [ ] **Step 2: Type-check + lint final**

Run:
```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: build limpo, sem warnings novos.

- [ ] **Step 3: Commit (se houver fixes)**

Se algum cenário pegou um bug, fazer fix + commit. Caso contrário, pular.

---

## Notas para o implementador

- **Não há framework de testes** neste projeto. Toda verificação é manual via browser + checagem estática (`tsc`, `lint`, `build`).
- **`firstActiveIdx`** é recomputado a cada render — não há estado de "exercício ativo" persistido. Reorder durante training "funciona naturalmente" porque o cálculo é sempre fresh.
- **`inputs[]` e `routine.exercises[]` devem permanecer em sincronia.** Todos os helpers de mutação (`applyAdd`, `applyDelete`, `applyReorder`) operam nos dois simultaneamente. Quebrar essa invariante quebra `markSetDone`, `updateSetInput`, e `handleFinish`.
- **Order field:** sempre reatribuído como `0..N-1` sequencial após delete/reorder. Add usa `length` (= max + 1, já que length é N e order vai de 0 a N-1).
- **Optimistic UI + refetch on error:** Mais simples que snapshot rollback. O custo é uma roundtrip extra se falhar, mas é raro.
- **Debounce de reorder (500ms)** é fundamental — sem ele, várias trocas seguidas no drag virariam várias writes no Firestore.
- **dnd-kit + touch:** `activationConstraint: { delay: 150, tolerance: 5 }` é o que permite scroll vertical da página funcionar sem confundir com drag intencional.
