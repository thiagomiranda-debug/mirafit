// src/app/template.tsx
// Re-renderiza em cada navegação (Next App Router behavior)
// permitindo fade-in suave entre rotas.
"use client";

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
