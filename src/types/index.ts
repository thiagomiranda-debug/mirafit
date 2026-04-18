// Firestore document types

export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  level: "iniciante" | "intermediario" | "avancado";
  days_per_week: number;
  time_per_session: number;
  goal: string;
  focus_muscle: string;
  medical_restrictions: string;
  gym_id: string;
  gender?: 'masculino' | 'feminino';
  age_group?: 'under_30' | '31_40' | 'over_40';
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
