# Polish Premium — Design Spec

**Data:** 2026-05-09
**Status:** Aprovado para planejamento
**Autor:** Thiago + Claude
**Escopo:** Auditoria visual completa do MiraFit elevando a percepção de qualidade do app sem mudar funcionalidade.

---

## 1. Objetivo

Transformar a sensação do MiraFit de "app bem-feito" para "app premium" através de polish visual e de interação aplicado consistentemente em todas as telas. Sem novas features. Sem mudar fluxos. Sem mexer em dados/Firestore/lógica de geração.

A vibe-alvo foi validada via mockup interativo da Home antes/depois (capturado em `.superpowers/brainstorm/`).

## 2. Não-objetivos

- **Nada de novas features** (sem novas telas, sem novos fluxos, sem novos campos)
- **Sem mudança de arquitetura** (Firebase/Next.js/rotas permanecem)
- **Sem refatoração não-relacionada** (lógica de geração, periodização, TAF scoring inalterados)
- **Sem rebrand** (paleta vermelho/âmbar mantida; só adicionamos profundidade)
- **Sem suporte a novas plataformas** (continua mobile-first PWA)

## 3. Cinco dimensões de polish

Cada dimensão é independente e pode ser implementada em fases separadas.

### Dimensão 1: Motion & Micro-interações

**Princípio:** todo toque do usuário deve ter resposta tátil ou visual em <100ms.

**Mudanças globais:**
- **Tactile press** — todos os botões clicáveis recebem `active:scale-[0.97]` + `transition-transform` rápida (150ms). Aplica em: `<button>`, `<Link>` que age como botão, cards clicáveis (RoutineCard, ExerciseCard header).
- **Spring easing** — substituir `ease-out` por `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot leve) em transições de entrada de modais e bottom-sheets.
- **Count-up nos KPIs** — números grandes (Streak/Total/Esta semana na Home) animam de 0 ao valor final em 600ms (easing easeOutCubic). Helper `useCountUp(target, duration)` hook novo em `src/lib/hooks.ts`.
- **Haptics consistentes** — wrapper `haptic.ts` com 3 níveis: `light` (10ms — toggle, tab change), `medium` (20ms — set done, save), `success` ([10,40,10] — finish workout, PR batido). Adicionado em: marcar set, finalizar treino, salvar profile, swap exercise, gerar treino concluído.
- **Transição entre páginas** — fade-in 200ms ao mudar de rota (via `template.tsx` no App Router).
- **Active set follow no Treino** — ao marcar um set, o próximo set do mesmo exercício recebe estado visual `active` (borda vermelha sutil) automaticamente. Próximo exercício também ganha estado active após último set do anterior.
- **Auto-scroll suave** — ao concluir todos os sets de um exercício, scroll suave (300ms) leva o próximo exercício pro topo da viewport.

**Arquivos afetados:** `src/lib/haptics.ts` (novo), `src/lib/hooks.ts` (novo, com `useCountUp`), `src/app/template.tsx` (novo), `src/app/page.tsx`, `src/app/treino/page.tsx`, e todos os componentes com botão.

### Dimensão 2: Loading & Empty states

**Princípio:** zero spinners genéricos onde a estrutura do conteúdo é conhecida.

**Mudanças:**
- **Skeleton components** — criar `src/components/skeletons/` com:
  - `HomeSkeleton.tsx` — header + KPI grid + week dots + cards (estrutura idêntica à Home final)
  - `TreinoSkeleton.tsx` — header + lista de exercise cards
  - `HistorySkeleton.tsx` — tabs + lista de logs
  - `ProfileSkeleton.tsx` — formulário com inputs cinza
  - `TafSkeleton.tsx` — dashboard com cards de PR
- **Shimmer animation** — keyframe já existe em `globals.css`. Skeletons usam `bg-gradient-to-r from-[var(--surface)] via-[var(--surface-2)] to-[var(--surface)] bg-[length:200%_100%] animate-shimmer`.
- **Substituir spinners de página** — os 21 arquivos atualmente usando `<div className="animate-spin rounded-full border-2 border-[var(--red-500)]">` em loading states de tela cheia recebem o skeleton correspondente. Spinners pequenos dentro de botões (gerando treino, salvando) **continuam** — eles têm contexto.
- **Empty states ilustrados** — substituir os divs cinzas atuais por estados com ícone grande (gradient red→amber), título Bebas, copy mais humana e CTA claro. Telas afetadas: Home (sem treino), History (sem logs), TAF (sem tentativas), Medidas (sem medidas).

**Arquivos afetados:** `src/components/skeletons/*.tsx` (novos), `src/components/EmptyState.tsx` (novo, reutilizável), todos os pages que tem loading guard.

### Dimensão 3: Depth, Hierarquia & Tipografia

**Princípio:** superfícies ganham camadas; tipografia ganha personalidade.

**Novos design tokens** (adicionar em `globals.css`):

```css
/* Layered surfaces (gradient sutis) */
--surface-gradient: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
--surface-gradient-active: linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02));

