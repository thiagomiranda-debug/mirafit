# PDF Workout Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload a personal-trainer PDF (text, table, or scan) into the manual workout builder. Gemini 2.5 Flash extracts exercises, sets and reps, matches them to the Firestore library, and pre-fills the existing `/builder` page for review/edit/save.

**Architecture:** New server-only importer lib + Next.js API route handle PDF upload and Gemini call (with library names embedded in the prompt and forced JSON via `responseSchema`). A new `HomeBuilderModal` replaces the home `Link` to `/builder`, offering "Do zero" or "Importar PDF". The modal posts to the API and, on success, drops the resulting draft into `sessionStorage` and navigates to `/builder`. The builder hydrates from sessionStorage on mount, marks unmatched exercises with a new optional `unresolved` field, and adds a `ResolveUnmatchedModal` for picking from AI suggestions or falling back to the existing `ExerciseSearchModal`. The save endpoint is unchanged — a workout can only be saved once every exercise is resolved.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Firebase Admin SDK (server) · Firebase client SDK (modal/builder) · Gemini 2.5 Flash via `@google/genai`.

**Note on testing:** Project has no automated test suite (verified in `CLAUDE.md` — only `npm run lint` and `npx tsc --noEmit` are listed). Each task ends with a type-check + lint + commit. Manual QA happens in Task 9.

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Add `@google/genai` dependency |
| `src/lib/pdfWorkoutImporter.ts` | create | Server-only: types + Gemini call + validate/normalize |
| `src/app/api/import-workout-pdf/route.ts` | create | POST endpoint: auth, multipart parse, library load, importer call |
| `src/components/HomeBuilderModal.tsx` | create | Bottom-sheet on home: "Do zero" / "Importar PDF" + upload UI |
| `src/components/ResolveUnmatchedModal.tsx` | create | Bottom-sheet on builder: top-3 AI suggestions for one unmatched exercise |
| `src/app/page.tsx` | modify | Replace `<Link href="/builder">` with button that opens `HomeBuilderModal` |
| `src/app/builder/page.tsx` | modify | Add `unresolved` field, hydrate from sessionStorage, unresolved UI, save gating |

---

## Task 1: Add `@google/genai` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install package**

```bash
npm install @google/genai
```

Expected: `package.json` and `package-lock.json` updated. The lib will be used server-side only.

- [ ] **Step 2: Verify install**

```bash
node -e "console.log(require('@google/genai/package.json').version)"
```

Expected: prints a version like `1.x.x`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @google/genai for PDF workout import"
```

---

## Task 2: Create `src/lib/pdfWorkoutImporter.ts`

**Files:**
- Create: `src/lib/pdfWorkoutImporter.ts`

This file is server-only. It exposes one function `importWorkoutFromPdf` that takes a base64 PDF and the library, calls Gemini with a forced JSON schema, and returns a normalized draft.

- [ ] **Step 1: Create the file with full implementation**

```ts
// src/lib/pdfWorkoutImporter.ts
import "server-only";
import { GoogleGenAI, Type } from "@google/genai";

export interface CatalogItem {
  id: string;
  name: string;
  target_muscle: string;
  equipment: string;
}

export interface ImportedExercise {
  raw_name: string;
  target_muscle: string;
  sets: number;
  reps: string;
  matched_exercise_id: string | null;
  matched_name: string | null;
  suggestions: string[];
}

export interface ImportedRoutine {
  name: string;
  exercises: ImportedExercise[];
}

export interface ImportedWorkoutDraft {
  planName: string;
  locationType: "gym" | "quartel";
  routines: ImportedRoutine[];
}

interface RawExercise {
  raw_name: string;
  target_muscle: string;
  sets: number;
  reps: string;
  matched_exercise_id: string | null;
  suggestions: string[];
}

interface RawDraft {
  planName: string;
  locationType: "gym" | "quartel";
  routines: { name: string; exercises: RawExercise[] }[];
}

