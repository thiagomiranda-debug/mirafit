# Importação de Treino via PDF — Design Spec

**Data:** 2026-05-05
**Status:** Aprovado (aguarda implementação)
**Escopo:** Permitir que usuários (especialmente os que têm personal trainer) importem fichas de treino em PDF — texto digitado, tabelas formatadas, ou foto/scan — extraindo automaticamente exercícios, séries e repetições para o builder manual.

---

## 1. Motivação

Hoje o `/builder` exige montagem manual exercício por exercício. Para usuários com ficha pronta do personal, isso é fricção alta. A feature reaproveita 100% do builder atual — o PDF apenas pré-preenche o estado inicial; o usuário continua sendo o "salvador" final.

## 2. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Formato suportado | Qualquer (texto, tabela, scan/foto) — exige IA com visão |
| 2 | Fluxo de revisão | Obrigatória — sempre cai no `/builder` pré-preenchido antes de salvar |
| 3 | Tratamento de não-casados | IA sugere top 3 alternativas da biblioteca; fallback `ExerciseSearchModal` |
| 4 | Entrada na UI | Modal na home (substitui `Link` direto), com 2 opções: "Do zero" / "Importar PDF" |
| 5 | Provider de IA | Gemini 2.5 Flash (chave já em `.env.local`) |

## 3. Arquitetura

### 3.1 Componentes novos

- **`src/components/HomeBuilderModal.tsx`** — bottom-sheet aberto na home. Estados: idle (escolha do método) / uploading / error. Faz o `fetch` para `/api/import-workout-pdf`, salva resposta em `sessionStorage` e navega para `/builder`.
- **`src/components/ResolveUnmatchedModal.tsx`** — bottom-sheet pequeno por exercício não-resolvido. Mostra as 3 sugestões (com GIF + nome traduzido + equipment). Footer com "Buscar outro exercício" que abre o `ExerciseSearchModal` existente em `mode="swap"`.
- **`src/lib/pdfWorkoutImporter.ts`** — server-only. Funções: `extractWorkoutFromPdf(pdfBase64, library)` (chamada Gemini), `validateAndNormalize(rawDraft, library)` (sanity-checks server-side).
- **`src/app/api/import-workout-pdf/route.ts`** — POST endpoint, `multipart/form-data`. Auth via Bearer ID token (mesmo padrão de `save-manual-workout` e `generate-workout`).

### 3.2 Componentes modificados

- **`src/app/page.tsx`** — substitui o `<Link href="/builder">` por um botão que abre `HomeBuilderModal`. Modal navega para `/builder` em ambos os caminhos (vazio ou pré-preenchido).
- **`src/app/builder/page.tsx`** — adiciona `useEffect` no mount que lê `sessionStorage["mirafit_imported_workout_draft"]`, hidrata `routines`/`planName`/`locationType`, e **deleta a chave** imediatamente. O tipo local `BuilderExercise` ganha campo opcional `unresolved`. UI ajustada para destacar exercícios não-resolvidos. `canSave` passa a exigir `!ex.unresolved` em todos.

### 3.3 Dependências novas

- `@google/genai` (lib oficial do Google para Gemini, já com suporte a PDF + `responseSchema`).

Nenhuma mudança no schema do Firestore — exercícios não-resolvidos nunca são persistidos (impedidos pelo `canSave`).

## 4. Tipos e contrato

### 4.1 Resposta da API

```ts
// /api/import-workout-pdf
type ImportApiResponse = {
  draft: ImportedWorkoutDraft;
} | {
  error: string;  // 4xx/5xx
};

type ImportedWorkoutDraft = {
  planName: string;                          // ex: "Ficha do João" ou "Treino Manual"
  locationType: 'gym' | 'quartel';           // inferido pela IA, editável depois
  routines: ImportedRoutine[];
};

type ImportedRoutine = {
  name: string;                              // ex: "Treino A"
  exercises: ImportedExercise[];
};

type ImportedExercise = {
  raw_name: string;                          // como apareceu no PDF
  target_muscle: string;                     // PT-BR, inferido pela IA
  sets: number;                              // 1..10
  reps: string;                              // ex: "8-12", "10", "AMRAP", "30s"
  matched_exercise_id: string | null;        // ID válido em library_exercises ou null
  suggestions: string[];                     // até 3 IDs válidos, vazio se já matched
};
```

