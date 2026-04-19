# Onboarding Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir um modal na home para usuários sem perfil, com opção de preencher agora ou adiar (sessionStorage), sem bloquear o acesso ao app.

**Architecture:** Todas as mudanças ficam em `src/app/page.tsx`. O `loadData` deixa de redirecionar para `/onboarding` e passa a exibir um modal inline. A home renderiza em modo "vazio" quando `profile === null`. O `sessionStorage` controla se o modal já foi dispensado na sessão atual.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 com CSS vars, sessionStorage (browser API).

---

### Task 1: Adicionar estado e ajustar `loadData`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Adicionar estado `showOnboardingModal`**

Localizar o bloco de `useState` no topo do componente `Home` (linha ~33) e adicionar logo após `showConfigModal`:

```tsx
const [showOnboardingModal, setShowOnboardingModal] = useState(false);
```

- [ ] **Step 2: Substituir o redirect por lógica de modal em `loadData`**

Localizar em `loadData` (linha ~57):
```tsx
if (!p) {
  router.push("/onboarding");
  return;
}
```

Substituir por:
```tsx
if (!p) {
  setPageLoading(false);
  const dismissed = sessionStorage.getItem("mirafit_onboarding_dismissed");
  if (!dismissed) setShowOnboardingModal(true);
  return;
}
```

- [ ] **Step 3: Verificar tipagem**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): replace onboarding redirect with modal trigger"
```

---

### Task 2: Adaptar renderização da home para `profile === null`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Remover `!profile` do guard de renderização**

Localizar (linha ~135):
```tsx
if (!user || !profile) return null;
```

Substituir por:
```tsx
if (!user) return null;
```

- [ ] **Step 2: Adaptar o header para lidar com perfil ausente**

Localizar a linha que define `firstName` (logo abaixo do guard):
```tsx
const firstName = profile.name.split(" ")[0];
```

Substituir por:
```tsx
const firstName = profile?.name.split(" ")[0];
```

- [ ] **Step 3: Adaptar o título do header**

Localizar no JSX:
```tsx
<h1 className="mt-0.5 text-2xl font-bold text-[var(--foreground)]">
  {firstName}
</h1>
```

Substituir por:
```tsx
<h1 className="mt-0.5 text-2xl font-bold text-[var(--foreground)]">
  {firstName ?? "Bem-vindo"}
</h1>
```

- [ ] **Step 4: Ocultar tags de perfil quando não há perfil**

Localizar o bloco das tags (após o título, dentro do `<header>`):
```tsx
{/* Tags */}
<div className="relative mt-3 flex flex-wrap gap-2">
  {[
    `${profile.days_per_week}x/semana`,
    `${profile.time_per_session} min`,
    profile.level.charAt(0).toUpperCase() + profile.level.slice(1),
  ].map((tag) => (
```

Substituir por:
```tsx
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
```

- [ ] **Step 5: Desabilitar botão "Gerar Treino" quando não há perfil**

Localizar o botão principal de geração de treino:
```tsx
<button
  onClick={() => setShowConfigModal(true)}
  disabled={generating}
```

Substituir por:
```tsx
<button
  onClick={() => setShowConfigModal(true)}
  disabled={generating || !profile}
```

- [ ] **Step 6: Verificar tipagem**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): render empty state when profile is null"
```

---

### Task 3: Adicionar modal de onboarding inline

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Adicionar o modal no JSX antes do `</div>` final**

Localizar o fechamento do container raiz, logo antes de `<BottomNav />` ou ao final do JSX retornado (após o `WorkoutConfigModal`):

```tsx
{showConfigModal && (
  <WorkoutConfigModal
    ...
  />
)}
```

Adicionar APÓS esse bloco:

```tsx
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
        Preencher Agora
      </button>
      <button
        onClick={() => {
          sessionStorage.setItem("mirafit_onboarding_dismissed", "1");
          setShowOnboardingModal(false);
        }}
        className="w-full py-2 text-sm font-medium text-[var(--text-dim)] transition-colors hover:text-[var(--text-muted)]"
      >
        Agora Não
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Verificar tipagem**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Verificar lint**

```bash
npm run lint
```

Esperado: sem erros ou warnings novos.

- [ ] **Step 4: Build de produção**

```bash
npm run build
```

Esperado: build concluído sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): add onboarding prompt modal for users without profile"
```

---

## Verificação Manual

Após implementação completa, testar no dev server (`npm run dev`):

1. Criar nova conta (ou apagar o documento do usuário no Firestore)
2. Acessar a home → modal deve aparecer
3. Clicar "Agora Não" → modal fecha, home exibe "Bem-vindo" sem KPIs
4. Recarregar a página (mesma sessão) → modal NÃO deve reaparecer (`sessionStorage` persiste)
5. Abrir nova aba ou fechar e reabrir → modal volta
6. Clicar "Preencher Agora" → navega para `/onboarding`
7. Completar onboarding → volta para home com perfil preenchido, modal não aparece mais