const SYSTEM_INSTRUCTION = `Você é um extrator de fichas de treino em português brasileiro. Recebe um PDF (texto digitado, tabela ou foto/scan) e uma biblioteca de exercícios.

Sua tarefa:
1. Identifique o nome do plano (cabeçalho do PDF, se houver) e cada divisão (Treino A, B, C, ou nomes como "Peito/Tríceps").
2. Para cada exercício, extraia:
   - raw_name: como aparece no PDF
   - target_muscle: grupo muscular em PT-BR (peitoral, costas, ombros, bíceps, tríceps, quadríceps, posterior, glúteos, panturrilha, abdômen, antebraço, trapézio)
   - sets: número (inteiro 1-10)
   - reps: string preservando ranges/segundos/AMRAP (ex: "8-12", "10", "AMRAP", "30s")
3. Tente casar com a biblioteca:
   - Se um item da biblioteca representa o MESMO movimento + equipamento, retorne o id em matched_exercise_id e suggestions vazio.
   - Caso contrário, matched_exercise_id=null e até 3 ids em suggestions filtrados pelo target_muscle inferido.
4. Inferir locationType: "quartel" se o PDF menciona TAF/quartel/exercícios de combate predominantemente sem peso (barra fixa, paralelas, abdominais). Senão "gym".
5. Se o PDF não parece uma ficha de treino, retorne routines: [].

NUNCA invente ids — use apenas ids que aparecem na biblioteca fornecida.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    planName: { type: Type.STRING },
    locationType: { type: Type.STRING, enum: ["gym", "quartel"] },
    routines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          exercises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                raw_name: { type: Type.STRING },
                target_muscle: { type: Type.STRING },
                sets: { type: Type.INTEGER },
                reps: { type: Type.STRING },
                matched_exercise_id: { type: Type.STRING, nullable: true },
                suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                "raw_name",
                "target_muscle",
                "sets",
                "reps",
                "matched_exercise_id",
                "suggestions",
              ],
            },
          },
        },
        required: ["name", "exercises"],
      },
    },
  },
  required: ["planName", "locationType", "routines"],
} as const;

export class PdfImportError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "PdfImportError";
  }
}

export async function importWorkoutFromPdf(
  pdfBase64: string,
  catalog: CatalogItem[]
): Promise<ImportedWorkoutDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new PdfImportError("GEMINI_API_KEY não configurada", 500);
  }

  const ai = new GoogleGenAI({ apiKey });

  const slimCatalog = catalog.map((c) => ({
    id: c.id,
    name: c.name,
    muscle: c.target_muscle,
    equipment: c.equipment,
  }));

  const userText = `Biblioteca de exercícios disponível (JSON):\n\`\`\`json\n${JSON.stringify(slimCatalog)}\n\`\`\`\n\nExtraia o treino do PDF anexado conforme as instruções.`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
            { text: userText },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PdfImportError(`Falha ao chamar Gemini: ${msg}`, 502);
  }

  const text = response.text;
  if (!text) {
    throw new PdfImportError("Gemini não retornou conteúdo", 502);
  }

  let raw: RawDraft;
  try {
    raw = JSON.parse(text) as RawDraft;
  } catch {
    throw new PdfImportError("Resposta da IA não é JSON válido", 502);
  }

  return validateAndNormalize(raw, catalog);
}