### 4.2 Estado do builder

```ts
// src/app/builder/page.tsx (tipos locais)
type BuilderExercise = {
  exercise_id: string;            // string vazia '' se ainda não resolvido
  name: string;                   // nome PT-BR pra exibir (lib se resolvido, raw_name se não)
  sets: number;
  reps: string;
  unresolved?: {                  // presente apenas em exercícios importados não-casados
    raw_name: string;
    target_muscle: string;
    suggestions: string[];        // exercise_ids da library_exercises
  };
};
```

### 4.3 sessionStorage

Chave: `mirafit_imported_workout_draft`
Valor: `JSON.stringify(ImportedWorkoutDraft)`
Lifetime: criada após resposta 200 da API; deletada no primeiro `useEffect` do `/builder`.

## 5. Estratégia de IA (Gemini 2.5 Flash)

### 5.1 Uma única chamada por upload

**Input:**
- PDF inline em base64 (parts[0])
- Lista da biblioteca em JSON: `[{ id, name, target_muscle, equipment }, ...]` (~800 itens, ~6K tokens)
- System instruction em PT-BR explicando a tarefa

**Output:** forçado por `responseSchema` (JSON garantido — vide §5.3)

### 5.2 System instruction (resumo)

> Você é um extrator de fichas de treino em português. Recebe um PDF (texto ou imagem) e uma biblioteca de exercícios. Sua tarefa:
> 1. Identificar o nome do plano (cabeçalho do PDF) e cada divisão (Treino A, B, C, ou nomes como "Peito/Tríceps").
> 2. Para cada exercício listado, extrair: `raw_name`, `target_muscle` (em PT-BR — peitoral, costas, ombros, bíceps, tríceps, quadríceps, posterior, glúteos, panturrilha, abdômen, antebraço, trapézio), `sets` (número), `reps` (string, preserva ranges, segundos, AMRAP).
> 3. Para cada exercício, tentar casar com a biblioteca: se um item da biblioteca representa o mesmo movimento + equipamento, retornar o `id` em `matched_exercise_id`. Caso contrário, `null` + até 3 IDs em `suggestions` filtrados pelo `target_muscle` inferido.
> 4. Inferir `locationType`: "quartel" se o PDF menciona TAF/quartel/exercícios de combate predominantemente sem peso (barra, paralelas, abdominais). Senão "gym".
> 5. Se o PDF não parece uma ficha de treino, retornar `routines: []`.

### 5.3 responseSchema

```json
{
  "type": "object",
  "properties": {
    "planName": { "type": "string" },
    "locationType": { "type": "string", "enum": ["gym", "quartel"] },
    "routines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "exercises": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "raw_name": { "type": "string" },
                "target_muscle": { "type": "string" },
                "sets": { "type": "integer" },
                "reps": { "type": "string" },
                "matched_exercise_id": { "type": ["string", "null"] },
                "suggestions": { "type": "array", "items": { "type": "string" } }
              },
              "required": ["raw_name", "target_muscle", "sets", "reps", "matched_exercise_id", "suggestions"]
            }
          }
        },
        "required": ["name", "exercises"]
      }
    }
  },
  "required": ["planName", "locationType", "routines"]
}
```

### 5.4 Validação server-side (pós-Gemini)

Antes de devolver ao cliente, `validateAndNormalize`:
- `routines.length === 0` → throw 422 ("Não consegui identificar um treino neste PDF")
- Por exercício:
  - Se `matched_exercise_id` não existe na biblioteca → trata como `null`
  - Filtra `suggestions` removendo IDs inválidos; trunca em 3
  - `sets` fora de [1, 10] → coerce para 3
  - `reps` vazio → coerce para `"10"`
  - `raw_name` vazio → descarta o exercício
- Routines com 0 exercícios após normalização → descarta
- Se sobraram 0 routines → throw 422

