/**
 * Traduz nomes de exercícios do inglês para PT-BR.
 * Fonte dos exercícios: yuhonas/free-exercise-db (nomes em inglês).
 *
 * Estratégia:
 * 1. Lookup direto para nomes exatos mais comuns
 * 2. Substituição palavra por palavra para os demais
 */

// Traduções exatas para os exercícios mais comuns
const exactTranslations: Record<string, string> = {
  // Peito
  "Barbell Bench Press": "Supino Reto com Barra",
  "Incline Barbell Bench Press": "Supino Inclinado com Barra",
  "Decline Barbell Bench Press": "Supino Declinado com Barra",
  "Dumbbell Bench Press": "Supino Reto com Haltere",
  "Incline Dumbbell Press": "Supino Inclinado com Haltere",
  "Decline Dumbbell Press": "Supino Declinado com Haltere",
  "Dumbbell Fly": "Crucifixo com Haltere",
  "Incline Dumbbell Fly": "Crucifixo Inclinado com Haltere",
  "Cable Fly": "Crucifixo no Cabo",
  "Cable Crossover": "Crossover no Cabo",
  "Pec Deck Fly": "Crucifixo na Máquina (Peck Deck)",
  "Machine Chest Press": "Supino na Máquina",
  "Push-Up": "Flexão de Braço",
  "Wide-Grip Push-Up": "Flexão com Pegada Aberta",
  "Diamond Push-Up": "Flexão Diamante",
  "Chest Dip": "Fundos para Peito",

  // Dorsal / Costas
  "Pull-Up": "Barra Fixa",
  "Chin-Up": "Barra Fixa Supinada",
  "Wide-Grip Pull-Up": "Barra Fixa Pegada Aberta",
  "Close-Grip Pull-Up": "Barra Fixa Pegada Fechada",
  "Lat Pulldown": "Puxada Frontal",
  "Wide-Grip Lat Pulldown": "Puxada Frontal Pegada Aberta",
  "Close-Grip Lat Pulldown": "Puxada Frontal Pegada Fechada",
  "Reverse-Grip Lat Pulldown": "Puxada Frontal Supinada",
  "Barbell Row": "Remada Curvada com Barra",
  "Bent Over Barbell Row": "Remada Curvada com Barra",
  "Bent-Over Barbell Row": "Remada Curvada com Barra",
  "Dumbbell Row": "Remada com Haltere",
  "One Arm Dumbbell Row": "Remada Unilateral com Haltere",
  "Single Arm Dumbbell Row": "Remada Unilateral com Haltere",
  "Cable Row": "Remada no Cabo",
  "Seated Cable Row": "Remada Sentado no Cabo",
  "T-Bar Row": "Remada T",
  "Machine Row": "Remada na Máquina",
  "Chest-Supported Row": "Remada Apoiada no Peito",
  "Deadlift": "Levantamento Terra",
  "Romanian Deadlift": "Levantamento Terra Romeno",
  "Stiff-Leg Deadlift": "Levantamento Terra Stiff",
  "Dumbbell Pullover": "Pullover com Haltere",
  "Cable Pullover": "Pullover no Cabo",

  // Ombros
  "Barbell Shoulder Press": "Desenvolvimento com Barra",
  "Military Press": "Desenvolvimento Militar",
  "Overhead Press": "Desenvolvimento com Barra",
  "Dumbbell Shoulder Press": "Desenvolvimento com Haltere",
  "Arnold Press": "Press Arnold",
  "Machine Shoulder Press": "Desenvolvimento na Máquina",
  "Dumbbell Lateral Raise": "Elevação Lateral com Haltere",
  "Cable Lateral Raise": "Elevação Lateral no Cabo",
  "Dumbbell Front Raise": "Elevação Frontal com Haltere",
  "Barbell Front Raise": "Elevação Frontal com Barra",
  "Cable Front Raise": "Elevação Frontal no Cabo",
  "Dumbbell Rear Delt Fly": "Crucifixo Invertido com Haltere",
  "Reverse Dumbbell Fly": "Crucifixo Invertido com Haltere",
  "Face Pull": "Face Pull",
  "Upright Row": "Remada Alta",
  "Barbell Upright Row": "Remada Alta com Barra",
  "Dumbbell Shrug": "Encolhimento com Haltere",
  "Barbell Shrug": "Encolhimento com Barra",
  "Cable Shrug": "Encolhimento no Cabo",

  // Bíceps
  "Barbell Curl": "Rosca Direta com Barra",
  "Dumbbell Curl": "Rosca com Haltere",
  "Alternating Dumbbell Curl": "Rosca Alternada com Haltere",
  "Hammer Curl": "Rosca Martelo",
  "Dumbbell Hammer Curl": "Rosca Martelo com Haltere",
  "Concentration Curl": "Rosca Concentrada",
  "Preacher Curl": "Rosca Scott",
  "EZ Bar Curl": "Rosca com Barra EZ",
  "EZ-Bar Curl": "Rosca com Barra EZ",
  "Cable Curl": "Rosca no Cabo",
  "Incline Dumbbell Curl": "Rosca Inclinada com Haltere",
  "Reverse Curl": "Rosca Inversa",
  "Reverse Barbell Curl": "Rosca Inversa com Barra",

  // Tríceps
  "Tricep Dip": "Fundos para Tríceps",
  "Dip": "Fundos",
  "Close-Grip Bench Press": "Supino Fechado",
  "Tricep Pushdown": "Pushdown para Tríceps",
  "Cable Tricep Pushdown": "Pushdown para Tríceps no Cabo",
  "Rope Tricep Pushdown": "Pushdown com Corda para Tríceps",
  "Tricep Extension": "Extensão de Tríceps",
  "Overhead Tricep Extension": "Extensão de Tríceps Acima da Cabeça",
  "Dumbbell Tricep Extension": "Extensão de Tríceps com Haltere",
  "Skull Crusher": "Tríceps Testa",
  "Barbell Skull Crusher": "Tríceps Testa com Barra",
  "EZ Bar Skull Crusher": "Tríceps Testa com Barra EZ",
  "Tricep Kickback": "Coice de Tríceps",
  "Dumbbell Tricep Kickback": "Coice de Tríceps com Haltere",

  // Quadríceps / Pernas
  "Squat": "Agachamento",
  "Barbell Squat": "Agachamento com Barra",
  "Front Squat": "Agachamento Frontal",
  "Goblet Squat": "Agachamento Goblet",
  "Hack Squat": "Agachamento Hack",
  "Smith Machine Squat": "Agachamento no Smith",
  "Leg Press": "Leg Press",
  "Leg Extension": "Cadeira Extensora",
  "Machine Leg Extension": "Cadeira Extensora",
  "Bulgarian Split Squat": "Agachamento Búlgaro",
  "Lunge": "Avanço",
  "Dumbbell Lunge": "Avanço com Haltere",
  "Barbell Lunge": "Avanço com Barra",
  "Walking Lunge": "Avanço Caminhando",
  "Step-Up": "Subida em Step",
  "Dumbbell Step-Up": "Subida em Step com Haltere",
  "Sissy Squat": "Agachamento Sissy",
  "Wall Sit": "Cadeira na Parede",

  // Posterior de Coxa
  "Leg Curl": "Mesa Flexora",
  "Lying Leg Curl": "Mesa Flexora Deitado",
  "Seated Leg Curl": "Mesa Flexora Sentado",
  "Standing Leg Curl": "Mesa Flexora em Pé",
  "Good Morning": "Bom Dia",
  "Barbell Good Morning": "Bom Dia com Barra",
  "Nordic Hamstring Curl": "Rosca Nórdica",

  // Glúteos
  "Hip Thrust": "Elevação de Quadril",
  "Barbell Hip Thrust": "Elevação de Quadril com Barra",
  "Glute Bridge": "Ponte de Glúteo",
  "Barbell Glute Bridge": "Ponte de Glúteo com Barra",
  "Cable Kickback": "Coice no Cabo",
  "Donkey Kick": "Coice de Burro",
  "Sumo Squat": "Agachamento Sumô",
  "Sumo Deadlift": "Levantamento Terra Sumô",

  // Panturrilhas
  "Standing Calf Raise": "Elevação de Panturrilha em Pé",
  "Seated Calf Raise": "Elevação de Panturrilha Sentado",
  "Calf Raise": "Elevação de Panturrilha",
  "Leg Press Calf Raise": "Elevação de Panturrilha no Leg Press",
  "Donkey Calf Raise": "Elevação de Panturrilha Donkey",

  // Abdômen
  "Crunch": "Abdominal",
  "Sit-Up": "Abdominal Completo",
  "Plank": "Prancha",
  "Side Plank": "Prancha Lateral",
  "Russian Twist": "Rotação Russa",
  "Leg Raise": "Elevação de Pernas",
  "Hanging Leg Raise": "Elevação de Pernas Suspenso",
  "Ab Wheel Rollout": "Roda Abdominal",
  "Cable Crunch": "Abdominal no Cabo",
  "Reverse Crunch": "Abdominal Reverso",
  "Bicycle Crunch": "Abdominal Bicicleta",
  "Mountain Climber": "Escalador",
  "V-Up": "Abdominal em V",
  "Dragon Flag": "Dragon Flag",
  "Hollow Body Hold": "Posição Hollow",

  // Cardio / Funcional
  "Burpee": "Burpee",
  "Jumping Jack": "Polichinelo",
  "Jump Rope": "Corda",
  "Box Jump": "Salto na Caixa",
  "Kettlebell Swing": "Swing com Kettlebell",
};

