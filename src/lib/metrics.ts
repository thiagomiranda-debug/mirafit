import { SetPerformance } from "@/types";

/**
 * Fórmula de Epley: estima o peso máximo para 1 repetição.
 * 1RM = peso × (1 + reps / 30)
 * Casos especiais: reps === 0 retorna peso; weight === 0 retorna 0.
 */
export function epley1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return 0;
  if (weight <= 0) return 0;
  if (reps <= 0) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Retorna o melhor 1RM estimado (Epley) de um array de sets.
 * Retorna 0 para array vazio.
 */
export function best1RMFromSets(sets: SetPerformance[]): number {
  if (sets.length === 0) return 0;
  return Math.max(...sets.map((s) => epley1RM(s.weight, s.reps)));
}

/**
 * Volume total de um array de sets: Σ(peso × reps).
 * Retorna 0 para array vazio.
 */
export function totalVolume(sets: SetPerformance[]): number {
  if (sets.length === 0) return 0;
  return Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0) * 10) / 10;
}
