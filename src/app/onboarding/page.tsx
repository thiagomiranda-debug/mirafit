"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { saveUserProfile } from "@/lib/userProfile";
import { UserProfile, RestrictionTag } from "@/types";

const STEPS = ["Pessoal", "Treino", "Objetivo"];

const GOALS = [
  "Hipertrofia (ganho de massa)",
  "Emagrecimento",
  "Força",
  "Condicionamento físico",
  "Saúde e bem-estar",
];

const MUSCLES = [
  "Sem foco específico",
  "Peitorais",
  "Costas",
  "Pernas",
  "Ombros",
  "Bíceps",
  "Tríceps",
  "Abdômen",
  "Glúteos",
];

const RESTRICTION_OPTIONS: { tag: RestrictionTag; label: string }[] = [
  { tag: "joelho", label: "Joelho" },
  { tag: "ombro", label: "Ombro" },
  { tag: "lombar", label: "Lombar" },
  { tag: "cervical", label: "Cervical" },
  { tag: "punho", label: "Punho" },
  { tag: "cotovelo", label: "Cotovelo" },
  { tag: "tornozelo", label: "Tornozelo" },
  { tag: "quadril", label: "Quadril" },
];

type FormData = {
  name: string;
  age: string;
  weight: string;
  height: string;
  gender: UserProfile["gender"] | "";
  level: UserProfile["level"] | "";
  months_training: string;
  days_per_week: string;
  time_per_session: string;
  goal: string;
  focus_muscle: string;
  medical_restriction_tags: RestrictionTag[];
  medical_restrictions: string;
};

