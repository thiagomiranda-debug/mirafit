# MiraFit - Plano de Execucao

## Stack
- Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Firebase Auth (Email/Google) + Firestore
- Google Gemini API (gemini-2.0-flash) — server-side only
- Seed: yuhonas/free-exercise-db
- PWA Mobile-First

## Etapas

### Etapa 1 — Setup e Infraestrutura [CONCLUIDA]
- Projeto Next.js com TypeScript + Tailwind
- Firebase Client SDK (Auth + Firestore)
- Firebase Admin SDK (API Routes)
- Types completos (UserProfile, LibraryExercise, Workout, Routine, WorkoutLog, ExercisePerformance)
- PWA: manifest.json, icones, viewport

### Etapa 2 — Auth, Onboarding, Seed e Geracao de Treino [CONCLUIDA]
- Login/Signup (email + Google OAuth)
- Onboarding multi-step (anamnese: dados pessoais, disponibilidade, objetivo)
- Script seed-exercises.mjs (popula library_exercises no Firestore)
- API Route /api/generate-workout (Gemini server-side, prompt restrito, validacao de IDs)
- Home page com perfil resumido, botao gerar treino, cards de rotinas

### Etapa 3 — Tela de Rotina + Midia [CONCLUIDA]
- Pagina /routine/[workoutId]/[routineId]
- Fetch de exercicios do library_exercises (nome real, GIF, instrucoes)
- GIFs lazy-loaded com spinner e fallback
- Cards expandiveis com grupo muscular, sets/reps, instrucoes
- Navegacao da home para pagina de rotina
- Fix: .env.local.example com variaveis Firebase Admin
- Fix: firebase-admin movido para dependencies

### Etapa 4 — Execucao de Treino + WorkoutLog [CONCLUIDA]
- Modo "treinar agora" na pagina de rotina
- Inputs de peso e reps por serie ao lado de cada exercicio
- Timer de descanso entre series (opcional)
- Botao "Finalizar Treino" salva WorkoutLog no Firestore (colecao workout_history)
- Lib workoutLogs.ts com funcoes de salvar/buscar

### Etapa 5 — Historico de Treinos [CONCLUIDA]
- Pagina /history com lista de treinos passados
- Detalhes de cada log (exercicios, cargas, reps)
- Evolucao de cargas por exercicio

### Etapa 6 — Perfil e Edicao [CONCLUIDA]
- Pagina /profile com dados da anamnese
- Edicao dos dados (usa updateUserProfile ja existente)
- Opcao de gerar novo treino apos editar perfil

### Etapa 7 — PWA Offline + Polish + Seguranca [CONCLUIDA]
- Service Worker registration (public/sw.js + ServiceWorkerRegister.tsx)
- Firestore Security Rules (firestore.rules — deploy manual no console)
- Auth no API Route (verifyIdToken via Firebase Admin)
- Error Boundary global (ErrorBoundary.tsx)
- Testes finais de fluxo completo
