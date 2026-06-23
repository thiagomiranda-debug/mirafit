"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile } from "@/lib/userProfile";
import { getActiveWorkoutByLocation } from "@/lib/workouts";
import { getCachedWorkoutLogs } from "@/lib/workoutLogsCache";
import { getWorkoutCount } from "@/lib/workoutLogs";
import { calculateStreak, StreakData } from "@/lib/streaks";
import {
  notificationPermission,
  requestNotificationPermission,
  showTrainingReminder,
  alreadyShownToday,
  dismissReminderBanner,
} from "@/lib/notifications";
import { UserProfile, Workout, Routine, WorkoutLog, LocationType, CyclePhase } from "@/types";
import BottomNav from "@/components/BottomNav";
import WorkoutConfigModal from "@/components/WorkoutConfigModal";
import CycleProtectionModal from "@/components/CycleProtectionModal";
import HomeBuilderModal from "@/components/HomeBuilderModal";
import HomeSkeleton from "@/components/skeletons/HomeSkeleton";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";
import { useCountUp, useGreeting } from "@/lib/hooks";
import { haptic } from "@/lib/haptics";
import { getProgramDisplayName } from "@/lib/workoutPrograms";

/** Normaliza Firestore Timestamp (objeto com seconds) ou Date para Date. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDateFn = (value as { toDate: () => Date }).toDate;
    if (typeof toDateFn === 'function') return toDateFn.call(value);
  }
  return null;
}

/** Retorna a próxima rotina considerando apenas sessões do programa ativo. */
function nextRoutineFromHistory(
  routines: Routine[],
  logs: WorkoutLog[],
  workout: Workout
): Routine | undefined {
  if (!routines?.length) return undefined;
  const names = routines.map((r) => r.name);
  const linkedLogs = workout.id
    ? logs.filter((log) => log.workout_id === workout.id)
    : [];

  // Compatibilidade: sessões do programa atual salvas antes do vínculo por ID.
  const createdAt = toDate(workout.created_at);
  const legacyLogs = linkedLogs.length === 0 && createdAt
    ? logs.filter((log) => {
        if (log.workout_id) return false;
        const logDate = log.date instanceof Date ? log.date : new Date(log.date);
        const sameLocation = !log.location_type || log.location_type === workout.location_type;
        return sameLocation && logDate >= createdAt;
      })
    : [];

  const lastDone = [...linkedLogs, ...legacyLogs].find((l) =>
    names.includes(l.routine_name)
  );
  if (!lastDone) return routines[0];
  const idx = names.indexOf(lastDone.routine_name);
  return routines[(idx + 1) % routines.length];
}

type ActiveWorkout = Workout & { routines: Routine[] };

const DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function Home() {
  const greeting = useGreeting();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, loading, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCycleProtection, setShowCycleProtection] = useState(false);
  const [pendingGenArgs, setPendingGenArgs] = useState<{
    loc: LocationType;
    days: number;
    daysOld: number;
    nextPhase: CyclePhase;
  } | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [locationType, setLocationType] = useState<LocationType>("gym");
  const [recentLogs, setRecentLogs] = useState<WorkoutLog[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("mirafit_location") as LocationType | null;
    if (stored) setLocationType(stored);
  }, []);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [p, w] = await Promise.all([
      getUserProfile(user.uid),
      getActiveWorkoutByLocation(user.uid, locationType),
    ]);
    if (!p) {
      const dismissed = sessionStorage.getItem("mirafit_onboarding_dismissed");
      if (!dismissed) setShowOnboardingModal(true);
      setPageLoading(false);
      return;
    }
    setProfile(p);
    setWorkout(w);
    setPageLoading(false);

    getCachedWorkoutLogs(user.uid, 120).then((logs) => {
      const data = calculateStreak(logs);
      setStreak(data);
      setRecentLogs(logs);

      // Total real de treinos via contagem server-side. logs.length é limitado
      // pela janela carregada (≤120), o que subcontava o KPI de usuários ativos.
      getWorkoutCount(user.uid)
        .then((count) =>
          setStreak((prev) =>
            prev ? { ...prev, totalWorkouts: count } : { ...data, totalWorkouts: count }
          )
        )
        .catch(() => {});

      const perm = notificationPermission();
      if (perm === "default" && !alreadyShownToday(user.uid)) {
        setShowNotifBanner(true);
      } else if (perm === "granted" && !data.trainedToday && w && !alreadyShownToday(user.uid)) {
        const nextRoutine = nextRoutineFromHistory(w.routines ?? [], logs, w);
        showTrainingReminder(nextRoutine?.name || "seu treino", user.uid);
      }
    });
  }, [user, locationType]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  async function handleGenerateWorkout(loc: LocationType, daysAvailable: number) {
    if (!user) return;

    // Proteção de ciclo: alerta se treino atual (mesmo local) tem menos de 30 dias
    if (loc === locationType && workout?.created_at) {
      const createdAt = toDate(workout.created_at);
      if (createdAt) {
        const daysOld = (Date.now() - createdAt.getTime()) / 86_400_000;
        if (daysOld < 30) {
          const prevPhase = workout.cycle_phase;
          const nextPhase: CyclePhase = prevPhase === 'acumulacao' ? 'intensificacao' : 'acumulacao';
          setPendingGenArgs({ loc, days: daysAvailable, daysOld, nextPhase });
          setShowCycleProtection(true);
          return;
        }
      }
    }

    await doGenerate(loc, daysAvailable);
  }

  async function doGenerate(loc: LocationType, daysAvailable: number) {
    if (!user) return;
    setGenerating(true);
    setGenError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locationType: loc, daysAvailable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não consegui gerar agora — tenta de novo?");
      if (loc !== locationType) {
        handleLocationChange(loc);
      }
      setShowConfigModal(false);
      await loadData();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Não consegui gerar agora — tenta de novo?");
    } finally {
      setGenerating(false);
    }
  }

  async function handleEnableNotifications() {
    if (!user) return;
    const granted = await requestNotificationPermission();
    setShowNotifBanner(false);
    dismissReminderBanner(user.uid);
    if (granted && workout && streak && !streak.trainedToday) {
      const nextRoutine = nextRoutineFromHistory(
        workout.routines ?? [],
        recentLogs,
        workout
      );
      showTrainingReminder(nextRoutine?.name || "seu treino", user.uid);
    }
  }

  function handleLocationChange(loc: LocationType) {
    setLocationType(loc);
    localStorage.setItem("mirafit_location", loc);
  }

  if (loading || pageLoading) {
    return <HomeSkeleton />;
  }

  if (!user) return null;

  const firstName = profile?.name?.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-24" data-location={locationType}>
      {/* Header */}
      <header className="relative overflow-hidden px-5 pb-5 pt-6">
        {/* Subtle gradient background */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--red-600)]/8 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
              {greeting}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold text-[var(--foreground)]">
              {firstName ? (
                <>
                  Vamos,{" "}
                  <span
                    style={{
                      background: "var(--gradient-accent)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {firstName}
                  </span>
                </>
              ) : (
                "Vamos treinar"
              )}
            </h1>
          </div>
          <Avatar name={firstName} size={36} />
        </div>

        {/* Tags */}
        {profile && (
          <div className="relative mt-3 flex flex-wrap gap-2">
            {[
              `${profile.days_per_week}x/semana`,
              `${profile.time_per_session} min`,
              profile.level.charAt(0).toUpperCase() + profile.level.slice(1),
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* ── Location Toggle ── */}
      <div className="px-4 pb-3">
        <div
          className="relative flex rounded-xl border p-1"
          style={{
            background: "var(--surface-gradient)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {/* Pill animado */}
          <div
            className="absolute top-1 bottom-1 rounded-lg transition-transform duration-400"
            style={{
              left: 4,
              width: "calc(50% - 4px)",
              transform: locationType === "quartel" ? "translateX(100%)" : "translateX(0)",
              background:
                locationType === "quartel"
                  ? "linear-gradient(135deg, var(--amber-600), var(--amber-500))"
                  : "linear-gradient(135deg, var(--red-700), var(--red-600))",
              boxShadow:
                locationType === "quartel"
                  ? "var(--shadow-amber)"
                  : "var(--shadow-red)",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
          <button
            onClick={() => {
              haptic("light");
              handleLocationChange("gym");
            }}
            className={`tactile relative z-10 flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors ${
              locationType === "gym"
                ? "text-white"
                : "text-[var(--text-muted)]"
            }`}
          >
            🏢 Academia
          </button>
          <button
            onClick={() => {
              haptic("light");
              handleLocationChange("quartel");
            }}
            className={`tactile relative z-10 flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors ${
              locationType === "quartel"
                ? "text-white"
                : "text-[var(--text-muted)]"
            }`}
          >
            🚒 Quartel
          </button>
        </div>
      </div>

      <main className="flex flex-1 flex-col gap-4 px-4">
        {/* ── KPI Cards ── */}
        {streak && (
          <div className="stagger grid grid-cols-3 gap-3">
            <KPICard
              value={streak.weekStreak}
              label={streak.weekStreak === 1 ? "Semana" : "Semanas"}
              iconBg="linear-gradient(135deg, rgba(220,38,38,0.25), rgba(220,38,38,0.10))"
              iconColor="#EF4444"
              icon={
                <svg className="h-4 w-4 text-[var(--red-500)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 23c-3.3 0-8-3.1-8-10.2 0-4.5 3.2-8.3 5.6-10.8.4-.4 1-.1 1 .4v3.2c0 .6.7 1 1.2.6C13.5 4.7 15 2.7 16 1c.3-.4.8-.3 1 .1C18.9 4.5 20 8.1 20 12.8 20 19.9 15.3 23 12 23z" />
                </svg>
              }
            />
            <KPICard
              value={streak.totalWorkouts}
              label="Treinos"
              iconBg="linear-gradient(135deg, rgba(245,158,11,0.25), rgba(245,158,11,0.10))"
              iconColor="#F59E0B"
              icon={
                <svg className="h-4 w-4 text-[var(--amber-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <KPICard
              value={streak.thisWeekDays.filter(Boolean).length}
              fraction={profile?.days_per_week || 0}
              label="Esta semana"
              iconBg="linear-gradient(135deg, rgba(34,197,94,0.25), rgba(34,197,94,0.10))"
              iconColor="#22C55E"
              icon={
                streak.trainedToday ? (
                  <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )
              }
            />
          </div>
        )}

        {/* ── Week dots ── */}
        {streak && (
          <div
            className="animate-fade-in flex items-center justify-between rounded-2xl px-5 py-3.5"
            style={{
              background: "var(--surface-gradient)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-semibold text-[var(--text-dim)]">
                  {label}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    streak.thisWeekDays[i]
                      ? "text-white"
                      : "text-[var(--text-dim)]"
                  }`}
                  style={
                    streak.thisWeekDays[i]
                      ? {
                          background:
                            "linear-gradient(135deg, var(--red-500), var(--red-600))",
                          boxShadow: "var(--glow-red)",
                          border: "1px solid rgba(239,68,68,0.5)",
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }
                  }
                >
                  {streak.thisWeekDays[i] ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Notification banner ── */}
        {showNotifBanner && (
          <div className="animate-fade-in flex items-center justify-between rounded-2xl border border-[var(--amber-500)]/20 bg-[var(--amber-500)]/8 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--amber-400)]">
                Ativar lembretes
              </p>
              <p className="text-xs text-[var(--amber-500)]/70">
                Receba notificações nos seus dias de treino
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnableNotifications}
                className="rounded-xl bg-[var(--amber-500)] px-3.5 py-1.5 text-xs font-bold text-black transition-colors hover:bg-[var(--amber-400)]"
              >
                Ativar
              </button>
              <button
                onClick={() => {
                  setShowNotifBanner(false);
                  if (user) dismissReminderBanner(user.uid);
                }}
                className="text-[var(--amber-500)]/60 hover:text-[var(--amber-500)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Generate button ── */}
        <button
          onClick={() => { haptic("medium"); setShowConfigModal(true); }}
          disabled={generating || !profile}
          className="tactile shimmer-overlay animate-fade-in-up group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-4 text-sm font-bold text-white transition-all disabled:opacity-60 gradient-red"
          style={{ boxShadow: "var(--shadow-red)" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
          {generating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Gerando seu treino...
            </>
          ) : workout ? (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Gerar meu treino
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Gerar meu treino
            </>
          )}
        </button>

        {/* ── Manual builder button ── */}
        <button
          onClick={() => { haptic("light"); setShowBuilderModal(true); }}
          className="tactile animate-fade-in-up flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-4 text-sm font-bold text-[var(--foreground)] transition-all hover:border-[var(--red-500)]/30 hover:bg-[var(--surface-2)]"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Montar manualmente
        </button>

        {genError && (
          <p className="text-center text-sm font-medium text-[var(--red-500)]">{genError}</p>
        )}

        {/* ── Active workout ── */}
        {workout ? (
          <div className="animate-fade-in-up">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className="text-base text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.12em" }}
                >
                  PROGRAMA ATIVO
                </h2>
                <p className="truncate text-xs font-semibold text-[var(--text-muted)]">
                  {getProgramDisplayName(workout)}
                </p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--red-600)]/15 px-3 py-1 text-xs font-bold text-[var(--red-500)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--red-500)] animate-pulse" />
                Ativo
              </span>
            </div>
            <div className="stagger space-y-2.5">
              {workout.routines.map((routine) => (
                <RoutineCard key={routine.id} routine={routine} workoutId={workout.id!} />
              ))}
            </div>
          </div>
        ) : !generating && (
          <EmptyState
            icon="💪"
            title="PRONTO PRA COMEÇAR?"
            description="Gere seu primeiro treino e bora suar."
          />
        )}
      </main>

      <BottomNav />

      {showConfigModal && (
        <WorkoutConfigModal
          initialLocationType={locationType}
          onGenerate={handleGenerateWorkout}
          onClose={() => setShowConfigModal(false)}
          generating={generating}
        />
      )}

      {showCycleProtection && pendingGenArgs && (
        <CycleProtectionModal
          daysOld={pendingGenArgs.daysOld}
          nextPhase={pendingGenArgs.nextPhase}
          onCancel={() => {
            setShowCycleProtection(false);
            setPendingGenArgs(null);
          }}
          onConfirm={async () => {
            const args = pendingGenArgs;
            setShowCycleProtection(false);
            setPendingGenArgs(null);
            await doGenerate(args.loc, args.days);
          }}
        />
      )}

      {showBuilderModal && (
        <HomeBuilderModal onClose={() => setShowBuilderModal(false)} />
      )}

      {showOnboardingModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6 pt-20">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 animate-slide-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--red-600)]/15">
              <svg
                className="h-7 w-7 text-[var(--red-500)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h2
              className="mb-2 text-center text-3xl text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-bebas)" }}
            >
              CONFIGURE SEU PERFIL
            </h2>
            <p className="mb-6 text-center text-sm text-[var(--text-muted)]">
              Para gerar treinos precisos, precisamos conhecer seu nível, objetivos e
              disponibilidade.
            </p>
            <button
              onClick={() => router.push("/onboarding")}
              className="mb-3 w-full rounded-xl py-3 text-sm font-bold text-white gradient-red transition-all hover:shadow-md hover:shadow-[var(--red-600)]/20"
            >
              Começar
            </button>
            <button
              onClick={() => {
                sessionStorage.setItem("mirafit_onboarding_dismissed", "1");
                setShowOnboardingModal(false);
              }}
              className="w-full py-2 text-sm font-medium text-[var(--text-dim)] transition-colors hover:text-[var(--text-muted)]"
            >
              Mais tarde
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoutineCard({ routine, workoutId }: { routine: Routine; workoutId: string }) {
  // Tempo estimado: ~90s/set + 30s/exercício de transição
  const totalSets = routine.exercises.reduce((acc, ex) => acc + ex.sets, 0);
  const estMinutes = Math.round((totalSets * 90 + routine.exercises.length * 30) / 60);
  const primaryMuscle = (routine.exercises[0] as unknown as Record<string, string> | undefined)?.target_muscle;
  const muscleLabel = primaryMuscle
    ? primaryMuscle.charAt(0).toUpperCase() + primaryMuscle.slice(1)
    : null;

  return (
    <Link
      href={`/treino?w=${workoutId}&r=${routine.id}`}
      onClick={() => haptic("light")}
      className="tactile animate-fade-in group relative flex items-center justify-between overflow-hidden rounded-2xl px-4 py-3.5 transition-all hover:border-[var(--red-600)]/30"
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px]"
        style={{
          background: "linear-gradient(180deg, var(--red-500), transparent)",
        }}
      />
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(220,38,38,0.25), rgba(220,38,38,0.10))",
            boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.2)",
          }}
        >
          <svg className="h-5 w-5 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-[var(--foreground)]">
            {routine.name}
            {muscleLabel && (
              <span className="font-medium text-[var(--text-muted)]"> · {muscleLabel}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">
            {routine.exercises.length} exercícios · ~{estMinutes} min
          </p>
        </div>
      </div>
      <svg className="h-5 w-5 text-[var(--text-dim)] transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function KPICard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  fraction,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
  /** Quando presente, renderiza "value/total" (ex: 2/3) */
  fraction?: number;
}) {
  const animated = useCountUp(value);
  return (
    <div
      className="animate-fade-in relative overflow-hidden rounded-2xl p-3.5"
      style={{
        background: "var(--surface-gradient)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Top inner highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
        }}
      />
      <div
        className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg"
        style={{
          background: iconBg,
          boxShadow: `inset 0 0 0 1px ${iconColor}33`,
        }}
      >
        {icon}
      </div>
      <p
        className="text-3xl font-bold leading-none"
        style={{
          fontFamily: "var(--font-bebas)",
          background: "var(--gradient-num)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {animated}
        {fraction !== undefined && (
          <span className="text-lg text-[var(--text-dim)]">/{fraction}</span>
        )}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
        {label}
      </p>
    </div>
  );
}