function validateAndNormalize(
  raw: RawDraft,
  catalog: CatalogItem[]
): ImportedWorkoutDraft {
  const byId = new Map(catalog.map((c) => [c.id, c]));

  const locationType: "gym" | "quartel" =
    raw.locationType === "quartel" ? "quartel" : "gym";

  const planName =
    typeof raw.planName === "string" && raw.planName.trim()
      ? raw.planName.trim().slice(0, 50)
      : "Treino do Personal";

  const routines: ImportedRoutine[] = [];
  if (!Array.isArray(raw.routines)) {
    throw new PdfImportError(
      "Não consegui identificar um treino neste PDF. Verifique se é uma ficha de treino.",
      422
    );
  }

  for (const r of raw.routines) {
    if (!r || typeof r.name !== "string" || !Array.isArray(r.exercises)) continue;

    const exercises: ImportedExercise[] = [];
    for (const e of r.exercises) {
      if (!e || typeof e.raw_name !== "string" || !e.raw_name.trim()) continue;

      let sets = Number(e.sets);
      if (!Number.isFinite(sets) || sets < 1 || sets > 10) sets = 3;
      sets = Math.floor(sets);

      const reps =
        typeof e.reps === "string" && e.reps.trim() ? e.reps.trim().slice(0, 20) : "10";

      const target_muscle =
        typeof e.target_muscle === "string" ? e.target_muscle.trim() : "";

      const matched =
        typeof e.matched_exercise_id === "string" && byId.has(e.matched_exercise_id)
          ? e.matched_exercise_id
          : null;

      const suggestions = Array.isArray(e.suggestions)
        ? e.suggestions
            .filter((s): s is string => typeof s === "string" && byId.has(s))
            .slice(0, 3)
        : [];

      exercises.push({
        raw_name: e.raw_name.trim().slice(0, 100),
        target_muscle,
        sets,
        reps,
        matched_exercise_id: matched,
        matched_name: matched ? byId.get(matched)!.name : null,
        suggestions: matched ? [] : suggestions,
      });
    }

    if (exercises.length > 0) {
      routines.push({ name: r.name.trim().slice(0, 30), exercises });
    }
  }

  if (routines.length === 0) {
    throw new PdfImportError(
      "Não consegui identificar um treino neste PDF. Verifique se é uma ficha de treino.",
      422
    );
  }

  return { planName, locationType, routines };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. If `Type.OBJECT` is unknown, the import path is wrong — check `@google/genai` exports (newer SDKs export `Type` from the root).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 warnings/errors for the new file.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdfWorkoutImporter.ts
git commit -m "feat(import): add PDF workout importer (Gemini + normalize)"
```

---

## Task 3: Create API route `/api/import-workout-pdf`

**Files:**
- Create: `src/app/api/import-workout-pdf/route.ts`

This route mirrors the auth and library-load pattern of `src/app/api/generate-workout/route.ts` (see lines 1-48 of that file for reference). It accepts `multipart/form-data` with a `file` field.

- [ ] **Step 1: Create the route**

```ts
// src/app/api/import-workout-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebaseAdmin";
import {
  importWorkoutFromPdf,
  PdfImportError,
  CatalogItem,
} from "@/lib/pdfWorkoutImporter";

const MAX_BYTES = 11 * 1024 * 1024; // 11MB hard limit (client sends up to 10MB)

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    initAdmin();
    try {
      await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    // 2. Parse multipart
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo PDF não enviado" },
        { status: 400 }
      );
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "O arquivo precisa ser um PDF" },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "PDF muito grande (máx 10 MB)" },
        { status: 413 }
      );
    }

    // 3. Load library catalog (Admin SDK)
    const db = getFirestore();
    const exercisesSnap = await db.collection("library_exercises").get();
    const catalog: CatalogItem[] = exercisesSnap.docs.map((d) => ({
      id: d.id,
      name: (d.data().name as string) || "",
      target_muscle: (d.data().target_muscle as string) || "",
      equipment: (d.data().equipment as string) || "",
    }));

    // 4. Read PDF as base64
    const buf = Buffer.from(await file.arrayBuffer());
    const pdfBase64 = buf.toString("base64");

    // 5. Run importer
    const draft = await importWorkoutFromPdf(pdfBase64, catalog);

    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof PdfImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[import-workout-pdf]", message, err);
    return NextResponse.json(
      { error: `Erro ao processar PDF: ${message}` },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 warnings/errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/import-workout-pdf/route.ts
git commit -m "feat(api): add /api/import-workout-pdf endpoint"
```

---

## Task 4: Create `HomeBuilderModal` component

**Files:**
- Create: `src/components/HomeBuilderModal.tsx`

Use `CycleProtectionModal.tsx` as the styling/structure reference (bottom-sheet, `animate-slide-up`, backdrop). The modal has 3 internal states: `idle`, `uploading`, `error`.

- [ ] **Step 1: Create the component**

```tsx
// src/components/HomeBuilderModal.tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { ImportedWorkoutDraft } from "@/lib/pdfWorkoutImporter";

export const IMPORT_DRAFT_STORAGE_KEY = "mirafit_imported_workout_draft";

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  onClose: () => void;
}

type Phase = "idle" | "uploading" | "error";

