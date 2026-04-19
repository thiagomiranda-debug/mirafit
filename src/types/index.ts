// Firestore document types

export type RestrictionTag =
  | 'joelho'
  | 'ombro'
  | 'lombar'
  | 'cervical'
  | 'punho'
  | 'cotovelo'
  | 'tornozelo'
  | 'quadril';

export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  gender: 'masculino' | 'feminino';
  level: "iniciante" | "intermediario" | "avancado";
  months_training?: number;
  days_per_week: number;
  time_per_session: number;
  goal: string;
  focus_muscle: string;
  medical_restrictions: string;
  medical_restriction_tags?: RestrictionTag[];
  gym_id: string;
  age_group?: 'under_30' | '31_40' | 'over_40';
  /** Chaves de categorias de equipamento disponíveis no quartel do usuário.
   * Se undefined, o gerador usa a whitelist padrão (QUARTEL_EQUIPMENT_WHITELIST). */
  quartel_equipment?: string[];
}

export interface LibraryExercise {
  id: string;
  name: string;
  target_muscle: string;
  equipment: string;
  category: string;
  gif_url: string;
  instructions: string[];
}

export interface WorkoutExercise {
  exercise_id: string;
  sets: number;
  reps: string;
  order: number;
}

export interface Routine {
  id?: string;
  name: string;
  exercises: WorkoutExercise[];
}

export type LocationType = 'gym' | 'quartel';

export interface Workout {
  id?: string;
  user_id: string;
  workout_type: string;
  is_active: boolean;
  created_at: Date;
  location_type?: LocationType;
  routines?: Routine[];
  /** ID da variante curada usada nesta geração (ex: "abcd_sinergista"). Undefined em workouts pré-periodização. */
  split_variant_id?: string;
  /** Fase do mesociclo — alterna a cada geração para alternar volume/intensidade. */
  cycle_phase?: 'acumulacao' | 'intensificacao';
}

export interface SetPerformance {
  weight: number;
  reps: number;
}

export interface ExercisePerformance {
  exercise_id: string;
  sets: SetPerformance[];
  // Legacy (logs antigos salvos antes do multi-set)
  weight_lifted?: number;
  reps_done?: number;
}

export interface WorkoutLog {
  id?: string;
  user_id: string;
  date: Date;
  routine_name: string;
  performance: ExercisePerformance[];
  notes?: string;
  location_type?: LocationType;
}
