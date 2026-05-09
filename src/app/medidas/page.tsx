"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { getBodyMeasurements, saveBodyMeasurement } from "@/lib/bodyMeasurements";
import { BodyMeasurement } from "@/types";
import MeasurementSheet from "@/components/MeasurementSheet";
import EmptyState from "@/components/EmptyState";
import { haptic } from "@/lib/haptics";

type MeasurementKey = keyof Omit<BodyMeasurement, "id" | "user_id" | "date">;

interface ChipDef {
  key: MeasurementKey;
  label: string;
  unit: string;
}

const CHIPS: ChipDef[] = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "chest_cm", label: "Peito", unit: "cm" },
  { key: "shoulder_cm", label: "Ombros", unit: "cm" },
  { key: "neck_cm", label: "Pescoço", unit: "cm" },
  { key: "bicep_r_cm", label: "Bíceps D", unit: "cm" },
  { key: "bicep_l_cm", label: "Bíceps E", unit: "cm" },
  { key: "forearm_r_cm", label: "Antebraço D", unit: "cm" },
  { key: "forearm_l_cm", label: "Antebraço E", unit: "cm" },
  { key: "thigh_r_cm", label: "Coxa D", unit: "cm" },
  { key: "thigh_l_cm", label: "Coxa E", unit: "cm" },
  { key: "calf_r_cm", label: "Panturrilha D", unit: "cm" },
  { key: "calf_l_cm", label: "Panturrilha E", unit: "cm" },
];

const CARD_FIELDS: { key: MeasurementKey; label: string }[] = [
  { key: "weight_kg", label: "Peso" },
  { key: "waist_cm", label: "Cintura" },
  { key: "hip_cm", label: "Quadril" },
  { key: "chest_cm", label: "Peito" },
  { key: "shoulder_cm", label: "Ombros" },
  { key: "neck_cm", label: "Pescoço" },
  { key: "bicep_r_cm", label: "Bíceps D" },
  { key: "bicep_l_cm", label: "Bíceps E" },
  { key: "forearm_r_cm", label: "Anteb. D" },
  { key: "forearm_l_cm", label: "Anteb. E" },
  { key: "thigh_r_cm", label: "Coxa D" },
  { key: "thigh_l_cm", label: "Coxa E" },
  { key: "calf_r_cm", label: "Panturr. D" },
  { key: "calf_l_cm", label: "Panturr. E" },
];

function formatDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function MedidasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<MeasurementKey>("weight_kg");
  const [chartColors, setChartColors] = useState({ red: "#EF4444", amber: "#F59E0B", muted: "#6B7280" });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const red = style.getPropertyValue("--red-500").trim();
    const amber = style.getPropertyValue("--amber-500").trim();
    const muted = style.getPropertyValue("--text-dim").trim();
    setChartColors({
      red: red || "#EF4444",
      amber: amber || "#F59E0B",
      muted: muted || "#6B7280",
    });
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getBodyMeasurements(user.uid);
      setMeasurements(data);
      setLoadError(null);
    } catch (err) {
      console.error("[Medidas] Erro ao carregar:", err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function handleSave(data: Omit<BodyMeasurement, "id" | "user_id" | "date">) {
    if (!user) return;
    try {
      await saveBodyMeasurement(user.uid, data);
    } catch (err) {
      console.error("[Medidas] Erro ao salvar:", err);
      throw err;
    }
    setSheetOpen(false);
    setLoading(true);
    await load();
  }

  const chip = CHIPS.find((c) => c.key === selectedKey)!;

  // Chart data: oldest first, only entries that have this field
  const chartData = [...measurements]
    .filter((m) => m[selectedKey] !== undefined)
    .reverse()
    .map((m) => ({
      dateLabel: formatDateShort(m.date),
      value: m[selectedKey] as number,
    }));

  // Evolution badge
  const firstVal = chartData.length > 0 ? chartData[0].value : null;
  const lastVal = chartData.length > 0 ? chartData[chartData.length - 1].value : null;
  const diff = firstVal !== null && lastVal !== null ? +(lastVal - firstVal).toFixed(1) : null;

  if (authLoading || (!user && !authLoading)) return null;

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-6 pb-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:bg-[var(--border)]"
          aria-label="Voltar"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)" }}>
            MEDIDAS CORPORAIS
          </h1>
          <p className="text-xs text-[var(--text-dim)]">Acompanhe sua evolução</p>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 flex flex-col gap-4">
        {/* Chart section */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {/* Chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
            {CHIPS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  selectedKey === key
                    ? "bg-[var(--red-500)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loadError ? (
            <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-xs text-[var(--red-500)] font-semibold mb-1">Erro ao carregar dados</p>
              <p className="text-[10px] text-[var(--text-dim)] break-all">{loadError}</p>
              <p className="text-[10px] text-[var(--text-dim)] mt-1">Veja o console do browser (F12) para o link do índice Firestore.</p>
            </div>
          ) : loading ? (
            <div className="flex h-[160px] items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
            </div>
          ) : chartData.length < 2 ? (
            <div className="flex h-[120px] items-center justify-center rounded-xl bg-[var(--surface-2)] mt-3">
              <p className="text-center text-sm text-[var(--text-dim)] px-4">
                {chartData.length === 0
                  ? `Nenhum registro de ${chip.label} ainda`
                  : `Adicione mais 1 registro de ${chip.label} para ver o gráfico`}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              {/* Current value + evolution badge */}
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-3xl font-bold text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)" }}>
                  {lastVal} <span className="text-base font-normal text-[var(--text-dim)]">{chip.unit}</span>
                </span>
                {diff !== null && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      diff < 0
                        ? "bg-green-500/15 text-green-400"
                        : diff > 0
                        ? "bg-red-500/15 text-[var(--red-500)]"
                        : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}{diff} {chip.unit} desde o início
                  </span>
                )}
              </div>

              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <XAxis
                    dataKey="dateLabel"
                    stroke={chartColors.muted}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={chartColors.muted}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => [
                      `${value ?? ""} ${chip.unit}`,
                      chip.label,
                    ]}
                    labelStyle={{ color: "var(--text-dim)", marginBottom: "2px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={chartColors.red}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: chartColors.amber, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-dim)] mb-3">
            Registros
          </h2>

          {!loading && measurements.length === 0 ? (
            <EmptyState
              icon="📏"
              title="REGISTRE SUAS MEDIDAS"
              description="Acompanhe sua evolução corporal ao longo do tempo."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {measurements.map((m) => {
                const filled = CARD_FIELDS.filter((f) => m[f.key] !== undefined);
                const weightField = filled.find((f) => f.key === "weight_kg");
                const rest = filled.filter((f) => f.key !== "weight_kg");
                return (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-[var(--red-500)]">
                        {formatDate(m.date)}
                      </span>
                      {weightField && (
                        <span className="text-sm font-bold text-[var(--foreground)]">
                          {m.weight_kg} kg
                        </span>
                      )}
                    </div>
                    {rest.length > 0 && (
                      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                        {rest.map(({ key, label }) => (
                          <div key={key}>
                            <p className="text-[10px] text-[var(--text-dim)]">{label}</p>
                            <p className="text-xs font-semibold text-[var(--foreground)]">
                              {m[key]} cm
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {filled.length === 0 && (
                      <p className="text-xs text-[var(--text-dim)]">Nenhum campo registrado</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => { haptic("medium"); setSheetOpen(true); }}
        className="tactile fixed bottom-6 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95 gradient-red"
        aria-label="Adicionar medida"
        style={{ boxShadow: "var(--shadow-red)" }}
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <MeasurementSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