export default function HomeBuilderModal({ onClose }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFromScratch = () => {
    onClose();
    router.push("/builder");
  };

  const handleClickImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErrorMsg("Selecione um arquivo PDF.");
      setPhase("error");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorMsg("PDF muito grande (máximo 10 MB).");
      setPhase("error");
      return;
    }
    setPendingFile(file);
    void runUpload(file);
  };

  const runUpload = async (file: File) => {
    if (!user) {
      setErrorMsg("Faça login para importar um treino.");
      setPhase("error");
      return;
    }
    setPhase("uploading");
    setErrorMsg("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/import-workout-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as
        | { draft?: ImportedWorkoutDraft; error?: string };

      if (!res.ok || !data.draft) {
        throw new Error(data.error || "Erro ao processar PDF");
      }

      sessionStorage.setItem(
        IMPORT_DRAFT_STORAGE_KEY,
        JSON.stringify(data.draft)
      );
      onClose();
      router.push("/builder");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setPhase("idle");
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : "Erro ao processar PDF");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    abortRef.current?.abort();
  };

  const handleRetry = () => {
    if (pendingFile) void runUpload(pendingFile);
  };

  const handleChangeFile = () => {
    setPendingFile(null);
    setErrorMsg("");
    setPhase("idle");
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase === "uploading" ? undefined : onClose}
      />

      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] px-5 pb-8 pt-4">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border)]" />

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileChosen}
        />

        {phase === "idle" && (
          <>
            <h2 className="mb-1 text-base font-bold text-[var(--foreground)]">
              Como você quer montar?
            </h2>
            <p className="mb-5 text-xs text-[var(--text-dim)]">
              Você pode adicionar exercícios manualmente ou importar uma ficha pronta.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleFromScratch}
                className="flex w-full items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-left transition-all hover:border-[var(--red-500)]/30"
              >
                <span className="text-xl">📝</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-[var(--foreground)]">
                    Do zero
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-dim)]">
                    Adicione exercícios um por um do catálogo
                  </span>
                </span>
              </button>

              <button
                onClick={handleClickImport}
                className="flex w-full items-start gap-3 rounded-2xl border border-[var(--red-500)]/30 bg-[var(--red-600)]/10 px-4 py-4 text-left transition-all hover:bg-[var(--red-600)]/15"
              >
                <span className="text-xl">📄</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-[var(--foreground)]">
                    Importar de PDF
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-dim)]">
                    Carregue uma ficha do seu personal e a IA extrai pra você
                  </span>
                </span>
              </button>
            </div>
          </>
        )}

        {phase === "uploading" && (
          <>
            <h2 className="mb-1 text-base font-bold text-[var(--foreground)]">
              Lendo seu treino...
            </h2>
            <p className="mb-5 text-xs text-[var(--text-dim)]">
              Isso pode levar até 30 segundos.
            </p>

            <div className="mb-5 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
              <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
              <span className="truncate text-xs font-medium text-[var(--text-muted)]">
                {pendingFile?.name || "PDF"}
              </span>
            </div>

            <button
              onClick={handleCancelUpload}
              className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Cancelar
            </button>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--amber-600)]/15 text-[var(--amber-500)]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">
                  Não deu pra importar
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-dim)]">{errorMsg}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {pendingFile && (
                <button
                  onClick={handleRetry}
                  className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl gradient-red"
                >
                  Tentar novamente
                </button>
              )}
              <button
                onClick={handleChangeFile}
                className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Trocar arquivo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/HomeBuilderModal.tsx
git commit -m "feat(home): add HomeBuilderModal with PDF upload flow"
```

---

## Task 5: Wire up modal in home page

**Files:**
- Modify: `src/app/page.tsx` (around lines 411-420 — the "Manual builder button" `<Link>`)

- [ ] **Step 1: Add import + state for the modal**

In `src/app/page.tsx`, find the existing imports near the top of the file. Add:

```tsx
import HomeBuilderModal from "@/components/HomeBuilderModal";
```

In the component body (next to other `useState` declarations), add:

```tsx
const [showBuilderModal, setShowBuilderModal] = useState(false);
```

- [ ] **Step 2: Replace the `<Link>` with a button**

Find the existing block (currently around lines 411-420):

```tsx
{/* ── Manual builder button ── */}
<Link
  href="/builder"
  className="animate-fade-in-up flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-4 text-sm font-bold text-[var(--foreground)] transition-all hover:border-[var(--red-500)]/30 hover:bg-[var(--surface-2)]"