// Dicionário palavra por palavra para tradução de fallback
const wordMap: Record<string, string> = {
  // Equipamentos
  barbell: "Barra",
  dumbbell: "Haltere",
  cable: "Cabo",
  machine: "Máquina",
  smith: "Smith",
  kettlebell: "Kettlebell",
  band: "Elástico",
  bodyweight: "Peso Corporal",
  "body weight": "Peso Corporal",

  // Movimentos principais
  press: "Press",
  bench: "Supino",
  squat: "Agachamento",
  deadlift: "Levantamento Terra",
  row: "Remada",
  pulldown: "Puxada",
  "pull-up": "Barra Fixa",
  pullup: "Barra Fixa",
  "chin-up": "Barra Fixa Supinada",
  chinup: "Barra Fixa Supinada",
  curl: "Rosca",
  extension: "Extensão",
  fly: "Crucifixo",
  flye: "Crucifixo",
  raise: "Elevação",
  lunge: "Avanço",
  thrust: "Elevação",
  shrug: "Encolhimento",
  kickback: "Coice",
  pullover: "Pullover",
  crunch: "Abdominal",
  plank: "Prancha",
  dip: "Fundos",
  twist: "Rotação",
  rotation: "Rotação",
  "push-up": "Flexão",
  pushup: "Flexão",
  pushdown: "Pushdown",
  bridge: "Ponte",
  step: "Step",
  jump: "Salto",
  swing: "Swing",
  hold: "Sustentação",
  rollout: "Rollout",

  // Modificadores de posição
  incline: "Inclinado",
  decline: "Declinado",
  overhead: "Acima da Cabeça",
  seated: "Sentado",
  standing: "Em Pé",
  lying: "Deitado",
  reverse: "Invertido",
  close: "Fechado",
  wide: "Aberto",
  narrow: "Estreito",

  // Partes do corpo / músculos
  chest: "Peito",
  back: "Costas",
  shoulder: "Ombro",
  tricep: "Tríceps",
  triceps: "Tríceps",
  bicep: "Bíceps",
  biceps: "Bíceps",
  glute: "Glúteo",
  glutes: "Glúteos",
  quad: "Quadríceps",
  quads: "Quadríceps",
  hamstring: "Posterior de Coxa",
  hamstrings: "Posterior de Coxa",
  calf: "Panturrilha",
  calves: "Panturrilhas",
  lat: "Dorsal",
  lats: "Dorsal",
  ab: "Abdominal",
  abs: "Abdômen",
  core: "Core",
  hip: "Quadril",
  leg: "Perna",
  legs: "Pernas",
  arm: "Braço",
  arms: "Braços",
  wrist: "Pulso",
  forearm: "Antebraço",
  forearms: "Antebraços",

  // Adjetivos de direção
  front: "Frontal",
  rear: "Traseiro",
  lateral: "Lateral",
  inner: "Interno",
  outer: "Externo",
  upper: "Superior",
  lower: "Inferior",
  single: "Unilateral",
  one: "Um",
  alternate: "Alternado",
  alternating: "Alternado",

  // Estilos / variações
  hammer: "Martelo",
  preacher: "Scott",
  concentration: "Concentrado",
  sumo: "Sumô",
  romanian: "Romeno",
  bulgarian: "Búlgaro",
  nordic: "Nórdico",
  military: "Militar",
  arnold: "Arnold",
  hack: "Hack",
  goblet: "Goblet",
  "t-bar": "T",
  stiff: "Stiff",
  "skull crusher": "Tríceps Testa",
  "good morning": "Bom Dia",
  "face pull": "Face Pull",
  "hip thrust": "Elevação de Quadril",
  "glute bridge": "Ponte de Glúteo",
  grip: "Pegada",
  bar: "Barra",
  rope: "Corda",
  ez: "EZ",
  pec: "Peitoral",
  deck: "Deck",
};

