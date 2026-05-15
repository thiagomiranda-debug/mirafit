'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import {
  MODALITY_LABELS,
  deleteCardioSession,
  formatDistance,
  formatDuration,
  formatPace,
  getCardioSessions,
  getCardioPRs,
} from '@/lib/cardioSessions';
import type { CardioModality, CardioSession } from '@/types';
import CardioModalityPicker from '@/components/CardioModalityPicker';
import BottomNav from '@/components/BottomNav';

export default function CardioPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/login');
        return;
      }
      setUser({ uid: u.uid });
      const data = await getCardioSessions(u.uid, 200);
      setSessions(data);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const prs = useMemo(
    () => (sessions.length ? getCardioPRs(sessions) : null),
    [sessions]
  );

  const recentSessions = sessions.slice(0, 5);
  const hasAnySessions = sessions.length > 0;

  const activeModalities = useMemo(
    () =>
      prs
        ? (Object.keys(MODALITY_LABELS) as CardioModality[]).filter(
            (m) => prs[m].sessionsCount4w >= 1
          )
        : [],
    [prs]
  );

  function handleModalitySelect(m: CardioModality) {
    setPickerOpen(false);
    router.push(`/cardio/sessao?m=${m}`);
  }

  async function handleDelete() {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await deleteCardioSession(deleteConfirmId);
      setSessions((prev) => prev.filter((s) => s.id !== deleteConfirmId));
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      {/* Header */}
      <header className="px-5 pb-2 pt-12">
        <h1
          className="text-4xl text-[var(--foreground)]"
          style={{ fontFamily: 'var(--font-bebas)' }}
        >
          Cardio
        </h1>
        <p className="text-sm text-[var(--text-dim)]">
          Registre suas sessões aeróbicas
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 py-4">
        {/* Botão Iniciar sessão */}
        <button
          onClick={() => setPickerOpen(true)}
          className="tactile relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl gradient-red"
        >
          <span className="text-lg">▶</span>
          Iniciar sessão
        </button>

        {/* Loading skeletons */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-[var(--surface-2)]"
              />
            ))}
          </div>
        )}

        {/* Seção PRs */}
        {!loading && activeModalities.length > 0 && prs && (
          <section className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-dim)]">
              Seus PRs
            </p>
            <div className="grid grid-cols-2 gap-3">
              {activeModalities.map((m) => {
                const info = MODALITY_LABELS[m];
                const pr = prs[m];
                return (
                  <div
                    key={m}
                    className="flex flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl">{info.emoji}</span>
                      <span className="text-xs font-bold text-[var(--foreground)]">
                        {info.label}
                      </span>
                    </div>
                    {pr.maxDistanceKm !== undefined && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Maior dist:{' '}
                        <span className="font-semibold text-[var(--foreground)]">
                          {formatDistance(pr.maxDistanceKm)}
                        </span>
                      </p>
                    )}
                    {pr.bestPaceSecPerKm !== undefined && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Melhor pace:{' '}
                        <span className="font-semibold text-[var(--foreground)]">
                          {formatPace(pr.bestPaceSecPerKm)}
                        </span>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {pr.sessionsCount4w} sess. em 4 sem.
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Seção Últimas sessões */}
        {!loading && hasAnySessions && (
          <section className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-dim)]">
              Últimas sessões
            </p>
            <div
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]"
              style={{ overflow: 'hidden' }}
            >
              {recentSessions.map((session) => {
                const info = MODALITY_LABELS[session.modality];
                const dateStr = new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                }).format(session.date);
                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                  >
                    {/* Emoji + label + data */}
                    <span className="text-xl">{info.emoji}</span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-semibold text-[var(--foreground)]">
                        {info.label}
                      </span>
                      <span className="text-xs text-[var(--text-dim)]">
                        {dateStr}
                      </span>
                    </div>

                    {/* Duração + distância */}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-bold text-[var(--foreground)]">
                        {formatDuration(session.duration_sec)}
                      </span>
                      {session.distance_km !== undefined && (
                        <span className="text-xs text-[var(--text-dim)]">
                          {formatDistance(session.distance_km)}
                        </span>
                      )}
                    </div>

                    {/* Botão lixeira */}
                    <button
                      onClick={() => setDeleteConfirmId(session.id ?? null)}
                      className="tactile ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-dim)] transition-colors hover:text-[var(--red-500)]"
                      aria-label="Excluir sessão"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!loading && !hasAnySessions && (
          <div className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-3xl">
              ❤️
            </div>
            <p className="text-base font-bold text-[var(--foreground)]">
              Sua primeira sessão aparece aqui
            </p>
            <p className="text-sm text-[var(--text-dim)]">
              Toque em &apos;Iniciar sessão&apos; para começar
            </p>
          </div>
        )}
      </main>

      <BottomNav />

      {/* Modality Picker */}
      <CardioModalityPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleModalitySelect}
      />

      {/* Delete confirmation modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteConfirmId(null)}
          />
          <div
            className="animate-slide-up relative w-full rounded-t-3xl bg-[var(--surface)] px-5 pb-8 pt-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <div
              className="mx-auto mb-5 h-1 w-12 rounded-full"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            />

            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--red-500)]/15 text-[var(--red-500)]">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">
                  Excluir sessão?
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-dim)]">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl gradient-red disabled:opacity-60"
              >
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