>
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
  Montar Treino Manual
</Link>
```

Replace it with:

```tsx
{/* ── Manual builder button ── */}
<button
  onClick={() => setShowBuilderModal(true)}
  className="animate-fade-in-up flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-4 text-sm font-bold text-[var(--foreground)] transition-all hover:border-[var(--red-500)]/30 hover:bg-[var(--surface-2)]"
>
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
  Montar Treino Manual
</button>
```

- [ ] **Step 3: Render the modal at the end of the JSX (before the closing wrapper)**

At the bottom of the returned JSX in `src/app/page.tsx`, just before the outermost closing tag of the page (and after any other modal renders like `CycleProtectionModal`), add:

```tsx
{showBuilderModal && (
  <HomeBuilderModal onClose={() => setShowBuilderModal(false)} />
)}
```

- [ ] **Step 4: Remove the unused `Link` import if no other usage remains**

Run: `grep -n "from \"next/link\"" src/app/page.tsx` — if there are still uses of `Link`, leave the import alone. If `Link` is unused after the swap, remove the import line.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): open builder modal instead of direct link"
```

---

## Task 6: Builder hydration + types

**Files:**
- Modify: `src/app/builder/page.tsx`

- [ ] **Step 1: Update `BuilderExercise` type and add hydration effect**

Open `src/app/builder/page.tsx`. Find the type declaration at the top (currently lines 10-15):

```ts
type BuilderExercise = {
  exercise_id: string;
  name: string;
  sets: number;
  reps: string;
};
```

Replace with:

```ts
type BuilderExercise = {
  exercise_id: string;
  name: string;
  sets: number;
  reps: string;
  unresolved?: {
    raw_name: string;
    target_muscle: string;
    suggestions: string[];
  };
};
```

- [ ] **Step 2: Add imports needed for hydration**

At the top of the file, change `useState, Suspense` to also import `useEffect`:

```tsx
import { useState, useEffect, Suspense } from "react";
```

