"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, updateUserProfile } from "@/lib/userProfile";
import { UserProfile } from "@/types";
import BottomNav from "@/components/BottomNav";
import ProgressChart from "@/components/ProgressChart";
import TafDashboard from "@/components/TafDashboard";
import { TafGender, TafAgeGroup } from "@/lib/tafData";

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

type FormData = {
  name: string;
  age: string;
  weight: string;
  height: string;
  level: UserProfile["level"] | "";
  days_per_week: string;
  time_per_session: string;
  goal: string;
  focus_muscle: string;
  medical_restrictions: string;
  gender: TafGender | "";
  age_group: TafAgeGroup | "";
};

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"perfil" | "taf">("perfil");
  const [form, setForm] = useState<FormData>({
    name: "",
    age: "",
    weight: "",
    height: "",
    level: "",
    days_per_week: "",
    time_per_session: "",
    goal: "",
    focus_muscle: "",
    medical_restrictions: "",
    gender: "",
    age_group: "",
  });

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const profile = await getUserProfile(user.uid);
    if (!profile) {
      router.push("/onboarding");
      return;
    }
    setForm({
      name: profile.name,
      age: String(profile.age),
      weight: String(profile.weight),
      height: String(profile.height),
      level: profile.level,
      days_per_week: String(profile.days_per_week),
      time_per_session: String(profile.time_per_session),
      goal: profile.goal,
      focus_muscle: profile.focus_muscle,
      medical_restrictions: profile.medical_restrictions || "",
      gender: profile.gender ?? "",
      age_group: profile.age_group ?? "",
    });
    setPageLoading(false);
  }, [user, router]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) loadProfile();
  }, [user, loadProfile]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSaved(false);
  }

  function validate(): boolean {
    if (!form.name.trim()) { setError("Informe seu nome."); return false; }
    if (!form.age || +form.age < 10 || +form.age > 100) { setError("Informe uma idade válida."); return false; }
    if (!form.weight || +form.weight < 30) { setError("Informe seu peso em kg."); return false; }
    if (!form.height || +form.height < 100) { setError("Informe sua altura em cm."); return false; }
    if (!form.level) { setError("Selecione seu nível."); return false; }
    if (!form.days_per_week || +form.days_per_week < 1) { setError("Informe os dias de treino."); return false; }
    if (!form.time_per_session || +form.time_per_session < 20) { setError("Informe o tempo de treino."); return false; }
    if (!form.goal) { setError("Selecione seu objetivo."); return false; }
    if (!form.focus_muscle) { setError("Selecione o foco muscular."); return false; }
    return true;
  }

  async function handleSave() {
    if (!validate() || !user) return;
    setSaving(true);
    setError("");
    try {
      await updateUserProfile(user.uid, {
        name: form.name.trim(),
        age: +form.age,
        weight: +form.weight,
        height: +form.height,
        level: form.level as UserProfile["level"],
        days_per_week: +form.days_per_week,
        time_per_session: +form.time_per_session,
        goal: form.goal,
        focus_muscle: form.focus_muscle,
        medical_restrictions: form.medical_restrictions.trim(),
        ...(form.gender ? { gender: form.gender } : {}),
        ...(form.age_group ? { age_group: form.age_group } : {}),
      });
      setSaved(true);
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      {/* Header */}
      <header className="px-5 pb-1 pt-6">
        <h1
          className="text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          MEU PERFIL
        </h1>
        <p className="text-xs text-[var(--text-dim)]">Ajuste seus dados para treinos otimizados</p>
      </header>

      {/* Tab Bar */}
      <div className="mx-4 mt-3 flex gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        <button
          onClick={() => setTab("perfil")}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
            tab === "perfil"
              ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--text-dim)]"
          }`}
        >
          Perfil
        </button>
        <button
          onClick={() => setTab("taf")}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
            tab === "taf"
              ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--text-dim)]"
          }`}
        >
          Modo TAF
        </button>
      </div>

      <main className="flex flex-1 flex-col gap-5 px-4 py-5">
        {tab === "perfil" ? (
          <>
            {/* Análise de Força */}
            <Section title="Análise de Força">
              <ProgressChart userId={user!.uid} />
            </Section>

            {/* Dados pessoais */}
            <Section title="Dados pessoais">
              <Field label="Nome completo">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Seu nome"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Idade">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form.age}
                    onChange={(e) => set("age", e.target.value)}
                    placeholder="25"
                    className={inputCls}
                  />
                </Field>
                <Field label="Peso (kg)">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(e) => set("weight", e.target.value)}
                    placeholder="75"
                    className={inputCls}
                  />
                </Field>
                <Field label="Altura (cm)">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form.height}
                    onChange={(e) => set("height", e.target.value)}
                    placeholder="175"
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* Sexo biológico (para TAF) */}
              <Field label="Sexo biológico (TAF)">
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(["masculino", "feminino"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set("gender", g)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        form.gender === g
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {g === "masculino" ? "Masculino" : "Feminino"}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Faixa etária (para TAF) */}
              <Field label="Faixa etária (TAF)">
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: "under_30", label: "Até 30" },
                      { value: "31_40", label: "31–40" },
                      { value: "over_40", label: "40+" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set("age_group", value)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        form.age_group === value
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Nível de experiência">
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(["iniciante", "intermediario", "avancado"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => set("level", lvl)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        form.level === lvl
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {lvl === "iniciante" ? "Iniciante" : lvl === "intermediario" ? "Intermediário" : "Avançado"}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            {/* Disponibilidade */}
            <Section title="Disponibilidade">
              <Field label="Dias de treino por semana">
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set("days_per_week", String(d))}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${
                        form.days_per_week === String(d)
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {d}x
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Tempo por sessão (minutos)">
                <div className="flex gap-2">
                  {[45, 60, 75, 90].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("time_per_session", String(t))}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${
                        form.time_per_session === String(t)
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            {/* Objetivo */}
            <Section title="Objetivo">
              <Field label="Objetivo principal">
                <div className="space-y-2">
                  {GOALS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set("goal", g)}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
                        form.goal === g
                          ? "border-[var(--red-500)] bg-[var(--red-600)]/15 text-[var(--red-500)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Foco muscular">
                <select
                  value={form.focus_muscle}
                  onChange={(e) => set("focus_muscle", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecione...</option>
                  {MUSCLES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field label="Restrições médicas (opcional)">
                <textarea
                  value={form.medical_restrictions}
                  onChange={(e) => set("medical_restrictions", e.target.value)}
                  placeholder="Ex: lesão no joelho, hérnia de disco..."
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </Section>

            {error && (
              <p className="text-center text-sm font-medium text-[var(--red-500)]">{error}</p>
            )}

            {saved && (
              <div className="animate-fade-in rounded-2xl border border-[var(--success)]/20 bg-[var(--success)]/10 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-[var(--success)]">
                  Perfil atualizado com sucesso!
                </p>
                <p className="mt-1 text-xs text-[var(--success)]/70">
                  Gere um novo treino na home para aplicar as mudanças
                </p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-60 gradient-red"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Salvando...
                </>
              ) : (
                "Salvar Perfil"
              )}
            </button>

            {saved && (
              <button
                onClick={() => router.push("/")}
                className="w-full rounded-2xl border border-[var(--border)] py-3.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
              >
                Voltar e gerar novo treino
              </button>
            )}
          </>
        ) : (
          /* ── Aba Modo TAF ── */
          <TafDashboard
            userId={user!.uid}
            gender={form.gender || undefined}
            ageGroup={form.age_group || undefined}
          />
        )}
      </main>

      <BottomNav />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--amber-500)]">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
