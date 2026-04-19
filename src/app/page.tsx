"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile } from "@/lib/userProfile";
import { getActiveWorkoutByLocation } from "@/lib/workouts";
import { getWorkoutLogs } from "@/lib/workoutLogs";
import { calculateStreak, StreakData } from "@/lib/streaks";
import {
  notificationPermission,
  requestNotificationPermission,
  showTrainingReminder,
  alreadyShownToday,
  dismissReminderBanner,
} from "@/lib/notifications";
import { UserProfile, Workout, Routine, LocationType } from "@/types";
import BottomNav from "@/components/BottomNav";
import WorkoutConfigModal from "@/components/WorkoutConfigModal";

type ActiveWorkout = Workout & { routines: Routine[] };

const DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [locationType, setLocationType] = useState<LocationType>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("mirafit_location") as LocationType) || "gym";
    }
    return "gym";
  });
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

    getWorkoutLogs(user.uid, 30).then((logs) => {
      const data = calculateStreak(logs);
      setStreak(data);

      const perm = notificationPermission();
      if (perm === "default" && !alreadyShownToday(user.uid)) {
        setShowNotifBanner(true);
      } else if (perm === "granted" && !data.trainedToday && w && !alreadyShownToday(user.uid)) {
        const nextRoutine = w.routines?.[0];
        showTrainingReminder(nextRoutine?.name || "seu treino", user.uid);
      }
    });
  }, [user, locationType]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  async function handleGenerateWorkout(loc: LocationType, daysAvailable: number) {
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
      if (!res.ok) throw new Error(data.error || "Erro ao gerar treino");
      // Se o local gerado for diferente do atual, atualiza o toggle
      if (loc !== locationType) {
        handleLocationChange(loc);
      }
      setShowConfigModal(false);
      await loadData();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Erro ao gerar treino");
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
      const nextRoutine = workout.routines?.[0];
      showTrainingReminder(nextRoutine?.name || "seu treino", user.uid);
    }
  }

  function handleLocationChange(loc: LocationType) {
    setLocationType(loc);
    localStorage.setItem("mirafit_location", loc);
  }

  if (loading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  if (!user || !profile) return null;

  const firstName = profile.name.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20" data-location={locationType}>
      {/* Header */}
      <header className="relative overflow-hidden px-5 pb-5 pt-6">
        {/* Subtle gradient background */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--red-600)]/8 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-dim)]">
              Bem-vindo
            </p>
            <h1 className="mt-0.5 text-2xl font-bold text-[var(--foreground)]">
              {firstName}
            </h1>
          </div>
          <button
            onClick={signOut}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-dim)] transition-colors hover:text-[var(--foreground)]"
            title="Sair"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        {/* Tags */}
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
      </header>

      {/* ── Location Toggle ── */}
      <div className="px-4 pb-3">
        <div className="flex rounded-xl bg-[var(--surface)] p-1 border border-[var(--border)]">
          <button
            onClick={() => handleLocationChange("gym")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
              locationType === "gym"
                ? "bg-[var(--red-600)] text-white shadow-md"
                : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            🏢 Academia
          </button>
          <button
            onClick={() => handleLocationChange("quartel")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
              locationType === "quartel"
                ? "bg-[var(--amber-600)] text-white shadow-md"
                : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
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
            {/* Streak */}
            <div className="animate-fade-in rounded-2xl bg-[var(--surface)] p-3.5 border border-[var(--border)]">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--red-600)]/15">
                <svg className="h-4 w-4 text-[var(--red-500)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 23c-3.3 0-8-3.1-8-10.2 0-4.5 3.2-8.3 5.6-10.8.4-.4 1-.1 1 .4v3.2c0 .6.7 1 1.2.6C13.5 4.7 15 2.7 16 1c.3-.4.8-.3 1 .1C18.9 4.5 20 8.1 20 12.8 20 19.9 15.3 23 12 23z" />
                </svg>
              </div>
              <p
                className="text-3xl font-bold leading-none text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {streak.weekStreak}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
                {streak.weekStreak === 1 ? "Semana" : "Semanas"}
              </p>
            </div>

            {/* Total Workouts */}
            <div className="animate-fade-in rounded-2xl bg-[var(--surface)] p-3.5 border border-[var(--border)]">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--amber-500)]/15">
                <svg className="h-4 w-4 text-[var(--amber-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p
                className="text-3xl font-bold leading-none text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {streak.totalWorkouts}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
                Treinos
              </p>
            </div>

            {/* This Week */}
            <div className="animate-fade-in rounded-2xl bg-[var(--surface)] p-3.5 border border-[var(--border)]">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--success)]/15">
                {streak.trainedToday ? (
                  <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <p
                className="text-3xl font-bold leading-none text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-bebas)" }}
              >
                {streak.thisWeekDays.filter(Boolean).length}
                <span className="text-lg text-[var(--text-dim)]">/{profile.days_per_week}</span>
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
                Esta semana
              </p>
            </div>
          </div>
        )}

        {/* ── Week dots ── */}
        {streak && (
          <div className="animate-fade-in flex items-center justify-between rounded-2xl bg-[var(--surface)] px-5 py-3.5 border border-[var(--border)]">
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-semibold text-[var(--text-dim)]">
                  {label}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    streak.thisWeekDays[i]
                      ? "bg-[var(--red-600)] text-white shadow-[0_0_12px_rgba(220,38,38,0.3)]"
                      : "bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
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
          onClick={() => setShowConfigModal(true)}
          disabled={generating}
          className="animate-fade-in-up group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-60 gradient-red animate-pulse-glow"
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
              Gerar Novo Treino
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Gerar Treino Automático
            </>
          )}
        </button>

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

        {genError && (
          <p className="text-center text-sm font-medium text-[var(--red-500)]">{genError}</p>
        )}

        {/* ── Active workout ── */}
        {workout ? (
          <div className="animate-fade-in-up">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--foreground)]">
                Treino {workout.workout_type}
              </h2>
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
          <div className="animate-fade-in rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
              <svg className="h-6 w-6 text-[var(--text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--text-muted)]">Nenhum treino ativo</p>
            <p className="mt-1 text-xs text-[var(--text-dim)]">
              Gere seu primeiro treino para começar
            </p>
          </div>
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
    </div>
  );
}

function RoutineCard({ routine, workoutId }: { routine: Routine; workoutId: string }) {
  return (
    <Link
      href={`/treino?w=${workoutId}&r=${routine.id}`}
      className="animate-fade-in group flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 transition-all hover:border-[var(--red-600)]/30 hover:bg-[var(--surface-2)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--red-600)]/10">
          <svg className="h-5 w-5 text-[var(--red-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-[var(--foreground)]">{routine.name}</p>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">
            {routine.exercises.length} exercícios
          </p>
        </div>
      </div>
      <svg className="h-5 w-5 text-[var(--text-dim)] transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