Add the storage key constant import (it's exported from `HomeBuilderModal`):

```tsx
import { IMPORT_DRAFT_STORAGE_KEY } from "@/components/HomeBuilderModal";
import type { ImportedWorkoutDraft } from "@/lib/pdfWorkoutImporter";
```

- [ ] **Step 3: Add the hydration `useEffect` inside `BuilderContent`**

After the existing `useState` declarations (right after `const [error, setError] = useState("");`), add:

```tsx
useEffect(() => {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem(IMPORT_DRAFT_STORAGE_KEY);
  if (!raw) return;
  sessionStorage.removeItem(IMPORT_DRAFT_STORAGE_KEY);

  try {
    const draft = JSON.parse(raw) as ImportedWorkoutDraft;
    if (!draft.routines?.length) return;

    setPlanName(draft.planName || "Ficha do Personal");
    setLocationType(draft.locationType === "quartel" ? "quartel" : "gym");
    setRoutines(
      draft.routines.map((r) => ({
        name: r.name || "Treino",
        exercises: r.exercises.map((e) => ({
          exercise_id: e.matched_exercise_id || "",
          name: e.matched_name || e.raw_name,
          sets: e.sets,
          reps: e.reps,
          unresolved: e.matched_exercise_id
            ? undefined
            : {
                raw_name: e.raw_name,
                target_muscle: e.target_muscle,
                suggestions: e.suggestions,
              },
        })),
      }))
    );
    setActiveTab(0);
  } catch (err) {
    console.error("Failed to hydrate imported draft", err);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors. The `unresolved` field is optional, so existing exercise creations (in `handleAddExercise`) still typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/app/builder/page.tsx
git commit -m "feat(builder): hydrate imported workout draft from sessionStorage"
```

---

## Task 7: Create `ResolveUnmatchedModal`

**Files:**
- Create: `src/components/ResolveUnmatchedModal.tsx`

This modal receives an exercise's `unresolved` data, fetches the suggestion details via existing `getExercisesByIds`, and lets the user pick one or fall back to the existing `ExerciseSearchModal`.

- [ ] **Step 1: Create the component**

```tsx
// src/components/ResolveUnmatchedModal.tsx
"use client";

import { useEffect, useState } from "react";
import { getExercisesByIds } from "@/lib/workouts";
import { LibraryExercise } from "@/types";
import { translateExerciseName } from "@/lib/exerciseNames";

interface Props {
  rawName: string;
  targetMuscle: string;
  suggestionIds: string[];
  onResolve: (exercise: LibraryExercise) => void;
  onSearchManual: () => void;
  onClose: () => void;
}

export default function ResolveUnmatchedModal({
  rawName,
  targetMuscle,
  suggestionIds,
  onResolve,
  onSearchManual,
  onClose,
}: Props) {
  const [suggestions, setSuggestions] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(suggestionIds.length > 0);

  useEffect(() => {
    if (suggestionIds.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getExercisesByIds(suggestionIds)
      .then((map) => {
        if (cancelled) return;
        const ordered = suggestionIds
          .map((id) => map[id])
          .filter((e): e is LibraryExercise => Boolean(e));
        setSuggestions(ordered);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [suggestionIds]);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] border-t border-[var(--border)] px-5 pb-8 pt-4">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border)]" />

        <h2 className="text-base font-bold text-[var(--foreground)]">
          Encontrar substituto
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-dim)]">
          Do PDF: <span className="italic">{rawName}</span>
        </p>
        {targetMuscle && (
          <span className="mt-2 inline-flex items-center rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {targetMuscle}
          </span>
        )}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border-light)] py-4 text-center text-xs text-[var(--text-dim)]">
              Nenhuma sugestão automática
            </p>
          ) : (
            suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onResolve(s)}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-left transition-all hover:border-[var(--red-500)]/30"
              >
                {s.gif_url ? (
                  <img
                    src={s.gif_url}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg bg-black/10 object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--surface)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold capitalize text-[var(--foreground)]">
                    {translateExerciseName(s.name)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-dim)]">
                    {s.equipment}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <button
          onClick={onSearchManual}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Buscar outro exercício
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors. The `<img>` will trigger an ESLint warning from `@next/next/no-img-element` — same pattern as `ExerciseSearchModal` already uses in this codebase. If lint fails specifically on that rule, add `{/* eslint-disable-next-line @next/next/no-img-element */}` directly above the `<img>` tag (inspect the existing modal for the exact pattern used elsewhere).

- [ ] **Step 3: Commit**

```bash
git add src/components/ResolveUnmatchedModal.tsx
git commit -m "feat(builder): add ResolveUnmatchedModal for AI suggestions"
```

---

## Task 8: Builder unresolved UI + resolve flow + save gating

**Files:**
- Modify: `src/app/builder/page.tsx`

- [ ] **Step 1: Add new imports + state**

Add these imports at the top of the file (next to existing component imports):

```tsx
import ResolveUnmatchedModal from "@/components/ResolveUnmatchedModal";
```

In the `BuilderContent` component body (next to the other `useState` calls), add:

```tsx
const [resolvingIdx, setResolvingIdx] = useState<number | null>(null);
const [showResolveSearch, setShowResolveSearch] = useState(false);
```

- [ ] **Step 2: Update `canSave` to require all exercises resolved**

Find the existing `canSave` line (currently around line 40):

```tsx
const canSave = totalExercises > 0 && routines.every((r) => r.exercises.length > 0);
```

Replace with:

```tsx
const hasUnresolved = routines.some((r) =>
  r.exercises.some((ex) => Boolean(ex.unresolved))
);
const unresolvedCount = routines.reduce(
  (sum, r) => sum + r.exercises.filter((ex) => ex.unresolved).length,
  0
);
const canSave =
  totalExercises > 0 &&
  routines.every((r) => r.exercises.length > 0) &&
  !hasUnresolved;
```

- [ ] **Step 3: Add a helper to resolve an exercise**

Inside the component, add this function near the other handlers (after `removeExercise`):

```tsx
const resolveExercise = (exIdx: number, libraryEx: LibraryExercise) => {
  setRoutines((prev) =>
    prev.map((r, i) => {
      if (i !== activeTab) return r;
      const updated = [...r.exercises];
      const old = updated[exIdx];
      updated[exIdx] = {
        exercise_id: libraryEx.id,
        name: libraryEx.name,
        sets: old.sets,
        reps: old.reps,
        // unresolved omitted = field deleted
      };
      return { ...r, exercises: updated };
    })
  );
  setResolvingIdx(null);
  setShowResolveSearch(false);
};
```

- [ ] **Step 4: Update the exercise row JSX to handle unresolved state**

Find the existing `routines[activeTab].exercises.map((ex, exIdx) => ...)` block (currently around lines 257-309). Replace the inner row content to branch on `ex.unresolved`:

```tsx
{routines[activeTab].exercises.map((ex, exIdx) => {
  const isUnresolved = Boolean(ex.unresolved);
  return (
    <div
      key={`${ex.exercise_id || ex.unresolved?.raw_name || "ex"}-${exIdx}`}
      className={`animate-fade-in flex items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 py-3 transition-all ${
        isUnresolved
          ? "border-l-4 border-[var(--amber-500)]"
          : "border-[var(--border)]"
      }`}
    >
      {/* Order/warning badge */}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
          isUnresolved
            ? "bg-[var(--amber-600)]/15 text-[var(--amber-500)]"
            : "bg-[var(--red-600)]/15 text-[var(--red-500)]"
        }`}
      >
        {isUnresolved ? "⚠" : exIdx + 1}
      </span>

      {/* Exercise info */}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold capitalize text-[var(--foreground)] ${
            isUnresolved ? "italic text-[var(--text-muted)]" : ""
          }`}
        >
          {isUnresolved ? ex.unresolved!.raw_name : translateExerciseName(ex.name)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-dim)]">
          {isUnresolved ? "Do PDF · " : ""}
          {ex.sets} séries × {ex.reps} reps
        </p>
      </div>

      {isUnresolved ? (
        <button
          onClick={() => setResolvingIdx(exIdx)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--amber-600)] px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[var(--amber-700)]"
        >
          Resolver
        </button>
      ) : (
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            onClick={() => moveExercise(exIdx, -1)}
            disabled={exIdx === 0}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)] disabled:opacity-25"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => moveExercise(exIdx, 1)}
            disabled={exIdx === routines[activeTab].exercises.length - 1}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)] disabled:opacity-25"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      <button
        onClick={() => removeExercise(exIdx)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-dim)] transition-colors hover:bg-[var(--red-600)]/10 hover:text-[var(--red-500)]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
})}
```

- [ ] **Step 5: Update the footer save button to reflect unresolved state**

Find the footer button block (currently around lines 333-351). Replace the button's contents:

```tsx
<button
  onClick={handleSave}
  disabled={!canSave || saving}
  className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 ${
    hasUnresolved ? "bg-[var(--amber-600)]" : "gradient-red"
  }`}
>
  {saving ? (
    <>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      Salvando...
    </>
  ) : hasUnresolved ? (
    <>
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      Resolver {unresolvedCount} exercício{unresolvedCount !== 1 ? "s" : ""}
    </>
  ) : (
    <>
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Salvar Treino ({totalExercises} exercício{totalExercises !== 1 ? "s" : ""})
    </>
  )}
</button>
```

