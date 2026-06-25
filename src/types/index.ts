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

export type CyclePhase = 'acumulacao' | 'intensificacao';

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
  secondary_muscles?: string[];
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
export type WorkoutSource = 'generated' | 'manual';

export interface Workout {
  id?: string;
  user_id: string;
  workout_type: string;
  /** Meta semanal congelada no momento em que o programa foi criado. */
  weekly_target?: number;
  /** Nome amigável exibido como programa no dashboard e no histórico. */
  display_name?: string;
  /** Origem do programa: gerado pelo app ou montado/importado manualmente. */
  source?: WorkoutSource;
  is_active: boolean;
  created_at: Date;
  /** Data em que o programa deixou de ser ativo. */
  ended_at?: Date | null;
  location_type?: LocationType;
  routines?: Routine[];
  /** ID da variante curada usada nesta geração (ex: "abcd_sinergista"). Undefined em workouts pré-periodização. */
  split_variant_id?: string;
  /** Fase do mesociclo — alterna a cada geração para alternar volume/intensidade. */
  cycle_phase?: CyclePhase;
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
  /** Programa (documento em workouts) usado nesta sessão. Ausente em logs legados. */
  workout_id?: string;
  /** Rotina (subdocumento do workout) executada nesta sessão. */
  routine_id?: string;
  /** Snapshot para o histórico continuar legível mesmo se o programa mudar. */
  workout_name_snapshot?: string;
  routine_name: string;
  performance: ExercisePerformance[];
  /** Duração da sessão em segundos. Ausente nos registros anteriores ao cronômetro persistido. */
  duration_sec?: number;
  notes?: string;
  location_type?: LocationType;
}

export type CardioModality =
  | 'corrida_ar_livre'
  | 'esteira'
  | 'bike'
  | 'eliptico'
  | 'stepper'
  | 'remo';

export interface CardioSession {
  id?: string;
  user_id: string;
  date: Date;
  modality: CardioModality;
  duration_sec: number;
  distance_km?: number;
}

export interface BodyMeasurement {
  id?: string;
  user_id: string;
  date: Date;
  // Geral
  weight_kg?: number;
  // Tronco
  waist_cm?: number;
  hip_cm?: number;
  chest_cm?: number;
  shoulder_cm?: number;
  neck_cm?: number;
  // Membros Superiores
  bicep_r_cm?: number;
  bicep_l_cm?: number;
  forearm_r_cm?: number;
  forearm_l_cm?: number;
  // Membros Inferiores
  thigh_r_cm?: number;
  thigh_l_cm?: number;
  calf_r_cm?: number;
  calf_l_cm?: number;
}
