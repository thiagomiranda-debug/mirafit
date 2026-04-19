# Quartel Equipment + Gender Split — Design Spec

**Data:** 2026-04-19  
**Status:** Aprovado

## Contexto

O app já possui um sistema de seleção de equipamentos para treinos do quartel e um motor de geração baseado em regras. Este spec adiciona:

1. 8 equipamentos obrigatórios do quartel (sempre ativos, não podem ser desmarcados)
2. Distribuição muscular ajustada por gênero aplicada a academia e quartel

---

## 1. Equipamentos obrigatórios do quartel

### 1.1 Mudanças em `QUARTEL_EQUIPMENT_CATEGORIES`

Adicionar campo `mandatory?: boolean` à estrutura de cada categoria. Os 8 itens abaixo são `mandatory: true`:

| Key | Label | Tokens Firestore | Novo? |
|---|---|---|---|
| `crossover_cable` | Cross Over e Polia | `cable` | Sim |
| `adjustable_bench` | Banco Articulado | `leverage machine`, `leverage_machine` | Sim |
| `treadmill` | Esteira Ergométrica | `cardio` | Sim |
| `stationary_bike` | Bicicleta Ergométrica | `stationary bike` | Existente → adicionar `mandatory: true` |
| `power_rack` | Power Rack | `barbell`, `olympic barbell` | Sim |
| `weight_plates` | Anilhas | `barbell`, `olympic barbell` | Sim |
| `barbell_bars` | Barras | `barbell`, `olympic barbell`, `ez barbell` | Sim |
| `dumbbell` | Halteres | `dumbbell` | Existente → renomear label + `mandatory: true` |

Tokens se somam via `Set` no gerador (duplicatas ignoradas automaticamente).

### 1.2 Mudanças em `resolveQuartelTokens()`

A função passa a sempre incluir tokens de todos os itens `mandatory: true`, independente do que está em `profile.quartel_equipment`. Os tokens opcionais (selecionados pelo usuário) são adicionados por cima:

```ts
function resolveQuartelTokens(keys?: string[]): Set<string> {
  const tokens = new Set<string>();
  // 1. Sempre inclui mandatórios
  for (const cat of QUARTEL_EQUIPMENT_CATEGORIES) {
    if (cat.mandatory) cat.tokens.forEach((t) => tokens.add(t));
  }
  // 2. Adiciona opcionais selecionados pelo usuário
  const optionalKeys = keys ?? [];
  for (const key of optionalKeys) {
    const cat = QUARTEL_EQUIPMENT_CATEGORIES.find((c) => c.key === key && !c.mandatory);
    if (cat) cat.tokens.forEach((t) => tokens.add(t));
  }
  return tokens;
}
```

### 1.3 `QUARTEL_DEFAULT_EQUIPMENT_KEYS`

Remover da constante os itens que agora são obrigatórios (já não precisam de default):
```ts
export const QUARTEL_DEFAULT_EQUIPMENT_KEYS = [
  'kettlebell',
  'cable',        // já coberto por crossover_cable mandatory
  'body_weight',
  'leverage_machine',
  'elliptical',
];
```

---

## 2. Distribuição muscular por gênero

### 2.1 Nova constante `GENDER_MUSCLE_BOOSTS`

Define boost adicional de peso muscular por gênero, somado ao `MUSCLE_WEIGHTS` base durante `allocateBudget`. Aplica-se a **academia e quartel**.

```ts
const GENDER_MUSCLE_BOOSTS: Record<string, Record<string, number>> = {
  feminino: {
    "Glúteos": 3,
    "Posterior de Coxa": 2,
    "Quadríceps": 1,
    "Adutores": 1,
  },
  masculino: {
    "Peitorais": 2,
    "Dorsal": 2,
    "Deltoides": 1,
    "Bíceps": 1,
    "Tríceps": 1,
  },
};
```

### 2.2 Mudança em `allocateBudget()`

Adicionar `gender` como parâmetro opcional e aplicar boost antes da ordenação:

```ts
function allocateBudget(
  muscles: string[],
  budget: number,
  focusMuscle: string | undefined,
  gender?: string,
): Map<string, number> {
  const genderBoosts = gender ? (GENDER_MUSCLE_BOOSTS[gender] ?? {}) : {};
  const entries = muscles.map((m) => ({
    muscle: m,
    weight: (MUSCLE_WEIGHTS[m] ?? 1)
      + (m === focusMuscle ? 2 : 0)
      + (genderBoosts[m] ?? 0),      // ← novo
  }));
  // resto da função inalterado
}
```

### 2.3 Ajuste em `scoreExercise()`

Ampliar o viés de gênero existente (atualmente só glúteos/posterior feminino) para cobrir superiores masculinos:

```ts
// Mulher: boost em exercícios de glúteo, posterior e quadríceps
if (profile.gender === "feminino") {
  if (["Glúteos", "Posterior de Coxa", "Quadríceps", "Adutores"].includes(muscle)) {
    if (/hip thrust|romanian|\brdl\b|bridge|kickback|bulgarian|\bsquat\b|\blunge\b|leg press/i.test(name)) {
      score += 15;
    }
  }
}
// Homem: boost em compostos de superiores
if (profile.gender === "masculino") {
  if (["Peitorais", "Dorsal", "Deltoides"].includes(muscle)) {
    if (/bench press|overhead press|military press|\brow\b|pull.?up|lat.?pull/i.test(name)) {
      score += 12;
    }
  }
}
```

### 2.4 Chamada em `generateWorkout()`

Passar `profile.gender` para `allocateBudget`:
```ts
const allocation = allocateBudget(safeMuscles, remaining, focusMuscle, profile.gender);
```

---

## 3. UI do perfil — equipamentos do quartel

### 3.1 Estrutura da seção

A seção "Equipamentos do Quartel" passa a ter dois blocos:

**Bloco 1 — "Equipamentos Fixos"** (sempre disponíveis no quartel):
- Lista os 8 itens `mandatory: true`
- Checkboxes visualmente sempre marcados (`border-[var(--amber-500)] bg-[var(--amber-500)]/15 text-[var(--amber-500)]`)
- Sem handler de clique (não clicáveis)
- Cursor padrão (`cursor-default`)

**Bloco 2 — "Equipamentos Opcionais"** (selecionáveis):
- Apenas itens com `mandatory !== true`
- Comportamento atual inalterado (toggle, marcar todos, limpar)

### 3.2 O que NÃO muda

- `quartel_equipment` no Firestore continua armazenando apenas os opcionais
- Os obrigatórios não são salvos — o gerador os injeta sempre

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/lib/workoutGenerator.ts` | `QUARTEL_EQUIPMENT_CATEGORIES` (campo `mandatory`, 8 itens), `resolveQuartelTokens()`, `GENDER_MUSCLE_BOOSTS`, `allocateBudget()` assinatura, `scoreExercise()` masculino, chamada em `generateWorkout()` |
| `src/app/profile/page.tsx` | Seção de equipamentos dividida em Fixos + Opcionais |

## Fora do Escopo

- Nenhuma mudança no Firestore schema ou índices
- Nenhuma mudança na API de geração
- Nenhuma mudança nas outras páginas
