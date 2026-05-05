# Exercise Swap — Design Spec
**Date:** 2026-05-05

## Problem

The exercise swap flow in `/treino` has two issues:
1. The modal lista exercícios de forma compacta sem imagem, tornando difícil escolher visualmente.
2. A troca não é persistida — ao reabrir o treino ou na próxima sessão, o exercício original aparece de volta.

## Goals

- Modal de troca com cards visuais (foto + nome + músculo + equipamento)
- Troca salva permanentemente na rotina do Firestore

## Out of Scope

- Troca em modo "builder" (sem alteração)
- Histórico de trocas ou desfazer
- Animação de GIF no modal (só thumbnail estático `0.jpg`)

---

## Design

### 1. ExerciseSearchModal — modo `swap`

**Apresentação:**
- Bottom sheet com `h-[90vh]`, `rounded-t-2xl` — consistente com outros sheets do app
- Topo fixo: título "Trocar exercício" + campo de busca
- Lista scrollável abaixo

**Card de exercício (modo swap):**
- Thumbnail `<img>` da URL `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/{id}/0.jpg`
  - `loading="lazy"`, `onError` troca por placeholder cinza com ícone de haltere
- Nome traduzido via `translateExerciseName()`
- Linha secundária: `target_muscle` + equipamento em texto pequeno (`text-muted`)
- Toque em qualquer parte do card confirma a troca e fecha o modal imediatamente

**Sem alterações ao modo `builder`** — a branch de renderização é separada por `if (mode === "swap")`.

---

### 2. Persistência — `updateRoutineExercise()`

**Nova função em `src/lib/workouts.ts`:**

```typescript
async function updateRoutineExercise(
  workoutId: string,
  routineId: string,
  oldExerciseId: string,
  newExerciseId: string
): Promise<void>
```

**Implementação:**
1. Lê o documento `workouts/{workoutId}/routines/{routineId}`
2. Mapeia o array `exercises`, substituindo `exercise_id === oldExerciseId` pelo `newExerciseId`
3. Escreve de volta com `updateDoc({ exercises: updatedArray })`

**Chamada em `handleSwapExercise()` (treino page):**
```
1. setRoutine(...)       // atualiza estado React (existente)
2. setExercises(...)     // cacheia nova LibraryExercise (existente)
3. setInputs(...)        // reseta inputs (existente)
4. setSwapModal(null)    // fecha modal imediatamente (existente)
5. updateRoutineExercise(...).catch(() => setSwapError(true))  // NOVO — fire-and-forget
```

O save é fire-and-forget: o modal fecha na hora (sem spinner), e erros são capturados pelo `.catch()` que seta um estado `swapError` para mostrar o toast.

Os IDs `workoutId` e `routineId` já vêm dos query params da URL (`?w=...&r=...`).

---

### 3. Firestore Security Rules

Verificar se `firestore.rules` já permite escrita autenticada em `workouts/{workoutId}/routines/{routineId}`.

Regra necessária (se ausente):
```
match /workouts/{workoutId}/routines/{routineId} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/workouts/$(workoutId)).data.user_id == request.auth.uid;
}
```

---

### 4. Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Falha no save Firestore | Toast de erro discreto; estado React mantido (sessão continua) |
| Imagem não carrega | Placeholder cinza com ícone de haltere via `onError` |
| Lista vazia (sem outros exercícios) | Mensagem "Nenhum exercício encontrado para este grupo muscular" |
| Loading do save | Nenhum spinner — write é rápido, modal fecha imediatamente |

---

## Files Affected

| File | Change |
|---|---|
| `src/components/ExerciseSearchModal.tsx` | Novo layout de card para `mode="swap"` com foto + músculo + equipamento |
| `src/lib/workouts.ts` | Nova função `updateRoutineExercise()` |
| `src/app/treino/page.tsx` | Chamar `updateRoutineExercise()` em `handleSwapExercise()`; passar `workoutId` ao swap modal |
| `firestore.rules` | Verificar/adicionar regra de escrita para subcoleção `routines` |