- [ ] **Step 6: Render the `ResolveUnmatchedModal` and conditional `ExerciseSearchModal`**

Find the existing modal render (currently around line 356):

```tsx
{showExerciseModal && (
  <ExerciseSearchModal
    mode="builder"
    onSelectWithDetails={handleAddExercise}
    onClose={() => setShowExerciseModal(false)}
  />
)}
```

Add these blocks immediately after that one:

```tsx
{resolvingIdx !== null &&
  routines[activeTab]?.exercises[resolvingIdx]?.unresolved && (
    <ResolveUnmatchedModal
      rawName={routines[activeTab].exercises[resolvingIdx].unresolved!.raw_name}
      targetMuscle={routines[activeTab].exercises[resolvingIdx].unresolved!.target_muscle}
      suggestionIds={routines[activeTab].exercises[resolvingIdx].unresolved!.suggestions}
      onResolve={(libEx) => resolveExercise(resolvingIdx, libEx)}
      onSearchManual={() => {
        setShowResolveSearch(true);
      }}
      onClose={() => setResolvingIdx(null)}
    />
  )}

{showResolveSearch && resolvingIdx !== null &&
  routines[activeTab]?.exercises[resolvingIdx]?.unresolved && (
    <ExerciseSearchModal
      mode="swap"
      targetMuscle={routines[activeTab].exercises[resolvingIdx].unresolved!.target_muscle}
      onSelect={(libEx) => resolveExercise(resolvingIdx, libEx)}
      onClose={() => setShowResolveSearch(false)}
    />
  )}
```

