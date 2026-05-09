# Polish Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar polish visual e de interação consistente em todas as telas do MiraFit, elevando a percepção de qualidade do app sem mudar funcionalidade. Baseado na spec [2026-05-09-polish-premium-design.md](../specs/2026-05-09-polish-premium-design.md).

**Architecture:** Adições não-quebradoras — novos design tokens em `globals.css`, novos utilitários (`haptics`, `useCountUp`), novos componentes (skeletons, `EmptyState`, `Avatar`), e refinamentos pontuais nas pages e componentes existentes. Sem mudança de arquitetura, sem novas dependências.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, CSS variables, Web Animations API. Nenhuma biblioteca nova.

**Verification (no tests in this codebase):** Cada task termina com `npm run lint && npx tsc --noEmit` + verificação visual em `npm run dev` (dev server roda em http://localhost:3000). Build final no fim de cada fase com `npm run build`.

**Commit cadence:** Um commit por task. Mensagens em PT-BR seguindo o padrão `feat(scope):` / `fix(scope):` / `style(scope):` do repo.

---

## Pré-requisitos

- [ ] **Garantir dev server rodando** — `npm run dev` em background. Manter aberto pra verificação visual ao longo do plano.
- [ ] **Branch limpa** — confirmar `git status` clean (sem mudanças não-commitadas além do `.claude/settings.local.json` e `mirafit-setup/` que são pré-existentes).

---

## FASE 1 — Foundations (tokens + utils)

Estabelece base reutilizada por todas as fases seguintes. Sem mudanças visíveis isoladas — habilita o resto.

---

### Task 1: Adicionar design tokens em `globals.css`

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Inserir novos tokens no `:root`**

Após a linha `--error: #EF4444;` (atual linha 28), adicionar:

```css
  /* ── Layered surfaces ── */
  --surface-gradient: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  --surface-gradient-active: linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02));
  --border-subtle: rgba(255,255,255,0.06);
  --border-active: rgba(239,68,68,0.4);

  /* ── Multi-layer shadows ── */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3);
  --shadow-red: 0 8px 24px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
  --shadow-amber: 0 8px 24px rgba(245,158,11,0.30), inset 0 1px 0 rgba(255,255,255,0.2);

  /* ── Glow effects ── */
  --glow-red: 0 0 16px rgba(239,68,68,0.4);
  --glow-amber: 0 0 16px rgba(251,191,36,0.4);
  --glow-success: 0 0 12px rgba(34,197,94,0.4);

  /* ── Gradient text ── */
  --gradient-accent: linear-gradient(90deg, #EF4444, #FBBF24);
  --gradient-num: linear-gradient(180deg, #FFFFFF, #C0C0C8);
```

- [ ] **Step 2: Adicionar overrides no light mode**

Dentro do bloco `@media (prefers-color-scheme: light) { :root { ... } }`, adicionar antes do `}` final:

```css
    --surface-gradient: linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.01));
    --surface-gradient-active: linear-gradient(180deg, rgba(220,38,38,0.06), rgba(220,38,38,0.01));
    --border-subtle: rgba(0,0,0,0.06);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
    --gradient-num: linear-gradient(180deg, #111113, #4B5563);
```

- [ ] **Step 3: Adicionar utility classes para shimmer e tactile no fim do arquivo**

```css
/* ── Tactile press (uso global em botões) ── */
.tactile {
  transition: transform 150ms ease-out;
}
.tactile:active {
  transform: scale(0.97);
}

/* ── Shimmer overlay (para CTAs premium) ── */
.shimmer-overlay {
  position: relative;
  overflow: hidden;
}
.shimmer-overlay::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  animation: shimmer-sweep 3s infinite;
  pointer-events: none;
}
@keyframes shimmer-sweep {
  0% { left: -100%; }
  100% { left: 200%; }
}

/* ── Skeleton shimmer ── */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface) 0%,
    var(--surface-2) 50%,
    var(--surface) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 8px;
}
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors. Abrir http://localhost:3000 — UI atual deve renderizar normalmente (tokens novos não estão sendo usados ainda).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "style(tokens): adiciona design tokens premium (surface-gradient, shadows, glows, shimmer)"
```

---

### Task 2: Criar utilitário de haptics

**Files:**
- Create: `src/lib/haptics.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// src/lib/haptics.ts
/**
 * Wrapper sobre navigator.vibrate com 3 níveis semânticos.
 * Degrada silenciosamente em browsers/iOS sem suporte.
 */

type HapticLevel = "light" | "medium" | "success" | "error";

const PATTERNS: Record<HapticLevel, number | number[]> = {
  light: 10,           // toggle, tab change, expand
  medium: 25,          // set done, save, swap
  success: [10, 40, 10],   // finish workout, PR batido
  error: [50, 30, 50, 30, 50],  // erros bloqueantes
};

export function haptic(level: HapticLevel = "light"): void {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[level]);
  } catch {
    // graceful degradation — alguns browsers tem permissão restrita
  }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/haptics.ts
git commit -m "feat(lib): adiciona haptics utility com 4 niveis semanticos"
```

---

### Task 3: Criar hook `useCountUp`

**Files:**
- Create: `src/lib/hooks.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// src/lib/hooks.ts
import { useEffect, useRef, useState } from "react";

/**
 * Anima um número de 0 ao target em `duration` ms (easing easeOutCubic).
 * Roda apenas uma vez por mount. Retorna o valor atual da animação.
 *
 * Use para KPIs (Streak, Total, Esta semana) que aparecem no load.
 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (startedRef.current) {
      // Se o target mudar depois do mount, snap pro valor sem reanimar
      setValue(target);
      return;
    }
    startedRef.current = true;

    if (target <= 0) {
      setValue(0);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/**
 * Saudação contextual baseada na hora local. Use no header da Home.
 */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState("Bem-vindo");

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) setGreeting("Bom dia");
    else if (h >= 12 && h < 18) setGreeting("Boa tarde");
    else setGreeting("Boa noite");
  }, []);

  return greeting;
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks.ts
git commit -m "feat(lib): adiciona useCountUp e useGreeting hooks"
```

---

### Task 4: Criar componente `Avatar`

**Files:**
- Create: `src/components/Avatar.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
// src/components/Avatar.tsx
"use client";

interface AvatarProps {
  /** Nome completo. A inicial é extraída do primeiro caractere. */
  name?: string | null;
  /** Tamanho em px. Default 36. */
  size?: number;
  /** Adicionado como onClick handler — quando presente vira clicável. */
  onClick?: () => void;
  className?: string;
}

export default function Avatar({
  name,
  size = 36,
  onClick,
  className = "",
}: AvatarProps) {
  const initial = (name?.trim()[0] || "?").toUpperCase();
  const interactive = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`tactile flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-md ${
        interactive ? "cursor-pointer" : "cursor-default"
      } ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: "linear-gradient(135deg, var(--red-600), var(--amber-500))",
        boxShadow:
          "0 0 0 1.5px rgba(255,255,255,0.08), 0 4px 12px rgba(220,38,38,0.25)",
      }}
      aria-label={name ? `Avatar de ${name}` : "Avatar"}
    >
      {initial}
    </button>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Avatar.tsx
git commit -m "feat(components): adiciona Avatar circular com gradient red->amber"
```

---

### Task 5: Criar `template.tsx` para page transitions

**Files:**
- Create: `src/app/template.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
// src/app/template.tsx
// Re-renderiza em cada navegação (Next App Router behavior)
// permitindo fade-in suave entre rotas.
"use client";

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Verificar visualmente**

Com dev server rodando, navegue: Home → Histórico → Perfil → Home. Cada transição deve ter um fade-in sutil (~350ms) — não instantâneo.

- [ ] **Step 4: Commit**

```bash
git add src/app/template.tsx
git commit -m "feat(app): adiciona page transitions com fade-in entre rotas"
```

---

