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
