"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkoutById, getExercisesByIds } from "@/lib/workouts";
import { getWorkoutLogsByWorkout } from "@/lib/workoutLogs";
import { getProgramDisplayName } from "@/lib/workoutPrograms";
import { buildWorkoutProgramReport, type ProgramSessionReport, type ReportHighlight } from "@/lib/workoutReport";
import type { LibraryExercise, Routine, Workout, WorkoutLog } from "@/types";
import ProgramReportChart from "@/components/ProgramReportChart";
import { haptic } from "@/lib/haptics";

type ProgramWithRoutines = Workout & { routines: Routine[] };

export default function ProgramReportPage() {
  return <Suspense fallback={<ReportSkeleton />}><ProgramReportContent /></Suspense>;
}

function ProgramReportContent() {
  const searchParams = useSearchParams();
  const workoutId = searchParams.get("w");
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [workout, setWorkout] = useState<ProgramWithRoutines | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, LibraryExercise>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user || !workoutId) {
      if (!authLoading && user && !workoutId) {
        setError("Programa não informado.");
        setLoading(false);
      }
      return;
    }
    const userId = user.uid;
    const programId = workoutId;
    let cancelled = false;
    async function loadReport() {
      try {
        const [program, programLogs] = await Promise.all([
          getWorkoutById(userId, programId),
          getWorkoutLogsByWorkout(userId, programId),
        ]);
        if (!program) throw new Error("Programa não encontrado.");
        const exerciseIds = [...new Set(programLogs.flatMap((log) => log.performance.map((item) => item.exercise_id)))];
        const exercises = exerciseIds.length ? await getExercisesByIds(exerciseIds) : {};
        if (!cancelled) {
          setWorkout(program);
          setLogs(programLogs);
          setExerciseMap(exercises);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o relatório.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReport();
    return () => { cancelled = true; };
  }, [authLoading, user, workoutId]);

  const report = useMemo(
    () => workout ? buildWorkoutProgramReport(workout, logs, exerciseMap) : null,
    [exerciseMap, logs, workout]
  );

  if (authLoading || loading) return <ReportSkeleton />;
  if (error || !workout || !report) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--background)]">
        <ReportHeader onBack={() => router.back()} />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--red-600)]/15 text-[var(--red-500)]">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.3 3.7L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.7a2 2 0 00-3.4 0z" /></svg>
          </div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{error || "Relatório indisponível."}</p>
          <button type="button" onClick={() => router.push("/history")} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-muted)]">Voltar ao histórico</button>
        </main>
      </div>
    );
  }

  const programEnd = workout.is_active ? new Date() : workout.ended_at || logs[0]?.date;
  const dateRange = `${formatDate(workout.created_at)} — ${programEnd ? formatDate(programEnd) : "atual"}`;
  const maxMuscleVolume = report.muscles[0]?.volume || 1;

  return (
    <div className="min-h-dvh bg-[var(--background)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <ReportHeader onBack={() => router.back()} />
      <main className="mx-auto w-full max-w-3xl space-y-7 px-4 py-5 sm:px-6">
        <section className="animate-fade-in">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--red-500)]/40 bg-[var(--red-600)]/12 text-[var(--red-500)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 7v10m12-10v10M3 10v4m18-4v4M6 12h12" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold leading-tight text-[var(--foreground)] sm:text-2xl">{getProgramDisplayName(workout)}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${workout.is_active ? "bg-[var(--success)]/12 text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--text-dim)]"}`}>{workout.is_active ? "Ativo" : "Finalizado"}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-dim)]">{dateRange} · {workout.location_type === "quartel" ? "Quartel" : "Academia"}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[var(--red-500)]/35" style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.16), rgba(19,19,22,0.96))" }}>
            <SummaryMetric value={report.sessionCount.toLocaleString("pt-BR")} label="sessões" />
            <SummaryMetric value={compactNumber(report.totalVolume)} label="kg volume" />
            <SummaryMetric value={report.totalSets.toLocaleString("pt-BR")} label="séries" />
            <SummaryMetric value={report.sessionsPerWeek.toLocaleString("pt-BR")} label="treinos/sem" last />
          </div>
        </section>

        <section className="animate-fade-in-up">
          <SectionTitle>EVOLUÇÃO NO PROGRAMA</SectionTitle>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
            <ProgramReportChart data={report.chart} volumeChangePct={report.volumeChangePct} strengthChangePct={report.strengthChangePct} />
          </div>
        </section>

        <section className="animate-fade-in-up">
          <SectionTitle>DISTRIBUIÇÃO POR ROTINA</SectionTitle>
          <div className="space-y-2">
            {report.routines.map((routine, index) => <RoutineDistributionRow key={routine.key} index={index} name={routine.name} sessions={routine.sessions} percentage={routine.percentage} />)}
          </div>
        </section>

        <section className="animate-fade-in-up">
          <SectionTitle>DESTAQUES</SectionTitle>
          <div className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-4">
            <HighlightMetric label="Maior carga" highlight={report.maxWeight} suffix="kg" />
            <HighlightMetric label="Melhor 1RM" highlight={report.best1RM} suffix="kg" />
            <div className="min-w-0 px-2 text-center">
              <p className="text-[10px] font-medium text-[var(--text-dim)]">Mais frequente</p>
              <p className="mt-1 truncate text-sm font-bold text-[var(--amber-500)]">{report.mostFrequentExercise?.exerciseName || "—"}</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">{report.mostFrequentExercise ? `${report.mostFrequentExercise.sessions} sessões · ${report.mostFrequentExercise.percentage.toLocaleString("pt-BR")}%` : "Sem dados"}</p>
            </div>
          </div>
        </section>

        <section className="animate-fade-in-up">
          <SectionTitle>VOLUME POR GRUPO MUSCULAR</SectionTitle>
          {report.muscles.length ? (
            <div className="space-y-3">
              {report.muscles.map((muscle) => (
                <div key={muscle.muscle} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2">
                  <p className="truncate text-xs font-semibold text-[var(--text-muted)]">{muscle.muscle}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--red-600)] to-[var(--red-500)]" style={{ width: `${Math.max(2, (muscle.volume / maxMuscleVolume) * 100)}%` }} /></div>
                  <div className="w-20 text-right"><p className="text-xs font-bold text-[var(--foreground)]">{compactNumber(muscle.volume)} kg</p><p className="text-[10px] text-[var(--red-500)]">{muscle.percentage.toLocaleString("pt-BR")}%</p></div>
                </div>
              ))}
            </div>
          ) : <UnavailableMetric message="O volume muscular aparecerá após sessões com cargas registradas." />}
        </section>

        <section className="animate-fade-in-up">
          <div className="mb-3 flex items-end justify-between gap-3"><SectionTitle noMargin>SESSÕES</SectionTitle><p className="text-[10px] font-semibold text-[var(--text-dim)]">Mais recentes primeiro</p></div>
          {report.sessions.length ? <div className="space-y-2">{report.sessions.map((session, index) => <SessionReportRow key={session.id} session={session} number={report.sessions.length - index} />)}</div> : <UnavailableMetric message="Este programa ainda não possui sessões concluídas." />}
        </section>
      </main>
    </div>
  );
}

function ReportHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
        <button type="button" onClick={onBack} aria-label="Voltar" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></button>
        <p className="flex-1 text-center text-xl text-[var(--foreground)]" style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.08em" }}>RELATÓRIO DO PROGRAMA</p>
        <div className="h-10 w-10" aria-hidden="true" />
      </div>
    </header>
  );
}

function SummaryMetric({ value, label, last = false }: { value: string; label: string; last?: boolean }) {
  return <div className={`min-w-0 px-1 py-4 text-center ${last ? "" : "border-r border-white/10"}`}><p className="truncate text-2xl leading-none text-[var(--red-500)] sm:text-4xl" style={{ fontFamily: "var(--font-bebas)" }}>{value}</p><p className="mt-1 truncate text-[9px] font-semibold text-[var(--text-muted)] sm:text-xs">{label}</p></div>;
}

function SectionTitle({ children, noMargin = false }: { children: React.ReactNode; noMargin?: boolean }) {
  return <h2 className={`${noMargin ? "" : "mb-3"} text-xl text-[var(--foreground)]`} style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.06em" }}>{children}</h2>;
}

function RoutineDistributionRow({ index, name, sessions, percentage }: { index: number; name: string; sessions: number; percentage: number }) {
  const palette = ["var(--red-500)", "var(--amber-500)", "var(--text-muted)"];
  const color = palette[index % palette.length];
  return (
    <div className="grid grid-cols-[2rem_5rem_1fr_auto] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: color }}>{String.fromCharCode(65 + (index % 26))}</div>
      <p className="truncate text-xs font-semibold text-[var(--foreground)]">{name}</p>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${percentage}%`, background: color }} /></div>
      <div className="w-20 text-right text-[10px]"><span className="font-bold text-[var(--foreground)]">{sessions} sessões</span><span className="ml-1 text-[var(--text-dim)]">{percentage.toLocaleString("pt-BR")}%</span></div>
    </div>
  );
}

