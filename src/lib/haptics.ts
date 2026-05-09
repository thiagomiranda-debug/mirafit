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
