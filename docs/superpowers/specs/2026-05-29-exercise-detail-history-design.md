# Tela de Detalhe e Histórico por Exercício — Design

**Data:** 2026-05-29
**Status:** Aprovado para planejamento

## Objetivo

Criar uma tela de detalhe por exercício (inspirada no "exercise history" do Hevy): tocar num exercício abre uma página dedicada com GIF/instruções, painel de recordes, gráfico de evolução com toggle de métrica, e o histórico sessão a sessão de todas as vezes que aquele exercício foi executado.

## Contexto: o que já existe

| Onde | O que faz | Reuso |
|---|---|---|
| `/history` → aba "Evolução" | Lista exercícios (≥2 sessões) com mini-gráfico SVG (`ExerciseChart`) de peso máx, % de variação, contagem de sessões | Vira ponto de entrada; mantido como está (preview) |
| `/history` → aba "Treinos" | `LogCard` expansível com tabela de exercícios da sessão | Nome do exercício vira ponto de entrada |
| `ProgressChart` (Perfil) | Gráfico recharts **agregado** (1RM médio + volume de todos exercícios) | Referência de padrão recharts + cores runtime; NÃO reutilizado diretamente |
| `metrics.ts` | `epley1RM`, `best1RMFromSets`, `totalVolume` | Reutilizado na nova função de dados |
| `getExerciseHistory()` em `workoutLogs.ts` | Órfão, não usado em lugar nenhum | **Removido** — substituído pela nova função |
| `getCachedWorkoutLogs(uid, limit)` | Cache de logs (TTL 60s, teto 120) | Fonte de dados (120 logs) |
| `getExercisesByIds([id])` | Busca `LibraryExercise` do catálogo | Busca GIF/músculo/equipamento |
| `translateExerciseName`, `generatePortugueseInstructions` | Localização PT-BR | Reutilizados na tela |

## Decisões de design (do brainstorming)

- **Pontos de entrada:** aba "Evolução" (card clicável) **e** aba "Treinos" (nome do exercício no `LogCard`). Ambos dentro de `/history`. A tela `/treino` **não** é tocada.
- **Conteúdo da tela:** GIF + instruções, painel de recordes, gráfico com toggle de métrica, histórico sessão a sessão. (Todos os quatro.)
- **Apresentação:** página dedicada com rota (não bottom-sheet).
- **Profundidade de dados:** cache ampliado para **120 logs** (teto do cache atual). Sem nova query Firestore nem índice.
- **Gráfico:** Opção C — recharts na página de detalhe (interativo, tooltip), mantendo o `ExerciseChart` SVG atual no preview da aba Evolução.

## Arquitetura

### Rota

Nova rota `/exercicio?id=<exerciseId>` — client page com `useSearchParams` envolto em `<Suspense>`, seguindo o padrão de `/treino` (query-param em vez de rota dinâmica aninhada, que quebra o Turbopack). Sem `BottomNav`; sub-tela com botão voltar e `pb-20` no container.

### Camada de dados

Nova função em `src/lib/workoutLogs.ts`:

```ts
export interface ExerciseSession {
  date: Date;
  sets: SetPerformance[];
}

export interface ExerciseRecords {
  best1RM: number;                      // melhor Epley de qualquer série
  maxWeight: number;                    // maior peso usado em qualquer série
  bestSet: { weight: number; reps: number } | null;  // série com maior 1RM
  maxReps: number;                      // mais reps numa única série
  bestSessionVol: number;               // maior Σ(peso×reps) numa sessão
}

export interface ExerciseDetail {
  sessions: ExerciseSession[];          // ordenado mais recente → mais antigo
  records: ExerciseRecords;
}

export async function getExerciseDetail(
  userId: string,
  exerciseId: string
): Promise<ExerciseDetail>;
```