function HighlightMetric({ label, highlight, suffix }: { label: string; highlight?: ReportHighlight; suffix: string }) {
  return <div className="min-w-0 px-2 text-center"><p className="text-[10px] font-medium text-[var(--text-dim)]">{label}</p><p className="mt-1 text-2xl text-[var(--red-500)]" style={{ fontFamily: "var(--font-bebas)" }}>{highlight ? `${highlight.value.toLocaleString("pt-BR")} ${suffix}` : "—"}</p><p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{highlight?.exerciseName || "Sem dados"}</p>{highlight && <p className="mt-0.5 text-[9px] text-[var(--text-dim)]">{formatDate(highlight.date)}</p>}</div>;
}

function SessionReportRow({ session, number }: { session: ProgramSessionReport; number: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button type="button" aria-expanded={open} onClick={() => { haptic("light"); setOpen((value) => !value); }} className="flex w-full items-center gap-3 px-3 py-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--red-600)] text-sm font-bold text-white">{session.routineName.replace(/^Treino\s*/i, "").slice(0, 2) || "T"}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[var(--foreground)]">{session.routineName}</p><p className="mt-0.5 text-[10px] text-[var(--text-dim)]">{formatDate(session.date)} · Sessão {number}</p></div>
        <p className="text-xs font-bold text-[var(--red-500)]">{session.volume ? `${compactNumber(session.volume)} kg` : "—"}</p>
        <svg className={`h-4 w-4 shrink-0 text-[var(--text-dim)] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/45 px-3 py-3">
          <div className="grid grid-cols-4 divide-x divide-[var(--border)] text-center">
            <SessionMetric label="Séries" value={String(session.sets)} />
            <SessionMetric label="Maior carga" value={session.maxWeight ? `${session.maxWeight} kg` : "—"} />
            <SessionMetric label="Melhor 1RM" value={session.best1RM ? `${session.best1RM.toLocaleString("pt-BR")} kg` : "—"} />
            <SessionMetric label="Duração" value={session.durationSec ? formatDuration(session.durationSec) : "N/D"} />
          </div>
          {session.notes && <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--text-muted)]">{session.notes}</p>}
        </div>
      )}
    </article>
  );
}

function SessionMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-1.5"><p className="text-[9px] text-[var(--text-dim)]">{label}</p><p className="mt-1 truncate text-[11px] font-bold text-[var(--foreground)]">{value}</p></div>;
}

function UnavailableMetric({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center"><p className="text-xs leading-relaxed text-[var(--text-dim)]">{message}</p></div>;
}

function ReportSkeleton() {
  return <div className="min-h-dvh bg-[var(--background)]"><div className="h-16 border-b border-[var(--border)] bg-[var(--surface)]" /><div className="mx-auto max-w-3xl space-y-6 px-4 py-6"><div className="skeleton h-16 w-full" /><div className="skeleton h-28 w-full rounded-2xl" /><div className="skeleton h-64 w-full rounded-2xl" /><div className="skeleton h-40 w-full rounded-2xl" /></div></div>;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}