## FASE 2 — Skeletons & Empty States

Substitui spinners genéricos por skeletons e empty states ilustrados.

---

### Task 6: Criar componente `EmptyState`

**Files:**
- Create: `src/components/EmptyState.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
// src/components/EmptyState.tsx
"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  /** SVG ou emoji. Renderizado em uma "moldura" gradient. */
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl text-3xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(220,38,38,0.15), rgba(245,158,11,0.10))",
          boxShadow:
            "inset 0 0 0 1px rgba(239,68,68,0.2), 0 8px 24px rgba(220,38,38,0.10)",
        }}
      >
        {icon}
      </div>
      <h3
        className="mb-1.5 text-xl text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.04em" }}
      >
        {title}
      </h3>
      {description && (
        <p className="mb-5 max-w-xs text-sm text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="tactile rounded-xl bg-[var(--surface-2)] px-5 py-2.5 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-3)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EmptyState.tsx
git commit -m "feat(components): adiciona EmptyState reutilizavel com gradient frame"
```

---

### Task 7: Criar skeletons para Home, Treino, History, Profile, TAF

**Files:**
- Create: `src/components/skeletons/HomeSkeleton.tsx`
- Create: `src/components/skeletons/TreinoSkeleton.tsx`
- Create: `src/components/skeletons/HistorySkeleton.tsx`
- Create: `src/components/skeletons/ProfileSkeleton.tsx`
- Create: `src/components/skeletons/TafSkeleton.tsx`

- [ ] **Step 1: Criar `HomeSkeleton.tsx`**

```tsx
// src/components/skeletons/HomeSkeleton.tsx
export default function HomeSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-32" />
          </div>
          <div className="skeleton h-9 w-9 rounded-full" />
        </div>
        <div className="mt-3 flex gap-2">
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-5 w-12 rounded-full" />
          <div className="skeleton h-5 w-20 rounded-full" />
        </div>
      </header>
      <div className="px-4 pb-3">
        <div className="skeleton h-11 w-full rounded-xl" />
      </div>
      <main className="flex flex-1 flex-col gap-4 px-4">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 w-full rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-16 w-full rounded-2xl" />
        <div className="skeleton h-14 w-full rounded-2xl" />
        <div className="skeleton h-14 w-full rounded-2xl" />
        <div className="space-y-2.5">
          <div className="skeleton h-4 w-24" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Criar `TreinoSkeleton.tsx`**

```tsx
// src/components/skeletons/TreinoSkeleton.tsx
export default function TreinoSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3 w-20" />
            </div>
          </div>
          <div className="skeleton h-8 w-20 rounded-xl" />
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-3 px-4 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 w-full rounded-2xl" />
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Criar `HistorySkeleton.tsx`**

```tsx
// src/components/skeletons/HistorySkeleton.tsx
export default function HistorySkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="skeleton h-7 w-32" />
      </header>
      <div className="px-4 pb-4">
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
      <main className="flex flex-1 flex-col gap-3 px-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-24 w-full rounded-2xl" />
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Criar `ProfileSkeleton.tsx`**

```tsx
// src/components/skeletons/ProfileSkeleton.tsx
export default function ProfileSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="flex items-center gap-4">
          <div className="skeleton h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-3 w-20" />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-11 w-full rounded-xl" />
          </div>
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Criar `TafSkeleton.tsx`**

```tsx
// src/components/skeletons/TafSkeleton.tsx
export default function TafSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="skeleton h-7 w-24" />
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 w-full rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-12 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/skeletons/
git commit -m "feat(components): adiciona skeletons para Home, Treino, History, Profile, TAF"
```

---

### Task 8: Substituir spinners de tela cheia por skeletons

**Files:**
- Modify: `src/app/page.tsx` (loading guard)
- Modify: `src/app/treino/page.tsx` (Suspense fallback + loading guard)
- Modify: `src/app/history/page.tsx` (loading guard)
- Modify: `src/app/profile/page.tsx` (loading guard)
- Modify: `src/app/taf/page.tsx` (loading guard)
- Modify: `src/app/medidas/page.tsx` (loading guard)

**Importante:** Spinners DENTRO de botões (ex: "Gerando..." no Generate Treino) **continuam** — eles têm contexto. Substituir só os de tela cheia.

- [ ] **Step 1: Home — substituir loading**

Em `src/app/page.tsx`, no topo dos imports adicionar:

```tsx
import HomeSkeleton from "@/components/skeletons/HomeSkeleton";
```

Localizar (linhas ~187-193):

```tsx
  if (loading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }
```

Substituir por:

```tsx
  if (loading || pageLoading) {
    return <HomeSkeleton />;
  }
```

- [ ] **Step 2: Treino — substituir Suspense fallback E loading**

Em `src/app/treino/page.tsx`, adicionar import:

```tsx
import TreinoSkeleton from "@/components/skeletons/TreinoSkeleton";
```

Localizar (linhas ~46-57) o `Suspense` fallback:

```tsx
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
        </div>
      }
    >
      <TreinoContent />
    </Suspense>
  );
```

Substituir o `fallback` por:

```tsx
  return (
    <Suspense fallback={<TreinoSkeleton />}>
      <TreinoContent />
    </Suspense>
  );
```

E o loading guard interno (linhas ~337-343):

```tsx
  if (authLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }
```

Substituir por:

```tsx
  if (authLoading || loading) {
    return <TreinoSkeleton />;
  }
```

- [ ] **Step 3: History — substituir loading**

Em `src/app/history/page.tsx`, adicionar import:

```tsx
import HistorySkeleton from "@/components/skeletons/HistorySkeleton";
```

Localizar o spinner de tela cheia e substituir por `<HistorySkeleton />`.

- [ ] **Step 4: Profile — substituir loading**

Em `src/app/profile/page.tsx`, adicionar import:

```tsx
import ProfileSkeleton from "@/components/skeletons/ProfileSkeleton";
```

Localizar o spinner de tela cheia e substituir por `<ProfileSkeleton />`.

- [ ] **Step 5: TAF — substituir loading**

Em `src/app/taf/page.tsx`, adicionar import:

```tsx
import TafSkeleton from "@/components/skeletons/TafSkeleton";
```

Localizar o spinner de tela cheia e substituir por `<TafSkeleton />`.

- [ ] **Step 6: Medidas — substituir loading**

Em `src/app/medidas/page.tsx`, adicionar import:

```tsx
import HomeSkeleton from "@/components/skeletons/HomeSkeleton";
```

(reusar HomeSkeleton — Medidas tem layout similar)

Localizar o spinner de tela cheia e substituir por `<HomeSkeleton />`.

- [ ] **Step 7: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors.

Manualmente: faça hard reload (Ctrl+Shift+R) na Home — você deve ver brevemente o skeleton com shimmer antes do conteúdo real, em vez do spinner. Repita pra cada tela acima.

- [ ] **Step 8: Commit**

```bash
git add src/app/
git commit -m "refactor(loading): substitui spinners de tela cheia por skeletons"
```

---

## FASE 3 — Home Polish

Aplica os 5 dimensões de polish na Home.

---

### Task 9: Saudação contextual + Avatar no header da Home

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Adicionar imports**

No topo de `src/app/page.tsx`, adicionar:

```tsx
import Avatar from "@/components/Avatar";
import { useGreeting } from "@/lib/hooks";
```

- [ ] **Step 2: Usar `useGreeting` no componente**

Dentro de `function Home()`, antes do `useEffect`s, adicionar:

```tsx
  const greeting = useGreeting();
```

- [ ] **Step 3: Substituir o header**

Localizar o `<header>` (linhas ~202-242). Substituir o conteúdo de `<div className="relative flex items-center justify-between">` (atualmente um `<div>` com texto + um `<button>` de logout) por:

```tsx
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
```

