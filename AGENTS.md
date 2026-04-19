# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server (Turbopack) at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # Type-check without building
```

If the dev server crashes or port 3000 is stuck:
```bash
taskkill //IM node.exe //F && rm -rf .next
```

Seed the Firestore exercise library (run once, requires `scripts/serviceAccountKey.json`):
```bash
node scripts/seed-exercises.mjs
```

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4 + Firebase (Auth + Firestore) + Firebase Admin SDK (API routes only).

### Design System

**Theme:** Dark-first with red/amber accent palette. CSS variables defined in `globals.css` (`--red-500`, `--amber-500`, `--surface`, `--border`, etc.) — all UI uses `var(--*)` tokens, not raw Tailwind colors.

**Fonts:** Outfit (body/UI, variable `--font-outfit`) + Bebas Neue (display/KPIs, variable `--font-bebas`). Imported via `next/font/google` in `layout.tsx`. Use `style={{ fontFamily: "var(--font-bebas)" }}` for large numbers and section headers.

**Navigation:** `src/components/BottomNav.tsx` — fixed bottom nav bar present on Home, History, and Profile pages. Pages using BottomNav must add `pb-20` to their root container. The Treino and Onboarding pages do NOT use BottomNav (they have their own fixed footers).

**Animations:** Custom keyframes in `globals.css` — `animate-fade-in`, `animate-fade-in-up`, `animate-slide-up`, `animate-scale-in`, `animate-pulse-glow`. Use `.stagger` class on parent to auto-delay children.

**Light mode:** Supported via `@media (prefers-color-scheme: light)` which overrides CSS variables. No `dark:` Tailwind prefixes — everything flows through CSS vars.

### Firestore Collections

| Collection | Description |
|---|---|
| `users/{uid}` | UserProfile (anamnese: goals, level, schedule) |
| `library_exercises/{id}` | Exercise catalog seeded from yuhonas/free-exercise-db |
| `workouts/{id}` | Active/past workouts per user; `routines` subcollection |
| `workouts/{id}/routines/{id}` | Routine with ordered exercises list |
| `workout_history/{id}` | Logged workout sessions with per-set performance + optional notes |

### Key Flows

**Workout generation** (`POST /api/generate-workout`):
1. Client sends Firebase ID token in `Authorization: Bearer <token>` header
2. API route verifies token via Firebase Admin `verifyIdToken`
3. Fetches user profile + full exercise catalog from Firestore (Admin SDK)
4. `src/lib/workoutGenerator.ts` runs a rule-based split (AB/ABC/ABCD/ABCDE/PPL×2) based on `days_per_week`, `goal`, `level`, `time_per_session`, and `medical_restrictions` — no AI/API cost
5. Deactivates previous active workouts and saves new workout+routines via batch write

**Manual workout builder** (`/builder`):
- Route for users with personal trainers to input their own workout plans
- Manages an array of `BuilderRoutine[]` (local types, not exported) with tabs per split (A, B, C…, max 6)
- Uses `ExerciseSearchModal` in `mode="builder"` — chips load muscle groups dynamically from Firestore via `getDistinctMuscleGroups()`, exercise row expands inline to collect sets/reps before confirming
- Saves via `POST /api/save-manual-workout` (same auth + batch-write pattern as `generate-workout`; deactivates previous workout of same `location_type`)
- Does NOT use BottomNav — has its own fixed footer with save button

**Routine view + training** (`/treino?w=WORKOUT_ID&r=ROUTINE_ID`):
- Query-params routing (not nested dynamic routes — those crash Turbopack)
- `useSearchParams` must be wrapped in `<Suspense>` (Next.js 16 requirement)
- Two modes: browse (lazy-load GIFs on expand) and training (per-set weight/reps inputs)
- Training mode pre-fills inputs and loads PR data via `getPerfAndRecords(uid)` — a single Firestore query that returns both `lastPerfMap` (last session per exercise) and `personalRecords` (all-time best 1RM per exercise). Never call `getLastPerformanceMap` and `getPersonalRecords` separately in the treino context; use `getPerfAndRecords` instead.
- While typing a set, if the computed Epley 1RM exceeds the historical PR, a `🏆 Novo PR!` badge (amber, `animate-scale-in`) appears below the set row. The badge hides when the set is marked done.
- Marking a set done triggers the `RestTimer` bottom-sheet (90s default, vibrates on end)
- Exercises can be swapped mid-session via `ExerciseSearchModal` in `mode="swap"` (queries same `target_muscle`; `onSelect` fires immediately and closes modal)
- The `ExerciseCard` header must be a `<div role="button">` (not `<button>`) because the swap button is nested inside it — HTML forbids nested `<button>` elements
- On finish: saves `WorkoutLog` with per-set data + optional notes to `workout_history`

**Exercise performance format:** `ExercisePerformance.sets: SetPerformance[]`. Old logs may have legacy `weight_lifted`/`reps_done` fields — all read paths handle both formats.

**Localization:** The exercise DB is English-only. Two files handle Portuguese output:
- `src/lib/exerciseInstructions.ts` — generates PT-BR instructions from `target_muscle` + `equipment` metadata
- `src/lib/exerciseNames.ts` — translates exercise names via exact lookup dict + word-level fallback. Apply `translateExerciseName(name)` everywhere a `LibraryExercise.name` is displayed.
- `target_muscle` values in Firestore are already in Portuguese (translated at seed time). However, some documents may still have English values — `ExerciseSearchModal` has a local `MUSCLE_NAME_PT` map (mirrors the seed script's `muscleTranslation`) to handle both cases. Any new UI that displays `target_muscle` labels should apply the same translation.

**Strength metrics:** `src/lib/metrics.ts` — pure utility with three exports: `epley1RM(weight, reps)` (Epley formula, guards against NaN/zero), `best1RMFromSets(sets)` (max 1RM across a set array), `totalVolume(sets)` (Σ weight×reps). Used by `getPersonalRecords` in `workoutLogs.ts` and by `ProgressChart`.

**Progress dashboard:** `src/components/ProgressChart.tsx` — `"use client"` recharts component on the Profile page. Fetches the last 60 `workout_history` logs, computes per-session avg 1RM and total volume, renders a `LineChart` with a toggle between the two metrics. Colors are resolved at runtime via `getComputedStyle` (not hardcoded) to respect light/dark mode CSS vars. Minimum 3 data points required to render the chart.

**Streaks:** `src/lib/streaks.ts` → `calculateStreak(logs)` returns `{ weekStreak, thisWeekDays, trainedToday, totalWorkouts }`. Computed on the home page from the last 30 logs (loaded in background after main content).

**Notifications:** `src/lib/notifications.ts` wraps the browser Notifications API. Permission is requested via an in-app banner (once per day via `localStorage`). If already granted and user hasn't trained today, a push notification fires on app open. No backend push service — notifications only work when the browser is running.

### Firebase Initialization Pattern

The client SDK uses lazy singletons in `src/lib/firebase.ts` (`getFirebaseAuth()`, `getFirebaseDb()`). The Admin SDK is initialized on-demand in the API route with `initAdmin()` guarded by `getApps().length`.

### Environment Variables

Copy `.env.local.example` to `.env.local`. `NEXT_PUBLIC_*` vars are client-side (Firebase Client SDK). `FIREBASE_ADMIN_*` vars are server-side only (API routes). `GEMINI_API_KEY` is present but unused — workout generation is rule-based.

### Firestore Security Rules

`firestore.rules` defines the access rules. Deploy manually via Firebase Console → Firestore → Rules. The API route writes workouts/routines via Admin SDK (bypasses client rules); client reads are subject to the rules.

The `workout_history` collection requires a composite index on `(user_id ASC, date DESC)`. If the index is missing, Firestore returns an error with a direct link to create it.

### PWA

`public/sw.js` — Service Worker with cache strategies:
- `/_next/*`: never cached (Next.js manages versioning via content hashing; caching these causes Chrome to freeze on stale JS)
- `/api/*`: network-only
- GitHub raw GIFs (exercise animations): cache-first, separate `mirafit-gifs-v1` cache, capped at 100 entries (FIFO)
- Static assets (`*.png`, `*.svg`, `*.ico`, `manifest.json`): cache-first
- Navigation requests (HTML): network-only

`src/components/ServiceWorkerRegister.tsx` — in **development**, the SW is unregistered and all caches are cleared on mount to prevent Turbopack asset conflicts. In production, the SW is registered and auto-updates every 30 minutes.
