/**
 * Gera instruções em PT-BR para exercícios baseado nos metadados.
 * Como o banco de exercícios (free-exercise-db) tem instruções apenas em inglês,
 * geramos instruções genéricas em português baseadas no músculo alvo e equipamento.
 */

const equipmentInstructions: Record<string, string[]> = {
  barbell: [
    "Segure a barra com pegada firme na largura dos ombros.",
    "Mantenha a coluna neutra durante todo o movimento.",
    "Controle o peso tanto na subida quanto na descida.",
    "Expire durante o esforço e inspire no retorno.",
  ],
  dumbbell: [
    "Segure os halteres com pegada firme.",
    "Mantenha os movimentos simétricos dos dois lados.",
    "Controle o peso durante toda a amplitude do movimento.",
    "Expire durante o esforço e inspire no retorno.",
  ],
  cable: [
    "Ajuste a polia na altura adequada para o exercício.",
    "Mantenha o tronco estável durante o movimento.",
    "Controle o cabo tanto na fase concêntrica quanto excêntrica.",
    "Expire durante o esforço e inspire no retorno.",
  ],
  machine: [
    "Ajuste o banco e os apoios para seu corpo.",
    "Realize o movimento de forma controlada.",
    "Não trave as articulações no final do movimento.",
    "Expire durante o esforço e inspire no retorno.",
  ],
  body_weight: [
    "Use o peso do próprio corpo como resistência.",
    "Mantenha o core ativado durante todo o exercício.",
    "Controle o movimento, evitando usar impulso.",
    "Respire de forma ritmada durante as repetições.",
  ],
  leverage_machine: [
    "Ajuste o equipamento para sua altura e alcance.",
    "Siga a trajetória guiada da máquina.",
    "Não trave as articulações no final do movimento.",
    "Expire durante o esforço e inspire no retorno.",
  ],
  smith_machine: [
    "Posicione-se corretamente sob a barra guiada.",
    "Destrave a barra girando os punhos.",
    "Mantenha a coluna neutra durante o movimento.",
    "Trave a barra novamente ao finalizar a série.",
  ],
  resistance_band: [
    "Fixe o elástico em um ponto seguro.",
    "Mantenha tensão constante no elástico durante o movimento.",
    "Controle tanto a fase de esforço quanto o retorno.",
    "Expire durante o esforço e inspire no retorno.",
  ],
  medicine_ball: [
    "Segure a medicine ball com ambas as mãos.",
    "Mantenha o core ativado durante o exercício.",
    "Controle o movimento com precisão.",
    "Respire de forma ritmada durante as repetições.",
  ],
};

const muscleSpecificTips: Record<string, string> = {
  "Peitorais": "Foque em sentir a contração no peito, aproximando os braços na fase final.",
  "Dorsal": "Puxe com os cotovelos, não com as mãos. Sinta as costas trabalhando.",
  "Deltoides": "Evite elevar os ombros em direção às orelhas. Mantenha os ombros abaixados.",
  "Bíceps": "Mantenha os cotovelos fixos ao lado do corpo. Isole o movimento no bíceps.",
  "Tríceps": "Mantenha os cotovelos próximos ao corpo. Estenda completamente os braços.",
  "Quadríceps": "Empurre o chão com os pés. Mantenha os joelhos alinhados com os pés.",
  "Posterior de Coxa": "Foque na contração da parte posterior da coxa. Evite compensar com a lombar.",
  "Glúteos": "Contraia os glúteos no topo do movimento. Mantenha o core ativado.",
  "Panturrilhas": "Realize a amplitude completa do movimento. Segure a contração no topo.",
  "Abdômen": "Mantenha a lombar apoiada. Foque na contração abdominal, não no pescoço.",
  "Trapézio": "Eleve os ombros em direção às orelhas e segure brevemente no topo.",
  "Costas Superior": "Retraia as escápulas durante o movimento. Sinta a contração entre as omoplatas.",
  "Antebraços": "Mantenha o punho firme. Controle o movimento na amplitude completa.",
  "Adutores": "Mantenha o tronco estável. Foque na contração da parte interna da coxa.",
  "Abdutores": "Mantenha o tronco estável. Foque na contração da parte externa da coxa.",
};

export function generatePortugueseInstructions(
  targetMuscle: string,
  equipment: string
): string[] {
  const equipKey = equipment.replace(/\s+/g, "_").toLowerCase();
  const baseInstructions = equipmentInstructions[equipKey] || equipmentInstructions["body_weight"];

  const instructions = [...baseInstructions];

  const muscleTip = muscleSpecificTips[targetMuscle];
  if (muscleTip) {
    instructions.splice(1, 0, muscleTip);
  }

  return instructions;
}
