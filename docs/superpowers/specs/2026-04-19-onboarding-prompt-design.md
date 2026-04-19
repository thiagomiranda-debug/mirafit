# Onboarding Prompt — Design Spec

**Data:** 2026-04-19  
**Status:** Aprovado

## Contexto

Usuários novos que se cadastram no MiraFit podem acessar o app sem preencher o perfil. Isso torna a geração de treinos imprecisa ou impossível. O objetivo é promover o preenchimento do perfil sem bloquear completamente o acesso ao app.

## Escopo

Modificações restritas à home (`src/app/page.tsx`). Nenhuma outra rota ou componente é afetado.

## Fluxo de Sessão

1. Home carrega e `loadData` detecta `profile === null`
2. Checa `sessionStorage.getItem('mirafit_onboarding_dismissed')`:
   - Se presente → não exibe modal (sessão já dispensada); home renderiza em modo "vazio"
   - Se ausente → exibe o `OnboardingPromptModal`
3. Usuário clica "Agora Não" → `sessionStorage.setItem('mirafit_onboarding_dismissed', '1')`, fecha modal
4. Usuário clica "Preencher Agora" → `router.push('/onboarding')`
5. `sessionStorage` é limpo automaticamente ao fechar/reabrir o app — modal reaparece na próxima sessão

## Home em Modo "Vazio" (sem perfil)

| Elemento | Comportamento |
|---|---|
| Header | Exibe "Bem-vindo" sem nome; sem tags de `days_per_week`, `level`, `time_per_session` |
| KPIs (streak, treinos, semana) | Ocultos — `streak` não carrega sem perfil |
| Dots da semana | Ocultos |
| Botão "Gerar Treino" | Desabilitado (`disabled`), sem tooltip adicional |
| Link "Montar Treino Manual" | Visível e funcional |
| BottomNav | Visível normalmente |

## Modal `OnboardingPromptModal`

Overlay escuro semi-transparente cobrindo a tela inteira. Card centralizado seguindo o design system (dark surface, red accent).

**Estrutura:**
- Ícone: SVG de perfil/pessoa, fundo `var(--red-600)/15`, cor `var(--red-500)`
- Título: "Configure seu perfil" — `font-bebas`, `text-3xl`
- Subtítulo: "Para gerar treinos precisos, precisamos conhecer seu nível, objetivos e disponibilidade."
- Botão primário: "Preencher Agora" — `gradient-red`, texto branco → `router.push('/onboarding')`
- Botão secundário: "Agora Não" — texto muted, sem borda → dispensa e salva flag

**Sem botão X** — fechamento exclusivo pelos dois botões.

## Mudanças em `page.tsx`

1. Adicionar estado `showOnboardingModal: boolean`
2. Em `loadData`, substituir `router.push('/onboarding')` por:
   - `setPageLoading(false)`
   - Se `sessionStorage` não tiver a flag → `setShowOnboardingModal(true)`
   - Retornar sem setar `profile` (permanece `null`)
3. Remover `!profile` do guard `if (!user || !profile) return null` — permitir renderização sem perfil
4. Adaptar header e seções para lidar com `profile === null`
5. Renderizar `<OnboardingPromptModal>` inline no JSX (não é componente separado — modal simples dentro de `page.tsx`)

## Fora do Escopo

- Outras rotas (`/history`, `/profile`, `/taf`, `/builder`) não recebem o prompt
- Sem banner persistente
- Sem bloqueio total de navegação
- Sem alterações no `AuthContext`
