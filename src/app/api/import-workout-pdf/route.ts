import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebaseAdmin";
import {
  importWorkoutFromPdf,
  PdfImportError,
  CatalogItem,
} from "@/lib/pdfWorkoutImporter";

const MAX_BYTES = 11 * 1024 * 1024;

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