const initial: FormData = {
  name: "",
  age: "",
  weight: "",
  height: "",
  gender: "",
  level: "",
  months_training: "",
  days_per_week: "",
  time_per_session: "",
  goal: "",
  focus_muscle: "",
  medical_restriction_tags: [],
  medical_restrictions: "",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const router = useRouter();

  function set<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  function toggleRestriction(tag: RestrictionTag) {
    setForm((prev) => {
      const has = prev.medical_restriction_tags.includes(tag);
      return {
        ...prev,
        medical_restriction_tags: has
          ? prev.medical_restriction_tags.filter((t) => t !== tag)
          : [...prev.medical_restriction_tags, tag],
      };
    });
    setError("");
  }

  function validateStep(): boolean {
    if (step === 0) {
      if (!form.name.trim()) { setError("Informe seu nome."); return false; }
      if (!form.age || +form.age < 10 || +form.age > 100) { setError("Informe uma idade válida."); return false; }
      if (!form.gender) { setError("Selecione seu gênero."); return false; }
      if (!form.weight || +form.weight < 30) { setError("Informe seu peso em kg."); return false; }
      if (!form.height || +form.height < 100) { setError("Informe sua altura em cm."); return false; }
      if (!form.level) { setError("Selecione seu nível."); return false; }
      if (form.months_training === "" || +form.months_training < 0) { setError("Informe há quantos meses você treina (0 se nunca treinou)."); return false; }
    }
    if (step === 1) {
      if (!form.days_per_week || +form.days_per_week < 1 || +form.days_per_week > 7) { setError("Informe quantos dias por semana (1-7)."); return false; }
      if (!form.time_per_session || +form.time_per_session < 20) { setError("Informe o tempo de treino (mín. 20 min)."); return false; }
    }
    if (step === 2) {
      if (!form.goal) { setError("Selecione seu objetivo."); return false; }
      if (!form.focus_muscle) { setError("Selecione o foco muscular."); return false; }
    }
    return true;
  }

  function next() {
    if (!validateStep()) return;
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    if (!user) return;
    setLoading(true);
    try {
      const profile: UserProfile = {
        name: form.name.trim(),
        age: +form.age,
        weight: +form.weight,
        height: +form.height,
        gender: form.gender as UserProfile["gender"],
        level: form.level as UserProfile["level"],
        months_training: +form.months_training,
        days_per_week: +form.days_per_week,
        time_per_session: +form.time_per_session,
        goal: form.goal,
        focus_muscle: form.focus_muscle,
        medical_restrictions: form.medical_restrictions.trim(),
        medical_restriction_tags: form.medical_restriction_tags,
        gym_id: "",
      };
      await saveUserProfile(user.uid, profile);
      router.push("/");
    } catch {
      setError("Erro ao salvar perfil. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-5">
        <h1
          className="text-center text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          CONFIGURAR PERFIL
        </h1>

        {/* Step indicators */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                    i < step
                      ? "bg-[var(--success)] text-white"
                      : i === step
                        ? "gradient-red text-white shadow-md shadow-[var(--red-600)]/20"
                        : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {i < step ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className="text-[10px] font-semibold text-[var(--text-dim)]">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mb-5 h-px w-8 ${i < step ? "bg-[var(--success)]" : "bg-[var(--border)]"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col px-6 py-6">
        <div className="mx-auto w-full max-w-sm space-y-4">

          {/* Step 0 — Dados pessoais */}
          {step === 0 && (
            <div className="animate-fade-in space-y-4">
              <p className="text-sm font-medium text-[var(--text-dim)]">Nos conte sobre você</p>

              <Field label="Nome completo">
                <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                  placeholder="Seu nome" className={inputCls} />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Idade">
                  <input type="number" value={form.age} onChange={(e) => set("age", e.target.value)}
                    placeholder="25" min={10} max={100} className={inputCls} />
                </Field>
                <Field label="Peso (kg)">
                  <input type="number" value={form.weight} onChange={(e) => set("weight", e.target.value)}
                    placeholder="75" min={30} className={inputCls} />
                </Field>
                <Field label="Altura (cm)">
                  <input type="number" value={form.height} onChange={(e) => set("height", e.target.value)}
                    placeholder="175" min={100} className={inputCls} />
                </Field>
              </div>

              <Field label="Gênero">
                <div className="grid grid-cols-2 gap-2">
                  {(["masculino", "feminino"] as const).map((g) => (
                    <button key={g} type="button" onClick={() => set("gender", g)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold capitalize transition-all ${
                        form.gender === g
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}>
                      {g === "masculino" ? "Masculino" : "Feminino"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Nível de experiência">
                <div className="grid grid-cols-3 gap-2">
                  {(["iniciante", "intermediario", "avancado"] as const).map((lvl) => (
                    <button key={lvl} type="button" onClick={() => set("level", lvl)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold capitalize transition-all ${
                        form.level === lvl
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}>
                      {lvl === "iniciante" ? "Iniciante" : lvl === "intermediario" ? "Intermediário" : "Avançado"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Há quantos meses treina continuamente?">
                <input type="number" value={form.months_training}
                  onChange={(e) => set("months_training", e.target.value)}
                  placeholder="Ex: 6 (0 se nunca treinou)" min={0} max={600} className={inputCls} />
              </Field>
            </div>
          )}

          {/* Step 1 — Disponibilidade */}
          {step === 1 && (
            <div className="animate-fade-in space-y-4">
              <p className="text-sm font-medium text-[var(--text-dim)]">Sua disponibilidade</p>

              <Field label="Dias de treino por semana">
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map((d) => (
                    <button key={d} type="button" onClick={() => set("days_per_week", String(d))}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${
                        form.days_per_week === String(d)
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}>
                      {d}x
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Tempo por sessão (minutos)">
                <div className="flex gap-2">
                  {[45, 60, 75, 90].map((t) => (
                    <button key={t} type="button" onClick={() => set("time_per_session", String(t))}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${
                        form.time_per_session === String(t)
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {/* Step 2 — Objetivo */}
          {step === 2 && (
            <div className="animate-fade-in space-y-4">
              <p className="text-sm font-medium text-[var(--text-dim)]">Seu objetivo</p>

              <Field label="Objetivo principal">
                <div className="space-y-2">
                  {GOALS.map((g) => (
                    <button key={g} type="button" onClick={() => set("goal", g)}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
                        form.goal === g
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Foco muscular">
                <select value={form.focus_muscle} onChange={(e) => set("focus_muscle", e.target.value)}
                  className={inputCls}>
                  <option value="">Selecione...</option>
                  {MUSCLES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field label="Restrições / lesões (marque se tiver)">
                <div className="grid grid-cols-2 gap-2">
                  {RESTRICTION_OPTIONS.map(({ tag, label }) => {
                    const active = form.medical_restriction_tags.includes(tag);
                    return (
                      <button key={tag} type="button" onClick={() => toggleRestriction(tag)}
                        className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                          active
                            ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                            : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                        }`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Outras observações (opcional)">
                <textarea value={form.medical_restrictions} onChange={(e) => set("medical_restrictions", e.target.value)}
                  placeholder="Ex: hérnia de disco, tendinite, cirurgia recente..."
                  rows={2} className={`${inputCls} resize-none`} />
              </Field>
            </div>
          )}

          {error && (
            <p className="text-sm font-medium text-[var(--red-500)]">{error}</p>
          )}
        </div>
      </div>

      {/* Footer buttons */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex w-full max-w-sm gap-3">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)}
              className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]">
              Voltar
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={next}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white gradient-red transition-all hover:shadow-md hover:shadow-[var(--red-600)]/20">
              Continuar
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white gradient-red transition-all hover:shadow-md hover:shadow-[var(--red-600)]/20 disabled:opacity-50">
              {loading ? "Salvando..." : "Concluir"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "mt-1.5 block w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-sm text-[var(--foreground)] placeholder-[var(--text-dim)] focus:border-[var(--red-500)] focus:outline-none focus:ring-1 focus:ring-[var(--red-500)] transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">{label}</label>
      {children}
    </div>
  );
}