Note: o botão de logout sai daqui — vai pro Profile na Task 21.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente em http://localhost:3000: você deve ver "Bom dia / Vamos, [Nome]" com o nome em gradient red→amber, e o avatar circular substituindo o ícone de logout.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): saudacao contextual + nome em gradient + avatar circular"
```

---

### Task 10: Toggle Academia/Quartel com pill animado

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Adicionar import de haptics**

```tsx
import { haptic } from "@/lib/haptics";
```

- [ ] **Step 2: Substituir o bloco do toggle**

Localizar `{/* ── Location Toggle ── */}` (linhas ~244-268). Substituir o `<div>` interno por:

```tsx
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
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: clicar entre Academia/Quartel deve animar uma "pílula" deslizando entre os dois com gradient + glow correspondente. Vibração leve em cada toque (em mobile).

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): toggle academia/quartel com pill animado e haptics"
```

---

### Task 11: KPIs com count-up + gradient + depth

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Adicionar import de useCountUp**

```tsx
import { useCountUp } from "@/lib/hooks";
```

- [ ] **Step 2: Criar componente local `KPICard`**

No final de `src/app/page.tsx` (depois de `RoutineCard`), adicionar:

```tsx
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
```

- [ ] **Step 3: Substituir o bloco de KPI Cards**

Localizar `{/* ── KPI Cards ── */}` (linhas ~272-335). Substituir o `<div className="stagger grid grid-cols-3 gap-3">` inteiro por:

```tsx
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
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: ao recarregar a Home, os 3 KPIs devem animar de 0 ao valor final em ~600ms. Os números devem ter um leve gradient white→gray (mais sutil que o anterior).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): KPIs com count-up animation e gradient nos numeros"
```

---

### Task 12: Week dots glow + Routine cards enriquecidos + CTA shimmer

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/types/index.ts` (adicionar tempo estimado helper)

- [ ] **Step 1: Substituir Week dots block**

Localizar `{/* ── Week dots ── */}` (linhas ~338-361). Substituir o `<div>` por:

```tsx
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
```

- [ ] **Step 2: Adicionar shimmer ao CTA "Gerar treino"**

Localizar o `<button>` de gerar treino (linhas ~397-423). Substituir a className do botão de:

```tsx
className="animate-fade-in-up group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-60 gradient-red animate-pulse-glow"
```

Para:

```tsx
className="tactile shimmer-overlay animate-fade-in-up group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-4 text-sm font-bold text-white transition-all disabled:opacity-60 gradient-red"
style={{ boxShadow: "var(--shadow-red)" }}
```

(Remove `animate-pulse-glow` e `shadow-lg`, troca por `tactile shimmer-overlay` + style box-shadow.)

E adicionar handler `onClick`:

```tsx
onClick={() => {
  haptic("medium");
  setShowConfigModal(true);
}}
```

(Substitui a versão atual sem haptic.)

- [ ] **Step 3: Adicionar tactile no botão "Montar Treino Manual"**

Localizar o botão (linhas ~426-434). Adicionar `tactile` na className e handler com haptic:

```tsx
<button
  onClick={() => {
    haptic("light");
    setShowBuilderModal(true);
  }}
  className="tactile animate-fade-in-up flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-4 text-sm font-bold text-[var(--foreground)] transition-all hover:border-[var(--red-500)]/30 hover:bg-[var(--surface-2)]"
>
```

- [ ] **Step 4: Microcopy do CTA**

Trocar:
```tsx
"Gerar Novo Treino" → "Gerar meu treino"
"Gerar Treino Automático" → "Gerar meu treino"
"Montar Treino Manual" → "Montar manualmente"
```

(Localizar e atualizar nos `<>... </>` do botão.)

- [ ] **Step 5: Enriquecer RoutineCard**

Substituir o componente `RoutineCard` (final do arquivo, linhas ~555-579) por:

```tsx
function RoutineCard({ routine, workoutId }: { routine: Routine; workoutId: string }) {
  // Tempo estimado: ~90s/set + 30s/exercício de transição
  const totalSets = routine.exercises.reduce((acc, ex) => acc + ex.sets, 0);
  const estMinutes = Math.round((totalSets * 90 + routine.exercises.length * 30) / 60);
  const primaryMuscle = routine.exercises[0]?.target_muscle;
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
```

- [ ] **Step 6: Atualizar título "Treino Ativo" pra usar Bebas**

Localizar (linhas ~443-451):

```tsx
<h2 className="text-sm font-bold uppercase tracking-wider text-[var(--foreground)]">
  Treino {workout.workout_type}
</h2>
```

Substituir por:

```tsx
<h2
  className="text-base text-[var(--foreground)]"
  style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.12em" }}
>
  TREINO ATIVO
</h2>
```

- [ ] **Step 7: Substituir empty state por EmptyState component**

Adicionar import:

```tsx
import EmptyState from "@/components/EmptyState";
```

Localizar o bloco `else if (!generating)` (linhas ~458-470). Substituir o `<div className="animate-fade-in rounded-2xl border border-dashed border-[var(--border-light)] p-8 text-center">` por:

