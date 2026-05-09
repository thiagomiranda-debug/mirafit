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