/**
 * Traduz o nome de um exercício do inglês para PT-BR.
 * Tenta primeiro por lookup exato, depois word-by-word.
 */
export function translateExerciseName(name: string): string {
  if (!name) return name;

  // 1. Lookup exato (case-insensitive)
  const lower = name.toLowerCase();
  for (const [en, pt] of Object.entries(exactTranslations)) {
    if (en.toLowerCase() === lower) return pt;
  }

  // 2. Tradução palavra por palavra
  // Ordena as chaves do dicionário por comprimento decrescente para dar prioridade a frases
  const keys = Object.keys(wordMap).sort((a, b) => b.length - a.length);

  let result = name;
  const usedRanges: Array<[number, number]> = [];

  for (const key of keys) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(result)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Ignora se já foi traduzida essa posição
      const overlaps = usedRanges.some(([s, e]) => start < e && end > s);
      if (!overlaps) {
        usedRanges.push([start, end]);
      }
    }
  }

  // Aplica as substituições de trás para frente para não deslocar índices
  const parts: Array<{ start: number; end: number; original: string }> = [];
  for (const key of keys) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(name)) !== null) {
      parts.push({ start: match.index, end: match.index + match[0].length, original: match[0] });
    }
  }

  // Constrói resultado substituindo palavra por palavra de forma simples
  let translated = name;
  for (const key of keys) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    const pt = wordMap[key];
    translated = translated.replace(regex, pt);
  }

  // Se a tradução não mudou nada (nome completamente desconhecido), retorna original
  return translated === name ? name : translated;
}