```tsx
        ) : !generating && (
          <EmptyState
            icon="💪"
            title="PRONTO PRA COMEÇAR?"
            description="Gere seu primeiro treino e bora suar."
          />
        )}
```

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente:
- Week dots treinados têm glow vermelho
- "Gerar meu treino" tem shimmer sutil + sombra colorida
- RoutineCards mostram músculo + tempo estimado, com barra lateral vermelha
- "TREINO ATIVO" em Bebas

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): week dots glow + routine cards enriquecidos + CTA shimmer + empty state"
```

---

## FASE 4 — Treino Polish

---

### Task 13: Header do Treino com gradient + timer pulse + progress glow

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Adicionar import de haptics**

No topo de `src/app/treino/page.tsx`:

```tsx
import { haptic } from "@/lib/haptics";
```

- [ ] **Step 2: Substituir o `<header>`**

Localizar `<header className="relative border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">` (linhas ~382-439). Substituir o `<header>` inteiro por:

```tsx
      <header
        className="relative px-4 py-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(220,38,38,0.06), rgba(19,19,22,0.95))",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="tactile flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-[var(--foreground)]">
                {routine.name}
              </h1>
              <p className="text-xs text-[var(--text-dim)]">
                {routine.exercises.length} exercícios
                {training && totalSets > 0 && (
                  <span
                    className="ml-2 text-[var(--amber-500)]"
                    style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.05em", fontSize: "0.8rem" }}
                  >
                    {doneSets}/{totalSets} SETS
                  </span>
                )}
              </p>
            </div>
          </div>
          {training ? (
            <div
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
              style={{
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))",
                border: "1px solid rgba(245,158,11,0.25)",
                boxShadow: "0 0 12px rgba(245,158,11,0.15)",
              }}
            >
              <span
                className="block h-1.5 w-1.5 rounded-full bg-[var(--amber-500)]"
                style={{
                  boxShadow: "0 0 6px var(--amber-500)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <span
                className="text-sm font-bold text-[var(--amber-400)]"
                style={{ fontFamily: "var(--font-bebas)", letterSpacing: "0.05em" }}
              >
                {formatElapsed(elapsed)}
              </span>
            </div>
          ) : (
            <button
              onClick={() => {
                haptic("medium");
                setTraining(true);
              }}
              className="tactile rounded-xl px-4 py-2 text-xs font-bold text-white gradient-red transition-all"
              style={{ boxShadow: "var(--shadow-red)" }}
            >
              Treinar
            </button>
          )}
        </div>

        {/* Progress bar com glow */}
        {training && totalSets > 0 && (
          <div className="mt-3 relative">
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <div
                className="relative h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, var(--red-500), var(--amber-500))",
                  boxShadow: "0 0 8px rgba(239,68,68,0.4)",
                }}
              >
                {progressPct > 0 && progressPct < 100 && (
                  <div
                    className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                    style={{
                      background: "var(--amber-400)",
                      boxShadow: "0 0 12px var(--amber-400)",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </header>
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: entrar em uma rotina ativa. Header deve ter gradient sutil red→surface, timer (em training mode) deve ter glow âmbar com dot pulsando, progress bar deve ter cabeça brilhante na ponta.

- [ ] **Step 4: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): header com gradient + timer pulse + progress bar com glow"
```

---

### Task 14: Numeração Bebas + active state em ExerciseCard

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Localizar o componente `ExerciseCard`**

Está dentro de `src/app/treino/page.tsx` (procure por `function ExerciseCard`). Tem props: `name`, `gifUrl`, `targetMuscle`, `equipment`, `instructions`, `sets`, `reps`, `index`, `training`, `setInputs`, `lastSets`, `personalRecord`, `onSetUpdate`, `onSetDone`, `onSwap`.

- [ ] **Step 2: Adicionar prop `isActive` no ExerciseCard**

Encontrar a interface/type de props do ExerciseCard. Adicionar:

```tsx
isActive?: boolean;
```

Adicionar `isActive` no destructuring e default `false`.

- [ ] **Step 3: Computar e passar `isActive` no map de exercícios**

Localizar o `.map((ex, idx) => {` no `<main>` (linha ~444-484). Antes do `return`, computar:

```tsx
            const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };
            // Active = exercício atual em andamento (tem sets feitos mas não todos)
            const doneInEx = exInput.sets.filter((s) => s.done).length;
            const isActive =
              training &&
              doneInEx > 0 &&
              doneInEx < exInput.sets.length;
            // Se nenhum tá ativo, ativo é o primeiro com sets pendentes
```

E mudar pra computar o "first pending" como fallback. Substituir a lógica `isActive` por:

```tsx
            const exInput = inputs[idx] ?? { exercise_id: ex.exercise_id, sets: [] };
            const doneInEx = exInput.sets.filter((s) => s.done).length;
            const allSetsDone = doneInEx === exInput.sets.length && exInput.sets.length > 0;
            // Primeiro exercício com sets não-terminados é o "ativo"
            const firstActiveIdx = sorted.findIndex((_, i) => {
              const inp = inputs[i];
              if (!inp) return false;
              return inp.sets.some((s) => !s.done);
            });
            const isActive = training && idx === firstActiveIdx && !allSetsDone;
```

E passar `isActive` na prop:

```tsx
                isActive={isActive}
```

- [ ] **Step 4: Atualizar o JSX do `ExerciseCard` com numeração Bebas e active state**

Dentro do componente `ExerciseCard`, localizar o card raiz (provavelmente um `<div>` com `bg-[var(--surface)]`). Modificar:

- O wrapper: aplicar conditional styles baseados em `isActive`:
  - Se ativo: borda vermelha, gradient bg ativo, barra lateral
  - Se não ativo: surface-gradient normal

- Adicionar numeração `01/02/03` à esquerda do nome do exercício, em Bebas grande (~24px), cor texto cinza normal e vermelho quando ativo.

Substituir o wrapper raiz do ExerciseCard por (ajustar conforme estrutura real):

```tsx
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: isActive ? "var(--surface-gradient-active)" : "var(--surface-gradient)",
        border: `1px solid ${isActive ? "var(--border-active)" : "var(--border-subtle)"}`,
        boxShadow: isActive ? "0 0 20px rgba(239,68,68,0.10)" : "none",
        transition: "all 200ms ease-out",
      }}
    >
      {isActive && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px]"
          style={{
            background: "linear-gradient(180deg, var(--red-500), transparent)",
          }}
        />
      )}
      {/* Header do card com numeração */}
      <div role="button" /* ...etc */ className="...">
        <div className="flex items-center gap-3">
          <span
            style={{
              fontFamily: "var(--font-bebas)",
              fontSize: "1.25rem",
              lineHeight: 1,
              color: isActive ? "var(--red-500)" : "var(--text-dim)",
              letterSpacing: "0.04em",
              minWidth: "28px",
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          {/* ...existing content (gif/icon, name, target muscle, swap button) */}
        </div>
      </div>
      {/* sets etc */}
    </div>
```

**Importante:** preserve toda a lógica existente (expand/collapse, swap button, GIF lazy load, set rows). Só envolva o wrapper raiz com novos styles e adicione a numeração.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: entrar em training mode. Marcar 1 set do primeiro exercício. O exercício atual deve ficar destacado (borda vermelha + barra lateral + número 01 vermelho). Outros exercícios ficam com o estilo neutro normal.

- [ ] **Step 6: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): numeracao Bebas e active state visual em ExerciseCard"
```

---

### Task 15: Set rows com 3 estados + inputs Bebas + check com glow

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Localizar set rows dentro de `ExerciseCard`**

Procurar pela seção que renderiza cada set (provavelmente `setInputs.map` ou `sets.map`). Cada row tem: número do set, input weight, input reps, checkbox done.

- [ ] **Step 2: Substituir set row por versão com 3 estados**

Substituir cada `<div>` de set row por uma versão com estilos condicionais:

```tsx
              {setInputs.map((s, sIdx) => {
                // Estado: done | active (próximo a ser feito) | pending
                const isDone = s.done;
                const firstPendingIdx = setInputs.findIndex((x) => !x.done);
                const isActive = training && !isDone && sIdx === firstPendingIdx;

                return (
                  <div
                    key={sIdx}
                    className="grid items-center gap-2 rounded-lg px-2 py-1.5 transition-all"
                    style={{
                      gridTemplateColumns: "20px 1fr 1fr 32px",
                      background: isDone
                        ? "rgba(34,197,94,0.06)"
                        : isActive
                        ? "rgba(239,68,68,0.06)"
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${
                        isDone
                          ? "rgba(34,197,94,0.2)"
                          : isActive
                          ? "rgba(239,68,68,0.4)"
                          : "rgba(255,255,255,0.04)"
                      }`,
                      boxShadow: isActive ? "0 0 0 1px rgba(239,68,68,0.2)" : "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-bebas)",
                        fontSize: "0.95rem",
                        textAlign: "center",
                        color: isDone
                          ? "var(--success)"
                          : isActive
                          ? "var(--red-500)"
                          : "var(--text-muted)",
                        fontWeight: 700,
                      }}
                    >
                      {sIdx + 1}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="kg"
                      value={s.weight}
                      onChange={(e) => onSetUpdate(sIdx, "weight", e.target.value)}
                      disabled={!training}
                      className="rounded-lg bg-transparent px-2 py-1.5 text-center text-[var(--foreground)] placeholder-[var(--text-dim)] focus:outline-none disabled:opacity-60"
                      style={{
                        fontFamily: "var(--font-bebas)",
                        fontSize: "0.95rem",
                        letterSpacing: "0.04em",
                        border: `1px solid ${
                          s.weight ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"
                        }`,
                        background: s.weight ? "rgba(255,255,255,0.03)" : "transparent",
                      }}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="reps"
                      value={s.reps}
                      onChange={(e) => onSetUpdate(sIdx, "reps", e.target.value)}
                      disabled={!training}
                      className="rounded-lg bg-transparent px-2 py-1.5 text-center text-[var(--foreground)] placeholder-[var(--text-dim)] focus:outline-none disabled:opacity-60"
                      style={{
                        fontFamily: "var(--font-bebas)",
                        fontSize: "0.95rem",
                        letterSpacing: "0.04em",
                        border: `1px solid ${
                          s.reps ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"
                        }`,
                        background: s.reps ? "rgba(255,255,255,0.03)" : "transparent",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => training && onSetDone(sIdx)}
                      disabled={!training}
                      className="tactile flex h-7 w-7 items-center justify-center rounded-lg transition-all disabled:opacity-50"
                      style={
                        isDone
                          ? {
                              background: "linear-gradient(135deg, #22C55E, #16A34A)",
                              border: "1.5px solid #22C55E",
                              boxShadow: "var(--glow-success)",
                            }
                          : {
                              background: "rgba(255,255,255,0.04)",
                              border: "1.5px solid rgba(255,255,255,0.08)",
                            }
                      }
                    >
                      {isDone && (
                        <svg className="h-4 w-4 text-white animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
```

**Importante:** preserve a estrutura de props (`setInputs`, `onSetUpdate`, `onSetDone`) — o substituido é só o JSX dentro do `.map`.

- [ ] **Step 3: Adicionar haptic ao marcar set done**

Em `markSetDone` (linha ~204 de `treino/page.tsx`), depois de `if (!wasDone) {`, adicionar:

```tsx
      haptic("medium");
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: em training mode, marcar sets em sequência. Cada set deve transicionar de "pending → active (vermelho) → done (verde com glow)". O check verde tem glow e anima scale-in. Vibração leve em cada done.

- [ ] **Step 5: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): set rows com 3 estados + inputs Bebas + check com glow + haptic"
```

---

### Task 16: Active set follow + auto-scroll + finish CTA shimmer + haptics

**Files:**
- Modify: `src/app/treino/page.tsx`

- [ ] **Step 1: Implementar auto-scroll quando termina exercício**

Em `markSetDone` (linha ~204), após o setRestTimer existente, adicionar lógica de auto-scroll. Localizar o bloco `if (remainingAfter > 0)` e o `else` correspondente.

No bloco `else` (quando termina o exercício), adicionar antes do `setRestTimer`:

```tsx
        // Auto-scroll suave para o próximo exercício
        if (sortedEx[exIdx + 1]) {
          setTimeout(() => {
            const nextEl = document.querySelector(
              `[data-exercise-idx="${exIdx + 1}"]`
            );
            nextEl?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 300);
        }
```

- [ ] **Step 2: Adicionar `data-exercise-idx` aos cards**

No `.map` de exercícios (linha ~444), adicionar prop `data-exercise-idx={idx}` no `<ExerciseCard>` ou mais facilmente envolver com um wrapper:

```tsx
            return (
              <div key={`${ex.exercise_id}-${idx}`} data-exercise-idx={idx}>
                <ExerciseCard
                  // ...existing props
                />
              </div>
            );
```

(Remova o `key` duplicado do ExerciseCard se já tinha.)

- [ ] **Step 3: Refinar finish CTA**

Localizar (linhas ~518-536). Substituir o `<button>` por:

```tsx
          <button
            onClick={() => {
              haptic("success");
              handleFinish();
            }}
            disabled={saving || doneSets === 0}
            className="tactile shimmer-overlay flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white transition-all disabled:opacity-50 gradient-red"
            style={{ boxShadow: "var(--shadow-red)" }}
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </>
            ) : (
              `Finalizar Treino${doneSets > 0 ? ` (${doneSets}/${totalSets})` : ""}`
            )}
          </button>
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente:
- Em training mode, marcar todos os sets do exercício 1 → o próximo exercício deve scrollar pro topo automaticamente
- Finish button tem shimmer
- Tocar finalizar = haptic success (3 pulses)

- [ ] **Step 5: Commit**

```bash
git add src/app/treino/page.tsx
git commit -m "feat(treino): auto-scroll entre exercicios + finish CTA com shimmer + haptics"
```

---

## FASE 5 — Rest Timer Refinado

---

### Task 17: Rest Timer com gradient interpolado + haptics

**Files:**
- Modify: `src/components/RestTimer.tsx`

- [ ] **Step 1: Adicionar import de haptics**

No topo:

```tsx
import { haptic } from "@/lib/haptics";
```

- [ ] **Step 2: Computar gradient color baseado em tempo restante**

No componente `RestTimer`, antes do `return`, adicionar:

```tsx
  // Gradient interpolado: red (tempo cheio) → amber (acabando)
  const progressColor = (() => {
    const ratio = remaining / total;
    if (ratio > 0.66) return "var(--red-500)";
    if (ratio > 0.33) return "var(--amber-500)";
    return "var(--amber-400)";
  })();
```

- [ ] **Step 3: Atualizar circular progress com gradient + glow**

Localizar o `<svg>` do círculo (linhas ~146-165). Substituir os dois `<circle>` por:

```tsx
          <svg className="absolute inset-0" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="restGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--red-500)" />
                <stop offset="100%" stopColor="var(--amber-500)" />
              </linearGradient>
              <filter id="restGlow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Track */}
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="6"
            />
            {/* Progress */}
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="url(#restGrad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 50 50)"
              filter="url(#restGlow)"
              style={{ transition: "stroke-dasharray 1s linear" }}
            />
          </svg>
```

(Remova a variável `progressColor` adicionada no Step 2 — usaremos o gradient SVG estático em vez de cor interpolada por JS, fica mais bonito.)

Atualizar Step 2: você pode remover a variável `progressColor` agora (não usada).

- [ ] **Step 4: Adicionar haptic light em preset buttons**

Localizar `{[30, 45, 60].map((s) => (` (linha ~175). Adicionar `haptic("light")` no onClick:

```tsx
              onClick={() => {
                haptic("light");
                startCountdown(s);
              }}
```

E adicionar `tactile` na className:

```tsx
className={`tactile flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${...}`}
```

- [ ] **Step 5: Adicionar tactile no botão "Pular descanso"**

Localizar o botão final (linha ~232). Adicionar `tactile`:

```tsx
className="tactile w-full rounded-xl border border-[var(--border)] py-3.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
```

E haptic no click:

```tsx
onClick={() => {
  haptic("light");
  onClose();
}}
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: em training mode, marcar um set. O Rest Timer abre com circular progress em gradient red→amber, com glow sutil. Os preset buttons (30s/45s/60s) vibram ao toque.

- [ ] **Step 7: Commit**

```bash
git add src/components/RestTimer.tsx
git commit -m "feat(rest-timer): circular progress com gradient red->amber + glow + haptics"
```

---

## FASE 6 — Navigation Polish

---

### Task 18: BottomNav floating + pill animado

**Files:**
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/app/page.tsx` (pb-20 → pb-24)
- Modify: `src/app/history/page.tsx` (pb-20 → pb-24)
- Modify: `src/app/profile/page.tsx` (pb-20 → pb-24)
- Modify: `src/app/taf/page.tsx` (pb-20 → pb-24)
- Modify: `src/app/medidas/page.tsx` (pb-20 → pb-24)

- [ ] **Step 1: Adicionar import de haptics no BottomNav**

```tsx
import { haptic } from "@/lib/haptics";
```

- [ ] **Step 2: Reescrever BottomNav com pill flutuante**

Substituir todo o `export default function BottomNav()` (linhas ~61-93) por:

```tsx
export default function BottomNav() {
  const pathname = usePathname();
  const activeIdx = NAV_ITEMS.findIndex((item) => item.href === pathname);

  return (
    <nav
      className="fixed bottom-1.5 left-1.5 right-1.5 z-40"
      style={{
        marginBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div
        className="relative flex items-stretch justify-around overflow-hidden rounded-2xl"
        style={{
          background: "rgba(19,19,22,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Pill animado */}
        {activeIdx >= 0 && (
          <div
            className="absolute top-1 bottom-1 rounded-xl transition-transform duration-400"
            style={{
              left: 4,
              width: `calc(${100 / NAV_ITEMS.length}% - 4px)`,
              transform: `translateX(${activeIdx * 100}%)`,
              background:
                "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(220,38,38,0.12))",
              border: "1px solid rgba(239,68,68,0.25)",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        )}
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic("light")}
              className={`tactile relative z-10 flex flex-1 flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors ${
                active ? "text-[var(--red-500)]" : "text-[var(--text-dim)]"
              }`}
            >
              {item.icon(active)}
              <span className="text-[10px] font-semibold tracking-wide">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Atualizar padding bottom nas pages que usam BottomNav**

Em cada page abaixo, localizar o div raiz `pb-20` e trocar pra `pb-24`:

- `src/app/page.tsx` — linha ~200
- `src/app/history/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/taf/page.tsx`
- `src/app/medidas/page.tsx`

Use Grep pra confirmar:

```bash
grep -rn "pb-20" src/app/ --include="*.tsx"
```

Expected: lista todas as ocorrências em pages que usam BottomNav. Depois Edit cada arquivo pra trocar `pb-20` por `pb-24` no div raiz.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: navegar entre Home/Histórico/TAF/Perfil. O pill (gradient vermelho sutil) deve deslizar entre os tabs com spring easing. Bottom nav aparece flutuando (não colado no fundo) com blur. Vibração leve em cada toque.

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomNav.tsx src/app/
git commit -m "feat(nav): BottomNav flutuante com pill animado + backdrop blur + haptics"
```

---

## FASE 7 — Per-Screen Polish

---

### Task 19: History page — empty state + cards refinados

**Files:**
- Modify: `src/app/history/page.tsx`

- [ ] **Step 1: Adicionar import de EmptyState**

```tsx
import EmptyState from "@/components/EmptyState";
```

- [ ] **Step 2: Substituir empty state**

Localizar onde renderiza quando `logs.length === 0` (procurar por "Nenhum treino" ou similar). Substituir o div atual por:

```tsx
            <EmptyState
              icon="📊"
              title="SEM HISTÓRICO AINDA"
              description="Complete seu primeiro treino e ele aparecerá aqui."
            />
```

- [ ] **Step 3: Refinar log cards**

Localizar onde renderiza cada `WorkoutLog` (provavelmente um `.map` na seção "treinos" tab). Aplicar nos cards:

```tsx
style={{
  background: "var(--surface-gradient)",
  border: "1px solid var(--border-subtle)",
}}
```

(Substituir as classes `bg-[var(--surface)] border-[var(--border)]` por inline style.)

E adicionar `tactile` se forem clicáveis.

- [ ] **Step 4: Tab indicator com pill animado**

Localizar o `<div>` de tabs (procurar por `setTab(`). Aplicar o mesmo padrão do toggle Academia/Quartel — wrapper com pill absoluto que move por translateX.

Substituir o tab container por:

```tsx
        <div className="px-4 pb-4">
          <div
            className="relative flex rounded-xl border p-1"
            style={{
              background: "var(--surface-gradient)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="absolute top-1 bottom-1 rounded-lg transition-transform duration-400"
              style={{
                left: 4,
                width: "calc(33.333% - 3px)",
                transform: `translateX(${
                  tab === "treinos" ? "0" : tab === "evolucao" ? "100%" : "200%"
                })`,
                background: "linear-gradient(135deg, var(--red-700), var(--red-600))",
                boxShadow: "var(--shadow-red)",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
            {(["treinos", "evolucao", "analise"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  haptic("light");
                  setTab(t);
                }}
                className={`tactile relative z-10 flex-1 py-2 text-xs font-bold transition-colors ${
                  tab === t ? "text-white" : "text-[var(--text-muted)]"
                }`}
              >
                {t === "treinos" ? "Treinos" : t === "evolucao" ? "Evolução" : "Análise"}
              </button>
            ))}
          </div>
        </div>
```

(Adicionar `import { haptic } from "@/lib/haptics";` no topo se não existe.)

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: ir pra History. Tabs devem ter pill vermelho deslizando entre os 3. Sem logs → empty state ilustrado. Com logs → cards com gradient sutil.

- [ ] **Step 6: Commit**

```bash
git add src/app/history/page.tsx
git commit -m "feat(history): tabs com pill animado + cards refinados + empty state"
```

---

### Task 20: Profile — logout move + avatar topo + save success

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Adicionar imports**

```tsx
import Avatar from "@/components/Avatar";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/contexts/AuthContext"; // confirmar se já tá importado
```

- [ ] **Step 2: Pegar `signOut` do useAuth**

Localizar o `useAuth()` no componente. Mudar pra:

```tsx
  const { user, loading: authLoading, signOut } = useAuth();
```

- [ ] **Step 3: Adicionar header com avatar grande**

Procurar pelo início do return JSX. Adicionar antes do form:

```tsx
      <header className="px-5 pb-5 pt-6">
        <div className="flex items-center gap-4">
          <Avatar name={form.name} size={56} />
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">
              {form.name || "Seu perfil"}
            </h1>
            <p className="text-xs text-[var(--text-dim)]">
              {form.level
                ? form.level.charAt(0).toUpperCase() + form.level.slice(1)
                : "Configure seus dados"}
            </p>
          </div>
        </div>
      </header>
```

- [ ] **Step 4: Refinar Save button com success animation**

Procurar o botão de Save (provavelmente "Salvar" ou similar). Adicionar `tactile shimmer-overlay` na className e haptic + show success state.

Modificar a lógica: o estado `saved` já existe. Localizar onde é renderizado e atualizar pra mostrar `✓ Salvo!` com fundo verde por 1.2s. Procurar por `setSaved(true)` — provavelmente já existe um `setTimeout(() => setSaved(false), ...)`.

Substituir o botão de Save por:

```tsx
          <button
            type="submit"
            disabled={saving}
            onClick={() => haptic("medium")}
            className={`tactile shimmer-overlay w-full rounded-2xl py-4 text-sm font-bold text-white transition-all disabled:opacity-60 ${
              saved ? "bg-[var(--success)]" : "gradient-red"
            }`}
            style={{
              boxShadow: saved ? "var(--glow-success)" : "var(--shadow-red)",
            }}
          >
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar alterações"}
          </button>
```

- [ ] **Step 5: Adicionar botão de logout no rodapé**

No final do form, antes do `</main>`, adicionar:

```tsx
          <button
            type="button"
            onClick={() => {
              haptic("light");
              signOut();
            }}
            className="tactile mt-2 w-full rounded-xl border border-[var(--border)] py-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--red-500)]"
          >
            Sair da conta
          </button>
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: ir pra Profile. Avatar grande com inicial no topo. Salvar com sucesso → botão fica verde com "✓ Salvo!" por ~1.2s. Logout existe no rodapé.

- [ ] **Step 7: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat(profile): avatar topo + logout no rodape + save success animation"
```

---

### Task 21: TAF + Medidas polish

**Files:**
- Modify: `src/app/taf/page.tsx`
- Modify: `src/app/medidas/page.tsx`
- Modify: `src/components/TafDashboard.tsx`

- [ ] **Step 1: TAF — refinar PR cards**

Em `TafDashboard.tsx`, localizar onde renderiza cada PR card. Aplicar:

```tsx
style={{
  background: "var(--surface-gradient)",
  border: "1px solid var(--border-subtle)",
  boxShadow: "0 0 12px rgba(245,158,11,0.10)",
}}
```

E nos números do PR, aplicar Bebas com gradient:

```tsx
style={{
  fontFamily: "var(--font-bebas)",
  background: "var(--gradient-num)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
}}
```

- [ ] **Step 2: TAF — empty state**

Em `src/app/taf/page.tsx`, adicionar import de EmptyState e substituir o estado vazio (procurar por mensagens tipo "Nenhuma tentativa") por:

```tsx
<EmptyState
  icon="🎯"
  title="SEM TENTATIVAS AINDA"
  description="Registre sua primeira tentativa de TAF."
  action={{
    label: "Nova tentativa",
    onClick: () => router.push("/taf/tentativa"),
  }}
/>
```

- [ ] **Step 3: Medidas — empty state**

Em `src/app/medidas/page.tsx`, mesmo padrão:

```tsx
<EmptyState
  icon="📏"
  title="REGISTRE SUAS MEDIDAS"
  description="Acompanhe sua evolução corporal ao longo do tempo."
/>
```

(Localizar onde aparece a mensagem "Nenhuma medida" ou similar e substituir.)

- [ ] **Step 4: Adicionar haptic + tactile nos botões principais de TAF e Medidas**

Em cada page, localizar botões CTA principais (ex: "Nova tentativa", "Adicionar medida") e:
- Adicionar `tactile` na className
- Adicionar `haptic("medium")` no `onClick`
- Adicionar `boxShadow: "var(--shadow-red)"` no style

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: TAF dashboard tem PR cards com gradient sutil + glow âmbar. Sem tentativas → empty state com CTA. Medidas idem.

- [ ] **Step 6: Commit**

```bash
git add src/app/taf/ src/app/medidas/ src/components/TafDashboard.tsx
git commit -m "feat(taf,medidas): cards refinados + empty states + haptics"
```

---

### Task 22: Onboarding + Builder polish

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/builder/page.tsx`

- [ ] **Step 1: Onboarding — selection cards com glow ao selecionar**

Em `src/app/onboarding/page.tsx`, localizar cards de seleção (level, goals, etc). Aplicar style condicional:

```tsx
style={
  isSelected
    ? {
        background: "var(--surface-gradient-active)",
        border: "1px solid var(--border-active)",
        boxShadow: "0 0 16px rgba(239,68,68,0.20)",
      }
    : {
        background: "var(--surface-gradient)",
        border: "1px solid var(--border-subtle)",
      }
}
```

E adicionar `tactile` + haptic nos clicks.

- [ ] **Step 2: Onboarding — progress dots refinados**

Localizar o indicador de steps (procurar por `STEPS.map` ou similar). Aplicar visual mais refinado:

```tsx
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-2 rounded-full transition-all duration-400"
              style={{
                width: i === currentStep ? 32 : 8,
                background:
                  i === currentStep
                    ? "linear-gradient(90deg, var(--red-500), var(--amber-500))"
                    : i < currentStep
                    ? "var(--red-600)"
                    : "rgba(255,255,255,0.1)",
                boxShadow: i === currentStep ? "var(--glow-red)" : "none",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          ))}
        </div>
```

(Adapte o nome `currentStep` ao state real do componente.)

- [ ] **Step 3: Builder — tab switcher com pill animado**

Em `src/app/builder/page.tsx`, localizar onde estão as abas A/B/C. Aplicar o mesmo padrão de pill animado do toggle (Task 10) com `translateX` baseado no tab ativo.

- [ ] **Step 4: Builder — exercise rows com mesma estética do Treino**

Aplicar nos rows de exercícios:
- Background `var(--surface-gradient)`
- Border `var(--border-subtle)`
- `tactile` nos botões

- [ ] **Step 5: Builder — Save CTA com shimmer**

Localizar o botão Save. Adicionar `tactile shimmer-overlay` e `boxShadow: "var(--shadow-red)"`.

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: criar profile do zero (acessar /onboarding em modo incógnito, ou apagar profile). Cards de seleção têm glow vermelho ao selecionar. Step indicator anima entre passos. Builder funciona similar.

- [ ] **Step 7: Commit**

```bash
git add src/app/onboarding/ src/app/builder/
git commit -m "feat(onboarding,builder): selection cards com glow + step indicator + pill tabs"
```

---

### Task 23: Modais — backdrop blur consistente + drag handle refinada

**Files:**
- Modify: `src/components/WorkoutConfigModal.tsx`
- Modify: `src/components/CycleProtectionModal.tsx`
- Modify: `src/components/HomeBuilderModal.tsx`
- Modify: `src/components/ExerciseSearchModal.tsx`
- Modify: `src/components/ResolveUnmatchedModal.tsx`
- Modify: `src/components/MeasurementSheet.tsx`

- [ ] **Step 1: Verificar quais modais já têm backdrop-blur**

```bash
grep -l "backdrop-blur" src/components/*.tsx
```

Expected: lista os componentes que já tem. Os que não aparecerem precisam de adição.

- [ ] **Step 2: Padronizar backdrop em cada modal**

Em CADA arquivo da lista, localizar o backdrop overlay (`<div className="absolute inset-0 bg-black/60..."`) e garantir que tem `backdrop-blur-sm`. Trocar `bg-black/60` por `bg-black/70` pra cobertura mais sólida.

Exemplo (em todos):

```tsx
<div
  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
  onClick={onClose}
/>
```

- [ ] **Step 3: Refinar drag handle nos sheets**

Em cada modal que usa pattern de bottom-sheet (`<div className="...rounded-t-3xl..."`), localizar o handle (`<div className="...h-1 w-10 rounded-full bg-[var(--border)]" />`). Substituir por:

```tsx
        <div
          className="mx-auto mb-5 h-1 w-12 rounded-full"
          style={{ background: "rgba(255,255,255,0.15)" }}
        />
```

- [ ] **Step 4: Adicionar border-subtle nos sheets**

Localizar o sheet container (com `bg-[var(--surface)]`). Adicionar:

```tsx
style={{ borderTop: "1px solid var(--border-subtle)" }}
```

ou trocar `border-t border-[var(--border)]` por inline.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: abrir cada modal (Configurar treino, Cycle protection, Home builder, Exercise search, Resolve unmatched, Measurement sheet). Todos têm backdrop com blur, drag handle mais refinada, borda sutil no topo.

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "style(modals): backdrop blur consistente + drag handle refinada em todos os modals"
```

---

## FASE 8 — Detalhes Finais

---

### Task 24: Iconografia consistente + microcopy

**Files:**
- Modify: vários (depende da auditoria)

- [ ] **Step 1: Auditoria de strokeWidth nos SVGs**

```bash
grep -rn "strokeWidth=" src/app/ src/components/ --include="*.tsx" | grep -v "strokeWidth={1.8}" | grep -v "strokeWidth={2.2}" | grep -v "strokeWidth={2.5}" | grep -v "strokeWidth={3}"
```

Expected: lista os SVGs com strokeWidth fora do padrão. Padrão alvo: `1.8` em ícones normais, `2.2` em ícones ativos/primários (botão, indicador), `2.5+` mantém pra checks/alertas.

- [ ] **Step 2: Atualizar ícones inconsistentes**

Em cada arquivo listado, revisar SVGs e ajustar strokeWidth conforme regra:
- Botões de ação primária / ícone destacado: 2.2
- Ícones contextuais / decorativos: 1.8
- Ícones de check (✓) ou alertas (!): 2.5+ (já costumam estar corretos)

Foque nos arquivos com mais variação:
- `src/app/page.tsx`
- `src/app/treino/page.tsx`
- `src/components/BottomNav.tsx`
- `src/components/RestTimer.tsx`

(Não tente unificar tudo de uma vez — passe pelos principais. SVGs em recharts e libs externos ficam como estão.)

- [ ] **Step 3: Auditoria de microcopy**

Localizar e atualizar:

| Antes | Depois |
|-------|--------|
| "Bem-vindo" | (já tratado em Task 9 com saudação contextual) |
| "Configure seu perfil" | "Vamos te conhecer" |
| "Preencher Agora" | "Começar" |
| "Agora Não" | "Mais tarde" |
| "Nenhum treino ativo" | (já tratado em Task 12 com EmptyState) |
| "Erro ao gerar treino" | "Não consegui gerar agora — tenta de novo?" |
| "Erro ao salvar. Tente novamente." | "Não consegui salvar. Verifica sua conexão." |
| "Erro ao carregar rotina." | "Não consegui carregar essa rotina." |

Use Grep pra localizar cada string e Edit pra substituir.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: revisar telas principais — copy mais humana e quente.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "style(polish): iconografia consistente (1.8/2.2 stroke) + microcopy mais humana"
```

---

### Task 25: Focus rings + scrollbar refinada

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Adicionar focus rings refinados em globals.css**

No final do arquivo, adicionar:

```css
/* ── Focus rings refinados ── */
button:focus,
a:focus,
input:focus,
textarea:focus,
select:focus {
  outline: none;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid var(--red-500);
  outline-offset: 2px;
  border-radius: 8px;
}

/* Inputs já com border próprio: usar ring no lugar */
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--red-500), 0 0 0 4px rgba(239,68,68,0.2);
}
```

- [ ] **Step 2: Refinar scrollbar**

Substituir o bloco `::-webkit-scrollbar` existente (linhas ~62-72) por:

```css
/* ── Scrollbar refinada ── */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--border-subtle), var(--border));
  border-radius: 9999px;
  transition: background 0.2s;
}
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--red-700), var(--red-600));
}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Manualmente: navegar com Tab pelos elementos — focus ring vermelho aparece (só com keyboard, não com mouse). Scrollbar tem gradient sutil; ao hover, fica vermelho.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style(globals): focus rings com focus-visible + scrollbar com gradient"
```

---

### Task 26: Light mode audit

**Files:**
- Modify: vários (correções pontuais conforme auditoria)

- [ ] **Step 1: Forçar light mode no DevTools**

Abrir DevTools (F12) → Three dots → More tools → Rendering → "Emulate CSS media feature prefers-color-scheme" → Light.

- [ ] **Step 2: Auditar Home**

Navegar para Home. Procurar por:
- Texto ilegível (cinza demais sobre branco)
- Sombras muito agressivas (devem ser sutis)
- Gradients que ficam apagados
- Cards sem profundidade visível

Anotar problemas. Corrigir adicionando overrides em `@media (prefers-color-scheme: light)` em `globals.css` ou ajustando inline styles.

Exemplo: se KPI numbers ficam transparentes em light, adicionar fallback no light mode:

```css
@media (prefers-color-scheme: light) {
  .kpi-num-light-fix {
    -webkit-text-fill-color: initial !important;
    background: none !important;
    color: var(--foreground) !important;
  }
}
```

(Aplicar a class condicional onde necessário.)

- [ ] **Step 3: Auditar Treino**

Mesma rotina: entrar em training mode em light mode. Verificar contraste do progress bar, das set rows, dos inputs Bebas. Ajustar contrastes que quebraram.

- [ ] **Step 4: Auditar History, Profile, TAF, Medidas**

Mesma rotina pra cada tela.

- [ ] **Step 5: Adicionar overrides necessários**

Em `globals.css`, no bloco `@media (prefers-color-scheme: light)`, adicionar tudo que precisou de fix.

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: build passa sem warnings.

Manualmente: alternar entre light/dark no DevTools. Ambos devem renderizar consistentes.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "style(light): correcoes de contraste e sombras em light mode"
```