- [ ] **Step 7: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/builder/page.tsx
git commit -m "feat(builder): unresolved exercise UI + resolve flow + save gating"
```

---

## Task 9: Manual QA + final verification

**Files:** none

- [ ] **Step 1: Run full type-check and lint one more time**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both pass clean.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Expected: server up at http://localhost:3000

- [ ] **Step 3: Manual QA — happy path (digitized PDF)**

In a browser logged in as a test user:
1. On home, click "Montar Treino Manual" → modal opens with two cards
2. Click "Importar de PDF" → file picker opens
3. Pick a clean digitized workout PDF (text selectable, e.g. exported from Google Docs/Sheets)
4. Watch loading state ("Lendo seu treino...") — should resolve in 5-15s
5. Builder opens with `planName`, `locationType`, routines and exercises pre-filled
6. Verify exercise names look right and series/reps match PDF
7. Edit a set count or reps if you want — should save fine
8. Click "Salvar Treino" → redirects to home, treino aparece como ativo

- [ ] **Step 4: Manual QA — unresolved exercises (foto/scan PDF)**

1. Repeat upload with a photo/scan PDF that includes some unusual exercises
2. Some exercises should appear with âmbar border + ⚠️ + "Do PDF: {raw_name}"
3. Click "Resolver" on one → `ResolveUnmatchedModal` opens with up to 3 suggestions
4. Pick a suggestion → modal closes, exercise turns into normal numbered row
5. On another, click "Resolver" → "Buscar outro exercício" → `ExerciseSearchModal` opens with target_muscle filter pre-selected. Pick anything → resolved.
6. Footer button should say "Resolver N exercícios" (âmbar) until all are done, then "Salvar Treino" (vermelho)

- [ ] **Step 5: Manual QA — error paths**

1. Upload a non-workout PDF (e.g. a random article PDF) → modal shows error "Não consegui identificar um treino" + "Tentar novamente" / "Trocar arquivo"
2. Upload a `.txt` renamed to `.pdf` → server returns 415 or 422, error shown
3. Upload a 15MB PDF → client-side rejection before upload ("PDF muito grande (máximo 10 MB)")
4. Start an upload, click "Cancelar" mid-flight → returns to idle state

- [ ] **Step 6: Manual QA — refresh resilience**

1. Import a PDF → land on `/builder` pre-filled
2. Hard-refresh (Ctrl+Shift+R) the builder page
3. Builder loads empty (sessionStorage was cleared during the first hydration). This is expected behavior — same as builder today.

- [ ] **Step 7: If all QA passes, final commit (if no extra fixes were needed) — otherwise fix and commit per issue**

If you had to make tweaks during QA:

```bash
git add -A
git commit -m "fix(import): <describe tweak>"
```

If everything passed clean, no commit needed.

---

## Self-review notes

- **Spec coverage:** §3 components → Tasks 2,3,4,7,8. §4 types → Tasks 2,6. §5 AI strategy → Task 2. §6 UX → Tasks 4,5,6,7,8. §7 errors → Tasks 2,3,4. §10 backwards-compat → no API changes (Task 9 verifies).
- **Refinement vs spec:** Plan adds `matched_name` to API response (server enriches it from the library when matched). Spec §4.1 had `suggestions: string[]` only — kept that, modal loads suggestion details on demand via existing `getExercisesByIds`.
- **No tests:** Project has no automated test suite; relies on `tsc --noEmit` + `npm run lint` + manual QA (Task 9).
