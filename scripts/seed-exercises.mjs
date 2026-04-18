/**
 * Script de Seeding — Popula a coleção library_exercises no Firestore
 * Fonte: yuhonas/free-exercise-db (GitHub)
 *
 * Uso: node scripts/seed-exercises.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);

// Inicializa Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Mapa de tradução de grupos musculares
const muscleTranslation = {
  abductors: "Abdutores",
  abs: "Abdômen",
  adductors: "Adutores",
  biceps: "Bíceps",
  calves: "Panturrilhas",
  cardiovascular_system: "Sistema Cardiovascular",
  delts: "Deltoides",
  forearms: "Antebraços",
  glutes: "Glúteos",
  hamstrings: "Posterior de Coxa",
  lats: "Dorsal",
  levator_scapulae: "Levantador da Escápula",
  pectorals: "Peitorais",
  quads: "Quadríceps",
  serratus_anterior: "Serrátil Anterior",
  spine: "Coluna",
  traps: "Trapézio",
  triceps: "Tríceps",
  upper_back: "Costas Superior",
};

// Mapa de tradução de categorias
const categoryTranslation = {
  barbell: "Barra",
  dumbbell: "Haltere",
  cable: "Cabo/Polia",
  machine: "Máquina",
  body_weight: "Peso Corporal",
  assisted: "Assistido",
  weighted_body_weight: "Peso Corporal com Carga",
  smith_machine: "Smith",
  cardio: "Cardio",
  olympic_barbell: "Barra Olímpica",
  resistance_band: "Elástico",
  leverage_machine: "Máquina de Alavanca",
  roller: "Rolo",
  medicine_ball: "Medicine Ball",
  upper_body: "Corpo Superior",
  lower_body: "Corpo Inferior",
  stretches: "Alongamento",
};

function translateMuscle(muscle) {
  return muscleTranslation[muscle] || muscle;
}

function translateCategory(category) {
  return categoryTranslation[category] || category;
}

async function fetchExercises() {
  console.log("📥 Baixando exercícios do repositório yuhonas/free-exercise-db...");
  const { default: fetch } = await import("node-fetch");

  const url =
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ ${data.length} exercícios baixados.`);
  return data;
}

function buildGifUrl(exercise) {
  // O repositório serve imagens em: /exercises/images/{id}/0.gif
  if (exercise.images && exercise.images.length > 0) {
    const baseUrl =
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
    return `${baseUrl}${exercise.images[0]}`;
  }
  return "";
}

function transformExercise(exercise) {
  return {
    name: exercise.name, // nome em inglês (original)
    target_muscle: translateMuscle(exercise.primaryMuscles?.[0] || ""),
    secondary_muscles: (exercise.secondaryMuscles || []).map(translateMuscle),
    category: translateCategory(exercise.category || ""),
    equipment: exercise.equipment || "",
    gif_url: buildGifUrl(exercise),
    instructions: exercise.instructions || [],
  };
}

async function seed() {
  try {
    const exercises = await fetchExercises();

    // Filtra exercícios sem imagem ou sem músculo primário
    const valid = exercises.filter(
      (e) => e.primaryMuscles?.length > 0
    );

    console.log(`\n🔄 Iniciando seeding de ${valid.length} exercícios no Firestore...`);
    console.log("(Isso pode levar alguns minutos)\n");

    const BATCH_SIZE = 400; // Firestore limita 500 por batch
    let count = 0;

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const chunk = valid.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const exercise of chunk) {
        const docRef = db.collection("library_exercises").doc(exercise.id);
        batch.set(docRef, transformExercise(exercise));
      }

      await batch.commit();
      count += chunk.length;
      console.log(`  ✓ ${count}/${valid.length} exercícios escritos...`);
    }

    console.log(`\n🎉 Seeding completo! ${count} exercícios na coleção library_exercises.`);
  } catch (err) {
    console.error("❌ Erro durante o seeding:", err.message);
    process.exit(1);
  }
}

seed();
