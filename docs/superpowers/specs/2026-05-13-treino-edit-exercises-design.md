# Editar exercícios na tela de treino (adicionar/excluir/reordenar)

**Status:** Spec
**Data:** 2026-05-13
**Escopo:** Página `/treino` (`src/app/treino/page.tsx`)

## Problema

A rotina exibida em `/treino` é gerada automaticamente (ou pelo builder manual) e hoje é imutável durante a sessão — o usuário só consegue trocar um exercício pelo botão de swap. Quando o usuário tem mais tempo ou disposição num dia específico, não há como adicionar um exercício extra; quando quer ajustar a ordem ou remover algo que não pretende fazer, também não há caminho.

## Objetivo

Permitir que o usuário, na tela `/treino`:

1. **Adicione** exercícios extras (catálogo `library_exercises`)
2. **Exclua** exercícios da rotina atual
3. **Reordene** os exercícios via drag-and-drop

Todas as mudanças **persistem no Firestore** (mesmo padrão do swap atual) — ou seja, modificam a rotina salva. A próxima vez que o usuário abrir a rotina, ela reflete as mudanças.

## Decisões já tomadas

| Decisão | Valor |
|---|---|
| Persistência | Tudo persiste no Firestore (atualiza `routine.exercises`) |
| Quando disponível | Antes e durante o treino (ambos os modos: browse e training) |
| Padrão de UI | Modo edição com toggle (botão "Editar" no header) |
| Dependência de drag-drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Excluir com sets done | Modal de confirmação contextual |
| Set rows durante edit mode | Escondidos (cards ficam compactos) |
| Persistência de reorder | Debounce 500ms pra agrupar reorders rápidos |

## Arquitetura

### Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `src/app/treino/page.tsx` | Estado de modo edição, handlers de mutação, integração com dnd-kit |
| `src/lib/workouts.ts` | Nova função `updateRoutineExercises()` |
| `src/components/treino/EditModeCard.tsx` | **Novo** — card compacto pra modo edição |
| `src/components/treino/DeleteConfirmModal.tsx` | **Novo** — bottom-sheet de confirmação de exclusão |
| `package.json` | Adiciona `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

`ExerciseSearchModal` é **reusado** sem mudanças (já tem `mode="builder"` com chips de muscle group + inputs de sets/reps).

`ExerciseCard` existente fica **intacto** — é o card de modo browse/training. O `EditModeCard` é um componente separado.

### Nova API de persistência

```ts
// src/lib/workouts.ts

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

Sobrescreve o array inteiro. As regras de segurança em `firestore.rules` já validam `user_id` do workout pai — não é necessário ajustar rules.

### Estado novo em `TreinoContent`

```ts
const [editMode, setEditMode] = useState(false);
const [addModal, setAddModal] = useState(false);
const [deleteConfirm, setDeleteConfirm] = useState<{
  exIdx: number;
  exerciseName: string;
  doneSets: number;
} | null>(null);
const [editError, setEditError] = useState(false);

const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
```

### Helpers de mutação (todos atualizam `routine` + `inputs` em sincronia)

```ts
function applyAdd(newEx: LibraryExercise, sets: number, reps: string) {
  // 1. Adiciona em routine.exercises com order = max + 1
  // 2. Adiciona em inputs com sets pré-populados via lastPerf[newEx.id]
  // 3. Adiciona em exercises map (cache local de LibraryExercise)
  // 4. Persiste imediatamente (sem debounce — add é raro)
}

function applyDelete(exIdx: number) {
  // 1. Remove o item de routine.exercises pelo índice
  // 2. Remove o item correspondente de inputs
  // 3. Reatribui order: 0, 1, 2... pros remanescentes
  // 4. Persiste imediatamente
}

function applyReorder(fromIdx: number, toIdx: number) {
  // 1. arrayMove em routine.exercises (dnd-kit/sortable helper)
  // 2. arrayMove em inputs (mesma transformação)
  // 3. Reatribui order: 0, 1, 2... baseado na nova posição
  // 4. Persiste com debounce 500ms
}

function persistExercises(exercises: WorkoutExercise[], immediate = false) {
  if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  const doIt = () => {
    updateRoutineExercises(workoutId, routineId, exercises).catch(() => {
      setEditError(true);
      // rollback: refetch via loadRoutine()
      loadRoutine();
    });
  };
  if (immediate) doIt();
  else persistTimerRef.current = setTimeout(doIt, 500);
}
```

**Optimistic update + refetch on error.** Diferente do swap atual (que mantém um snapshot do estado anterior pra rollback), aqui usamos `loadRoutine()` no rollback. É menos otimizado mas mais simples e seguro contra inconsistências.