Comportamento:
- Lê 120 logs via `getCachedWorkoutLogs(userId, 120)`.
- Para cada log que contém `exercise_id`, normaliza o formato (usa `perf.sets` se houver; senão converte legado `weight_lifted`/`reps_done` em `[{ weight, reps }]`; senão ignora).
- `sessions`: um item por log que contém o exercício, com `date` do log e os `sets` normalizados, ordenado da mais recente para a mais antiga (logs já vêm `date desc` do cache).
- `records`: derivado em passagem única sobre as sessões, reutilizando `epley1RM`/`best1RMFromSets`/`totalVolume`.
- `getExerciseHistory()` é removido (código morto).

As séries do gráfico (peso máx / 1RM / volume / reps por sessão) são derivadas das `sessions` **no cliente**, na página `/exercicio`. Nada é persistido.

### Componente de gráfico

Novo `src/components/ExerciseProgressChart.tsx` (`"use client"`):
- Props: dados já formatados por métrica (ou as `sessions` + métrica ativa) e a métrica selecionada.
- recharts `LineChart` com `XAxis` (datas), `YAxis`, `Tooltip` — cores resolvidas em runtime via `getComputedStyle` (mesmo padrão do `ProgressChart`, respeita light/dark).
- Renderiza apenas com ≥2 pontos; caso contrário a página oculta o gráfico.
- Separado do `ProgressChart` porque o formato de dados e a semântica (um exercício vs. agregado) são diferentes.

## Layout da página `/exercicio`

De cima para baixo:

1. **Header** — botão voltar + nome traduzido (`translateExerciseName`) + músculo-alvo traduzido (mapa `MUSCLE_NAME_PT` já usado em outras telas).
2. **GIF + instruções** — animação do `gif_url` do catálogo + instruções PT-BR via `generatePortugueseInstructions(target_muscle, equipment)`. Dados via `getExercisesByIds([id])`.
3. **Painel de recordes** — 4 cards (melhor 1RM 🏆, peso máx, melhor série, maior volume de sessão), estilo KPI chip com `var(--font-bebas)`.
4. **Gráfico** — `ExerciseProgressChart` com toggle de 4 métricas: **Peso máx / 1RM / Volume / Reps**. Tooltip ao toque.
5. **Histórico sessão a sessão** — lista (mais recente primeiro): cada item = data + todas as séries daquela sessão (ex.: `3×10 @ 80 kg` ou lista de séries).

## Pontos de entrada (em `/history`)

- **Aba "Evolução":** `EvolutionCard` vira clicável → `router.push('/exercicio?id=' + exerciseId)`. Mantém o mini-gráfico SVG atual como preview.
- **Aba "Treinos":** no `LogCard` expandido, o nome do exercício na tabela vira link → mesma rota.

## Estados de borda

- **Sem `id`** ou exercício inexistente no catálogo → mensagem amigável + botão voltar.
- **1 sessão apenas** → gráfico não renderiza (precisa ≥2 pontos); mostra recordes + a única sessão.
- **Carregando** → spinner padrão (borda `var(--red-500)`).
- **Erro de leitura** → mensagem + "Tentar novamente" (padrão da `/history`).

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/workoutLogs.ts` | Modificar | Adicionar `getExerciseDetail` + tipos; remover `getExerciseHistory` órfão |
| `src/components/ExerciseProgressChart.tsx` | Criar | Gráfico recharts por exercício com toggle de métrica |
| `src/app/exercicio/page.tsx` | Criar | Página de detalhe (Suspense + query-param) |
| `src/app/history/page.tsx` | Modificar | `EvolutionCard` clicável + nome do exercício no `LogCard` clicável |

## Fora de escopo (YAGNI)

- Entrada a partir da tela `/treino` (decidido: não tocar).
- Busca dedicada de exercícios do catálogo.
- Query Firestore por exercício / novo índice (cache de 120 logs basta).
- Compartilhamento/exportação da tela.
- Persistência de recordes (sempre derivados no read).

## Verificação

Sem infra de testes no projeto (sem jest/vitest). Verificação por:
- `npx tsc --noEmit` — sem erros de tipo.
- `npm run lint` — sem erros.
- Verificação visual no dev server: navegar Histórico → Evolução → tocar card → tela de detalhe; alternar as 4 métricas; conferir recordes e lista de sessões; testar exercício com 1 sessão e com 0 sessões.
