'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';
import type { CardioModality } from '@/types';
import {
  MODALITY_LABELS,
  createCardioSession,
  formatDuration,
} from '@/lib/cardioSessions';

const LS_KEY = 'mirafit_cardio_active';
const VALID_MODALITIES = new Set(Object.keys(MODALITY_LABELS));

interface PersistedSession {
  startedAtMs: number | null;
  accumulatedMs: number;
  modality: string;
}

function persistSession(
  startedAtMs: number | null,
  accumulatedMs: number,
  modality: string
) {
  if (typeof window === 'undefined') return;
  const data: PersistedSession = { startedAtMs, accumulatedMs, modality };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function clearPersistedSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_KEY);
}

// ─── Inner component (uses useSearchParams) ──────────────────────────────────

function CardioSessaoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawModality = searchParams.get('m') ?? '';

  // Validate modality
  const modality: CardioModality | null = VALID_MODALITIES.has(rawModality)
    ? (rawModality as CardioModality)
    : null;

  // Redirect if invalid
  useEffect(() => {
    if (!modality) {
      router.replace('/cardio');
    }
  }, [modality, router]);

  const modalityInfo = modality ? MODALITY_LABELS[modality] : null;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = auth.onAuthStateChanged((u) => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  // ── Stopwatch state ──────────────────────────────────────────────────────
  const startedAtRef = useRef<number | null>(null);
  const accumulatedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // ── Phase ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<'running' | 'paused' | 'summary'>('running');

  // ── Summary state ────────────────────────────────────────────────────────
  const [editingTime, setEditingTime] = useState(false);
  const [summaryMin, setSummaryMin] = useState('');
  const [summarySec, setSummarySec] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Tick fn ───────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const now = Date.now();
    const elapsed =
      accumulatedRef.current + (startedAtRef.current ? now - startedAtRef.current : 0);
    setElapsedMs(elapsed);
  }, []);

  // ── Start interval ────────────────────────────────────────────────────────
  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 100);
  }, [tick]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Hydrate from localStorage on mount ───────────────────────────────────
  useEffect(() => {
    if (!modality) return;

    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const saved: PersistedSession = JSON.parse(raw);
        if (saved.modality === modality) {
          let accumulated = saved.accumulatedMs;
          if (saved.startedAtMs !== null) {
            // Was running when interrupted — add elapsed since then
            accumulated += Date.now() - saved.startedAtMs;
          }
          accumulatedRef.current = accumulated;
          startedAtRef.current = Date.now();
          setElapsedMs(accumulated);
        }
      } catch {
        // ignore corrupted data
      }
    }

    // Start running immediately
    startedAtRef.current = startedAtRef.current ?? Date.now();
    startInterval();

    return () => stopInterval();
  }, [modality, startInterval, stopInterval]);

  // ── visibilitychange ─────────────────────────────────────────────────────
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        // Save to localStorage before going to background
        if (phase !== 'summary') {
          persistSession(startedAtRef.current, accumulatedRef.current, modality ?? '');
        }
      } else {
        // Came back — recalculate immediately
        tick();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [phase, modality, tick]);

  // ── beforeunload ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (phase !== 'summary' && elapsedMs > 30000) {
        e.preventDefault();
        return '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase, elapsedMs]);

  // ── Pause ─────────────────────────────────────────────────────────────────
  function handlePause() {
    accumulatedRef.current += Date.now() - (startedAtRef.current ?? Date.now());
    startedAtRef.current = null;
    stopInterval();
    tick();
    setPhase('paused');
    persistSession(null, accumulatedRef.current, modality ?? '');
  }

  // ── Resume ────────────────────────────────────────────────────────────────
  function handleResume() {
    startedAtRef.current = Date.now();
    persistSession(startedAtRef.current, accumulatedRef.current, modality ?? '');
    setPhase('running');
    startInterval();
  }

  // ── Finalizar ─────────────────────────────────────────────────────────────
  function handleFinish() {
    stopInterval();

    // Freeze elapsed
    const now = Date.now();
    const frozen =
      accumulatedRef.current + (startedAtRef.current ? now - startedAtRef.current : 0);
    startedAtRef.current = null;
    accumulatedRef.current = frozen;
    setElapsedMs(frozen);

    const elapsedSec = Math.floor(frozen / 1000);
    setSummaryMin(String(Math.floor(elapsedSec / 60)));
    setSummarySec(String(Math.round(elapsedSec % 60)));
    setPhase('summary');
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!modality || !uid) return;
    setSaveError(null);

    const minVal = parseInt(summaryMin, 10);
    const secVal = parseInt(summarySec, 10);

    if (isNaN(minVal) || isNaN(secVal) || minVal < 0 || secVal < 0 || secVal > 59) {
      setSaveError('Informe um tempo válido (minutos e segundos de 0 a 59).');
      return;
    }

    const durationSec = minVal * 60 + secVal;
    if (durationSec < 10) {
      setSaveError('A duração mínima é de 10 segundos.');
      return;
    }

    let distKm: number | undefined;
    if (distanceKm.trim() !== '') {
      const normalized = distanceKm.replace(',', '.');
      const parsed = parseFloat(normalized);
      if (isNaN(parsed) || parsed <= 0 || parsed > 100) {
        setSaveError('Distância inválida. Informe um valor entre 0,1 e 100 km.');
        return;
      }
      distKm = parsed;
    }

    setSaving(true);
    try {
      await createCardioSession({
        user_id: uid,
        date: new Date(),
        modality,
        duration_sec: durationSec,
        ...(distKm !== undefined ? { distance_km: distKm } : {}),
      });
      clearPersistedSession();
      router.push('/cardio');
    } catch {
      setSaveError('Erro ao salvar. Tente novamente.');
      setSaving(false);
    }
  }

  // ── Discard ───────────────────────────────────────────────────────────────
  function handleDiscard() {
    stopInterval();
    clearPersistedSession();
    router.push('/cardio');
  }

  // ── Display helpers ───────────────────────────────────────────────────────
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const tenths = Math.floor((elapsedMs % 1000) / 100);
  const timeDisplay = `${formatDuration(elapsedSec)}.${tenths}`;

  const summaryDurationSec =
    (parseInt(summaryMin, 10) || 0) * 60 + (parseInt(summarySec, 10) || 0);

  if (!modality || !modalityInfo) return null;

  // ── Render: running / paused ──────────────────────────────────────────────
  if (phase !== 'summary') {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{
          background: 'var(--surface)',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-outfit)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pt-10 pb-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1 text-sm"
            style={{ color: 'var(--text-dim)' }}
            aria-label="Voltar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Voltar
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xl">{modalityInfo.emoji}</span>
            <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {modalityInfo.label}
            </span>
          </div>

          {/* spacer */}
          <div style={{ width: 72 }} />
        </div>

        {/* Stopwatch display */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
          <div
            className="tabular-nums leading-none"
            style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(64px, 20vw, 96px)',
              letterSpacing: '0.02em',
              color: phase === 'running' ? 'var(--red-500)' : 'var(--text-dim)',
              transition: 'color 0.3s ease',
            }}
          >
            {timeDisplay}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            {phase === 'running' ? (
              <button
                onClick={handlePause}
                className="tactile flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
                Pausar
              </button>
            ) : (
              <button
                onClick={handleResume}
                className="tactile flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Retomar
              </button>
            )}

            <button
              onClick={handleFinish}
              className="tactile px-6 py-3 rounded-xl font-semibold text-sm"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
              }}
            >
              Finalizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: summary ───────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col px-4 pt-10 pb-8 animate-fade-in"
      style={{
        background: 'var(--surface)',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-outfit)',
      }}
    >
      {/* Title */}
      <h1
        className="text-xl font-bold mb-1"
        style={{ color: 'var(--foreground)' }}
      >
        Resumo da sessão
      </h1>
      <div
        className="flex items-center gap-2 mb-8"
        style={{ color: 'var(--text-dim)' }}
      >
        <span className="text-xl">{modalityInfo.emoji}</span>
        <span className="font-medium">{modalityInfo.label}</span>
      </div>

      {/* Duration */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-between mb-3"
          style={{ color: 'var(--text-dim)' }}
        >
          <span className="text-sm font-medium uppercase tracking-wider">Duração</span>
          <button
            onClick={() => setEditingTime((v) => !v)}
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--amber-500)' }}
            aria-label={editingTime ? 'Fechar edição de tempo' : 'Editar tempo'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {editingTime ? 'Fechar' : 'Editar tempo'}
          </button>
        </div>

        {editingTime ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label
                className="block text-xs mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Minutos
              </label>
              <input
                type="number"
                min="0"
                max="999"
                inputMode="numeric"
                value={summaryMin}
                onChange={(e) => setSummaryMin(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-center text-lg font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-bebas)',
                  letterSpacing: '0.04em',
                }}
              />
            </div>

            <span
              className="text-3xl font-bold mt-4"
              style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-bebas)' }}
            >
              :
            </span>

            <div className="flex-1">
              <label
                className="block text-xs mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Segundos
              </label>
              <input
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                value={summarySec}
                onChange={(e) => setSummarySec(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-center text-lg font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-bebas)',
                  letterSpacing: '0.04em',
                }}
              />
            </div>
          </div>
        ) : (
          <div
            className="tabular-nums leading-none text-center"
            style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(48px, 16vw, 72px)',
              letterSpacing: '0.02em',
              color: 'var(--foreground)',
            }}
          >
            {formatDuration(summaryDurationSec)}
          </div>
        )}
      </div>

      {/* Distance */}
      <div
        className="rounded-2xl p-5 mb-8"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <label
          className="block text-sm font-medium uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-dim)' }}
          htmlFor="distance-input"
        >
          Distância (opcional)
        </label>
        <div className="flex items-center gap-3">
          <input
            id="distance-input"
            type="text"
            inputMode="decimal"
            placeholder="0,0"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            className="flex-1 rounded-xl px-4 py-3 text-lg font-bold"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-bebas)',
              letterSpacing: '0.04em',
            }}
          />
          <span
            className="font-semibold text-base"
            style={{ color: 'var(--text-dim)' }}
          >
            km
          </span>
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl font-bold text-base mb-3"
        style={{
          background: saving
            ? 'var(--surface-2)'
            : 'linear-gradient(135deg, var(--red-600), var(--red-500))',
          color: saving ? 'var(--text-muted)' : '#fff',
          border: 'none',
          opacity: saving ? 0.7 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>

      <button
        onClick={handleDiscard}
        disabled={saving}
        className="w-full py-4 rounded-2xl font-semibold text-base"
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
        }}
      >
        Descartar
      </button>

      {saveError && (
        <p
          className="mt-4 text-sm text-center animate-fade-in"
          style={{ color: 'var(--red-500)' }}
        >
          {saveError}
        </p>
      )}
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function CardioSessaoPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--surface)', color: 'var(--text-dim)' }}
        >
          <div className="text-sm">Carregando…</div>
        </div>
      }
    >
      <CardioSessaoContent />
    </Suspense>
  );
}