---

### Task 27: Verificação final + smoke test

**Files:** nenhum (verificação)

- [ ] **Step 1: Build de produção**

```bash
npm run build
```

Expected: Build success com 0 errors. Bundle size razoável (compare com baseline pre-polish se disponível).

- [ ] **Step 2: Lint completo**

```bash
npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Smoke test manual de todas as telas**

Com dev server rodando, percorrer:

1. **Login** (logout primeiro se preciso) → form polido?
2. **Onboarding** (modo incógnito ou apagar profile) → step indicator anima? Selection cards com glow?
3. **Home** → saudação contextual, avatar, KPIs com count-up, week dots glow, toggle pill, CTAs shimmer, routine cards enriquecidos
4. **Treino → browse mode** → header gradient, numeração Bebas, cards estéticos
5. **Treino → training mode** → progress bar com glow, exercise active highlighted, set rows 3 estados, inputs Bebas, check com glow + haptic, active set follow, auto-scroll, finish CTA shimmer
6. **Rest Timer** → circular progress gradient red→amber + glow
7. **Workout Complete** → confetti existente continua funcionando
8. **History** → tabs pill animado, cards refinados, empty state quando sem logs
9. **TAF** → PR cards com glow âmbar, empty state
10. **Medidas** → empty state, cards
11. **Profile** → avatar topo, save success, logout no rodapé
12. **Builder** → tab switcher pill, exercise rows estéticos
13. **Bottom Nav** → flutuante com pill animado entre tabs

- [ ] **Step 5: Smoke test em light mode**

Forçar light mode no DevTools. Re-percorrer Home, Treino, History — sem contrastes quebrados.

- [ ] **Step 6: Smoke test em mobile (DevTools device emulation)**

DevTools → Toggle device toolbar (Ctrl+Shift+M) → iPhone 14 Pro. Verificar:
- BottomNav respeita safe-area-inset
- Tap targets mínimo 44×44 (botões pequenos podem ficar apertados)
- Text size legível
- Modais fullscreen-friendly

- [ ] **Step 7: Verificar haptics em mobile real (opcional)**

Acessar via celular (mesma rede WiFi: http://[seu-ip]:3000). Tocar nos botões e set check — vibração deve disparar.

- [ ] **Step 8: Commit final marcando entrega**

Se tudo OK, sem mudanças adicionais necessárias. Commit vazio (opcional) marcando milestone:

```bash
git commit --allow-empty -m "chore(polish): polish premium completo - 8 fases entregues

