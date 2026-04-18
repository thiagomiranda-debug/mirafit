# Modo TAF completo — eventos de corrida, tentativas e histórico

Data: 2026-04-18
Status: Draft
Edital de referência: Corpo de Bombeiros Militar de Alagoas — BGO Nº 145 (03/08/2023), ANEXO A, Tabela 1 (Masculino) e Tabela 2 (Feminino)

## 1. Contexto

A aba "Modo TAF" na tela de Perfil (`src/app/profile/page.tsx` + `src/components/TafDashboard.tsx`) hoje expõe 3 KPIs — Barra Fixa, Flexão de Braço e Abdominal — calculando a nota do candidato a partir do **maior número de reps** registrado nos logs de treino (`workout_history`), casando exercícios pelo nome (inglês) via `matchExerciseToTaf()`.

Limitações atuais:
- Faltam os eventos **corrida 300m** (4.a) e **corrida 1600m** (5.a) da tabela do edital.
- Não existe fluxo dedicado para registrar uma tentativa de TAF (o usuário só consegue ver pontuação para os eventos que aparecem nos treinos regulares).
- Não existe histórico de evolução específico da nota TAF.

## 2. Objetivo

Entregar um **modo TAF de ponta a ponta** que permita ao candidato:
1. Ver os 5 eventos do edital (3 existentes + 2 corridas novas) com sua nota atual.
2. Iniciar uma tentativa — completa (5 eventos) ou avulsa (1 evento) — e registrar o resultado.
3. Acompanhar a evolução ao longo do tempo via gráficos por evento e lista de tentativas.

Não-objetivos:
- Cronômetro integrado (input é manual, confirmado pelo usuário).
- Eventos de natação (4.b / 5.b do edital) — fora de escopo.
- Teste de Cooper ou qualquer protocolo fora do CBMAL.
- Barra feminina (barra estática em tempo) — o comportamento atual exclui `pull_up` para mulheres e será preservado.

## 3. Escopo dos 5 eventos

| Evento | Sexo | Tipo de medida | Melhor = |
|---|---|---|---|
| Barra Fixa (`pull_up`) | Masculino apenas | reps | maior |
| Flexão de Braço (`push_up`) | Ambos | reps | maior |
| Abdominal (`crunch`) | Ambos | reps | maior |
| Corrida 300m (`run_300m`) | Ambos | tempo (mm:ss.ms) | menor |
| Corrida 1600m (`run_1600m`) | Ambos | tempo (mm:ss) | menor |

Para mulheres a tela mostra 4 eventos (sem `pull_up`). Para homens, 5 eventos.

## 4. Pontuação das corridas

### 4.1. Modelo de dados

