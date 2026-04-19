"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createTafAttempt, TafEventResult } from "@/lib/tafAttempts";
import {
  TAF_EVENT_LABELS,
  TafAgeGroup,
  TafEventKey,
  TafExerciseKey,
  TafGender,
  TafRunKey,
  calculateTafScore,
  formatRunTime,
  getTafEventsForGender,
  scoreRunTime,
  tafStandards,
} from "@/lib/tafData";
import { getUserProfile } from "@/lib/userProfile";

type Screen = "select_type" | "wizard" | "single" | "summary";
type ResultDraft = Record<TafEventKey, { value: number; skipped: boolean }>;

function TentativaInner() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [gender, setGender] = useState<TafGender | null>(null);
  const [ageGroup, setAgeGroup] = useState<TafAgeGroup | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("select_type");
  const [wizardIndex, setWizardIndex] = useState(0);
  const [wizardResults, setWizardResults] = useState<ResultDraft>({} as ResultDraft);
  const [repsInput, setRepsInput] = useState("");
  const [minInput, setMinInput] = useState("");
  const [secInput, setSecInput] = useState("");
  const [csInput, setCsInput] = useState("");
  const [singleEvent, setSingleEvent] = useState<TafEventKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid)
      .then((profile) => {
        if (profile?.gender && profile.age_group) {
          setGender(profile.gender as TafGender);
          setAgeGroup(profile.age_group as TafAgeGroup);
        }
      })
      .finally(() => {
        setProfileLoaded(true);
      });
  }, [user]);

  const events = useMemo(
    () => (gender ? getTafEventsForGender(gender) : []),
    [gender]
  );
  const currentEvent = events[wizardIndex];
  const isRunEvent =
    currentEvent === "run_300m" || currentEvent === "run_1600m";

  const currentValue = (() => {
    if (!currentEvent) return 0;
    if (isRunEvent) {
      const minutes = Number.parseInt(minInput || "0", 10);
      const seconds = Number.parseInt(secInput || "0", 10);
      const centesimos = Number.parseInt(csInput || "0", 10);
      if (seconds >= 60) return Number.NaN;
      return (
        minutes * 60 +
        seconds +
        (currentEvent === "run_300m" ? centesimos / 100 : 0)
      );
    }
    const reps = Number.parseInt(repsInput || "0", 10);
    return Number.isFinite(reps) ? reps : 0;
  })();

  const currentScore = (() => {
    if (!currentEvent || !gender || !ageGroup || !Number.isFinite(currentValue)) {
      return 0;
    }
    if (isRunEvent) {
      return scoreRunTime(currentValue, gender, ageGroup, currentEvent);
    }
    const standard = tafStandards[gender][ageGroup][currentEvent as TafExerciseKey];
    return standard
      ? calculateTafScore(currentValue, standard.base, standard.mult)
      : 0;
  })();

  function resetInputs() {
    setRepsInput("");
    setMinInput("");
    setSecInput("");
    setCsInput("");
  }

  function resetFlowState() {
    setWizardIndex(0);
    setWizardResults({} as ResultDraft);
    setSingleEvent(null);
    setSaveError(null);
    resetInputs();
  }

  function recordCurrent(skipped: boolean) {
    if (!currentEvent) return;
    setWizardResults((prev) => ({
      ...prev,
      [currentEvent]: { value: skipped ? 0 : currentValue, skipped },
    }));
    resetInputs();

    if (wizardIndex < events.length - 1) {
      setWizardIndex((prev) => prev + 1);
    } else {
      setScreen("summary");
    }
  }

  async function handleSave(type: "full" | "single") {
    if (!user || !gender || !ageGroup) return;
    setSaving(true);
    setSaveError(null);

    try {
      const resultsArray: TafEventResult[] = Object.entries(wizardResults).map(
        ([event, data]) => {
          const eventKey = event as TafEventKey;
          const isRun = eventKey === "run_300m" || eventKey === "run_1600m";
          const score = (() => {
            if (data.skipped) return 0;
            if (isRun) {
              return scoreRunTime(
                data.value,
                gender,
                ageGroup,
                eventKey as TafRunKey
              );
            }
            const standard =
              tafStandards[gender][ageGroup][eventKey as TafExerciseKey];
            return standard
              ? calculateTafScore(data.value, standard.base, standard.mult)
              : 0;
          })();

          return {
            event: eventKey,
            value: data.value,
            score,
            ...(data.skipped ? { skipped: true } : {}),
          };
        }
      );

      const hasCompletedEvent = resultsArray.some((result) => !result.skipped);
      if (!hasCompletedEvent) {
        setSaveError("Preencha ao menos um evento antes de salvar.");
        return;
      }

      await createTafAttempt({
        user_id: user.uid,
        type,
        gender,
        age_group: ageGroup,
        results: resultsArray,
      });

      router.push("/taf");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !profileLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (!gender || !ageGroup) {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6">
        <p className="text-sm text-[var(--foreground)]">
          Complete seu perfil (sexo e faixa etaria) antes de iniciar o Modo
          TAF.
        </p>
        <button
          onClick={() => router.push("/profile")}
          className="mt-4 rounded-xl bg-[var(--red-500)] px-4 py-2 text-white"
        >
          Ir para Perfil
        </button>
      </div>
    );
  }

  if (screen === "select_type") {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6">
        <header className="mb-6">
          <button
            onClick={() => router.push("/taf")}
            className="text-sm text-[var(--text-dim)]"
          >
            ← Voltar
          </button>
          <h1
            className="mt-4 text-3xl text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            MODO TAF
          </h1>
          <p className="text-xs text-[var(--text-dim)]">
            Escolha como quer registrar sua tentativa.
          </p>
        </header>

        <div className="space-y-3">
          <button
            onClick={() => {
              resetFlowState();
              setScreen("wizard");
            }}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--red-500)]"
          >
            <p className="text-xs font-bold uppercase text-[var(--red-500)]">
              TAF Completo
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              Registrar os {gender === "masculino" ? "5" : "4"} eventos em
              sequencia
            </p>
            <p className="mt-2 text-xs text-[var(--text-dim)]">
              Uma tentativa = nota total somada dos eventos.
            </p>
          </button>

          <button
            onClick={() => {
              resetFlowState();
              setScreen("single");
            }}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--amber-500)]"
          >
            <p className="text-xs font-bold uppercase text-[var(--amber-500)]">
              Evento Avulso
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              Registrar apenas um exercicio
            </p>
            <p className="mt-2 text-xs text-[var(--text-dim)]">
              Util para testar um evento especifico de cada vez.
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (screen === "single") {
    if (!singleEvent) {
      return (
        <div className="min-h-screen bg-[var(--background)] px-4 py-6">
          <header className="mb-6">
            <button
              onClick={() => {
                resetFlowState();
                setScreen("select_type");
              }}
              className="text-sm text-[var(--text-dim)]"
            >
              ← Voltar
            </button>
            <h1
              className="mt-4 text-3xl text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-bebas)" }}
            >
              EVENTO AVULSO
            </h1>
            <p className="text-xs text-[var(--text-dim)]">
              Qual evento voce quer registrar?
            </p>
          </header>

          <div className="space-y-2">
            {events.map((event) => (
              <button
                key={event}
                onClick={() => setSingleEvent(event)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--amber-500)]"
              >
                {TAF_EVENT_LABELS[event]}
              </button>
            ))}
          </div>
        </div>
      );
    }

    const isRun = singleEvent === "run_300m" || singleEvent === "run_1600m";
    const value = (() => {
      if (isRun) {
        const minutes = Number.parseInt(minInput || "0", 10);
        const seconds = Number.parseInt(secInput || "0", 10);
        const centesimos = Number.parseInt(csInput || "0", 10);
        if (seconds >= 60) return Number.NaN;
        return (
          minutes * 60 +
          seconds +
          (singleEvent === "run_300m" ? centesimos / 100 : 0)
        );
      }
      return Number.parseInt(repsInput || "0", 10) || 0;
    })();

    const score = (() => {
      if (!Number.isFinite(value)) return 0;
      if (isRun) {
        return scoreRunTime(value, gender, ageGroup, singleEvent as TafRunKey);
      }
      const standard = tafStandards[gender][ageGroup][singleEvent as TafExerciseKey];
      return standard
        ? calculateTafScore(value, standard.base, standard.mult)
        : 0;
    })();

    return (
      <div className="min-h-screen bg-[var(--background)] px-4 pb-32 pt-6">
        <header className="mb-6">
          <button
            onClick={() => {
              setSingleEvent(null);
              resetInputs();
            }}
            className="text-sm text-[var(--text-dim)]"
          >
            ← Trocar evento
          </button>
          <h1
            className="mt-3 text-3xl text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            {TAF_EVENT_LABELS[singleEvent]}
          </h1>
        </header>

        {isRun ? (
          <div className="flex gap-2">
            <InputBlock
              label="MIN"
              value={minInput}
              onChange={setMinInput}
              maxLength={2}
            />
            <InputBlock
              label="SEG"
              value={secInput}
              onChange={setSecInput}
              maxLength={2}
            />
            {singleEvent === "run_300m" && (
              <InputBlock
                label="CENT"
                value={csInput}
                onChange={setCsInput}
                maxLength={2}
              />
            )}
          </div>
        ) : (
          <InputBlock
            label="REPETICOES"
            value={repsInput}
            onChange={setRepsInput}
            maxLength={3}
            wide
          />
        )}

        <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-dim)]">Nota</p>
          <p
            className="text-3xl"
            style={{
              fontFamily: "var(--font-bebas)",
              color: score >= 50 ? "var(--amber-500)" : "var(--red-500)",
            }}
          >
            {Number.isFinite(value) ? Math.round(score) : 0} pts
          </p>
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <div className="mx-auto max-w-md">
            <button
              onClick={() => {
                setWizardResults({
                  [singleEvent]: { value, skipped: false },
                } as ResultDraft);
                setScreen("summary");
              }}
              disabled={!Number.isFinite(value) || value <= 0}
              className="w-full rounded-xl bg-[var(--red-500)] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Registrar tentativa
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "wizard" && currentEvent) {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 pb-32 pt-6">
        <header className="mb-6">
          <button
            onClick={() => {
              resetFlowState();
              setScreen("select_type");
            }}
            className="text-sm text-[var(--text-dim)]"
          >
            ← Voltar
          </button>
          <p className="mt-3 text-xs text-[var(--text-dim)]">
            {wizardIndex + 1} de {events.length}
          </p>
          <h1
            className="mt-1 text-3xl text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            {TAF_EVENT_LABELS[currentEvent]}
          </h1>
        </header>

        {isRunEvent ? (
          <div className="flex gap-2">
            <InputBlock
              label="MIN"
              value={minInput}
              onChange={setMinInput}
              maxLength={2}
            />
            <InputBlock
              label="SEG"
              value={secInput}
              onChange={setSecInput}
              maxLength={2}
            />
            {currentEvent === "run_300m" && (
              <InputBlock
                label="CENT"
                value={csInput}
                onChange={setCsInput}
                maxLength={2}
              />
            )}
          </div>
        ) : (
          <InputBlock
            label="REPETICOES"
            value={repsInput}
            onChange={setRepsInput}
            maxLength={3}
            wide
          />
        )}

        <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-dim)]">Nota prevista</p>
          <p
            className="text-3xl"
            style={{
              fontFamily: "var(--font-bebas)",
              color:
                currentScore >= 50 ? "var(--amber-500)" : "var(--red-500)",
            }}
          >
            {Number.isFinite(currentValue) ? Math.round(currentScore) : 0} pts
          </p>
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <div className="mx-auto flex max-w-md gap-2">
            <button
              onClick={() => recordCurrent(true)}
              className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-muted)]"
            >
              Pular
            </button>
            <button
              onClick={() => recordCurrent(false)}
              disabled={!Number.isFinite(currentValue) || currentValue <= 0}
              className="flex-[2] rounded-xl bg-[var(--red-500)] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {wizardIndex === events.length - 1 ? "Finalizar" : "Proximo"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "summary") {
    const type: "full" | "single" =
      Object.keys(wizardResults).length === 1 ? "single" : "full";

    const resultRows = Object.entries(wizardResults).map(([event, data]) => {
      const eventKey = event as TafEventKey;
      const isRun = eventKey === "run_300m" || eventKey === "run_1600m";
      const score = (() => {
        if (data.skipped) return 0;
        if (isRun) {
          return scoreRunTime(data.value, gender, ageGroup, eventKey as TafRunKey);
        }
        const standard = tafStandards[gender][ageGroup][eventKey as TafExerciseKey];
        return standard
          ? calculateTafScore(data.value, standard.base, standard.mult)
          : 0;
      })();

      const display = data.skipped
        ? "Pulado"
        : isRun
          ? formatRunTime(data.value, eventKey as TafRunKey)
          : `${data.value} reps`;

      return { eventKey, score, display, skipped: data.skipped };
    });

    const total = resultRows.reduce((sum, row) => sum + row.score, 0);
    const hasCompletedEvent = resultRows.some((row) => !row.skipped);

    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6">
        <button
          onClick={() => {
            resetFlowState();
            setScreen(type === "single" ? "single" : "wizard");
          }}
          className="text-sm text-[var(--text-dim)]"
        >
          ← Voltar
        </button>

        <h1
          className="mt-4 text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          RESUMO DA TENTATIVA
        </h1>

        <div className="mt-4 rounded-2xl bg-gradient-to-r from-[var(--red-500)]/10 to-[var(--amber-500)]/10 p-6 text-center">
          <p className="text-xs text-[var(--text-dim)]">Nota total</p>
          <p
            className="mt-1 text-5xl text-[var(--amber-500)]"
            style={{ fontFamily: "var(--font-bebas)" }}
          >
            {total} <span className="text-xl text-[var(--text-dim)]">pts</span>
          </p>
        </div>

        <div className="mt-6 space-y-2">
          {resultRows.map((row) => (
            <div
              key={row.eventKey}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {TAF_EVENT_LABELS[row.eventKey]}
                </p>
                <p
                  className={`text-xs ${
                    row.skipped
                      ? "text-[var(--text-dim)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {row.display}
                </p>
              </div>
              <span
                className="text-2xl"
                style={{
                  fontFamily: "var(--font-bebas)",
                  color:
                    row.score >= 50 ? "var(--amber-500)" : "var(--red-500)",
                }}
              >
                {row.score}
              </span>
            </div>
          ))}
        </div>

        {saveError && (
          <p className="mt-4 text-sm text-[var(--red-500)]">{saveError}</p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => {
              resetFlowState();
              setScreen("select_type");
            }}
            className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-muted)]"
          >
            Refazer
          </button>
          <button
            onClick={() => handleSave(type)}
            disabled={saving || !hasCompletedEvent}
            className="flex-[2] rounded-xl bg-[var(--red-500)] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar tentativa"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function InputBlock({
  label,
  value,
  onChange,
  maxLength,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 ${
        wide ? "flex-1" : "w-20"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {label}
      </p>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={maxLength}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/[^0-9]/g, ""))
        }
        className="mt-1 w-full bg-transparent text-4xl text-[var(--foreground)] focus:outline-none"
        style={{ fontFamily: "var(--font-bebas)" }}
      />
    </div>
  );
}

export default function TentativaPage() {
  return (
    <Suspense fallback={null}>
      <TentativaInner />
    </Suspense>
  );
}