### Sincronização `inputs[]` ↔ `routine.exercises[]`

A invariante: `inputs[i].exercise_id === sorted[i].exercise_id` pra todo i. Os helpers de mutação garantem isso operando em ambos os arrays simultaneamente. Nenhum lookup por índice cruzado faz sentido sem essa garantia (afeta `markSetDone`, `updateSetInput`, `handleFinish`).

## UX detalhado

### Toggle de modo edição

**Header em modo browse/training (atual):**
```
[← back]  Costas A           [Treinar / 12:34]
          12 exercícios
```

**Header em modo edição:**
```
[← back]  Editando exercícios  [Concluído]
          12 exercícios
```

- Botão "Editar" aparece ao lado de "Treinar" no modo browse, e ao lado do cronômetro no modo training (com ícone de lápis)
- Em modo edição: o botão vira "Concluído" (verde, mesmo footprint)
- O botão "Treinar"/"Concluído" e o cronômetro nunca aparecem simultaneamente com "Editar" — só um conjunto por vez no canto direito

### Card em modo edição (EditModeCard)

Layout compacto, **uma linha só:**

```
[≡ drag handle]  01  Supino reto barra            [🗑]
                     3 séries × 8-10 reps
```

- `≡` = drag handle (cinza dim, fica laranja em hover/active)
- `01` = índice (estilo Bebas Neue, dim — não muda em hover)
- Nome + sets×reps (igual ao header atual do `ExerciseCard`)
- `🗑` = botão excluir (ícone lixeira, fundo `rgba(239,68,68,0.08)`, hover intensifica)
- **Sem** seta de expandir, **sem** botão de swap, **sem** set rows, **sem** progresso

Animação ao entrar em edit mode: cards atuais animam pra forma compacta com `transition: all 200ms ease-out` (igual ao border-color que já temos).

### Adicionar exercício

Botão no fim da lista, **só visível em edit mode:**

```
┌─────────────────────────────────────┐
│  + Adicionar exercício              │  ← dashed border, text-muted
└─────────────────────────────────────┘
```

Estilo: `border: 1.5px dashed var(--border)`, `color: var(--text-muted)`, hover intensifica pra `var(--red-500)/30`.

Abre `<ExerciseSearchModal mode="builder" onSelectWithDetails={...} />`. Ao confirmar:
1. `applyAdd(exercise, sets, reps)` é chamado
2. Modal fecha
3. Card aparece no fim da lista com `animate-fade-in`
4. Auto-scroll suave pra revelar o novo card

**Equipment whitelist:** se `locationType === "quartel"`, passa `equipmentWhitelist={QUARTEL_EQUIPMENT_WHITELIST}` pro modal (já suportado).

### Excluir exercício

**Fluxo sem sets done:**
1. Click no botão lixeira → `haptic("light")`
2. `applyDelete(exIdx)` é chamado direto
3. Card some com animação (fade-out + slide-up dos seguintes)

**Fluxo com sets done:**
1. Click no botão lixeira
2. Abre `DeleteConfirmModal` (bottom-sheet):
   ```
   Excluir "Supino reto barra"?
   
   Esse exercício tem 2 séries marcadas como
   concluídas. As séries feitas serão salvas no
   histórico ao finalizar o treino, mas o exercício
   sai da rotina.
   
   [Cancelar]              [Excluir]
   ```
3. "Cancelar" → fecha modal, nada muda
4. "Excluir" → `applyDelete(exIdx)` + fecha modal + `haptic("medium")`

**Importante:** o `handleFinish` continua salvando apenas `inputs.filter((inp) => inp.sets.some((s) => s.done))`, então os sets done do exercício excluído **só seriam preservados se ainda estivessem em `inputs[]`**. Como `applyDelete` remove o item de `inputs[]` também, **os sets done de um exercício excluído são perdidos.** A mensagem do modal precisa refletir isso honestamente — ajustando:

```
Excluir "Supino reto barra"?

Esse exercício tem 2 séries já marcadas. Ao excluir,
essas séries NÃO serão salvas no histórico.

[Cancelar]              [Excluir mesmo assim]
```

Decisão tomada: **excluir descarta os sets done do exercício.** Alternativa (preservar sets done num "log órfão") fica fora do escopo.

### Reordenar (dnd-kit)

Usar `@dnd-kit/sortable` com `SortableContext` envolvendo a lista de `EditModeCard`s em edit mode.