### 5.5 Custo e limites

- **Tamanho do PDF:** validado no client em **10 MB** antes do upload (Gemini aceita até 20MB inline, deixamos margem)
- **Páginas:** sem limite duro, mas client mostra aviso se >10 páginas: "PDFs longos podem demorar mais e ter menor precisão"
- **Custo estimado:** Gemini 2.5 Flash a $0.10/1M input + $0.40/1M output. Input típico: ~6K (lib) + ~5K (PDF visão de 2 páginas) = 11K tokens. Output: ~2K. Custo por upload: **~$0.0019**. Negligenciável.
- **Timeout:** 60s no fetch do client (AbortController). Server-side, Gemini SDK default.

## 6. UX detalhada

### 6.1 Modal na home (`HomeBuilderModal`)

**Estado idle:**
- Header: "Como você quer montar?"
- Card 1: 📝 **Do zero** — "Adicione exercícios um por um do catálogo"
- Card 2: 📄 **Importar de PDF** — "Carregue uma ficha do seu personal e a IA extrai pra você"
- Card 1 navega para `/builder` direto. Card 2 dispara `<input type="file" accept="application/pdf">`.

**Estado uploading:**
- Mostra nome do arquivo + tamanho
- Spinner + texto: "Lendo seu treino... isso pode levar até 30 segundos."
- Botão "Cancelar" (aborta o fetch)

**Estado error:**
- Ícone ⚠️ + mensagem do erro (do response body)
- Botão "Tentar novamente" (refaz o fetch com o mesmo arquivo)
- Botão "Trocar arquivo" (volta ao file picker)

**Estado sucesso:** modal fecha + navega para `/builder` (sessionStorage já populado).

### 6.2 Builder com draft importado

No `useEffect(() => {}, [])`:
1. Lê `sessionStorage["mirafit_imported_workout_draft"]`
2. Se existe e parseia OK: hidrata `planName`, `locationType`, `routines`. Marca `unresolved` em exercícios sem `matched_exercise_id`.
3. **Deleta a chave do sessionStorage**
4. Para resolvidos: busca o nome PT-BR na biblioteca (precisa carregar `library_exercises` no mount — o builder hoje já carrega via `ExerciseSearchModal`, então a página passa a precisar disso direto também). Para não-resolvidos: usa `raw_name`.

### 6.3 Visual do exercício não-resolvido

- Borda esquerda âmbar (`var(--amber-500)`), em vez do badge numerado mostra ⚠️
- Linha 1: nome em itálico cinza + chip pequeno "PDF: {raw_name}"
- Linha 2: `{sets}× {reps}` (mesmo padrão dos resolvidos)
- Botão **"Resolver"** (proeminente, âmbar) substitui os botões de mover. Mover/remover ficam em menu kebab (3 pontinhos).

### 6.4 `ResolveUnmatchedModal`

- Header: "Encontrar substituto" + linha "PDF: {raw_name}" + chip de `target_muscle`
- Lista de até 3 `suggestions`: cada uma mostra GIF (lazy), nome traduzido (`translateExerciseName`), equipment. Clique → resolve + fecha
- Empty state se `suggestions.length === 0`: "Nenhuma sugestão automática"
- Footer: botão "Buscar outro exercício" → fecha esse modal, abre `ExerciseSearchModal` em `mode="swap"` com `target_muscle` pré-filtrado. Quando o usuário escolhe ali, faz o mesmo `resolve()`.

**Resolver = atualizar o `BuilderExercise`:**
- Preenche `exercise_id` com o ID escolhido
- Atualiza `name` para o nome da biblioteca
- **Deleta** o campo `unresolved` (delete operator ou spread sem ele)
- Re-render mostra o exercício no estado normal (badge numerado, sem borda âmbar)

### 6.5 Footer do builder

- Quando `routines.some(r => r.exercises.some(ex => ex.unresolved))`: botão **desabilitado**, label "Resolver N exercício{s}", cor âmbar (não vermelho gradiente)
- Quando todos resolvidos: comportamento atual ("Salvar Treino (N exercícios)")
- Validação `canSave`: `totalExercises > 0 && routines.every(r => r.exercises.length > 0 && r.exercises.every(ex => !ex.unresolved))`

