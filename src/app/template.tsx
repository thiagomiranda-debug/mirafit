// src/app/template.tsx
// Re-renderiza em cada navegação (Next App Router behavior)
// permitindo fade suave entre rotas.
"use client";

export default function Template({ children }: { children: React.ReactNode }) {
  // animate-page-fade usa só opacity (sem transform) — transform criaria
  // containing block que quebra position:fixed dos modais filhos.
  return <div className="animate-page-fade">{children}</div>;
}