Configuração:
- **Sensor:** `PointerSensor` com `activationConstraint: { delay: 150, tolerance: 5 }` — long-press de 150ms ativa drag (evita conflito com scroll vertical). 5px de tolerância pra absorver micro-movimentos.
- **Strategy:** `verticalListSortingStrategy`
- **DragOverlay:** clone do card sendo arrastado com `opacity: 0.9`, `scale: 1.02`, `box-shadow: 0 8px 24px rgba(0,0,0,0.4)`
- **Transition:** `cubic-bezier(0.25, 1, 0.5, 1)` pra animar os outros cards abrindo espaço

Drag handle: ícone `≡` (6 dots ou 3 linhas horizontais). Só o handle ativa o drag — o resto do card não é draggable.

Ao soltar: `applyReorder(fromIdx, toIdx)` → atualiza `routine.exercises`, `inputs` e dispara persistência debounced.

### Estado vazio

Se o usuário excluir todos os exercícios:
```
┌─────────────────────────────────────┐
│         Rotina vazia                │
│  Adicione exercícios pra começar    │
│                                     │
│      [+ Adicionar exercício]        │
└─────────────────────────────────────┘
```

O botão "Treinar" do header fica disabled enquanto a rotina estiver vazia.

## Edge cases

| Caso | Comportamento |
|---|---|
| Reordenar durante treino com sets já done | Permitido. `firstActiveIdx` recalcula pelo array sorted, então o "exercício ativo" sempre é o primeiro com sets pendentes — funciona naturalmente. |
| Excluir o exercício "ativo" durante treino | Permitido. `firstActiveIdx` simplesmente aponta pro próximo. |
| Adicionar exercício mid-session | Entra no fim da lista, **não** vira ativo automaticamente. Usuário precisa terminar os atuais primeiro (ou pode marcar sets manualmente). |
| Modo edição enquanto rest timer aberto | Rest timer continua funcionando. Edit mode é só visual sobre a lista. |
| Falha de rede ao persistir | Banner de erro (estilo do `swapError` atual) + `loadRoutine()` pra ressincronizar com Firestore. |
| Toggle edit mode enquanto modal de add aberto | Botão "Concluído" desabilitado enquanto algum modal de edição está aberto (evita estado inconsistente). |
| Modal de delete confirm aberto + tap fora | Fecha o modal sem deletar (backdrop click). |
| Reorders muito rápidos (várias trocas em < 500ms) | Debounce 500ms agrupa tudo numa única escrita no Firestore. |
| Trocar exercício (swap atual) e depois entrar em edit | Swap já persiste imediatamente; edit mode opera no estado já atualizado. Sem conflito. |
| Exercício pré-existente com `order` duplicado ou faltando | `applyDelete`/`applyReorder` sempre reatribuem `order: 0..N-1` sequencial, normalizando. |

## Verificação manual

- [ ] Browse mode: entra em edit, adiciona um exercício, sai do edit → exercício aparece e **persiste no reload da página**
- [ ] Browse mode: reordena 3 exercícios via drag → ordem persiste no reload
- [ ] Training mode: marca 2 sets de Exercício A, entra em edit, exclui A → modal aparece avisando que os sets serão perdidos, confirma, A some, finaliza treino → log **não** inclui A
- [ ] Training mode: adiciona Exercício X mid-session, marca sets, finaliza → log inclui X
- [ ] Training mode: reordena durante treino → o "exercício ativo" (borda vermelha) muda corretamente conforme a nova ordem
- [ ] Offline: simula falha de rede ao reordenar (DevTools → Offline) → banner de erro aparece + lista volta pro estado anterior do Firestore
- [ ] Touch: drag funciona em mobile (testar em iOS PWA real) sem competir com scroll vertical — long-press 150ms é confortável
- [ ] Acessibilidade: navegação por teclado no dnd-kit funciona (Tab → Space pra pegar → setas pra mover → Space pra soltar)
- [ ] Empty state: excluir todos os exercícios → mensagem aparece, botão "Treinar" disabled, botão "+ Adicionar" continua funcional
- [ ] Light mode: cards de edit mode, modal de delete confirm, botão de add — tudo respeita as CSS vars

## Fora do escopo

- Editar `sets`/`reps` de um exercício já existente na rotina (precisa de outro fluxo — talvez tap-and-hold no card pra editar inline)
- Preservar sets done de um exercício excluído num "log órfão" separado
- Reorder cross-routine (mover exercício pra outro split, ex: A → B)
- Templates de "extras" pré-definidos (ex: "core finisher", "tabata de panturrilha")
- Histórico de mudanças na rotina (auditoria de quem mudou o quê)