Os tempos da tabela são **intervalos tabelados por faixa etária** (ex: homens ≤30 anos, 300m: "1'20"00 – 1'22"99" = 50 pts). Não é interpolação linear como reps — é lookup por faixa.

Novo tipo em `tafData.ts`:

```ts
export type TafRunKey = 'run_300m' | 'run_1600m';
export type TafEventKey = TafExerciseKey | TafRunKey;

// Escala por faixa de tempo. Tempos em segundos (inclusive do .99).
// Ordenado do pior (maior tempo = 0 pts) para melhor (menor tempo = 100 pts).
interface TafRunTier {
  maxSeconds: number; // tempo máximo (inclusive) para atingir essa nota
  score: number;      // pontos atribuídos se tempo ≤ maxSeconds
}

export const tafRunStandards: Record<
  TafGender,
  Record<TafAgeGroup, Record<TafRunKey, TafRunTier[]>>
> = { /* extraído diretamente da tabela do edital */ };
```

A função de scoring percorre os tiers ordenados (menor tempo → maior tempo) e retorna o primeiro `score` cujo `maxSeconds` ≥ tempo do candidato; se o tempo for pior que o pior tier, retorna 0.

```ts
export function scoreRunTime(seconds: number, gender: TafGender, age: TafAgeGroup, event: TafRunKey): number
```

### 4.2. Fonte dos dados

Os valores dos tiers serão transcritos manualmente da tabela do edital (anexada na issue do usuário, BGO nº 145). Um comentário JSDoc em `tafRunStandards` registrará a referência ao edital para auditoria futura.

## 5. Fluxo "Iniciar Modo TAF"

### 5.1. Entrada

Novo botão de destaque (gradiente âmbar/vermelho) no topo da aba TAF em `TafDashboard`, acima dos 5 cards:

```
[ INICIAR MODO TAF ]   (tap → navega para /taf/tentativa)
```

### 5.2. Rota `/taf/tentativa`

Nova página em `src/app/taf/tentativa/page.tsx`. Não usa `BottomNav` (footer próprio com ações), segue padrão do `/treino`.

Primeiro passo: seleção do tipo de tentativa.

```
Qual tentativa você vai registrar?

┌─────────────────────────────────────┐
│ 🏋️ TAF COMPLETO                      │
│ Registrar os 5 eventos em sequência │
│ (ou 4, se feminino)                  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🎯 EVENTO AVULSO                     │
│ Registrar apenas um exercício        │
└─────────────────────────────────────┘
```

### 5.3. TAF completo — wizard

Um passo por evento (na ordem: barra → flexão → abdominal → 300m → 1600m; pula `pull_up` se feminina). Cada passo mostra:

- Nome do evento + ilustração/ícone
- Input apropriado (reps: número; tempo: `mm`:`ss` para 1600m, `mm`:`ss.ms` ou `ss.ms` para 300m)
- Nota prevista em tempo real (usando `calculateTafScore` / `scoreRunTime`) + mínimo para aprovação
- Botão "Pular este evento" (resultado = `null`, nota = 0, conta na soma como 0)
- Botão "Próximo" (ou "Finalizar" no último)

No final, tela de resumo:
- Lista dos 5 resultados com nota individual (0-100)
- **Nota total = soma das 5 notas** (0-500 no máximo)
- Botão "Salvar" (grava em Firestore) / "Refazer" (descarta)

### 5.4. Evento avulso

Seleciona um dos eventos disponíveis (lista de chips), mostra input daquele evento, nota prevista, "Salvar".

### 5.5. Modelo de dados — `taf_attempts`

Nova coleção Firestore `taf_attempts`:

```ts
interface TafAttempt {
  id: string;
  user_id: string;
  date: Timestamp;                    // criada no momento do salvamento
  type: 'full' | 'single';
  gender: TafGender;                  // snapshot, para reinterpretar nota se usuário mudar perfil
  age_group: TafAgeGroup;             // snapshot
  results: TafEventResult[];          // 1..5 entradas
  total_score: number;                // soma das notas dos eventos registrados
}

interface TafEventResult {
  event: TafEventKey;
  value: number;                      // reps OU segundos (float p/ 300m)
  score: number;                      // 0-100, clampado
  skipped?: boolean;                  // true se "pulou" no wizard
}
```

Campos que *não* vão no doc (economia): `base`/`mult`/tiers usados para calcular a nota — são regeneráveis a partir dos padrões + snapshot de `gender`/`age_group`.

Regras Firestore (adicionar em `firestore.rules`):

```
match /taf_attempts/{id} {
  allow read, delete: if request.auth != null && resource.data.user_id == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.user_id == request.auth.uid;
  allow update: if false;   // tentativas são imutáveis
}
```

Índice composto necessário em `(user_id ASC, date DESC)` — mesmo padrão de `workout_history`. Documentar em `CLAUDE.md` junto com o existente.

## 6. Dashboard atualizado (TafDashboard.tsx)

### 6.1. Cards dos 5 eventos

Os 3 cards atuais (reps) continuam com a UI atual. Os 2 novos cards (corrida) seguem o mesmo layout visual, com estas diferenças:

- PR mostrado em `mm:ss` (300m: com centésimos; 1600m: sem)
- Texto indicador:
  - `score = 100`: "Nota máxima!"
  - `50 ≤ score < 100`: "Aprovado! Reduza X segundos para a nota máxima."
  - `score < 50`: "Reprovado. Reduza X segundos para atingir o mínimo."

### 6.2. Origem do PR de cada evento

Política de agregação: **o maior entre todas as fontes disponíveis**.

- Reps (`pull_up`, `push_up`, `crunch`): `max(PR de workout_history via name-match, melhor tentativa em taf_attempts)` — preserva integração automática com treinos existentes.
- Corridas (`run_300m`, `run_1600m`): só vêm de `taf_attempts` (não há equivalente em treinos regulares).

### 6.3. Botão "Iniciar Modo TAF"

Acima dos cards, destaque visual (gradiente + ícone). Sempre visível (mesmo sem perfil completo — nesse caso desabilitado com tooltip pedindo pra completar).

## 7. Histórico de evolução

Nova seção abaixo dos 5 cards, dentro do mesmo `TafDashboard`.

### 7.1. Gráficos por evento

Grid responsivo (2 colunas mobile, 3 colunas desktop). Um mini-gráfico por evento:

- `LineChart` (recharts) com eixo X = data e eixo Y = nota (0-100)
- Últimas 20 tentativas que incluíram o evento (full + single)
- Mesmo critério de cores do `ProgressChart` (valor via `getComputedStyle` para respeitar light/dark mode)
- Mínimo 2 pontos para renderizar; caso contrário mostra placeholder "Registre mais tentativas"

Componente novo: `src/components/TafHistoryChart.tsx`.

### 7.2. Lista de tentativas

Abaixo dos gráficos. Cards cronológicos (mais recente primeiro):

```
┌──────────────────────────────────────┐
│ 12/04/2026 · TAF COMPLETO    380 pts │
├──────────────────────────────────────┤
│ Barra Fixa     8 reps        80 pts  │
│ Flexão        32 reps        90 pts  │
│ Abdominal     45 reps       100 pts  │
│ 300m          1:12.50        70 pts  │
│ 1600m         8:45           40 pts  │
└──────────────────────────────────────┘
```

Limitado às 30 últimas (sem paginação; ajustar depois se virar um problema).

### 7.3. Estado vazio

Sem tentativas = placeholder "Nenhuma tentativa registrada. Toque em Iniciar Modo TAF para começar seu histórico."

## 8. Arquitetura de arquivos

### Novos

- `src/lib/tafAttempts.ts` — CRUD tipado da coleção `taf_attempts` (`createAttempt`, `getAttempts`, `getBestScoresByEvent`)
- `src/app/taf/tentativa/page.tsx` — página do wizard / modo avulso (Client Component, wrapped em `<Suspense>` se usar search params)
- `src/components/TafHistoryChart.tsx` — mini-gráficos recharts por evento
- `src/components/TafAttemptList.tsx` — lista de tentativas (cards)

### Modificados

- `src/lib/tafData.ts` — `TafRunKey`, `TafEventKey`, `tafRunStandards`, `scoreRunTime`, helpers para formatar tempo (mm:ss / mm:ss.ms), parser de input
- `src/components/TafDashboard.tsx` — botão Iniciar + 2 cards novos + composição com `TafHistoryChart` e `TafAttemptList`
- `firestore.rules` — regra para `taf_attempts`
- `CLAUDE.md` — doc da nova coleção e do índice composto

## 9. Formatação de tempo

Utilitários em `tafData.ts`:

```ts
// "1:12.50" → 72.5 (segundos)
// "8:45"    → 525  (segundos)
// "45.30"   → 45.3 (segundos, sem minutos)
export function parseTimeInput(input: string): number | null

// 72.5 → "1:12.50" (para 300m, sempre com centésimos)
// 525  → "8:45"    (para 1600m, sem centésimos)
export function formatRunTime(seconds: number, event: TafRunKey): string
```

Input na UI: dois campos numéricos separados (`MM` / `SS` — e para 300m um terceiro `.MS`) evitam bugs de parser e teclado numérico mobile.

## 10. Acessibilidade & UX

- Wizard: botões grandes (h ≥ 48px) e footer fixo com avanço/voltar
- Teclado numérico mobile via `inputMode="numeric"`
- Sem submit implícito em Enter dentro do wizard (evita avançar sem querer)
- Animações padrão (`animate-fade-in`, `animate-scale-in`) consistentes com o resto do app

## 11. Edge cases

| Cenário | Tratamento |
|---|---|
| Perfil sem sexo/faixa etária | Dashboard mostra warning existente + botão "Iniciar TAF" desabilitado |
| Tentativa com 0 eventos preenchidos (todos pulados) | Não permite salvar (validação no botão Salvar) |
| Usuário muda faixa etária depois de salvar | Snapshot no doc preserva a nota original; o PR no dashboard é recalculado contra os padrões atuais (comportamento aceitável — é raro) |
| Valor de tempo inválido (ex: "1:99") | Parser retorna `null`, botão Salvar desabilita |
| Valor de reps negativo / absurdamente alto | Clampar `[0, 500]` reps na UI |
| Sem internet na hora de salvar | Toast de erro + manter estado; sem offline queue (fora de escopo) |

## 12. Não-objetivos / YAGNI explícito

- Exportar tentativas como PDF/CSV
- Comparar nota contra média dos colegas
- Push/lembretes para registrar TAF
- Múltiplos editais (apenas CBMAL)
- Edição de tentativa (são imutáveis — se errou, registra nova)

## 13. Critérios de aceitação

- [ ] `TafDashboard` mostra 5 cards para masculino, 4 para feminino
- [ ] Os 2 novos cards de corrida exibem PR formatado em `mm:ss`/`mm:ss.ms` e nota 0-100
- [ ] Botão "Iniciar Modo TAF" navega para `/taf/tentativa`
- [ ] TAF completo registra doc em `taf_attempts` com `type='full'` e soma total
- [ ] Evento avulso registra doc em `taf_attempts` com `type='single'` e 1 resultado
- [ ] Pular evento no wizard grava `skipped:true` com score 0
- [ ] Dashboard lê `taf_attempts` e combina com `workout_history` nos reps (max dos dois)
- [ ] Histórico renderiza gráficos com ≥2 pontos + lista de 30 últimas tentativas
- [ ] Regras Firestore bloqueiam leitura/escrita entre usuários