/* Multi-layer shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
--shadow-md: 0 4px 12px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3);
--shadow-red: 0 8px 24px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
--shadow-amber: 0 8px 24px rgba(245,158,11,0.30), inset 0 1px 0 rgba(255,255,255,0.2);

/* Glow effects */
--glow-red: 0 0 16px rgba(239,68,68,0.4);
--glow-amber: 0 0 16px rgba(251,191,36,0.4);
--glow-success: 0 0 12px rgba(34,197,94,0.4);

/* Gradient text */
--gradient-accent: linear-gradient(90deg, #EF4444, #FBBF24);
--gradient-num: linear-gradient(180deg, #FFFFFF, #C0C0C8);
```

**Mudanças visuais:**
- **Cards principais** (KPIs Home, RoutineCard, ExerciseCard, TAF cards) ganham `background: var(--surface-gradient)` + borda mais sutil (`rgba(255,255,255,0.06)` em vez de `var(--border)`) + top inner highlight (`::before` com 1px de gradient horizontal).
- **CTAs primários** (Gerar Treino, Treinar, Finalizar Treino) ganham `box-shadow: var(--shadow-red)` + shimmer overlay sutil (já temos keyframe — animar a cada 3s).
- **KPI numbers** ganham `background: var(--gradient-num); -webkit-background-clip: text; -webkit-text-fill-color: transparent;` para contraste sutil.
- **Modais e bottom-sheets** ganham `backdrop-filter: blur(8px)` no overlay + borda `rgba(255,255,255,0.08)`.
- **Section titles** (ex: "TREINO ATIVO" na Home) usam Bebas + tracking maior (em vez de Outfit bold uppercase).
- **Light mode** — todos os novos tokens têm equivalente em `@media (prefers-color-scheme: light)` mantendo proporções de contraste.

**Arquivos afetados:** `src/app/globals.css`, todos os componentes que usam cards.

### Dimensão 4: Navegação & Header

**Mudanças:**
- **BottomNav rework** — fixed bottom continua, mas:
  - Container vira flutuante (`bottom: 6px; left: 6px; right: 6px;`) com border-radius e backdrop-blur
  - Pill animado (translate via `transform: translateX()`) marca o tab ativo, em vez de só mudar cor
  - Item ativo recebe scale leve (1.05) e o ícone ganha glow
  - Pages que usam BottomNav passam de `pb-20` para `pb-24` (compensar pelo float)
- **Header da Home** — saudação contextual:
  - "Bom dia, Thiago" (5h-12h) / "Boa tarde" (12h-18h) / "Boa noite" (18h-5h)
  - Nome em gradient (`var(--gradient-accent)`)
  - Avatar circular com inicial (gradient red→amber, 36px) **substitui** o botão de logout no header. Logout passa a viver na página Profile (botão dedicado no rodapé do form, abaixo de "Salvar")
- **Page headers consistentes** — Treino, History, Profile, TAF ganham mesmo padrão de header com sticky + backdrop-blur quando o usuário scrolla.

**Arquivos afetados:** `src/components/BottomNav.tsx`, `src/app/page.tsx`, `src/app/treino/page.tsx`, `src/app/history/page.tsx`, `src/app/profile/page.tsx`, `src/app/taf/page.tsx`, `src/app/medidas/page.tsx`.

### Dimensão 5: Detalhes & Microcopy

**Mudanças:**
- **Iconografia consistente** — todos os SVGs com `strokeWidth={1.8}` em estados normais e `strokeWidth={2.2}` quando ativos. Auditar e padronizar (atualmente mistura 1.5/1.8/2/2.5).
- **Microcopy** — revisar e humanizar:
  - "Gerar Treino Automático" → "Gerar meu treino"
  - "Montar Treino Manual" → "Montar manualmente"
  - "Bem-vindo" → saudação contextual (vide Dim 4)
  - "Nenhum treino ativo" → "Pronto pra começar?"
  - "Configure seu perfil" → "Vamos te conhecer"
- **Focus rings** — substituir o ring genérico Tailwind por `outline: 2px solid var(--red-500); outline-offset: 2px;` aplicado via `focus-visible` (não em focus, pra não aparecer no clique do mouse).
- **Scrollbar refinada** — track invisível, thumb com gradient sutil + hover state.
- **Light mode auditado** — passar pelas telas principais com `prefers-color-scheme: light` ativo e corrigir contrastes/sombras que ficaram quebrados.
- **Estados de erro/offline** — banner de erro padronizado (vermelho com ícone) + estado offline minimalista (já temos service worker).

**Arquivos afetados:** `src/app/globals.css`, todos os componentes (icones), pages com microcopy.

## 4. Polish específico por tela

### Home (`src/app/page.tsx`)
- Header: saudação contextual + avatar inicial + nome em gradient
- Toggle Academia/Quartel: pill slide animado
- KPIs: count-up + gradient nos números + inner highlight
- Week dots: glow vermelho nos dias treinados
- CTA "Gerar treino": shadow vermelho + shimmer
- Routine cards: enriquecer com músculo principal (já existe via `routine.exercises[0].target_muscle`) + tempo estimado (calcular: `sets × 90s + 30s entre exercícios`)
- BottomNav: float + pill animado

### Treino (`src/app/treino/page.tsx`)
- Header: gradient sutil + timer com pulse dot âmbar
- Progress bar 4px com glow + ponta brilhante (cabeça do bar)
- Numeração `01/02/03` em Bebas grande à esquerda do exercício
- Exercício ativo: borda vermelha + barra lateral + número vermelho
- Set rows com 3 estados (done verde sutil, active vermelho, neutro)
- Inputs em Bebas Neue (números viram protagonistas)
- Check com glow verde + scale animation ao marcar
- PR badge proativo (já implementado, refinar visual: gradient amber + ícone troféu)
- Active set follow + auto-scroll
- Finish CTA com shimmer
- Confetti no PR confirmado ao finalizar (keyframe `confetti-fall` já existe)

### Rest Timer (`src/components/RestTimer.tsx`)
- Substituir progress linear por **circular progress** (SVG com `stroke-dashoffset` animado)
- Número de segundos restantes em Bebas grande no centro do círculo
- Gradient vermelho→âmbar no stroke conforme tempo passa (interpola hue baseado em `remaining/total`)
- Botões +30s / -15s com tactile press
- Backdrop com blur

### History (`src/app/history/page.tsx`)
- Skeleton cards no load
- Cards de log: borda gradient sutil + KPI inline (volume + duração)
- Tab indicator: pill animado
- Empty state ilustrado (sem logs)

### Profile (`src/app/profile/page.tsx`)
- Skeleton no load
- Form inputs com gradient surface
- Save button com state success animado (✓ verde por 1.2s antes de voltar)
- Avatar grande no topo (gradient red→amber)

### TAF (`src/app/taf/page.tsx` + `tentativa/page.tsx`)
- Cards de PR com gradient + glow âmbar nos atuais
- Wizard de tentativa com transições entre passos (slide horizontal)
- Confetti no PR batido

### Medidas (`src/app/medidas/page.tsx`)
- Skeleton no load
- Empty state ilustrado
- MeasurementSheet com mesmo polish dos modais

### Onboarding (`src/app/onboarding/page.tsx`)
- Transições entre passos com spring easing
- Selection cards com gradient e glow ao selecionar
- Progress dots no topo (pill animado)

### Builder (`src/app/builder/page.tsx`)
- Tab switcher A/B/C com pill animado
- Exercise rows com mesma estética do Treino
- Save CTA com shimmer

### Modais existentes
- `WorkoutConfigModal`, `CycleProtectionModal`, `HomeBuilderModal`, `ExerciseSearchModal`, `ResolveUnmatchedModal`, `MeasurementSheet` — todos ganham backdrop blur, slide-up com spring, drag handle refinada.

## 5. Novos arquivos

```
src/lib/haptics.ts              # wrapper navigator.vibrate com 3 níveis
src/lib/hooks.ts                # useCountUp e helpers de animação
src/app/template.tsx            # transição entre páginas (fade)
src/components/skeletons/
  ├── HomeSkeleton.tsx
  ├── TreinoSkeleton.tsx
  ├── HistorySkeleton.tsx
  ├── ProfileSkeleton.tsx
  └── TafSkeleton.tsx
src/components/EmptyState.tsx   # componente reutilizável
src/components/CircularTimer.tsx # SVG circular progress (extraído do RestTimer)
src/components/Avatar.tsx       # avatar circular com inicial (gradient)
```

## 6. Implementação em fases

A spec será dividida pelo writing-plans em fases independentes, cada uma fazendo entregável visível:

**Fase 1 — Foundations** (tokens + utils)
- Adicionar novos CSS variables em `globals.css`
- Criar `haptics.ts`, `hooks.ts` (`useCountUp`)
- Criar componente `Avatar`
- Criar `template.tsx` para page transitions

**Fase 2 — Skeletons & Empty states**
- Criar todos os skeletons em `src/components/skeletons/`
- Criar `EmptyState.tsx` reutilizável
- Substituir os 21 spinners de tela cheia
- Aplicar empty states ilustrados

**Fase 3 — Home polish**
- Saudação contextual + avatar
- Toggle pill animado
- KPIs com count-up + gradient
- Week dots com glow
- Routine cards enriquecidos

**Fase 4 — Treino polish**
- Numeração Bebas
- Exercise card com 3 estados
- Set rows tactile
- Active set follow + auto-scroll
- Inputs Bebas
- PR badge refinado
- Confetti

**Fase 5 — Rest Timer circular**
- Extrair `CircularTimer`
- Integrar no `RestTimer.tsx`
- Gradient interpolado por tempo restante

**Fase 6 — Navigation polish**
- BottomNav float + pill animado
- Page headers sticky com blur
- Page transitions

**Fase 7 — Per-screen polish** (History, Profile, TAF, Medidas, Onboarding, Builder, Modais)

**Fase 8 — Detalhes finais** (iconografia, microcopy, focus, scrollbar, light mode auditado)

Cada fase é um PR potencial, testável isoladamente, sem quebrar nada das outras.

## 7. Critérios de sucesso

- **Verificável visualmente:** todas as 9 telas principais (Home, Treino, History, Profile, TAF, Medidas, Onboarding, Builder, Login) abertas no dev server e comparadas com mockup aprovado.
- **Verificável programaticamente:**
  - `npm run lint` passa
  - `npx tsc --noEmit` passa
  - `npm run build` passa
  - Nenhum spinner genérico em loading state de tela cheia (grep por `animate-spin rounded-full border-2 border-\[var\(--red-500\)\]` em pages, deve retornar 0 ocorrências em loading states de tela cheia — pode permanecer dentro de botões com contexto)
- **Verificável manualmente:**
  - Cada botão principal vibra ao toque (haptics)
  - KPIs animam ao carregar
  - Active set follow funciona em sequência de 3 sets
  - Light mode renderiza sem contrastes quebrados
  - PWA continua funcionando (service worker ok)

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Backdrop-blur tem custo de renderização em mobile antigo | Aplicar só em modais e BottomNav (não em todo card); fallback `background: rgba(19,19,22,0.95)` quando `@supports not (backdrop-filter)` |
| Count-up nos KPIs distrai usuário recorrente | Animação curta (600ms); roda só uma vez por sessão (controle com flag em sessionStorage por página) |
| Skeletons mudam tempo percebido se backend ficar lento, expondo mais o load | Aceitar — skeleton ainda é melhor que spinner em qualquer cenário |
| Mudança de iconografia pode quebrar consistência durante transição | Auditar todos os SVGs em uma única fase (Fase 8) |
| Haptics em iOS PWA podem não disparar (`navigator.vibrate` limitada) | Wrapper já guarda `if ('vibrate' in navigator)`; degradação silenciosa |
| Light mode pode ter regressões não-óbvias | Auditoria manual obrigatória na Fase 8 com toggle no DevTools |

## 9. Fora de escopo

- Animações Lottie ou bibliotecas externas (Framer Motion não será adicionado — usamos CSS + Web Animations API)
- Mudança da paleta de cores (vermelho/âmbar permanece)
- Dark/light theme switcher manual (continua via `prefers-color-scheme`)
- Internacionalização (continua só PT-BR)
- Refatoração de tipos / arquitetura
- Acessibilidade WCAG completa (aplicaremos `focus-visible` e contrast safe, mas não auditoria a11y completa)
- Testes E2E novos (manteremos verificação manual + tipos + lint)
