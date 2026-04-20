"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ─── Canvas Ember Particle System ─────────────────────────────── */
function useEmberCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    type Particle = {
      x: number; y: number; size: number;
      vx: number; vy: number; opacity: number;
      color: string; wobble: number; wobbleSpeed: number;
    };

    const particles: Particle[] = [];
    const COLORS = ["#F59E0B", "#EF4444", "#FBBF24", "#DC2626", "#FCD34D"];

    const spawn = () => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 5,
      size: Math.random() * 2.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -(Math.random() * 1.5 + 0.8),
      opacity: Math.random() * 0.7 + 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.04 + 0.01,
    });

    let raf: number;
    const MAX = 60;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (particles.length < MAX && Math.random() < 0.4) particles.push(spawn());

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.3;
        p.y += p.vy;
        p.opacity -= 0.004;
        p.size *= 0.998;
        if (p.opacity <= 0 || p.y < -10) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [canvasRef]);
}

/* ─── Scroll Reveal ─────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("revealed")),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [installTab, setInstallTab] = useState<"ios" | "android">("android");

  useEmberCanvas(canvasRef);
  useScrollReveal();

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <>
      <style>{`
        /* ── Reset & Base ────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-root {
          background: #080809;
          color: #F5F5F7;
          font-family: var(--font-outfit), system-ui, sans-serif;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Keyframes ───────────────────────────────────────── */
        @keyframes lp-fade-up   { from { opacity:0; transform:translateY(32px); } to { opacity:1; transform:none; } }
        @keyframes lp-fade-in   { from { opacity:0; } to { opacity:1; } }
        @keyframes lp-pulse-glow{
          0%,100% { box-shadow: 0 0 24px rgba(239,68,68,.35), 0 0 60px rgba(239,68,68,.12); }
          50%     { box-shadow: 0 0 48px rgba(239,68,68,.55), 0 0 100px rgba(239,68,68,.22); }
        }
        @keyframes lp-scan {
          0%   { transform: translateY(-100%); opacity:0; }
          10%  { opacity:1; }
          90%  { opacity:0.6; }
          100% { transform: translateY(100vh); opacity:0; }
        }
        @keyframes lp-flicker {
          0%,93%,95%,100% { opacity:1; }
          94%             { opacity:.4; }
        }
        @keyframes lp-badge-pop {
          0%   { opacity:0; transform:scale(.8) translateY(-6px); }
          60%  { transform:scale(1.04); }
          100% { opacity:1; transform:scale(1); }
        }

        /* ── Scroll Reveal ───────────────────────────────────── */
        .reveal { opacity:0; transform:translateY(28px); transition: opacity .65s ease, transform .65s ease; }
        .reveal.revealed { opacity:1; transform:none; }
        .reveal-d1 { transition-delay:.1s; }
        .reveal-d2 { transition-delay:.2s; }
        .reveal-d3 { transition-delay:.3s; }
        .reveal-d4 { transition-delay:.4s; }

        /* ── Header ──────────────────────────────────────────── */
        .lp-header {
          position: fixed; top:0; left:0; right:0; z-index: 200;
          height: 64px;
          display: flex; align-items:center; justify-content:space-between;
          padding: 0 40px;
          background: rgba(8,8,9,.82);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .lp-logo {
          display:flex; align-items:center; gap:10px;
          font-family: var(--font-bebas), sans-serif;
          font-size: 1.6rem; letter-spacing:.06em; color:#F5F5F7;
          text-decoration:none;
        }
        .lp-logo-dot {
          width:8px; height:8px; border-radius:50%;
          background: #EF4444;
          box-shadow: 0 0 8px rgba(239,68,68,.8);
          animation: lp-flicker 4s ease-in-out infinite;
        }
        .lp-nav { display:flex; align-items:center; gap:8px; }
        .lp-nav-link {
          font-size:.85rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
          color: #9CA3AF; padding: 8px 14px; background:transparent; border:none;
          cursor:pointer; transition: color .2s; text-decoration:none;
          font-family: var(--font-outfit), sans-serif;
        }
        .lp-nav-link:hover { color:#F5F5F7; }
        .lp-btn-header {
          font-family: var(--font-outfit), sans-serif;
          font-size:.82rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
          padding: 9px 22px; background: #DC2626; color:#fff; border:none; cursor:pointer;
          clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
          transition: background .2s, transform .15s;
        }
        .lp-btn-header:hover { background:#EF4444; transform:translateY(-1px); }
        @media (max-width:640px) { .lp-nav { display:none; } .lp-header { padding:0 20px; } }

        /* ── Hero ────────────────────────────────────────────── */
        .lp-hero {
          position: relative; min-height: 100svh;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          padding: 80px 24px 40px;
          overflow: hidden;
        }
        .lp-hero-bg {
          position:absolute; inset:0; z-index:0;
          background:
            radial-gradient(ellipse 90% 55% at 50% -5%, rgba(185,28,28,.32) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 15% 80%, rgba(185,28,28,.12) 0%, transparent 55%),
            radial-gradient(ellipse 50% 35% at 85% 85%, rgba(217,119,6,.12) 0%, transparent 50%),
            #080809;
        }
        .lp-hero-grid {
          position:absolute; inset:0; z-index:1;
          background-image:
            linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
          background-size: 56px 56px;
        }
        .lp-hero-canvas {
          position:absolute; inset:0; z-index:2;
          width:100%; height:100%; pointer-events:none;
        }
        .lp-hero-scan {
          position:absolute; inset:0; z-index:3; pointer-events:none; overflow:hidden;
        }
        .lp-hero-scan::after {
          content:'';
          position:absolute; left:0; right:0; height:3px;
          background: linear-gradient(transparent, rgba(239,68,68,.06), transparent);
          animation: lp-scan 12s linear infinite;
        }
        .lp-hero-content {
          position:relative; z-index:10;
          text-align:center; max-width:1000px;
          animation: lp-fade-up .9s ease both;
        }
        .lp-hero-badge {
          display:inline-flex; align-items:center; gap:8px;
          font-size:.75rem; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
          padding: 7px 18px;
          background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.35);
          color: #EF4444; margin-bottom:24px;
          animation: lp-badge-pop .6s ease .2s both;
        }
        .lp-hero-badge-dot { width:6px; height:6px; border-radius:50%; background:#EF4444; animation:lp-flicker 2s infinite; }
        .lp-hero-title {
          font-family: var(--font-bebas), sans-serif;
          font-size: clamp(4rem, 13vw, 11rem);
          line-height: .92; letter-spacing:.04em; color:#F5F5F7;
          text-shadow: 0 0 120px rgba(239,68,68,.25), 0 4px 32px rgba(0,0,0,.8);
          animation: lp-fade-up .9s ease .15s both;
        }
        .lp-hero-title-accent { color:#EF4444; }
        .lp-hero-sub {
          margin-top:28px; max-width:640px; margin-left:auto; margin-right:auto;
          font-size:clamp(1rem,2.2vw,1.2rem); font-weight:400; line-height:1.7;
          color: rgba(245,245,247,.7);
          animation: lp-fade-up .9s ease .3s both;
        }
        .lp-hero-cta {
          margin-top:40px; display:flex; gap:16px; justify-content:center; flex-wrap:wrap;
          animation: lp-fade-up .9s ease .45s both;
        }

        /* ── Buttons ─────────────────────────────────────────── */
        .lp-btn-primary {
          display:inline-flex; align-items:center; gap:10px;
          font-family: var(--font-outfit), sans-serif;
          font-size:1rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
          padding: 16px 36px; background: linear-gradient(135deg,#DC2626,#991B1B);
          color:#fff; border:none; cursor:pointer; text-decoration:none;
          clip-path: polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%);
          animation: lp-pulse-glow 3.5s ease-in-out infinite;
          transition: transform .2s, filter .2s;
        }
        .lp-btn-primary:hover { transform:translateY(-3px); filter:brightness(1.2); }
        .lp-btn-primary:active { transform:translateY(0); }
        .lp-btn-outline {
          display:inline-flex; align-items:center; gap:10px;
          font-family: var(--font-outfit), sans-serif;
          font-size:1rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
          padding: 16px 32px;
          background:transparent; color:#9CA3AF;
          border: 1px solid rgba(255,255,255,.1);
          cursor:pointer; text-decoration:none;
          clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
          transition: all .2s;
        }
        .lp-btn-outline:hover { border-color:rgba(239,68,68,.4); color:#F5F5F7; background:rgba(239,68,68,.05); }

        /* ── Hero Stats ──────────────────────────────────────── */
        .lp-hero-stats {
          position:relative; z-index:10;
          display:flex; justify-content:center; flex-wrap:wrap;
          border-top: 1px solid rgba(255,255,255,.06);
          border-bottom: 1px solid rgba(255,255,255,.06);
          width:100%; max-width:700px;
          margin-top:60px;
          animation: lp-fade-in 1s ease .7s both;
        }
        .lp-stat { padding: 20px 32px; border-right: 1px solid rgba(255,255,255,.06); text-align:center; }
        .lp-stat:last-child { border-right:none; }
        .lp-stat-val {
          font-family: var(--font-bebas), sans-serif;
          font-size:2.2rem; color:#EF4444; letter-spacing:.04em; display:block;
        }
        .lp-stat-label { font-size:.72rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#6B7280; }

        /* ── Section Wrapper ─────────────────────────────────── */
        .lp-section { padding: 100px 24px; position:relative; }
        .lp-section-inner { max-width:1100px; margin:0 auto; }
        .lp-section-tag {
          font-size:.72rem; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
          color:#EF4444; display:block; margin-bottom:14px;
        }
        .lp-section-title {
          font-family: var(--font-bebas), sans-serif;
          font-size: clamp(2.8rem, 6vw, 5rem); line-height:.95; letter-spacing:.04em;
        }
        .lp-section-sub {
          font-size:1.05rem; color:#9CA3AF; line-height:1.7;
          max-width:560px; margin-top:16px;
        }

        /* ── Problem / Solution ──────────────────────────────── */
        .lp-vs { background: #0C0C0E; }
        .lp-vs-grid {
          display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:56px;
        }
        @media (max-width:720px) { .lp-vs-grid { grid-template-columns:1fr; } }
        .lp-vs-card {
          padding:36px; border:1px solid rgba(255,255,255,.06);
          background: #111114; position:relative;
        }
        .lp-vs-card.bad { opacity:.65; }
        .lp-vs-card.bad::before { content:''; position:absolute; inset:0; background:repeating-linear-gradient(45deg,rgba(255,255,255,.012),rgba(255,255,255,.012) 1px,transparent 1px,transparent 12px); }
        .lp-vs-card.good {
          border-color: rgba(239,68,68,.3);
          background: linear-gradient(145deg,rgba(239,68,68,.06) 0%,#111114 40%);
          box-shadow: 0 0 60px rgba(239,68,68,.08), inset 0 1px 0 rgba(239,68,68,.15);
        }
        .lp-vs-card.good::before, .lp-vs-card.good::after {
          content:''; position:absolute; width:24px; height:24px;
        }
        .lp-vs-card.good::before { top:-1px; left:-1px; border-top:2px solid #EF4444; border-left:2px solid #EF4444; }
        .lp-vs-card.good::after  { bottom:-1px; right:-1px; border-bottom:2px solid #EF4444; border-right:2px solid #EF4444; }
        .lp-vs-card-title { font-size:1.15rem; font-weight:700; margin-bottom:24px; letter-spacing:.02em; }
        .lp-vs-item { display:flex; gap:14px; align-items:flex-start; margin-bottom:16px; }
        .lp-vs-item:last-child { margin-bottom:0; }
        .lp-vs-icon { width:22px; height:22px; flex-shrink:0; margin-top:1px; }
        .lp-vs-text { font-size:.93rem; color:#9CA3AF; line-height:1.55; }
        .lp-vs-text strong { color:#F5F5F7; font-weight:600; }

        /* ── 3 Modes ─────────────────────────────────────────── */
        .lp-modes { background: #080809; }
        .lp-modes-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; margin-top:56px; }
        @media (max-width:900px) { .lp-modes-grid { grid-template-columns:1fr; } }
        .lp-mode-card {
          padding: 44px 36px; background:#0F0F12;
          border:1px solid rgba(255,255,255,.06);
          position:relative; overflow:hidden;
          transition: border-color .3s, transform .3s, box-shadow .3s;
          cursor:default;
        }
        .lp-mode-card:hover {
          border-color: rgba(239,68,68,.35);
          transform: translateY(-4px);
          box-shadow: 0 24px 64px rgba(0,0,0,.6), 0 0 40px rgba(239,68,68,.08);
        }
        .lp-mode-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:2px;
          background: linear-gradient(90deg,transparent,rgba(239,68,68,.6),transparent);
          opacity:0; transition: opacity .3s;
        }
        .lp-mode-card:hover::before { opacity:1; }
        .lp-mode-glow {
          position:absolute; top:-40px; right:-40px; width:180px; height:180px;
          border-radius:50%; opacity:0;
          transition: opacity .4s;
          pointer-events:none;
        }
        .lp-mode-card:hover .lp-mode-glow { opacity:1; }
        .lp-mode-emoji { font-size:2.4rem; display:block; margin-bottom:20px; }
        .lp-mode-kicker {
          font-size:.7rem; font-weight:700; letter-spacing:.18em; text-transform:uppercase;
          padding: 4px 12px; display:inline-block; margin-bottom:16px;
        }
        .lp-mode-kicker.red { background:rgba(239,68,68,.12); color:#EF4444; border:1px solid rgba(239,68,68,.25); }
        .lp-mode-kicker.amber { background:rgba(245,158,11,.12); color:#F59E0B; border:1px solid rgba(245,158,11,.25); }
        .lp-mode-title { font-family: var(--font-bebas),sans-serif; font-size:2.2rem; letter-spacing:.04em; margin-bottom:6px; }
        .lp-mode-tagline { font-size:.9rem; color:#F59E0B; font-weight:600; margin-bottom:20px; font-style:italic; }
        .lp-mode-text { font-size:.93rem; color:#9CA3AF; line-height:1.7; }

        /* ── Vantagens ───────────────────────────────────────── */
        .lp-vantagens { background: #0C0C0E; }
        .lp-vantagens-grid {
          display:grid; grid-template-columns:repeat(2,1fr); gap:2px; margin-top:56px;
        }
        @media (max-width:640px) { .lp-vantagens-grid { grid-template-columns:1fr; } }
        .lp-vantagem {
          padding:36px; background:#0F0F12; border:1px solid rgba(255,255,255,.06);
          transition: border-color .3s, background .3s;
          position:relative;
        }
        .lp-vantagem:hover {
          border-color: rgba(239,68,68,.25);
          background: rgba(239,68,68,.02);
        }
        .lp-vantagem-icon {
          width:44px; height:44px; display:flex; align-items:center; justify-content:center;
          background: rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.2);
          margin-bottom:20px; font-size:1.3rem;
        }
        .lp-vantagem-title { font-size:1.1rem; font-weight:700; margin-bottom:10px; letter-spacing:.01em; }
        .lp-vantagem-text { font-size:.9rem; color:#9CA3AF; line-height:1.65; }

        /* ── Install ─────────────────────────────────────────── */
        .lp-install { background: #080809; }
        .lp-install-tabs { display:flex; gap:0; margin-top:48px; width:fit-content; }
        .lp-install-tab {
          font-family: var(--font-outfit),sans-serif;
          font-size:.85rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
          padding:12px 28px; background:transparent; cursor:pointer;
          border:1px solid rgba(255,255,255,.1); border-right:none; color:#6B7280;
          transition: all .2s;
        }
        .lp-install-tab:last-child { border-right:1px solid rgba(255,255,255,.1); }
        .lp-install-tab.active {
          background:rgba(239,68,68,.12); color:#EF4444;
          border-color: rgba(239,68,68,.35);
        }
        .lp-install-panel {
          margin-top:32px; padding:40px;
          background:#0F0F12; border:1px solid rgba(255,255,255,.07);
          max-width:620px;
        }
        .lp-install-step { display:flex; gap:20px; padding:20px 0; border-bottom:1px solid rgba(255,255,255,.05); }
        .lp-install-step:last-child { border-bottom:none; padding-bottom:0; }
        .lp-step-num {
          width:40px; height:40px; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          font-family: var(--font-bebas),sans-serif; font-size:1.25rem; letter-spacing:.04em;
          background: rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); color:#EF4444;
        }
        .lp-step-body { flex:1; }
        .lp-step-title { font-size:.95rem; font-weight:700; margin-bottom:6px; }
        .lp-step-desc { font-size:.88rem; color:#9CA3AF; line-height:1.6; }
        .lp-step-desc code {
          background:rgba(255,255,255,.07); padding:2px 7px;
          font-size:.82rem; color:#F59E0B; border-radius:2px;
        }

        /* ── Install Note ────────────────────────────────────── */
        .lp-install-note {
          margin-top:24px; padding:16px 20px;
          background:rgba(245,158,11,.05); border:1px solid rgba(245,158,11,.2);
          font-size:.85rem; color:#9CA3AF; line-height:1.6;
          display:flex; gap:12px; align-items:flex-start; max-width:620px;
        }

        /* ── Footer ──────────────────────────────────────────── */
        .lp-footer {
          background: #050506;
          border-top: 1px solid rgba(255,255,255,.06);
          padding: 60px 24px;
          text-align:center;
        }
        .lp-footer-logo {
          font-family: var(--font-bebas),sans-serif; font-size:2.2rem;
          letter-spacing:.08em; color:#F5F5F7; display:block; margin-bottom:12px;
        }
        .lp-footer-logo span { color:#EF4444; }
        .lp-footer-tagline { font-size:.85rem; color:#6B7280; max-width:480px; margin:0 auto 32px; line-height:1.7; }
        .lp-footer-divider { width:48px; height:2px; background:linear-gradient(90deg,#DC2626,#F59E0B); margin:32px auto 28px; }
        .lp-footer-credit { font-size:.78rem; color:#4B4B55; letter-spacing:.05em; }
        .lp-footer-credit a { color:#6B7280; text-decoration:none; }
        .lp-footer-credit a:hover { color:#EF4444; }

        /* ── Utility ─────────────────────────────────────────── */
        .lp-text-gradient {
          background: linear-gradient(135deg, #EF4444 0%, #F59E0B 100%);
          -webkit-background-clip: text; background-clip:text;
          -webkit-text-fill-color: transparent;
        }
        .lp-divider-line {
          border:none; height:1px;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);
          margin:0;
        }
      `}</style>

      <div className="lp-root">
        {/* ── HEADER ─────────────────────────────────────────── */}
        <header className="lp-header">
          <a href="/landing" className="lp-logo">
            <span className="lp-logo-dot" />
            MIRA<span style={{ color: "#EF4444" }}>FIT</span>
          </a>
          <nav className="lp-nav">
            <button className="lp-nav-link" onClick={() => scrollTo("modos")}>Funcionalidades</button>
            <button className="lp-nav-link" onClick={() => scrollTo("vantagens")}>Performance</button>
            <button className="lp-nav-link" onClick={() => scrollTo("instalacao")}>Instalar</button>
          </nav>
          <a className="lp-btn-header" href="https://mirafit.vercel.app/" target="_blank" rel="noopener noreferrer">
            ⚡ Abrir App
          </a>
        </header>

        {/* ── HERO ───────────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-hero-bg" />
          <div className="lp-hero-grid" />
          <canvas ref={canvasRef} className="lp-hero-canvas" />
          <div className="lp-hero-scan" />

          <div className="lp-hero-content">
            <div className="lp-hero-badge">
              <span className="lp-hero-badge-dot" />
              4º BATALHÃO DE BOMBEIROS MILITAR · EXCLUSIVO
            </div>

            <h1 className="lp-hero-title">
              PRONTIDÃO<br />
              COMEÇA<br />
              <span className="lp-hero-title-accent">NO TREINO.</span>
            </h1>

            <p className="lp-hero-sub">
              Abandone as planilhas genéricas. Um sistema que adapta seus treinos
              aos plantões do 4º BBM, analisa sua força real e garante sua
              nota máxima no TAF.
            </p>

            <div className="lp-hero-cta">
              <a className="lp-btn-primary" href="https://mirafit.vercel.app/" target="_blank" rel="noopener noreferrer">
                <span>⚡</span>
                Abrir o Aplicativo
              </a>
              <button className="lp-btn-outline" onClick={() => scrollTo("instalacao")}>
                Como Instalar →
              </button>
            </div>
          </div>

          <div className="lp-hero-stats">
            <div className="lp-stat">
              <span className="lp-stat-val">3</span>
              <span className="lp-stat-label">Modos Táticos</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-val">0</span>
              <span className="lp-stat-label">Custo por Uso</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-val">BGO<br style={{ display: "none" }} />145</span>
              <span className="lp-stat-label">Edital Embarcado</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-val">100%</span>
              <span className="lp-stat-label">Offline First</span>
            </div>
          </div>
        </section>

        <hr className="lp-divider-line" />

        {/* ── PROBLEMA VS SOLUÇÃO ────────────────────────────── */}
        <section className="lp-section lp-vs" id="problema">
          <div className="lp-section-inner">
            <div className="reveal">
              <span className="lp-section-tag">// A Realidade do Militar</span>
              <h2 className="lp-section-title">
                TREINAR NA FOLGA<br />
                <span className="lp-text-gradient">É FÁCIL.</span>
              </h2>
              <p className="lp-section-sub">
                Difícil é manter o ritmo quando a sirene toca no plantão de 24h
                ou na semana puxada de Força Tarefa.
              </p>
            </div>

            <div className="lp-vs-grid">
              <div className="lp-vs-card bad reveal reveal-d1">
                <h3 className="lp-vs-card-title" style={{ color: "#6B7280" }}>
                  📵 Apps Normais
                </h3>
                {[
                  ["Ignoram a fadiga do plantão", "Treinos iguais no dia de escala e na folga — como se seu corpo não tivesse trabalhado 24h."],
                  ["Não conhecem o quartel", "Querem que você use \"cabo com polias\" ou \"leg press\" — equipamentos que não existem na academia do 4º BBM."],
                  ["TAF é só um timer", "Um cronômetro que não sabe quantas barras você fez na semana. Sem contexto de evolução."],
                  ["Planilhas engessadas", "Mesma divisão de treino todo mês, sem periodização ou progressão inteligente."],
                ].map(([titulo, desc], i) => (
                  <div className="lp-vs-item" key={i}>
                    <svg className="lp-vs-icon" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="11" r="10" stroke="#4B4B55" strokeWidth="1.5" />
                      <path d="M7 7l8 8M15 7l-8 8" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <p className="lp-vs-text"><strong>{titulo}:</strong> {desc}</p>
                  </div>
                ))}
              </div>

              <div className="lp-vs-card good reveal reveal-d2">
                <h3 className="lp-vs-card-title">
                  🔥 MiraFit
                </h3>
                {[
                  ["Motor Tático de Periodização", "Alterna fases de acumulação e intensificação automaticamente. Seu treino nunca se repete."],
                  ["Conhece o Arsenal do Quartel", "Modo Quartel usa exatamente o que tem no 4º BBM: Crossover, Rack, Banco e Esteira."],
                  ["TAF com Edital Real", "O BGO Nº 145 está no código. Cada repetição de barra ou abdominal atualiza sua nota instantaneamente."],
                  ["Constrói com Seu PT", "Tem acompanhamento? Use o Construtor Manual e insira a ficha do seu personal com poucos cliques."],
                ].map(([titulo, desc], i) => (
                  <div className="lp-vs-item" key={i}>
                    <svg className="lp-vs-icon" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="11" r="10" stroke="#EF4444" strokeWidth="1.5" />
                      <path d="M7 11.5l3 3 5-5.5" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="lp-vs-text"><strong>{titulo}:</strong> {desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <hr className="lp-divider-line" />

        {/* ── 3 MODOS ────────────────────────────────────────── */}
        <section className="lp-section lp-modes" id="modos">
          <div className="lp-section-inner">
            <div className="reveal">
              <span className="lp-section-tag">// Três Engrenagens do Sistema</span>
              <h2 className="lp-section-title">
                UM APP.<br />
                <span className="lp-text-gradient">TRÊS MISSÕES.</span>
              </h2>
              <p className="lp-section-sub">
                Cada contexto da sua vida operacional tem um modo dedicado.
                Do quartel à academia, do edital ao personal trainer.
              </p>
            </div>

            <div className="lp-modes-grid" style={{ marginTop: 56 }}>
              {/* Modo Quartel */}
              <div className="lp-mode-card reveal reveal-d1">
                <div
                  className="lp-mode-glow"
                  style={{ background: "radial-gradient(circle,rgba(239,68,68,.18),transparent 70%)" }}
                />
                <span className="lp-mode-emoji">🔥</span>
                <span className="lp-mode-kicker red">Modo Quartel</span>
                <h3 className="lp-mode-title">Para os Dias<br />de Plantão</h3>
                <p className="lp-mode-tagline">"Otimizado para o maquinário do 4º BBM."</p>
                <p className="lp-mode-text">
                  O motor gera treinos táticos e compactos usando exatamente o que
                  existe na academia do batalhão —{" "}
                  <strong style={{ color: "#F5F5F7" }}>Crossover, Rack, Banco e Esteira</strong>.
                  Seja na escala normal de 2 plantões ou nas semanas de Força Tarefa,
                  seu corpo nunca fica sem estímulo.
                </p>
              </div>

              {/* Modo Academia */}
              <div className="lp-mode-card reveal reveal-d2">
                <div
                  className="lp-mode-glow"
                  style={{ background: "radial-gradient(circle,rgba(245,158,11,.15),transparent 70%)" }}
                />
                <span className="lp-mode-emoji">🏋️</span>
                <span className="lp-mode-kicker amber">Modo Academia</span>
                <h3 className="lp-mode-title">Para os Dias<br />de Folga</h3>
                <p className="lp-mode-tagline">"Liberdade e Periodização."</p>
                <p className="lp-mode-text">
                  Treina na academia de bairro na folga? O app gera divisões
                  completas — ABCD e variações — com periodização automática
                  para hipertrofia e força. Já tem Personal Trainer? Use o{" "}
                  <strong style={{ color: "#F5F5F7" }}>Construtor Manual</strong>{" "}
                  para inserir sua própria ficha com poucos cliques.
                </p>
              </div>

              {/* Modo TAF */}
              <div className="lp-mode-card reveal reveal-d3">
                <div
                  className="lp-mode-glow"
                  style={{ background: "radial-gradient(circle,rgba(239,68,68,.18),transparent 70%)" }}
                />
                <span className="lp-mode-emoji">🏆</span>
                <span className="lp-mode-kicker red">Modo TAF</span>
                <h3 className="lp-mode-title">A Sua Nota<br />no Edital</h3>
                <p className="lp-mode-tagline">"Não adivinhe sua nota. Tenha certeza."</p>
                <p className="lp-mode-text">
                  O edital vigente{" "}
                  <strong style={{ color: "#F5F5F7" }}>BGO Nº 145</strong>{" "}
                  está embarcado no código. Cada vez que você bate um Recorde
                  Pessoal em Barra, Flexão ou Abdominal durante um treino normal,
                  o painel TAF atualiza automaticamente sua pontuação de{" "}
                  <strong style={{ color: "#F59E0B" }}>0 a 100</strong>. Saiba
                  exatamente quantas reps faltam para o índice <em>Excelente</em>.
                </p>
              </div>
            </div>
          </div>
        </section>

        <hr className="lp-divider-line" />

        {/* ── VANTAGENS ──────────────────────────────────────── */}
        <section className="lp-section lp-vantagens" id="vantagens">
          <div className="lp-section-inner">
            <div className="reveal">
              <span className="lp-section-tag">// Métricas e Performance</span>
              <h2 className="lp-section-title">
                CADA DETALHE<br />
                <span className="lp-text-gradient">IMPORTA.</span>
              </h2>
            </div>

            <div className="lp-vantagens-grid">
              {[
                {
                  icon: "💪",
                  title: "Cálculo de 1RM em Tempo Real",
                  text: "A fórmula de Epley calcula sua Força Máxima (1RM) a cada set. Gráficos automáticos mostram sua curva de evolução nas últimas sessões.",
                  delay: "reveal-d1",
                },
                {
                  icon: "📡",
                  title: "Offline First — Sem Depender do Wi-Fi",
                  text: "Internet do quartel caiu? O app funciona em modo offline usando Service Worker com cache nativo. Nenhum treino é perdido.",
                  delay: "reveal-d2",
                },
                {
                  icon: "🏆",
                  title: "Selos de Recorde Pessoal Instantâneos",
                  text: "Enquanto digita o peso, se o Epley 1RM superar seu PR histórico, um badge dourado aparece em tempo real: 🏆 Novo PR!",
                  delay: "reveal-d3",
                },
                {
                  icon: "⏱️",
                  title: "Timer de Descanso Automático",
                  text: "Ao marcar um set concluído, o temporizador de descanso de 90s abre automaticamente e vibra quando o tempo acaba. Foco total no treino.",
                  delay: "reveal-d4",
                },
              ].map(({ icon, title, text, delay }) => (
                <div className={`lp-vantagem reveal ${delay}`} key={title}>
                  <div className="lp-vantagem-icon">{icon}</div>
                  <h3 className="lp-vantagem-title">{title}</h3>
                  <p className="lp-vantagem-text">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr className="lp-divider-line" />

        {/* ── INSTALAÇÃO ─────────────────────────────────────── */}
        <section className="lp-section lp-install" id="instalacao">
          <div className="lp-section-inner">
            <div className="reveal">
              <span className="lp-section-tag">// Manual de Instalação Rápida</span>
              <h2 className="lp-section-title">
                INSTALE EM<br />
                <span className="lp-text-gradient">30 SEGUNDOS.</span>
              </h2>
              <p className="lp-section-sub">
                Sem App Store, sem Play Store, sem taxa. Instale como um app nativo
                direto do seu navegador — funciona em iOS e Android.
              </p>
            </div>

            <div className="reveal reveal-d1">
              <div className="lp-install-tabs">
                <button
                  className={`lp-install-tab${installTab === "android" ? " active" : ""}`}
                  onClick={() => setInstallTab("android")}
                >
                  🤖 Android (Chrome)
                </button>
                <button
                  className={`lp-install-tab${installTab === "ios" ? " active" : ""}`}
                  onClick={() => setInstallTab("ios")}
                >
                  🍎 iPhone (Safari)
                </button>
              </div>

              {installTab === "android" ? (
                <div className="lp-install-panel">
                  {[
                    {
                      n: "01",
                      title: "Abra no Google Chrome",
                      desc: <>Acesse <code>mirafit.vercel.app</code> no <code>Google Chrome</code> no seu Android. Não funciona em outros navegadores.</>,
                    },
                    {
                      n: "02",
                      title: "Toque nos Três Pontinhos",
                      desc: "No canto superior direito da tela, toque no ícone de menu (⋮).",
                    },
                    {
                      n: "03",
                      title: 'Selecione "Instalar Aplicativo"',
                      desc: <>Toque em <code>Adicionar à Tela Inicial</code> ou <code>Instalar Aplicativo</code>, se disponível.</>,
                    },
                    {
                      n: "04",
                      title: "Confirme e Pronto!",
                      desc: "O ícone aparece na sua tela inicial como qualquer app. Não consome memória como apps da Play Store.",
                    },
                  ].map(({ n, title, desc }) => (
                    <div className="lp-install-step" key={n}>
                      <div className="lp-step-num">{n}</div>
                      <div className="lp-step-body">
                        <p className="lp-step-title">{title}</p>
                        <p className="lp-step-desc">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lp-install-panel">
                  {[
                    {
                      n: "01",
                      title: "Abra no Safari",
                      desc: <>Acesse <code>mirafit.vercel.app</code> no <code>Safari</code>. Não funciona no Chrome do iPhone.</>,
                    },
                    {
                      n: "02",
                      title: "Toque em Compartilhar",
                      desc: "Na barra inferior, toque no ícone de Compartilhar (quadrado com seta para cima ⬆).",
                    },
                    {
                      n: "03",
                      title: 'Role e Selecione "Adicionar à Tela de Início"',
                      desc: <>Role a lista de opções até encontrar <code>Adicionar à Tela de Início</code> e toque.</>,
                    },
                    {
                      n: "04",
                      title: "Confirme o Nome e Adicione",
                      desc: 'Confirme o nome "MiraFit" e toque em Adicionar. O ícone aparecerá junto com seus apps.',
                    },
                  ].map(({ n, title, desc }) => (
                    <div className="lp-install-step" key={n}>
                      <div className="lp-step-num">{n}</div>
                      <div className="lp-step-body">
                        <p className="lp-step-title">{title}</p>
                        <p className="lp-step-desc">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="lp-install-note">
                <span style={{ fontSize: "1.1rem" }}>⚡</span>
                <span>
                  <strong style={{ color: "#F59E0B" }}>PWA (Progressive Web App)</strong> — o app
                  usa tecnologia de cache nativo do navegador. Funciona offline, recebe atualizações
                  automáticas e não ocupa espaço de armazenamento como apps convencionais.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <footer className="lp-footer">
          <span className="lp-footer-logo">
            MIRA<span>FIT</span>
          </span>
          <p className="lp-footer-tagline">
            Desenvolvido com excelência técnica para elevar o padrão físico
            do 4º Batalhão de Bombeiros Militar. O primeiro app de treino
            feito para a realidade da escala.
          </p>
          <div className="lp-footer-divider" />
          <p className="lp-footer-credit">
            Por{" "}
            <a href="mailto:thmiranda.eng@gmail.com">
              Instrutor Thiago Miranda
            </a>{" "}
            · 4º BBM · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </>
  );
}