## 7. Erros e edge cases

| Caso | Tratamento |
|------|-----------|
| PDF > 10 MB | Validado no client antes do upload — mensagem inline no modal |
| PDF não-PDF (mime errado) | `accept=".pdf"` no input + check de mime no server (415) |
| PDF criptografado/protegido | Gemini retorna sem dados → cai no 422 |
| Gemini retorna 0 routines | API responde 422 com mensagem "Não consegui identificar um treino" |
| Gemini retorna `matched_exercise_id` que não existe | Server normaliza para `null` + suggestions vazias |
| `sets` 0 ou negativo | Coerce para 3 |
| `reps` vazio | Coerce para `"10"` |
| Timeout (>60s) | AbortController no client, mensagem "Demorou demais. Tente novamente." |
| Refresh no `/builder` após import | Estado some (sessionStorage já foi limpo). Aceito — comportamento atual do builder também perde estado em refresh. |
| Upload do mesmo PDF de novo | Gera novo draft, sobrescreve sessionStorage. Sem efeito colateral. |
| Usuário não autenticado | Modal mostra erro "Faça login para importar" — mas a home já protege isso, então é apenas defensa em profundidade |

## 8. Segurança

- API exige Firebase ID token (Bearer) — mesmo padrão de `/api/save-manual-workout`
- Upload limitado a 10 MB no client + 11 MB hard limit no server (margem)
- Mime check server-side (`application/pdf`)
- Nenhum dado sensível é logado — `console.error` apenas com tipo do erro, não com conteúdo do PDF

## 9. Testes e validação

O projeto não tem suite automatizada (`CLAUDE.md` lista apenas `npm run lint` e `npx tsc --noEmit`). Validação:

- **Type-check:** `npx tsc --noEmit` — todos os tipos novos devem compilar
- **Lint:** `npm run lint` — sem warnings
- **QA manual** com 3 PDFs reais:
  - PDF digitado (texto selecionável, formato planilha)
  - PDF foto/scan (texto não-selecionável)
  - PDF com exercícios "estranhos" (ex: "Cross-over no cabo unilateral", "Stiff com halteres") — testar fluxo de não-resolvido
- **QA na UI:** rotas afetadas (`/`, `/builder`), modais, navegação

## 10. Migrações e backwards-compat

- Nenhuma migração de dados — feature aditiva
- `BuilderExercise` ganha campo opcional `unresolved`; comportamento sem ele é idêntico ao atual
- API `/api/save-manual-workout` **não muda** — o save só roda quando todos os exercícios estão resolvidos, então o payload final é o mesmo formato de hoje
- O `Link href="/builder"` na home é substituído por botão; toda navegação direta para `/builder` continua funcionando

## 11. Fora do escopo (YAGNI)

- ❌ Importar de imagem solta (`.jpg`, `.png`) — só PDF nesta versão
- ❌ Editar séries/reps do exercício não-resolvido antes de resolver — você primeiro resolve, depois edita como qualquer exercício
- ❌ Sugestões da IA para exercícios já casados — confia no match
- ❌ Cache de PDFs já processados — re-upload re-processa (custo é baixo)
- ❌ Histórico de imports — após resolver e salvar, é só mais um workout no Firestore
- ❌ Múltiplos PDFs de uma vez — um por vez

## 12. Estrutura de arquivos

```
src/
  app/
    api/
      import-workout-pdf/
        route.ts                          [NOVO]
    builder/
      page.tsx                            [MODIFICADO — hidratação do draft + UI unresolved + canSave]
    page.tsx                              [MODIFICADO — Link → botão que abre HomeBuilderModal]
  components/
    HomeBuilderModal.tsx                  [NOVO]
    ResolveUnmatchedModal.tsx             [NOVO]
  lib/
    pdfWorkoutImporter.ts                 [NOVO — server-only, marker "import 'server-only'"]
package.json                              [MODIFICADO — +@google/genai]
```
