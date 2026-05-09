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