Implementa as 5 dimensoes da spec 2026-05-09-polish-premium:
- Motion & Micro-interacoes (haptics, count-up, page transitions, active set follow)
- Loading & Empty states (skeletons em todas pages, EmptyState reutilizavel)
- Depth & Hierarquia (surface gradients, shadows multi-camada, Bebas em titulos)
- Navegacao (BottomNav flutuante com pill, header com saudacao)
- Detalhes (iconografia consistente, microcopy humana, focus rings, scrollbar)"
```

---

## Self-Review

Após completar o plano, faça pass de revisão:

- [ ] **Spec coverage:**
  - Dimensão 1 Motion: Tasks 2, 3, 5, 9, 10, 12, 13, 15, 16, 17, 18 ✓
  - Dimensão 2 Loading/Empty: Tasks 6, 7, 8, 12, 19, 21 ✓
  - Dimensão 3 Depth/Hierarquia: Task 1 (tokens), aplicado em todas ✓
  - Dimensão 4 Navigation/Header: Tasks 9, 13, 18 ✓
  - Dimensão 5 Detalhes: Tasks 24, 25, 26 ✓
  - Per-screen: Home (9-12), Treino (13-16), RestTimer (17), Nav (18), History (19), Profile (20), TAF/Medidas (21), Onboarding/Builder (22), Modais (23) ✓

- [ ] **Placeholder scan:** Sem TBD, TODO, "implementar depois". Cada step tem código completo ou comando exato.

- [ ] **Type consistency:** `haptic()` usa string union `"light" | "medium" | "success" | "error"`. `useCountUp(target, duration?)`. `Avatar({name, size, onClick, className})`. `EmptyState({icon, title, description?, action?})`. Consistente entre tasks.

- [ ] **Verification gates:** Cada task tem `npx tsc --noEmit && npm run lint`. Tasks visuais incluem verificação manual no dev server. Build final no Task 26 e 27.

- [ ] **Commit cadence:** Um commit por task, mensagens em PT-BR seguindo padrão do repo (`feat(scope):`, `style(scope):`, `refactor(scope):`).

---

## Riscos durante execução

- **Backdrop-blur em mobile antigo:** Se durante smoke test mobile (Task 27 step 6) BottomNav ou modais ficarem laggy, adicionar fallback CSS `@supports not (backdrop-filter: blur(12px))` com background sólido.
- **Count-up distrai recorrentes:** Se o user reclamar, mudar `useCountUp` pra rodar só uma vez por sessão (flag em sessionStorage).
- **Type check falhando:** se `haptic` ou `useCountUp` tiverem problemas de import path, conferir `tsconfig.json` aliases.
- **Pages com pb-20 não atualizadas:** depois da Task 18, qualquer page nova com BottomNav precisa de `pb-24`. Documentar no CLAUDE.md se necessário.
