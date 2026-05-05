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
};

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
