# Design: Link YouTube para Demonstração de Exercícios

**Data:** 2026-05-05  
**Status:** Aprovado

## Objetivo

Adicionar um link para o YouTube dentro do `ExerciseCard` expandido na página `/treino`, permitindo que o usuário assista a uma demonstração em vídeo do exercício antes ou durante o treino.

## Decisões

- **Onde aparece:** somente na seção expandida do card (`{open && ...}`), logo abaixo do GIF/fallback
- **Mecanismo:** URL de busca do YouTube gerada dinamicamente — sem API, sem lookup table, sem iFrame
- **Idioma da query:** nome em português (já disponível via `translateExerciseName`)
- **Query format:** `{name} execução`  
  Exemplo: `Supino Reto com Barra execução`
- **Abertura:** `target="_blank" rel="noopener noreferrer"` — abre no app do YouTube ou no browser

## Abordagem rejeitada

- **Tabela estática de vídeos:** descartada por custo de manutenção e necessidade de atualizar quando vídeos saem do ar
- **iFrame embutido:** descartado por impacto de performance (carrega JS do YouTube em cada card)

## Escopo de mudanças

| Arquivo | Tipo de mudança |
|---|---|
| `src/app/treino/page.tsx` | Adicionar botão-link no bloco expandido do `ExerciseCard` |

Nenhum arquivo novo. Nenhuma prop nova. Nenhuma alteração de tipos.

## Comportamento

1. Usuário abre o card de um exercício clicando no header
2. Seção expandida mostra: GIF → **botão YouTube** → chips de músculo/equipamento → séries/reps → instruções
3. Clicar no botão abre `https://www.youtube.com/results?search_query={encodeURIComponent(name + " execução")}` em nova aba/app

## Visual

```
┌─────────────────────────────────────┐
│  [GIF do exercício]                 │
│                                     │
│  ▶ Ver demonstração no YouTube  ↗   │  ← link sutil, ícone YouTube vermelho
│                                     │
│  [Peito]  [Barra]                   │
│  Séries: 4    Repetições: 8-12      │
│  Como executar: ...                 │
└─────────────────────────────────────┘
```

**Estilo:** `<a>` com `bg-[var(--surface-2)]`, ícone SVG do YouTube em `text-[var(--red-500)]`, texto em `text-[var(--text-muted)]`. Hover: `hover:bg-[var(--surface-3)]`.

## Critério de sucesso

- O link aparece somente quando o card está expandido
- A URL de busca contém o nome traduzido em português + "execução"
- Não quebra o layout existente (GIF, chips, instruções)
- Funciona offline graciosamente (o link simplesmente não abre se sem conexão)
